#!/usr/bin/env python3
"""
Cognee Python SDK smoke test.
Connects to Cognee Cloud via serve(), runs remember + recall,
and reports any errors (including DNS / connectivity flakiness).
"""

import asyncio
import os
import sys
import time

# Load env from project .env
from pathlib import Path
import dotenv

dotenv.load_dotenv(Path(__file__).resolve().parents[2] / ".env")
dotenv.load_dotenv(Path(__file__).resolve().parents[2] / "apps/server/.env")

import cognee


async def main():
    url = os.environ.get("COGNEE_CLOUD_BASE_URL") or os.environ.get("COGNEE_BASE_URL")
    api_key = os.environ.get("COGNEE_CLOUD_API_KEY") or os.environ.get("COGNEE_API_KEY")

    if not url or not api_key:
        print("ERROR: Missing COGNEE_BASE_URL or COGNEE_API_KEY", file=sys.stderr)
        sys.exit(1)

    dataset_name = f"python_smoke_{int(time.time())}"

    print(f"Connecting to: {url}")
    print(f"Dataset:       {dataset_name}")
    print()

    # --- Connect ---
    try:
        await cognee.serve(url=url, api_key=api_key)
        print("✓ serve() connected")
    except Exception as e:
        print(f"✗ serve() FAILED: {e}", file=sys.stderr)
        sys.exit(1)

    # --- Remember ---
    try:
        await cognee.remember(
            "Cognee is a knowledge graph platform for AI applications. "
            "Artificial intelligence transforms how we work and live.",
            dataset_name=dataset_name,
        )
        print("✓ remember() succeeded")
    except Exception as e:
        print(f"✗ remember() FAILED: {e}", file=sys.stderr)
        await cognee.disconnect()
        sys.exit(1)

    # --- Recall ---
    try:
        results = await cognee.recall(query_text="What does AI transform?")
        print(f"✓ recall() returned {len(results)} results")
        for r in results:
            print(f"  → {r}")
    except Exception as e:
        print(f"✗ recall() FAILED: {e}", file=sys.stderr)
        await cognee.disconnect()
        sys.exit(1)

    # --- Disconnect ---
    await cognee.disconnect()
    print("✓ disconnect()")
    print()
    print("All checks passed.")


asyncio.run(main())
