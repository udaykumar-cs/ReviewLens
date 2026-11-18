"""Tests for SQLite Caching (Requirement 6)."""
import unittest
import tempfile
import os
from src.schemas import LLMReviewOutput
from src.cache import ReviewCache


class TestCache(unittest.TestCase):

    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(delete=False)
        self.temp_file.close()
        self.cache = ReviewCache(self.temp_file.name)

    def tearDown(self):
        del self.cache
        import gc
        gc.collect()
        try:
            if os.path.exists(self.temp_file.name):
                os.remove(self.temp_file.name)
        except PermissionError:
            pass

    def test_cache_miss_then_hit(self):
        text_hash = "abc123hash"
        text = "This is a test review."
        
        # Initial check -> miss
        self.assertIsNone(self.cache.get(text_hash))

        # Store in cache
        sample_output = LLMReviewOutput(
            sentiment="positive",
            topics=["quality"],
            summary="Test review summary.",
            needs_reply=False
        )
        self.cache.set(text_hash, text, sample_output)

        # Second check -> hit
        cached = self.cache.get(text_hash)
        self.assertIsNotNone(cached)
        self.assertEqual(cached.sentiment, "positive")
        self.assertEqual(cached.topics, ["quality"])
        self.assertEqual(cached.summary, "Test review summary.")
        self.assertFalse(cached.needs_reply)

    def test_bulk_cache_lookup(self):
        items = [
            ("hash1", "Review 1", LLMReviewOutput(sentiment="positive", topics=["price"], summary="Good price.", needs_reply=False)),
            ("hash2", "Review 2", LLMReviewOutput(sentiment="negative", topics=["delivery"], summary="Delayed shipment.", needs_reply=True))
        ]
        self.cache.set_many(items)

        results = self.cache.get_many(["hash1", "hash2", "hash3"])
        self.assertEqual(len(results), 2)
        self.assertIn("hash1", results)
        self.assertIn("hash2", results)
        self.assertNotIn("hash3", results)
        self.assertEqual(self.cache.count(), 2)


if __name__ == "__main__":
    unittest.main()
