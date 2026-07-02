"""
Supabase client singleton.

Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from the environment.
Uses the service role key (not the anon key) so server-side operations
(storage upload, table writes) bypass Row Level Security.
"""

from __future__ import annotations

import os

from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return the shared Supabase client, creating it on first call."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client
