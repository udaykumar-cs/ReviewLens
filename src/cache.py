"""SQLite Caching Manager for ReviewLens."""
import sqlite3
import json
import logging
from typing import Optional, Dict, Any, List
from src.schemas import LLMReviewOutput

logger = logging.getLogger(__name__)


class ReviewCache:
    """Manages SQLite cache for analyzed reviews keyed by SHA-256 hash."""

    def __init__(self, db_path: str = "cache.db"):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Create the cache table if it doesn't already exist."""
        conn = None
        try:
            conn = self._get_connection()
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS analysis_cache (
                        text_hash TEXT PRIMARY KEY,
                        review_text TEXT,
                        sentiment TEXT NOT NULL,
                        topics TEXT NOT NULL,
                        summary TEXT NOT NULL,
                        needs_reply INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    """
                )
        finally:
            if conn:
                conn.close()

    def get(self, text_hash: str) -> Optional[LLMReviewOutput]:
        """Fetch cached analysis by review text hash."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT sentiment, topics, summary, needs_reply FROM analysis_cache WHERE text_hash = ?",
                (text_hash,)
            )
            row = cursor.fetchone()
            if row:
                topics = json.loads(row["topics"]) if isinstance(row["topics"], str) else row["topics"]
                return LLMReviewOutput(
                    sentiment=row["sentiment"],
                    topics=topics,
                    summary=row["summary"],
                    needs_reply=bool(row["needs_reply"])
                )
        except Exception as e:
            logger.warning(f"Cache get error for hash {text_hash}: {e}")
        finally:
            if conn:
                conn.close()
        return None

    def set(self, text_hash: str, review_text: str, analysis: LLMReviewOutput) -> None:
        """Store analyzed review in cache."""
        conn = None
        try:
            conn = self._get_connection()
            with conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO analysis_cache 
                    (text_hash, review_text, sentiment, topics, summary, needs_reply)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        text_hash,
                        review_text,
                        analysis.sentiment,
                        json.dumps(analysis.topics),
                        analysis.summary,
                        1 if analysis.needs_reply else 0
                    )
                )
        except Exception as e:
            logger.warning(f"Cache set error for hash {text_hash}: {e}")
        finally:
            if conn:
                conn.close()

    def get_many(self, hashes: List[str]) -> Dict[str, LLMReviewOutput]:
        """Bulk retrieval of cached analyses."""
        results = {}
        if not hashes:
            return results
        conn = None
        try:
            conn = self._get_connection()
            placeholders = ",".join("?" for _ in hashes)
            cursor = conn.cursor()
            cursor.execute(
                f"SELECT text_hash, sentiment, topics, summary, needs_reply FROM analysis_cache WHERE text_hash IN ({placeholders})",
                hashes
            )
            for row in cursor.fetchall():
                topics = json.loads(row["topics"]) if isinstance(row["topics"], str) else row["topics"]
                results[row["text_hash"]] = LLMReviewOutput(
                    sentiment=row["sentiment"],
                    topics=topics,
                    summary=row["summary"],
                    needs_reply=bool(row["needs_reply"])
                )
        except Exception as e:
            logger.warning(f"Bulk cache retrieval error: {e}")
        finally:
            if conn:
                conn.close()
        return results

    def set_many(self, items: List[tuple]) -> None:
        """Bulk insertion of (text_hash, review_text, LLMReviewOutput)."""
        if not items:
            return
        conn = None
        try:
            conn = self._get_connection()
            with conn:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO analysis_cache 
                    (text_hash, review_text, sentiment, topics, summary, needs_reply)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            h,
                            text,
                            analysis.sentiment,
                            json.dumps(analysis.topics),
                            analysis.summary,
                            1 if analysis.needs_reply else 0
                        )
                        for h, text, analysis in items
                    ]
                )
        except Exception as e:
            logger.warning(f"Bulk cache insertion error: {e}")
        finally:
            if conn:
                conn.close()

    def count(self) -> int:
        """Total cached entries."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM analysis_cache")
            return cursor.fetchone()[0]
        except Exception:
            return 0
        finally:
            if conn:
                conn.close()
