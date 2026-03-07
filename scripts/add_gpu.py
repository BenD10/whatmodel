#!/usr/bin/env python3
"""
Add a new GPU to src/lib/data/gpus.json.

Usage:
    python scripts/add_gpu.py "GeForce RTX 5090" --manufacturer NVIDIA --vram 32 --bandwidth 1792
    python scripts/add_gpu.py "M5 Max" --manufacturer Apple --option 48:500 --option 64:550
"""

import argparse
import json
import sys

from gpu_script_utils import (
    load_gpus,
    save_gpus,
    slugify_gpu_id,
    validate_gpu_entry,
    normalize_number,
    normalize_options,
    insert_gpu_with_order,
)


def parse_option(value: str) -> dict:
    """Parse option in format 'vram:bandwidth', e.g. '64:546'."""
    parts = value.split(":")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(
            f"Invalid option '{value}'. Use format VRAM:BANDWIDTH (example: 64:546)."
        )
    try:
        vram_gb = float(parts[0])
        bandwidth_gbps = float(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid option '{value}'. VRAM and bandwidth must be numeric."
        ) from exc
    if vram_gb <= 0 or bandwidth_gbps <= 0:
        raise argparse.ArgumentTypeError(
            f"Invalid option '{value}'. VRAM and bandwidth must be positive."
        )
    return {"vram_gb": vram_gb, "bandwidth_gbps": bandwidth_gbps}


def build_entry(args: argparse.Namespace) -> dict:
    gpu_id = args.id or slugify_gpu_id(args.name)
    entry = {
        "id": gpu_id,
        "name": args.name.strip(),
        "manufacturer": args.manufacturer,
    }

    if args.option:
        entry["vram_options"] = normalize_options(args.option)
    else:
        entry["vram_gb"] = normalize_number(args.vram)
        entry["bandwidth_gbps"] = normalize_number(args.bandwidth)
    return entry


def main() -> None:
    parser = argparse.ArgumentParser(description="Add a new GPU to gpus.json.")
    parser.add_argument("name", type=str, help="GPU display name")
    parser.add_argument(
        "--manufacturer",
        required=True,
        choices=["NVIDIA", "AMD", "Intel", "Apple"],
        help="GPU manufacturer group",
    )
    parser.add_argument(
        "--id",
        type=str,
        default=None,
        help="Override GPU id (kebab-case). Default: slug generated from name",
    )
    parser.add_argument(
        "--vram",
        type=float,
        default=None,
        help="Discrete GPU VRAM (GB). Must be used with --bandwidth.",
    )
    parser.add_argument(
        "--bandwidth",
        type=float,
        default=None,
        help="Discrete GPU memory bandwidth (GB/s). Must be used with --vram.",
    )
    parser.add_argument(
        "--option",
        action="append",
        type=parse_option,
        help="Unified-memory option in format VRAM:BANDWIDTH (repeatable).",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt and write immediately.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the entry that would be added without writing.",
    )
    args = parser.parse_args()

    if args.option and (args.vram is not None or args.bandwidth is not None):
        parser.error("Use either --option (unified memory) or --vram/--bandwidth (discrete), not both.")
    if (args.vram is None) != (args.bandwidth is None):
        parser.error("--vram and --bandwidth must be provided together for discrete GPUs.")
    if not args.option and args.vram is None:
        parser.error("Provide either --option (unified) or --vram + --bandwidth (discrete).")

    gpus = load_gpus()
    existing_ids = {gpu["id"] for gpu in gpus}

    new_gpu = build_entry(args)
    errors = validate_gpu_entry(new_gpu, existing_ids=existing_ids)
    if errors:
        print("Validation failed:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    print("New GPU entry:")
    print(json.dumps(new_gpu, indent=2))
    print()

    if args.dry_run:
        print("Dry run enabled; no file changes made.")
        return

    if not args.yes:
        confirm = input("Add this GPU to gpus.json? (y/n): ").strip().lower()
        if confirm != "y":
            print("Operation cancelled.")
            return

    updated = insert_gpu_with_order(gpus, new_gpu)
    save_gpus(updated)
    print("Added GPU to src/lib/data/gpus.json")


if __name__ == "__main__":
    main()
