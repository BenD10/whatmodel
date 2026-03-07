#!/usr/bin/env python3
"""Extract all GPU IDs from src/lib/data/gpus.json."""

from gpu_script_utils import load_gpus


def extract_gpu_ids() -> list[str]:
    gpus = load_gpus()
    return [gpu["id"] for gpu in gpus]


def main() -> None:
    ids = extract_gpu_ids()
    print(f"Found {len(ids)} GPU IDs:")
    for i, gpu_id in enumerate(ids, start=1):
        print(f"{i}. {gpu_id}")


if __name__ == "__main__":
    main()
