"""
start.py — Production entry point for Railway / Render.

Railway does not guarantee a specific working directory when the start
command runs, so 'uvicorn api.main:app' fails with ModuleNotFoundError
because the 'api' package cannot be found via sys.path.

This script hard-codes /app (where nixpacks copies the repo) into
sys.path before starting uvicorn, making the import reliable regardless
of what directory Railway uses as CWD.
"""

import os
import sys

# Ensure the project root is always importable, regardless of CWD.
sys.path.insert(0, "/app")

import uvicorn  # noqa: E402 — must come after sys.path manipulation

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port)
