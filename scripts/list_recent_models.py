#!/usr/bin/env python3
"""
List recently released models from Hugging Face.

Usage:
    python scripts/list_recent_models.py [--days N]

Examples:
    python scripts/list_recent_models.py --days 30
    python scripts/list_recent_models.py --days 7

This script will fetch models uploaded in the last N days and display them.
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

def fetch_hf_models(limit: int = 100) -> list[dict]:
    """
    Fetch recent models from Hugging Face API.
    
    Args:
        limit: Maximum number of models to return.
    
    Returns:
        List of model dictionaries with upload dates and other metadata.
    """
    import requests
    
    url = "https://huggingface.co/api/models"
    params = {
        "limit": limit,
        "sort": "lastModified",
        "direction": -1,  # Descending (newest first)
    }
    response = requests.get(url, params=params, timeout=30)
    
    if response.status_code != 200:
        print(f"Error fetching models: {response.status_code}")
        return []
    
    return response.json()

def parse_upload_date(model_info: dict) -> datetime | None:
    """
    Parse the upload date from model info.
    
    Args:
        model_info: Model dictionary from Hugging Face API.
    
    Returns:
        Datetime object for the upload date, or None if not found.
    """
    # Try 'createdAt' field first
    created_at = model_info.get("createdAt")
    if created_at:
        try:
            # Parse ISO format datetime
            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            return dt
        except (ValueError, TypeError):
            pass
    
    # Try 'created_at' field
    created_at = model_info.get("created_at")
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            return dt
        except (ValueError, TypeError):
            pass
    
    # Try 'trendingScore' or other date fields
    for field in ['lastModified', 'updated_at']:
        value = model_info.get(field)
        if value:
            try:
                dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
                return dt
            except (ValueError, TypeError):
                continue
    
    return None

def filter_recent_models(models: list[dict], days: int) -> list[dict]:
    """
    Filter models to only include those uploaded within the last N days.
    
    Args:
        models: List of model dictionaries from Hugging Face API.
        days: Number of days to filter by.
    
    Returns:
        Filtered list of recent models.
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
    recent_models = []
    
    for model in models:
        upload_date = parse_upload_date(model)
        if upload_date and upload_date >= cutoff_date:
            # Add relative age
            model['age_days'] = (datetime.now(timezone.utc) - upload_date).days
            recent_models.append(model)
    
    return recent_models

def format_model_info(model: dict, short: bool = False) -> str:
    """
    Format a model's information for display.
    
    Args:
        model: Model dictionary from Hugging Face API.
        short: If True, show only essential info.
    
    Returns:
        Formatted string with model information.
    """
    lines = []
    
    # Always show these
    id_str = model.get("modelId", model.get("id", "Unknown"))
    lines.append(f"\n{'='*60}")
    lines.append(f"ID: {id_str}")
    
    if not short:
        title = model.get("title", id_str)
        lines.append(f"Title: {title}")
        
        author = model.get("author", "Unknown")
        lines.append(f"Author: @{author}")
        
        tags = model.get("tags", [])
        if tags:
            # Limit to first 5 tags
            tag_str = ", ".join(tags[:5])
            lines.append(f"Tags: {tag_str}")
    
    cardData = model.get("cardData", {})
    if cardData and not short:
        description = cardData.get("shortDescription", "")
        if description:
            lines.append(f"Description: {description[:200]}...")
    
    return "\n".join(lines)

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="List recently released models from Hugging Face",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python list_recent_models.py --days 30
  python list_recent_models.py --days 7 --short
  python list_recent_models.py --days 90 > recent_models.txt
        """
    )
    parser.add_argument(
        "--days", "-d",
        type=int,
        default=30,
        help="Number of days to look back (default: 30)"
    )
    parser.add_argument(
        "--limit", "-l",
        type=int,
        default=100,
        help="Maximum number of models to fetch (default: 100)"
    )
    parser.add_argument(
        "--short", "-s",
        action="store_true",
        help="Show only essential information"
    )
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Output as JSON instead of text"
    )
    
    args = parser.parse_args()
    
    print(f"Fetching recent models from Hugging Face (last {args.days} days)...")
    print("-" * 50)
    
    # Fetch models
    all_models = fetch_hf_models(limit=args.limit)
    
    if not all_models:
        print("No models found.")
        return
    
    # Filter to recent models
    recent_models = filter_recent_models(all_models, args.days)
    
    print(f"Found {len(recent_models)} model(s) released in the last {args.days} day(s):\n")
    
    if args.json:
        # Output as JSON for programmatic use
        output = {
            "count": len(recent_models),
            "cutoff_date": (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat(),
            "models": recent_models
        }
        print(json.dumps(output, indent=2))
    else:
        # Text output
        for model in recent_models:
            if args.short:
                id_str = model.get("modelId", model.get("id", "Unknown"))
                author = model.get("author", "Unknown")
                print(f"{id_str} by @{author}")
            else:
                print(format_model_info(model, short=False))
    
    if not args.json and len(recent_models) > 0:
        print(f"\n{'='*60}")
        print(f"Total: {len(recent_models)} recent model(s)")

if __name__ == "__main__":
    main()
