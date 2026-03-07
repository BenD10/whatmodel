#!/usr/bin/env python3
"""
Extract all model IDs from models.json and output them.
This script reads src/lib/data/models.json and outputs a list of all model IDs.
"""

import json
from pathlib import Path

def extract_model_ids(models_file: str) -> list[str]:
    """Read the models JSON file and extract all model IDs."""
    with open(models_file, 'r') as f:
        models = json.load(f)
    
    ids = [model['id'] for model in models]
    return ids

def main():
    models_path = Path(__file__).parent.parent / 'src' / 'lib' / 'data' / 'models.json'
    ids = extract_model_ids(str(models_path))
    
    print(f"Found {len(ids)} model IDs:")
    for i, id in enumerate(ids, 1):
        print(f"{i}. {id}")

if __name__ == '__main__':
    main()
