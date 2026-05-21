"""
db/client.py — Supabase client singleton.

Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from environment.
The service key bypasses Row Level Security — never expose it to the frontend.

Usage (everywhere in db/queries.py):
    from db.client import get_supabase
    sb = get_supabase()
    result = sb.table("categories").select("*").execute()
"""

import os
from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return the Supabase client, creating it on first call (singleton)."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
                "Add them to Railway dashboard or your local .env file."
            )
        _client = create_client(url, key)
    return _client
