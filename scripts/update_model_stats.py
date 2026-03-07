#!/usr/bin/env python3
"""
Fetch and update benchmark scores for models from Hugging Face.

Usage:
    python scripts/update_model_stats.py [--models MODEL1,MODEL2,...]

Examples:
    python scripts/update_model_stats.py
    python scripts/update_model_stats.py --models llama-3.2-1b-q8,qwen-2.5-7b-instruct

This script will fetch benchmark scores (MMLU, SWE-bench) from Hugging Face
and update the models.json file with the latest data.
"""

import json
from pathlib import Path

def fetch_model_benchmarks(model_id: str) -> dict:
    """
    Fetch benchmark scores for a model from Hugging Face API.
    
    Args:
        model_id: The model identifier to look up.
    
    Returns:
        Dictionary containing benchmark data, or empty dict if not found.
    """
    import requests
    
    url = f"https://huggingface.co/api/models/{model_id}"
    response = requests.get(url, timeout=30)
    
    if response.status_code != 200:
        return {}
    
    model_info = response.json()
    cardData = model_info.get("cardData", {})
    
    # Extract benchmark scores from cardData
    benchmarks = {
        "mmlu_score": None,
        "swe_bench_score": None,
        "hellaswag_score": None,
        "arc_score": None,
        "truthfulqa_score": None,
    }
    
    for key, value in cardData.items():
        if isinstance(value, dict) and "score" in value:
            benchmarks[key] = value["score"]
    
    return benchmarks

def update_model_in_json(models_file: str, model_id: str, benchmarks: dict) -> None:
    """
    Update a model's benchmark scores in the JSON file.
    
    Args:
        models_file: Path to the models.json file.
        model_id: The model identifier to update.
        benchmarks: Dictionary of benchmark scores to update.
    """
    with open(models_file, 'r') as f:
        models = json.load(f)
    
    # Find and update the model
    for model in models:
        if model['id'] == model_id:
            for key, value in benchmarks.items():
                if value is not None:
                    model[key + "_score"] = value
            break
    
    # Write back with pretty formatting
    with open(models_file, 'w') as f:
        json.dump(models, f, indent=2)

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Fetch and update benchmark scores for models",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python update_model_stats.py
  python update_model_stats.py --models llama-3.2-1b-q8,qwen-2.5-7b-instruct
  python update_model_stats.py --dry-run  # Preview changes without saving
        """
    )
    parser.add_argument(
        "--models", "-m",
        type=str,
        default=None,
        help="Comma-separated list of model IDs to update (reads all if not specified)"
    )
    parser.add_argument(
        "--dry-run", "-d",
        action="store_true",
        help="Preview changes without saving to file"
    )
    
    args = parser.parse_args()
    
    models_path = Path(__file__).parent.parent / 'src' / 'lib' / 'data' / 'models.json'
    
    # Determine which models to process
    if args.models:
        model_ids = [m.strip() for m in args.models.split(',')]
        print(f"Updating benchmark scores for {len(model_ids)} specified model(s):\n")
    else:
        # Read all models and update them
        with open(models_path, 'r') as f:
            models = json.load(f)
        
        model_ids = [m['id'] for m in models]
        print(f"Updating benchmark scores for {len(model_ids)} models...")
    
    # Fetch and update benchmarks
    updated_count = 0
    skipped_count = 0
    errors = []
    
    for model_id in model_ids:
        print(f"\n{'='*60}")
        print(f"Fetching benchmarks for: {model_id}")
        print("-" * 50)
        
        try:
            benchmarks = fetch_model_benchmarks(model_id)
            
            if not benchmarks:
                print(f"No benchmark data found for {model_id}")
                skipped_count += 1
                continue
            
            # Show what was found
            available_scores = [k for k, v in benchmarks.items() if v is not None]
            if available_scores:
                print(f"Found benchmarks: {', '.join(available_scores)}")
                
                if args.dry_run:
                    print(f"\nWould update model '{model_id}' with:")
                    for key, value in benchmarks.items():
                        if value is not None:
                            print(f"  {key}_score: {value}")
                else:
                    # Update the file
                    update_model_in_json(str(models_path), model_id, benchmarks)
                    updated_count += 1
                    print(f"Updated '{model_id}' with benchmark scores.")
            else:
                print("No benchmark scores available for this model")
                skipped_count += 1
        
        except Exception as e:
            error_msg = f"Error processing {model_id}: {str(e)}"
            print(error_msg)
            errors.append((model_id, str(e)))
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print("-" * 50)
    print(f"Models processed: {len(model_ids)}")
    print(f"Updated: {updated_count}")
    print(f"Skipped (no data): {skipped_count}")
    if errors:
        print(f"Errors: {len(errors)}")

if __name__ == "__main__":
    main()
