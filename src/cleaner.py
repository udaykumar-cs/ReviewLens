"""CSV Data Cleaning and Validation Module for ReviewLens."""
import csv
import io
import re
import hashlib
from typing import List, Tuple
from src.schemas import CleanedRow


def clean_html_tags(text: str) -> str:
    """Strip basic HTML markup from text."""
    if not text:
        return ""
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]*>", "", text)
    return cleaned.strip()


def parse_rating(raw_val: str) -> Tuple[bool, int | None]:
    """
    Parse a rating value safely.
    Returns (is_valid, parsed_integer_or_none).
    Handles empty string, non-numeric strings ('five'), floats, etc.
    Valid ratings are integers between 1 and 5 inclusive.
    """
    if raw_val is None:
        return False, None
    s = str(raw_val).strip()
    if not s:
        return False, None

    # Handle word numbers if present (e.g. 'five')
    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5
    }
    if s.lower() in word_to_num:
        # Recognized word number: note that original was non-standard
        return False, None  # Marked invalid per requirement "treat missing or invalid rating as unknown"

    try:
        val = float(s)
        int_val = int(val)
        if val == int_val and 1 <= int_val <= 5:
            return True, int_val
        return False, None
    except (ValueError, TypeError):
        return False, None


def compute_text_hash(text: str) -> str:
    """Compute SHA-256 hash of normalized text for caching and deduplication."""
    norm = text.strip()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def parse_and_clean_csv(file_content: str | bytes) -> List[CleanedRow]:
    """
    Parses raw CSV content into structured CleanedRow items.
    Handles:
      - Quoted multiline reviews
      - UTF-8 characters (Hindi, Hinglish, emojis)
      - Empty review text detection
      - Invalid / missing ratings
      - Duplicate text detection across rows
    """
    if isinstance(file_content, bytes):
        # Decode UTF-8 safely, handling BOM if present
        try:
            text_data = file_content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text_data = file_content.decode("latin-1", errors="replace")
    else:
        text_data = file_content

    # Read CSV with standard csv module to handle quotes and multiline cells properly
    reader = csv.reader(io.StringIO(text_data))
    
    rows = []
    header = None
    seen_hashes = {}  # hash -> first review_id

    for row_idx, row in enumerate(reader, start=1):
        if not row or not any(field.strip() for field in row):
            continue  # Blank lines

        # Detect and skip header row
        if header is None:
            first_col = row[0].strip().lower()
            if "review" in first_col or "id" in first_col:
                header = [h.strip().lower() for h in row]
                continue
            else:
                # If no header is present, treat as data row with default positions
                header = ["review_id", "product", "rating", "date", "review_text"]

        # Map row columns
        # Expected: review_id, product, rating, date, review_text
        review_id = row[0].strip() if len(row) > 0 else f"ROW_{row_idx}"
        product = row[1].strip() if len(row) > 1 else "Unknown Product"
        raw_rating = row[2].strip() if len(row) > 2 else ""
        date = row[3].strip() if len(row) > 3 else ""
        raw_text = row[4] if len(row) > 4 else ""

        # Rating validation
        is_rating_valid, rating = parse_rating(raw_rating)

        # Text cleaning and empty detection
        cleaned_text = clean_html_tags(raw_text)
        is_empty = len(cleaned_text.strip()) == 0

        # Duplicate detection (only check non-empty reviews)
        text_hash = compute_text_hash(cleaned_text)
        is_duplicate = False
        duplicate_of = None

        if not is_empty:
            if text_hash in seen_hashes:
                is_duplicate = True
                duplicate_of = seen_hashes[text_hash]
            else:
                seen_hashes[text_hash] = review_id

        cleaned_row = CleanedRow(
            review_id=review_id,
            product=product,
            rating=rating,
            rating_raw=raw_rating,
            date=date,
            review_text=raw_text,
            cleaned_text=cleaned_text,
            is_empty=is_empty,
            is_duplicate=is_duplicate,
            duplicate_of=duplicate_of,
            rating_valid=is_rating_valid,
            text_hash=text_hash,
        )
        rows.append(cleaned_row)

    return rows
