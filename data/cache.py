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

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

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
        Expired entries are removed from the cache on access (lazy eviction).
    """
    entry = _cache.get(key)

    if entry is None:
        # Key was never set.
        return None

    value, expiry = entry

    if time.time() > expiry:
        # Entry exists but has expired — evict it now (lazy cleanup).
        del _cache[key]
        logger.debug("Cache miss (expired): '%s'", key)
        return None

    logger.debug("Cache hit: '%s'", key)
    return value


def set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECONDS) -> None:
    """
    Store a value in the cache with a TTL.

    Args:
        key: Cache key string.
        value: Any Python object to cache (typically a DataFrame or dict).
        ttl: Time-to-live in seconds. After this duration, get() returns None.
    """
    expiry = time.time() + ttl
    _cache[key] = (value, expiry)
    logger.debug("Cache set: '%s' (TTL=%ds)", key, ttl)


def invalidate(key: str) -> None:
    """
    Remove a single entry from the cache.

    Useful for forcing a refresh of a specific dataset (e.g., after the user
    updates the Sheets manually and wants fresh data immediately).

    Args:
        key: Cache key to remove. No-op if the key does not exist.
    """
    removed = _cache.pop(key, None)
    if removed is not None:
        logger.debug("Cache invalidated: '%s'", key)


def clear() -> None:
    """
    Remove all entries from the cache.

    Typically called at the start of a new session to ensure fresh data.
    """
    count = len(_cache)
    _cache.clear()
    logger.debug("Cache cleared: %d entries removed.", count)
