"""Tests for Pydantic Schema Validation (Requirement 3)."""
import unittest
from pydantic import ValidationError
from src.schemas import LLMReviewOutput, ALLOWED_SENTIMENTS, ALLOWED_TOPICS


class TestSchemaValidation(unittest.TestCase):

    def test_valid_schema_passes(self):
        valid_payload = {
            "sentiment": "positive",
            "topics": ["quality", "delivery"],
            "summary": "Great bedsheet and fast delivery.",
            "needs_reply": False
        }
        obj = LLMReviewOutput.model_validate(valid_payload)
        self.assertEqual(obj.sentiment, "positive")
        self.assertEqual(obj.topics, ["quality", "delivery"])
        self.assertEqual(obj.summary, "Great bedsheet and fast delivery.")
        self.assertFalse(obj.needs_reply)

    def test_invalid_sentiment_rejected(self):
        invalid_payload = {
            "sentiment": "very_positive",  # Not in allowed list
            "topics": ["quality"],
            "summary": "Great quality.",
            "needs_reply": False
        }
        with self.assertRaises(ValidationError):
            LLMReviewOutput.model_validate(invalid_payload)

    def test_invalid_topic_rejected(self):
        invalid_payload = {
            "sentiment": "neutral",
            "topics": ["shipping_speed"],  # Not in allowed list
            "summary": "Standard delivery.",
            "needs_reply": False
        }
        with self.assertRaises(ValidationError):
            LLMReviewOutput.model_validate(invalid_payload)

    def test_empty_topics_rejected(self):
        invalid_payload = {
            "sentiment": "positive",
            "topics": [],  # Must be one or more
            "summary": "Nice product.",
            "needs_reply": False
        }
        with self.assertRaises(ValidationError):
            LLMReviewOutput.model_validate(invalid_payload)

    def test_empty_summary_rejected(self):
        invalid_payload = {
            "sentiment": "positive",
            "topics": ["quality"],
            "summary": "",  # Empty summary
            "needs_reply": False
        }
        with self.assertRaises(ValidationError):
            LLMReviewOutput.model_validate(invalid_payload)

    def test_case_insensitivity_and_cleaning(self):
        payload = {
            "sentiment": "  NEGATIVE ",
            "topics": ["Quality", "  Packaging  "],
            "summary": "  Box was damaged.\nSecond line that should be stripped.",
            "needs_reply": "true"
        }
        obj = LLMReviewOutput.model_validate(payload)
        self.assertEqual(obj.sentiment, "negative")
        self.assertEqual(obj.topics, ["quality", "packaging"])
        self.assertEqual(obj.summary, "Box was damaged.")
        self.assertTrue(obj.needs_reply)


if __name__ == "__main__":
    unittest.main()
