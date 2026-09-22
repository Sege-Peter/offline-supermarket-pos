"""
Supermarket Offline Sync Worker
Runs as a background daemon on checkout lane terminals.
Monitors network connectivity to the central store server / cloud MySQL instance.
When online, drains queued local SQLite sales batches and marks them as synced.
"""

import time
import json
import sqlite3
import os

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

SQLITE_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pos_local.db")
CENTRAL_SYNC_URL = os.getenv("CENTRAL_SYNC_URL", "http://192.168.1.100:5000/api/sync/batch")
SYNC_INTERVAL_SEC = 15


def get_unsynced_sales():
    if not os.path.exists(SQLITE_DB):
        return []
    conn = sqlite3.connect(SQLITE_DB)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sales WHERE is_synced = 0 ORDER BY id ASC LIMIT 50")
    sales = [dict(r) for r in cursor.fetchall()]

    # Fetch associated items
    for sale in sales:
        cursor.execute("SELECT * FROM sale_items WHERE sale_id = ?", (sale["id"],))
        sale["items"] = [dict(i) for i in cursor.fetchall()]

    conn.close()
    return sales


def mark_sales_synced(sale_ids):
    if not sale_ids or not os.path.exists(SQLITE_DB):
        return
    conn = sqlite3.connect(SQLITE_DB)
    placeholders = ",".join("?" for _ in sale_ids)
    conn.execute(f"UPDATE sales SET is_synced = 1 WHERE id IN ({placeholders})", sale_ids)
    conn.commit()
    conn.close()
    print(f"[✓] Successfully marked {len(sale_ids)} sales as synced with central store server.")


def run_sync_loop():
    print(f"[*] Starting Offline Sync Daemon (Polling every {SYNC_INTERVAL_SEC}s)...")
    while True:
        try:
            unsynced = get_unsynced_sales()
            if unsynced:
                print(f"[i] Found {len(unsynced)} pending offline sales. Attempting upload to {CENTRAL_SYNC_URL}...")
                if REQUESTS_AVAILABLE:
                    try:
                        res = requests.post(CENTRAL_SYNC_URL, json={"batch": unsynced}, timeout=5)
                        if res.status_code == 200 and res.json().get("success"):
                            synced_ids = [s["id"] for s in unsynced]
                            mark_sales_synced(synced_ids)
                        else:
                            print(f"[!] Sync rejected by central server: {res.text}")
                    except Exception as e:
                        print(f"[~] Central server offline ({e}). Keeping transactions safely buffered locally.")
                else:
                    print("[!] 'requests' library not installed. Simulated offline buffer intact.")
            else:
                pass
        except Exception as err:
            print(f"[!] Error during sync pass: {err}")

        time.sleep(SYNC_INTERVAL_SEC)


if __name__ == "__main__":
    run_sync_loop()
