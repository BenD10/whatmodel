#!/usr/bin/env python3
"""Run the legacy scripts/update_model_stats.py script."""

import os
import sys
from pathlib import Path


def main() -> None:
    target = Path(__file__).resolve().parents[1] / "update_model_stats.py"
    os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])


if __name__ == "__main__":
    main()
