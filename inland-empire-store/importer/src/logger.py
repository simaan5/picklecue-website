"""Console + file logger that never prints secrets."""
from __future__ import annotations

import logging
import re
import sys

_SECRET_RE = re.compile(
    r"(token|secret|cert|consumer_key|password)\s*[=:]\s*\S+", re.IGNORECASE
)


class _RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        return _SECRET_RE.sub(r"\1=***redacted***", msg)


def get_logger(name: str = "anstelias-importer") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_RedactingFormatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    return logger


log = get_logger()
