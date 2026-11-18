"""Orchestration Pipeline connecting Cleaner, Cache, Analyzer, and Aggregations."""
import time
from typing import List, Dict, Any
from collections import Counter

from src.schemas import CleanedRow, EnrichedReview, LLMReviewOutput
from src.cleaner import parse_and_clean_csv
from src.cache import ReviewCache
from src.analyzer import ReviewAnalyzer, check_rating_mismatch
import config


class ReviewPipeline:
    """Full end-to-end processing pipeline for reviews."""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or config.CACHE_DB_PATH
        self.cache = ReviewCache(self.db_path)
        self.analyzer = ReviewAnalyzer(self.cache)

    def process_csv_content(self, raw_content: str | bytes) -> Dict[str, Any]:
        """
        Executes full workflow:
        1. Clean and parse CSV
        2. Filter empty and duplicate rows
        3. Lookup cache via SHA-256
        4. Batch call LLM for un-cached rows
        5. Save new analyses to cache
        6. Reconnect duplicates
        7. Compute analytics, rating mismatch, top complaints/praises, and product views
        """
        start_time = time.time()

        # Step 1: Clean and parse
        cleaned_rows: List[CleanedRow] = parse_and_clean_csv(raw_content)
        total_rows = len(cleaned_rows)

        ai_calls_made = 0
        cached_count = 0
        skipped_empty_count = 0
        skipped_duplicate_count = 0
        failed_count = 0

        # Step 2: Separate rows by status
        valid_uniques: List[CleanedRow] = []
        hash_to_cleaned: Dict[str, CleanedRow] = {}

        for row in cleaned_rows:
            if row.is_empty:
                skipped_empty_count += 1
            elif row.is_duplicate:
                skipped_duplicate_count += 1
            else:
                valid_uniques.append(row)
                hash_to_cleaned[row.text_hash] = row

        # Step 3: Check cache for valid unique rows
        unique_hashes = [r.text_hash for r in valid_uniques]
        cached_results: Dict[str, LLMReviewOutput] = self.cache.get_many(unique_hashes)

        rows_needing_analysis: List[CleanedRow] = []
        analysis_by_hash: Dict[str, LLMReviewOutput] = {}

        for row in valid_uniques:
            if row.text_hash in cached_results:
                analysis_by_hash[row.text_hash] = cached_results[row.text_hash]
                cached_count += 1
            else:
                rows_needing_analysis.append(row)

        # Step 4: Batch analysis for un-cached rows (Requirement 5)
        batch_size = self.analyzer.batch_size
        new_cache_items = []

        for i in range(0, len(rows_needing_analysis), batch_size):
            batch = rows_needing_analysis[i:i + batch_size]
            batch_results = self.analyzer.analyze_batch(batch)
            ai_calls_made += 1

            for row in batch:
                out = batch_results.get(row.review_id)
                if out:
                    analysis_by_hash[row.text_hash] = out
                    new_cache_items.append((row.text_hash, row.cleaned_text, out))
                else:
                    failed_count += 1

        # Step 5: Save newly analyzed items to cache
        if new_cache_items:
            self.cache.set_many(new_cache_items)

        # Step 6: Assemble EnrichedReview records
        enriched_reviews: List[EnrichedReview] = []

        for row in cleaned_rows:
            rating_display = str(row.rating) if (row.rating_valid and row.rating is not None) else "Unknown"

            if row.is_empty:
                enriched_reviews.append(
                    EnrichedReview(
                        review_id=row.review_id,
                        product=row.product,
                        rating=row.rating,
                        rating_display=rating_display,
                        date=row.date,
                        review_text=row.review_text,
                        status="skipped_empty",
                        sentiment=None,
                        topics=[],
                        summary="[Empty review - skipped]",
                        needs_reply=False,
                        is_rating_mismatch=False,
                        duplicate_of=None,
                        cached=False
                    )
                )
                continue

            if row.is_duplicate:
                # Re-attach parent analysis if available
                parent_analysis = analysis_by_hash.get(row.text_hash)
                if parent_analysis:
                    is_mismatch = check_rating_mismatch(row.rating, parent_analysis.sentiment)
                    enriched_reviews.append(
                        EnrichedReview(
                            review_id=row.review_id,
                            product=row.product,
                            rating=row.rating,
                            rating_display=rating_display,
                            date=row.date,
                            review_text=row.review_text,
                            status="skipped_duplicate",
                            sentiment=parent_analysis.sentiment,
                            topics=parent_analysis.topics,
                            summary=f"[Duplicate of {row.duplicate_of}] {parent_analysis.summary}",
                            needs_reply=parent_analysis.needs_reply,
                            is_rating_mismatch=is_mismatch,
                            duplicate_of=row.duplicate_of,
                            cached=True
                        )
                    )
                else:
                    enriched_reviews.append(
                        EnrichedReview(
                            review_id=row.review_id,
                            product=row.product,
                            rating=row.rating,
                            rating_display=rating_display,
                            date=row.date,
                            review_text=row.review_text,
                            status="skipped_duplicate",
                            sentiment=None,
                            topics=[],
                            summary=f"[Duplicate of {row.duplicate_of}]",
                            needs_reply=False,
                            is_rating_mismatch=False,
                            duplicate_of=row.duplicate_of,
                            cached=False
                        )
                    )
                continue

            analysis = analysis_by_hash.get(row.text_hash)
            if analysis is None:
                # Analysis failed
                enriched_reviews.append(
                    EnrichedReview(
                        review_id=row.review_id,
                        product=row.product,
                        rating=row.rating,
                        rating_display=rating_display,
                        date=row.date,
                        review_text=row.review_text,
                        status="analysis_failed",
                        sentiment=None,
                        topics=[],
                        summary="[Analysis failed after retry - invalid LLM schema]",
                        needs_reply=False,
                        is_rating_mismatch=False,
                        duplicate_of=None,
                        cached=False
                    )
                )
            else:
                is_mismatch = check_rating_mismatch(row.rating, analysis.sentiment)
                is_from_cache = row.text_hash in cached_results
                enriched_reviews.append(
                    EnrichedReview(
                        review_id=row.review_id,
                        product=row.product,
                        rating=row.rating,
                        rating_display=rating_display,
                        date=row.date,
                        review_text=row.review_text,
                        status="cached" if is_from_cache else "analyzed",
                        sentiment=analysis.sentiment,
                        topics=analysis.topics,
                        summary=analysis.summary,
                        needs_reply=analysis.needs_reply,
                        is_rating_mismatch=is_mismatch,
                        duplicate_of=None,
                        cached=is_from_cache
                    )
                )

        total_time = round(time.time() - start_time, 2)

        # Step 7: Calculate Aggregations & Metrics
        metrics = self._compute_metrics(
            enriched_reviews=enriched_reviews,
            total_rows=total_rows,
            ai_calls_made=ai_calls_made,
            cached_count=cached_count,
            skipped_empty_count=skipped_empty_count,
            skipped_duplicate_count=skipped_duplicate_count,
            failed_count=failed_count,
            total_time=total_time
        )

        return {
            "reviews": [r.model_dump() for r in enriched_reviews],
            "metrics": metrics
        }

    def _compute_metrics(
        self,
        enriched_reviews: List[EnrichedReview],
        total_rows: int,
        ai_calls_made: int,
        cached_count: int,
        skipped_empty_count: int,
        skipped_duplicate_count: int,
        failed_count: int,
        total_time: float
    ) -> Dict[str, Any]:
        """Calculates dashboard summary metrics, top complaints/praises, and product breakdown."""
        analyzed_reviews = [r for r in enriched_reviews if r.sentiment is not None]
        total_analyzed = len(analyzed_reviews)

        sentiment_counts = Counter(r.sentiment for r in analyzed_reviews)
        pos_count = sentiment_counts.get("positive", 0)
        neu_count = sentiment_counts.get("neutral", 0)
        neg_count = sentiment_counts.get("negative", 0)

        pos_pct = round((pos_count / total_analyzed * 100), 1) if total_analyzed > 0 else 0.0
        neu_pct = round((neu_count / total_analyzed * 100), 1) if total_analyzed > 0 else 0.0
        neg_pct = round((neg_count / total_analyzed * 100), 1) if total_analyzed > 0 else 0.0

        needs_reply_count = sum(1 for r in enriched_reviews if r.needs_reply)

        # Rating vs Sentiment Agreement (Bonus requirement)
        agreements = 0
        rated_and_analyzed = 0
        for r in analyzed_reviews:
            if r.rating is not None:
                rated_and_analyzed += 1
                if not r.is_rating_mismatch:
                    agreements += 1
        agreement_pct = round((agreements / rated_and_analyzed * 100), 1) if rated_and_analyzed > 0 else 100.0

        # Top 3 Complaints (from negative reviews)
        complaint_topics = Counter()
        complaint_samples = {}
        for r in analyzed_reviews:
            if r.sentiment == "negative":
                for topic in r.topics:
                    complaint_topics[topic] += 1
                    if topic not in complaint_samples:
                        complaint_samples[topic] = r.summary

        top_3_complaints = [
            {"topic": topic, "count": count, "sample": complaint_samples.get(topic, "")}
            for topic, count in complaint_topics.most_common(3)
        ]

        # Top 3 Praises (from positive reviews)
        praise_topics = Counter()
        praise_samples = {}
        for r in analyzed_reviews:
            if r.sentiment == "positive":
                for topic in r.topics:
                    praise_topics[topic] += 1
                    if topic not in praise_samples:
                        praise_samples[topic] = r.summary

        top_3_praises = [
            {"topic": topic, "count": count, "sample": praise_samples.get(topic, "")}
            for topic, count in praise_topics.most_common(3)
        ]

        # Product View breakdown (Bonus requirement)
        products = sorted(list({r.product for r in enriched_reviews}))
        product_view = {}
        for prod in products:
            prod_reviews = [r for r in enriched_reviews if r.product == prod]
            prod_analyzed = [r for r in prod_reviews if r.sentiment is not None]
            prod_total = len(prod_reviews)
            p_counts = Counter(r.sentiment for r in prod_analyzed)

            # Top issues for this product
            p_neg_topics = Counter()
            for r in prod_analyzed:
                if r.sentiment == "negative":
                    for t in r.topics:
                        p_neg_topics[t] += 1

            product_view[prod] = {
                "total": prod_total,
                "analyzed": len(prod_analyzed),
                "positive": p_counts.get("positive", 0),
                "neutral": p_counts.get("neutral", 0),
                "negative": p_counts.get("negative", 0),
                "needs_reply": sum(1 for r in prod_reviews if r.needs_reply),
                "top_issues": [t for t, _ in p_neg_topics.most_common(2)]
            }

        return {
            "total_reviews": total_rows,
            "total_analyzed": total_analyzed,
            "ai_calls_made": ai_calls_made,
            "cached_count": cached_count,
            "skipped_empty_count": skipped_empty_count,
            "skipped_duplicate_count": skipped_duplicate_count,
            "failed_count": failed_count,
            "total_time_seconds": total_time,
            "sentiment_breakdown": {
                "positive_count": pos_count,
                "neutral_count": neu_count,
                "negative_count": neg_count,
                "positive_pct": pos_pct,
                "neutral_pct": neu_pct,
                "negative_pct": neg_pct
            },
            "needs_reply_count": needs_reply_count,
            "rating_agreement_pct": agreement_pct,
            "top_3_complaints": top_3_complaints,
            "top_3_praises": top_3_praises,
            "products": products,
            "product_view": product_view
        }
