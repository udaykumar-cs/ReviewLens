"""Tests for CSV parsing, sanitization, bad row handling, and deduplication."""
import unittest
from src.cleaner import parse_and_clean_csv, parse_rating, clean_html_tags, compute_text_hash


class TestCleaner(unittest.TestCase):

    def test_parse_rating_valid_and_invalid(self):
        # Valid ratings 1-5
        self.assertEqual(parse_rating("1"), (True, 1))
        self.assertEqual(parse_rating("5"), (True, 5))
        self.assertEqual(parse_rating("3.0"), (True, 3))

        # Invalid ratings per requirement "treat a missing or invalid rating as unknown"
        self.assertEqual(parse_rating(""), (False, None))
        self.assertEqual(parse_rating("   "), (False, None))
        self.assertEqual(parse_rating(None), (False, None))
        self.assertEqual(parse_rating("five"), (False, None))  # String number (R022)
        self.assertEqual(parse_rating("0"), (False, None))     # Out of bounds
        self.assertEqual(parse_rating("6"), (False, None))     # Out of bounds
        self.assertEqual(parse_rating("abc"), (False, None))

    def test_clean_html_tags(self):
        raw = "<b>Love it!</b> Keeps my desk clean."
        cleaned = clean_html_tags(raw)
        self.assertEqual(cleaned, "Love it! Keeps my desk clean.")

    def test_empty_review_flagged(self):
        csv_data = (
            'review_id,product,rating,date,review_text\n'
            'R001,Product A,5,2026-10-01,"Valid review"\n'
            'R005,Product A,5,2026-10-07,""\n'
            'R006,Product A,4,2026-10-08,"   "\n'
        )
        rows = parse_and_clean_csv(csv_data)
        self.assertEqual(len(rows), 3)
        self.assertFalse(rows[0].is_empty)
        self.assertTrue(rows[1].is_empty)
        self.assertTrue(rows[2].is_empty)

    def test_duplicate_review_detection(self):
        csv_data = (
            'review_id,product,rating,date,review_text\n'
            'R012,Wireless Earbuds,1,2026-10-03,"Left earbud stopped working after 2 days."\n'
            'R015,Wireless Earbuds,1,2026-10-03,"Left earbud stopped working after 2 days."\n'
        )
        rows = parse_and_clean_csv(csv_data)
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0].is_duplicate)
        self.assertTrue(rows[1].is_duplicate)
        self.assertEqual(rows[1].duplicate_of, "R012")

    def test_full_dataset_cleaner_stability(self):
        with open("reviews.csv", "r", encoding="utf-8") as f:
            content = f.read()
        rows = parse_and_clean_csv(content)
        self.assertEqual(len(rows), 30)

        # R005 is empty
        r005 = next(r for r in rows if r.review_id == "R005")
        self.assertTrue(r005.is_empty)

        # R010 has missing rating
        r010 = next(r for r in rows if r.review_id == "R010")
        self.assertFalse(r010.rating_valid)
        self.assertIsNone(r010.rating)

        # R015 is duplicate of R012
        r015 = next(r for r in rows if r.review_id == "R015")
        self.assertTrue(r015.is_duplicate)
        self.assertEqual(r015.duplicate_of, "R012")

        # R022 has invalid rating 'five'
        r022 = next(r for r in rows if r.review_id == "R022")
        self.assertFalse(r022.rating_valid)
        self.assertIsNone(r022.rating)


if __name__ == "__main__":
    unittest.main()
