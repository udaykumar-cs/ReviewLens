"""Pydantic schemas and models for ReviewLens."""
from enum import Enum
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


class Sentiment(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class Topic(str, Enum):
    QUALITY = "quality"
    DELIVERY = "delivery"
    PRICE = "price"
    PACKAGING = "packaging"
    SUPPORT = "support"
    SIZE_FIT = "size_fit"
    OTHER = "other"


ALLOWED_SENTIMENTS = {s.value for s in Sentiment}
ALLOWED_TOPICS = {t.value for t in Topic}


class LLMReviewOutput(BaseModel):
    """Strict schema required from LLM for every valid review."""
    sentiment: Literal["positive", "neutral", "negative"]
    topics: List[Literal["quality", "delivery", "price", "packaging", "support", "size_fit", "other"]]
    summary: str
    needs_reply: bool

    @field_validator("sentiment", mode="before")
    @classmethod
    def normalize_sentiment(cls, v):
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in ALLOWED_SENTIMENTS:
                return v_clean
        raise ValueError(f"Invalid sentiment '{v}'. Must be one of: {ALLOWED_SENTIMENTS}")

    @field_validator("topics", mode="before")
    @classmethod
    def validate_topics(cls, v):
        if isinstance(v, str):
            # In case LLM returns a single comma-separated string
            items = [item.strip().lower() for item in v.split(",") if item.strip()]
        elif isinstance(v, list):
            items = [str(item).strip().lower() for item in v if str(item).strip()]
        else:
            raise ValueError(f"Invalid topics type: {type(v)}")

        if not items:
            raise ValueError("At least one topic must be specified")

        cleaned = []
        for item in items:
            if item in ALLOWED_TOPICS:
                cleaned.append(item)
            else:
                raise ValueError(f"Invalid topic '{item}'. Allowed: {ALLOWED_TOPICS}")

        return list(dict.fromkeys(cleaned))  # Deduplicate while preserving order

    @field_validator("summary", mode="before")
    @classmethod
    def clean_summary(cls, v):
        if not v or not str(v).strip():
            raise ValueError("Summary must be a non-empty single line in English")
        first_line = str(v).strip().splitlines()[0].strip()
        return first_line

    @field_validator("needs_reply", mode="before")
    @classmethod
    def parse_needs_reply(cls, v):
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if v_clean in ("true", "yes", "1"):
                return True
            if v_clean in ("false", "no", "0"):
                return False
        raise ValueError(f"Invalid boolean for needs_reply: '{v}'")


class CleanedRow(BaseModel):
    """Represents a row parsed and cleaned from CSV."""
    review_id: str
    product: str
    rating: Optional[int] = None
    rating_raw: str
    date: str
    review_text: str
    cleaned_text: str
    is_empty: bool = False
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None
    rating_valid: bool = True
    text_hash: str


class EnrichedReview(BaseModel):
    """Final output object sent to the frontend dashboard."""
    review_id: str
    product: str
    rating: Optional[int]
    rating_display: str
    date: str
    review_text: str
    status: Literal["analyzed", "cached", "skipped_empty", "skipped_duplicate", "analysis_failed"]
    sentiment: Optional[Literal["positive", "neutral", "negative"]] = None
    topics: List[str] = Field(default_factory=list)
    summary: Optional[str] = None
    needs_reply: bool = False
    suggested_reply: Optional[str] = None
    is_rating_mismatch: bool = False
    duplicate_of: Optional[str] = None
    cached: bool = False
