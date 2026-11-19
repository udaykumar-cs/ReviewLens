"""ReviewLens Flask Application Server."""
import os
import logging
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

import config
from src.pipeline import ReviewPipeline
from src.analyzer import ReviewAnalyzer
from src.cache import ReviewCache

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("reviewlens")

app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static"
)
CORS(app)

# Initialize pipeline and analyzer
pipeline = ReviewPipeline()
analyzer = pipeline.analyzer
cache = pipeline.cache


@app.route("/")
def index():
    """Serves the main single-screen ReviewLens dashboard."""
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """Healthcheck endpoint returning server and provider metadata."""
    return jsonify({
        "status": "healthy",
        "app": "ReviewLens",
        "version": "1.0.0",
        "provider": config.LLM_PROVIDER,
        "cached_reviews": cache.count()
    })


@app.route("/api/upload", methods=["POST"])
def upload_csv():
    """
    Core Requirement 1: User uploads reviews.csv from browser.
    Parses, cleans, deduplicates, caches, analyzes with LLM, and returns metrics.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Please attach a CSV file."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    try:
        content = file.read()
        if not content:
            return jsonify({"error": "The uploaded CSV file is empty."}), 400

        result = pipeline.process_csv_content(content)
        return jsonify(result), 200

    except Exception as e:
        logger.exception("Failed to process uploaded CSV")
        return jsonify({"error": f"Internal processing error: {str(e)}"}), 500


@app.route("/api/sample-data", methods=["GET"])
def load_sample_data():
    """Convenience endpoint to load the pre-bundled reviews.csv immediately."""
    sample_path = config.BASE_DIR / "reviews.csv"
    if not sample_path.exists():
        return jsonify({"error": "Sample reviews.csv not found on server."}), 404

    try:
        with open(sample_path, "rb") as f:
            content = f.read()
        result = pipeline.process_csv_content(content)
        return jsonify(result), 200
    except Exception as e:
        logger.exception("Failed to process sample CSV")
        return jsonify({"error": f"Failed to load sample dataset: {str(e)}"}), 500


@app.route("/api/suggest-reply", methods=["POST"])
def suggest_reply():
    """
    Core Requirement 7: A suggested reply for each review marked needs_reply
    generated on click, not upfront.
    """
    data = request.get_json(silent=True) or {}
    product = data.get("product", "Product")
    review_text = data.get("review_text", "")
    summary = data.get("summary", "")
    topics = data.get("topics", [])
    tone = data.get("tone", "empathetic")

    if not review_text:
        return jsonify({"error": "Missing review_text for generating reply"}), 400

    try:
        reply = analyzer.suggest_merchant_reply(
            product=product,
            review_text=review_text,
            summary=summary,
            topics=topics,
            tone=tone
        )
        return jsonify({"reply": reply}), 200
    except Exception as e:
        logger.exception("Failed to generate suggested reply")
        return jsonify({"error": f"Failed to generate reply: {str(e)}"}), 500


@app.route("/api/clear-cache", methods=["POST"])
def clear_cache():
    """Utility endpoint to clear the SQLite cache for testing."""
    try:
        with cache._get_connection() as conn:
            conn.execute("DELETE FROM analysis_cache")
            conn.commit()
        return jsonify({"message": "Cache successfully cleared"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to clear cache: {str(e)}"}), 500


if __name__ == "__main__":
    logger.info(f"Starting ReviewLens server on http://localhost:{config.PORT}")
    app.run(
        host="0.0.0.0",
        port=config.PORT,
        debug=config.DEBUG
    )
