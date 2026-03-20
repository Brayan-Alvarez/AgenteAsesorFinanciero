"""
cache.py — Simple TTL (time-to-live) in-memory cache for Google Sheets data.

Why a cache?
    The agent may call tools multiple times within a single conversation session.
    Without caching, each tool call would trigger a new Google Sheets API request,
    which is slow (~1-2s) and subject to rate limits.
    This cache stores the result of expensive calls for a configurable TTL
    (default: 5 minutes), then re-fetches automatically when the data is stale.

Design:
    - Module-level dict stores (value, expiry_timestamp) pairs.
    - Thread-safety is not required for this single-user app.
    - Cache is invalidated on app restart (no persistence to disk).
"""

import time
from typing import Any

# Default TTL in seconds (5 minutes). Can be overridden per call.
DEFAULT_TTL_SECONDS = 300

# Internal cache store: {key: (value, expiry_unix_timestamp)}
_cache: dict[str, tuple[Any, float]] = {}


def get(key: str) -> Any | None:
    """
    Retrieve a cached value if it exists and has not expired.

    Args:
        key: Cache key string.

    Returns:
        The cached value, or None if the key is missing or expired.
    """
    pass  # TODO: implement in Phase 1


def set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:
    """
    Store a value in the cache with a TTL.

    Args:
        key: Cache key string.
        value: Any Python object to cache.
        ttl: Time-to-live in seconds. After this duration, get() returns None.
    """
    pass  # TODO: implement in Phase 1


def invalidate(key: str) -> None:
    """
    Remove a single entry from the cache.

    Useful for forcing a refresh of a specific dataset (e.g., after the user
    updates the Sheets manually and wants fresh data immediately).

    Args:
        key: Cache key to remove. No-op if the key does not exist.
    """
    pass  # TODO: implement in Phase 1


def clear() -> None:
    """
    Remove all entries from the cache.

    Typically called at the start of a new session to ensure fresh data.
    """
    pass  # TODO: implement in Phase 1
