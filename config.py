"""Configuration loader for ReviewLens application."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory of the repository
BASE_DIR = Path(__file__).resolve().parent

# Load .env if present
env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# LLM & API configurations
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()

# Provider resolution
_explicit_provider = os.getenv("LLM_PROVIDER", "").lower().strip()
if _explicit_provider in ("gemini", "groq", "openrouter", "mock"):
    LLM_PROVIDER = _explicit_provider
elif GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
    LLM_PROVIDER = "gemini"
elif GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
    LLM_PROVIDER = "groq"
elif OPENROUTER_API_KEY and OPENROUTER_API_KEY != "your_openrouter_api_key_here":
    LLM_PROVIDER = "openrouter"
else:
    LLM_PROVIDER = "mock"

# Batching & Rate Limiting parameters
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "5"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "2"))
INITIAL_BACKOFF_SECONDS = float(os.getenv("INITIAL_BACKOFF_SECONDS", "1.0"))

# Database & Cache
CACHE_DB_PATH = os.getenv("CACHE_DB_PATH", str(BASE_DIR / "cache.db"))

# Server options
PORT = int(os.getenv("PORT", "5000"))
DEBUG = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
