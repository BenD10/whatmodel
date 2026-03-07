#!/usr/bin/env python3
"""Run the legacy scripts/list_recent_models.py script."""

import os
import sys
from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[1] / "list_recent_models.py"
    os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])


if __name__ == "__main__":
    main()
