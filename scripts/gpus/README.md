# GPU Scripts

Scripts in this folder manage `src/lib/data/gpus.json`.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `add_gpu.py` | Add a GPU entry (discrete or unified-memory options) |
| `extract_gpu_ids.py` | Print all GPU IDs from `gpus.json` |
| `list_recent_gpus.py` | List the most recent GPU entries by file order |
| `update_gpu_specs.py` | Update specs for an existing GPU entry |

## Usage

```bash
# Add a discrete GPU
python3 scripts/gpus/add_gpu.py "GeForce RTX 5090" --manufacturer NVIDIA --vram 32 --bandwidth 1792

# Add unified-memory options (repeat --option)
python3 scripts/gpus/add_gpu.py "M5 Max" --manufacturer Apple --option 48:500 --option 64:550

# List known GPU ids
python3 scripts/gpus/extract_gpu_ids.py

# Show latest NVIDIA additions
python3 scripts/gpus/list_recent_gpus.py --manufacturer NVIDIA --limit 10

# Update an existing entry
python3 scripts/gpus/update_gpu_specs.py rtx-5090 --vram 32 --bandwidth 1792
```

## Notes

- These commands currently delegate to the existing top-level scripts in `scripts/`.
- Valid manufacturers are `NVIDIA`, `AMD`, `Intel`, and `Apple`.
