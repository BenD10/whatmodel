# Data Management Scripts

Scripts are now organized by domain:

- `scripts/models/` for model-data workflows
- `scripts/gpus/` for GPU-data workflows

Each folder has its own README with detailed usage and examples.

## Quick Start

### Model scripts

```bash
python3 scripts/models/add_model.py "Llama-3.2-1B-Instruct-Q8_0-GGUF"
python3 scripts/models/extract_model_ids.py
python3 scripts/models/list_recent_models.py --days 30 --short
python3 scripts/models/update_model_stats.py
```

### GPU scripts

```bash
python3 scripts/gpus/add_gpu.py "GeForce RTX 5090" --manufacturer NVIDIA --vram 32 --bandwidth 1792
python3 scripts/gpus/extract_gpu_ids.py
python3 scripts/gpus/list_recent_gpus.py --manufacturer NVIDIA --limit 10
python3 scripts/gpus/update_gpu_specs.py rtx-5090 --vram 32 --bandwidth 1792
```

## Dependencies

- Python 3.8+
- `requests` (`pip install requests`) for Hugging Face model scripts

## Data Files

- `src/lib/data/models.json` - main model database
- `src/lib/data/gpus.json` - main GPU database
- `src/lib/data/models.minimal.json` - generated minimal model dataset

## Backward Compatibility

Top-level scripts in `scripts/` are still present. The foldered commands are now the preferred interface.
