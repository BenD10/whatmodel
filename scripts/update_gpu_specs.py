#!/usr/bin/env python3
"""
Update an existing GPU entry in src/lib/data/gpus.json.

Usage examples:
    python scripts/update_gpu_specs.py rtx-5090 --vram 32 --bandwidth 1792
    python scripts/update_gpu_specs.py m4-max --option 48:546 --option 64:546
    python scripts/update_gpu_specs.py arc-b580 --name "Arc B580 Limited Edition"
"""

import argparse
import json
import sys

from gpu_script_utils import (
    load_gpus,
    save_gpus,
    validate_gpu_entry,
    normalize_number,
    normalize_options,
    insert_gpu_with_order,
)


def parse_option(value: str) -> dict:
    parts = value.split(":")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(
            f"Invalid option '{value}'. Use format VRAM:BANDWIDTH (example: 64:546)."
        )
    try:
        vram = float(parts[0])
        bandwidth = float(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid option '{value}'. VRAM and bandwidth must be numeric."
        ) from exc
    if vram <= 0 or bandwidth <= 0:
        raise argparse.ArgumentTypeError(
            f"Invalid option '{value}'. VRAM and bandwidth must be positive."
        )
    return {"vram_gb": vram, "bandwidth_gbps": bandwidth}


def main() -> None:
    parser = argparse.ArgumentParser(description="Update an existing GPU in gpus.json.")
    parser.add_argument("gpu_id", type=str, help="ID of GPU entry to update")
    parser.add_argument("--name", type=str, default=None, help="Updated GPU display name")
    parser.add_argument(
        "--manufacturer",
        choices=["NVIDIA", "AMD", "Intel", "Apple"],
        default=None,
        help="Updated manufacturer group",
    )
    parser.add_argument(
        "--vram",
        type=float,
        default=None,
        help="Discrete GPU VRAM (GB); must be paired with --bandwidth.",
    )
    parser.add_argument(
        "--bandwidth",
        type=float,
        default=None,
        help="Discrete GPU bandwidth (GB/s); must be paired with --vram.",
    )
    parser.add_argument(
        "--option",
        action="append",
        type=parse_option,
        help="Unified-memory option in format VRAM:BANDWIDTH. If provided, replaces options.",
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without saving.")
    args = parser.parse_args()

    if args.option and (args.vram is not None or args.bandwidth is not None):
        parser.error("Use either --option or --vram/--bandwidth, not both.")
    if (args.vram is None) != (args.bandwidth is None):
        parser.error("--vram and --bandwidth must be provided together.")

    gpus = load_gpus()
    target_idx = next((i for i, gpu in enumerate(gpus) if gpu.get("id") == args.gpu_id), None)
    if target_idx is None:
        print(f"GPU id '{args.gpu_id}' not found.")
        sys.exit(1)

    original_gpu = gpus[target_idx]
    updated_gpu = dict(original_gpu)

    if args.name is not None:
        updated_gpu["name"] = args.name.strip()
    if args.manufacturer is not None:
        updated_gpu["manufacturer"] = args.manufacturer

    if args.option:
        updated_gpu.pop("vram_gb", None)
        updated_gpu.pop("bandwidth_gbps", None)
        updated_gpu["vram_options"] = normalize_options(args.option)
    elif args.vram is not None and args.bandwidth is not None:
        updated_gpu.pop("vram_options", None)
        updated_gpu["vram_gb"] = normalize_number(args.vram)
        updated_gpu["bandwidth_gbps"] = normalize_number(args.bandwidth)

    existing_ids = {gpu["id"] for gpu in gpus if gpu["id"] != args.gpu_id}
    errors = validate_gpu_entry(updated_gpu, existing_ids=existing_ids, allow_existing_id=False)
    if errors:
        print("Validation failed:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    print("Current entry:")
    print(json.dumps(original_gpu, indent=2))
    print("\nUpdated entry:")
    print(json.dumps(updated_gpu, indent=2))
    print()

    if args.dry_run:
        print("Dry run enabled; no file changes made.")
        return

    if not args.yes:
        confirm = input("Apply update to gpus.json? (y/n): ").strip().lower()
        if confirm != "y":
            print("Operation cancelled.")
            return

    del gpus[target_idx]
    gpus = insert_gpu_with_order(gpus, updated_gpu)
    save_gpus(gpus)
    print("Updated GPU entry in src/lib/data/gpus.json")


if __name__ == "__main__":
    main()
