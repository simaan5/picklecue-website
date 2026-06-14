"""Run reporting: counters + per-row CSV/JSON output."""
from __future__ import annotations

import csv
import json
import os
import time

from .config import config


class Reporter:
    def __init__(self) -> None:
        self.counts = {"created": 0, "updated": 0, "skipped": 0, "errors": 0, "needs_review": 0}
        self.rows: list[dict] = []

    def record(self, record: dict, result: dict) -> None:
        action = result.get("action", "")
        if action.startswith("created"):
            self.counts["created"] += 1
        elif action.startswith("updated"):
            self.counts["updated"] += 1
        elif action == "skipped":
            self.counts["skipped"] += 1
        elif action == "error":
            self.counts["errors"] += 1
        if result.get("status") == "needs_review":
            self.counts["needs_review"] += 1
        self.rows.append({
            "ebay_item_id": record.get("ebay_item_id", ""),
            "sku": record.get("sku", ""),
            "title": record.get("title", ""),
            "action": action,
            "product_id": result.get("id", 0),
            "status": result.get("status", ""),
            "error": result.get("error", ""),
        })

    def summary(self) -> str:
        c = self.counts
        return (f"Created: {c['created']} · Updated: {c['updated']} · "
                f"Needs review: {c['needs_review']} · Skipped: {c['skipped']} · Errors: {c['errors']}")

    def write(self) -> str:
        os.makedirs(config.report_dir, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        csv_path = os.path.join(config.report_dir, f"report-{stamp}.csv")
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(self.rows[0].keys()) if self.rows else
                                    ["ebay_item_id", "sku", "title", "action", "product_id", "status", "error"])
            writer.writeheader()
            writer.writerows(self.rows)
        with open(os.path.join(config.report_dir, f"report-{stamp}.json"), "w", encoding="utf-8") as fh:
            json.dump({"counts": self.counts, "rows": self.rows}, fh, indent=2)
        return csv_path
