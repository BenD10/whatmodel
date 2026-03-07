# Model Scripts

Scripts in this folder manage `src/lib/data/models.json`.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `add_model.py` | Add a model by querying Hugging Face metadata |
| `extract_model_ids.py` | Print all model IDs from `models.json` |
| `list_recent_models.py` | List newly uploaded Hugging Face models |
| `update_model_stats.py` | Update benchmark fields in `models.json` |

## Usage

```bash
# Add a model by name or HF model id
python3 scripts/models/add_model.py "Llama-3.2-1B-Instruct-Q8_0-GGUF"

# Extract all model IDs
python3 scripts/models/extract_model_ids.py

# List recent Hugging Face uploads
python3 scripts/models/list_recent_models.py --days 30 --short

# Update benchmark stats for all models
python3 scripts/models/update_model_stats.py
```

## Notes

- These commands currently delegate to the existing top-level scripts in `scripts/`.
- Hugging Face scripts require `requests` (`pip install requests`).
