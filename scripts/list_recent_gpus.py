#!/usr/bin/env python3
"""
List recently added GPUs from src/lib/data/gpus.json.

Note:
The GPU file is maintained in newest-first order within manufacturer groups.
This script uses that ordering as a proxy for "recent."
"""

import argparse
import json

from gpu_script_utils import load_gpus


def format_specs(gpu: dict) -> str:
    if gpu.get("vram_options"):
        options = gpu["vram_options"]
        option_str = ", ".join(f'{opt["vram_gb"]}GB/{opt["bandwidth_gbps"]}GBps' for opt in options)
        return f"Unified memory options: {option_str}"
    return f'{gpu["vram_gb"]}GB VRAM, {gpu["bandwidth_gbps"]} GB/s'


def main() -> None:
    parser = argparse.ArgumentParser(description="List recent GPUs from gpus.json.")
    parser.add_argument(
        "--manufacturer",
        "-m",
        choices=["NVIDIA", "AMD", "Intel", "Apple"],
        default=None,
        help="Filter to one manufacturer group.",
    )
    parser.add_argument(
        "--limit",
        "-l",
        type=int,
        default=20,
        help="Maximum number of GPUs to output (default: 20).",
    )
    parser.add_argument(
        "--short",
        "-s",
        action="store_true",
        help="Show only id and name.",
    )
    parser.add_argument(
        "--json",
        "-j",
        action="store_true",
        help="Output as JSON.",
    )
    args = parser.parse_args()

    gpus = load_gpus()
    if args.manufacturer:
        gpus = [gpu for gpu in gpus if gpu.get("manufacturer") == args.manufacturer]
    gpus = gpus[: max(args.limit, 0)]

    if args.json:
        payload = {
            "count": len(gpus),
            "manufacturer": args.manufacturer,
            "gpus": gpus,
        }
        print(json.dumps(payload, indent=2))
        return

    filter_label = args.manufacturer or "all manufacturers"
    print(f"Showing {len(gpus)} recent GPU entries ({filter_label})")
    print("-" * 60)

    for gpu in gpus:
        if args.short:
            print(f'{gpu["id"]}: {gpu["name"]}')
            continue
        print(f'ID: {gpu["id"]}')
        print(f'Name: {gpu["name"]}')
        print(f'Manufacturer: {gpu["manufacturer"]}')
        print(f"Specs: {format_specs(gpu)}")
        print("-" * 60)


if __name__ == "__main__":
    main()
