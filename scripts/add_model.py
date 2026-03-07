#!/usr/bin/env python3
"""
Add a new model to models.json by looking up details from Hugging Face.

Usage:
    python scripts/add_model.py <model_name_or_id>

Examples:
    python scripts/add_model.py "Llama-3.2-1B-Instruct-Q8_0-GGUF"
    python scripts/add_model.py "llama-3.2-1b-q8"

This script will:
1. Search Hugging Face for the model
2. Extract relevant details (name, params, quantization, file size, etc.)
3. Add a new entry to src/lib/data/models.json
4. Preserve existing models and maintain JSON structure

Expected input: A model name or identifier from Hugging Face.
Returns: Updates src/lib/data/models.json with the new model entry.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

def fetch_hf_model_info(model_name: str) -> Optional[Dict]:
    """
    Fetch model information from Hugging Face API.
    
    Args:
        model_name: The model name or identifier to search for.
    
    Returns:
        A dictionary containing model details, or None if not found.
    """
    import requests

    model_lookup_url = f"https://huggingface.co/api/models/{model_name}"
    response = requests.get(model_lookup_url, params={"blobs": "true"}, timeout=20)
    if response.status_code == 200:
        return response.json()

    # Search fallback: HF search endpoint for models is /api/models?search=...
    search_url = "https://huggingface.co/api/models"
    search_params = {"search": model_name, "limit": 10, "full": "true"}
    response = requests.get(search_url, params=search_params, timeout=20)
    if response.status_code != 200:
        return None

    results = response.json()
    if not isinstance(results, list) or not results:
        return None

    query = model_name.lower()

    def score(item: Dict) -> Tuple[int, int]:
        item_id = str(item.get("id", "")).lower()
        tags_text = " ".join(item.get("tags", [])) if isinstance(item.get("tags"), list) else ""
        # Prefer exact-ish matches and GGUF repositories for this workflow.
        id_score = 2 if query == item_id else 1 if query in item_id else 0
        gguf_score = 1 if "gguf" in tags_text.lower() or "gguf" in item_id else 0
        return (id_score, gguf_score)

    best_match = sorted(results, key=score, reverse=True)[0]
    best_id = best_match.get("id")
    if not best_id:
        return None

    # Fetch full metadata for the selected result so siblings/config are available.
    response = requests.get(
        f"https://huggingface.co/api/models/{best_id}",
        params={"blobs": "true"},
        timeout=20,
    )
    if response.status_code != 200:
        return best_match
    return response.json()

def parse_file_size(size_str: str) -> float:
    """
    Parse Hugging Face file size string to GB.
    
    Args:
        size_str: Size string like "2.3GB", "1.5GiB", etc.
    
    Returns:
        File size in GB as a float.
    """
    if not size_str:
        return 0.0
    
    # Match patterns like "2.3GB", "1.5GiB", "4.2GB"
    match = re.search(r'([\d.]+)\s*(?:GB|GiB)', str(size_str))
    if match:
        return float(match.group(1))
    
    # Try parsing just the number
    try:
        return float(str(size_str).split()[0])
    except (ValueError, IndexError):
        return 0.0

def estimate_params_from_size(weight_gb: float) -> float:
    """
    Estimate parameters in billions based on typical quantization.
    
    Args:
        weight_gb: Weight file size in GB.
    
    Returns:
        Estimated params_b (billions of parameters).
    """
    # Rough estimates for common quantizations
    if weight_gb > 70:
        return round(weight_gb / 1.05, 2)  # ~fp32-ish
    elif weight_gb > 40:
        return round(weight_gb / 0.81, 2)  # Q8_0-ish
    elif weight_gb > 20:
        return round(weight_gb / 0.59, 2)  # Q4_K_M-ish
    else:
        return round(weight_gb / 0.37, 2)  # Q4_K_M-ish for smaller models

def estimate_params_from_name(model_name: str) -> Optional[float]:
    """Try extracting parameter count from names like 1B, 7b, 70.6B."""
    match = re.search(r"(\d+(?:\.\d+)?)\s*[bB](?:\b|[^a-zA-Z])", model_name)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None

def slugify_model_id(model_id: str, quantization: str = "unknown") -> str:
    """Normalize HF model IDs into project-style kebab-case IDs."""
    # Keep repository name, discard org/user prefix if present.
    repo = model_id.split("/")[-1]
    slug = repo.lower().replace("_", "-")
    slug = re.sub(r"-gguf$", "", slug)
    slug = re.sub(r"-(q8[-_]?0|q4[-_]?k[-_]?m|q4[-_]?0|f16|fp16|f32|fp32)$", "", slug)
    quant_suffix_map = {
        "Q8_0": "q8",
        "Q4_K_M": "q4",
        "Q4_0": "q4",
        "fp16": "fp16",
        "fp32": "fp32",
    }
    quant_suffix = quant_suffix_map.get(quantization, "")
    if quant_suffix:
        slug = f"{slug}-{quant_suffix}"
    slug = re.sub(r"[^a-z0-9.-]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug

def infer_quantization_from_filename(filename: str) -> str:
    lower = filename.lower()
    if "q8_0" in lower:
        return "Q8_0"
    if "q4_k_m" in lower:
        return "Q4_K_M"
    if "q4_0" in lower:
        return "Q4_0"
    if "fp16" in lower or "f16" in lower:
        return "fp16"
    if "f32" in lower or "fp32" in lower:
        return "fp32"
    return "unknown"

def select_weight_file(model_info: Dict, preferred_quant: str = "auto") -> Tuple[str, float]:
    """
    Select a preferred GGUF file from HF siblings metadata.
    Returns: (filename, size_gb), or ("", 0.0) if unavailable.
    """
    siblings = model_info.get("siblings", []) or []
    gguf_files = []
    for entry in siblings:
        filename = str(entry.get("rfilename", ""))
        if not filename.lower().endswith(".gguf"):
            continue

        size_bytes = entry.get("size") or (entry.get("lfs", {}) or {}).get("size")
        if isinstance(size_bytes, (int, float)) and size_bytes > 0:
            size_gb = float(size_bytes) / (1024 ** 3)
        else:
            size_gb = 0.0
        gguf_files.append((filename, size_gb))

    if not gguf_files:
        return ("", 0.0)

    def priority(item: Tuple[str, float]) -> Tuple[int, int, float]:
        filename, size_gb = item
        quant = infer_quantization_from_filename(filename)
        order = {"Q8_0": 4, "Q4_K_M": 3, "Q4_0": 2, "fp16": 1}.get(quant, 0)
        preferred = 1 if (
            (preferred_quant == "q8" and quant == "Q8_0")
            or (preferred_quant == "q4" and quant in {"Q4_K_M", "Q4_0"})
            or (preferred_quant == "fp16" and quant == "fp16")
        ) else 0
        # Prefer higher-priority quant first, then larger file as tie-breaker.
        return (preferred, order, size_gb)

    return sorted(gguf_files, key=priority, reverse=True)[0]

def extract_model_name(model_info: dict) -> str:
    """
    Extract a human-readable model name from HF API response.
    
    Args:
        model_info: Model info dictionary from Hugging Face API.
    
    Returns:
        Formatted model name string.
    """
    title = model_info.get("title", "")
    if title:
        # Clean up title (e.g., "Llama-3.2-1B-Instruct-Q8_0-GGUF" -> "Llama 3.2 1B Instruct")
        clean_name = re.sub(r'-GGUF$', '', title)
        return clean_name.replace("-", " ").strip()
    
    # Fallback to modelId
    model_id = model_info.get("modelId", "") or model_info.get("id", "")
    if model_id:
        repo = model_id.split("/")[-1]
        parts = repo.split("-")
        name_parts = []
        for part in parts:
            if not any(x in part.lower() for x in ["gguf", "q8", "q4", "fp16", "f16", "fp32", "f32"]):
                name_parts.append(part)
        return " ".join(name_parts).replace("-instruct", " Instruct").strip()
    
    return model_info.get("id", "Unknown Model")

def estimate_model_features(model_id: str, model_info: Dict) -> List[str]:
    """
    Estimate model features based on model ID and info.
    
    Args:
        model_id: The model identifier.
        model_info: Model info dictionary from Hugging Face API.
    
    Returns:
        List of feature strings (e.g., ["vision", "tool_use"]).
    """
    features = []
    tags = model_info.get("tags", []) or []
    tags_text = " ".join(tags).lower() if isinstance(tags, list) else str(tags).lower()
    id_text = model_id.lower()
    
    # Check for vision capabilities
    if any(v in id_text or v in tags_text
            for v in ["vl", "vision", "multimodal"]):
        features.append("vision")
    
    # Check for tool use capabilities
    if any(t in id_text or t in tags_text
            for t in ["text-generation", "instruct"]):
        features.append("tool_use")
    
    # Check for reasoning models
    if any(v in id_text or v in tags_text for v in ["r1", "reasoning", "thinker"]):
        features.append("reasoning")
    
    return features if features else []

def add_model_to_json(models_file: str, new_model: dict) -> None:
    """
    Add a new model entry to the models.json file.
    
    Args:
        models_file: Path to the models.json file.
        new_model: Dictionary containing the new model data.
    """
    with open(models_file, 'r') as f:
        models = json.load(f)
    
    # Add new model
    models.append(new_model)
    
    # Write back with pretty formatting
    with open(models_file, 'w') as f:
        json.dump(models, f, indent=2)

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Add a model from Hugging Face to models.json."
    )
    parser.add_argument("model_name_or_id", type=str, help="Model name or Hugging Face model ID")
    parser.add_argument(
        "--quant",
        choices=["auto", "q8", "q4", "fp16"],
        default="auto",
        help="Preferred quantization to select when multiple GGUF files exist (default: auto)",
    )
    args = parser.parse_args()

    model_identifier = args.model_name_or_id
    models_path = Path(__file__).parent.parent / 'src' / 'lib' / 'data' / 'models.json'
    
    print(f"Looking up model: {model_identifier}")
    print("-" * 50)
    
    # Fetch model info from Hugging Face
    model_info = fetch_hf_model_info(model_identifier)
    
    if not model_info:
        print(f"Error: Could not find model '{model_identifier}' on Hugging Face")
        sys.exit(1)
    
    # Extract details
    model_name = extract_model_name(model_info)
    hf_model_id = model_info.get("id", model_identifier)

    # Pull file + size from siblings blob metadata.
    weight_file, weight_gb = select_weight_file(model_info, preferred_quant=args.quant)
    quantization = infer_quantization_from_filename(weight_file) if weight_file else "unknown"
    model_id = slugify_model_id(hf_model_id, quantization=quantization)

    # Prefer explicit param count from model name/ID when present, fallback to size estimate.
    params_b = estimate_params_from_name(model_name) or estimate_params_from_name(hf_model_id)
    if params_b is None:
        params_b = estimate_params_from_size(weight_gb) if weight_gb > 0 else 0.0
    
    # Get other details
    config = model_info.get("config", {}) or {}
    layers = config.get("num_hidden_layers")
    num_attention_heads = config.get("num_attention_heads")
    kv_heads = config.get("num_key_value_heads") or num_attention_heads
    head_dim = config.get("head_dim")
    hidden_size = config.get("hidden_size")
    if head_dim is None and hidden_size and num_attention_heads:
        head_dim = hidden_size // num_attention_heads

    if layers and kv_heads and head_dim:
        kv_per_1k_gb = (
            2 * layers * kv_heads * head_dim * 2 * 1000 / (1024 ** 3)
        )
    else:
        kv_per_1k_gb = None

    max_context = config.get("max_position_embeddings")
    if not max_context:
        max_context = (model_info.get("cardData", {}) or {}).get("context_length")
    max_context_k = (
        int(round(max_context / 1024))
        if isinstance(max_context, (int, float)) and max_context > 1000
        else (max_context or 128)
    )
    mmlu_score = None  # Would need external benchmark data
    swe_bench_score = None  # Would need external benchmark data
    
    # Get tags for features
    tags = model_info.get("tags", [])
    features = estimate_model_features(model_id, {"id": model_id, "tags": tags})
    
    # Build notes
    notes_parts = []
    if layers and kv_heads and head_dim:
        notes_parts.append(f"{layers} layers, {kv_heads} KV heads, head_dim {head_dim}")
    if weight_file:
        notes_parts.append(f"GGUF {quantization} file size from {weight_file}.")
    else:
        notes_parts.append("No GGUF file metadata found in Hugging Face siblings.")
    
    # Add special notes for specific model types
    tags_text = " ".join(tags).lower() if isinstance(tags, list) else str(tags).lower()
    if any(t in tags_text for t in ["vision", "multimodal"]):
        notes_parts.insert(0, "Vision-language model.")
    elif any(t in tags_text for t in ["reasoning", "thinking"]):
        notes_parts.insert(0, "Reasoning model (thinking/non-thinking modes).")
    elif any(t in tags_text for t in ["code", "coder"]):
        notes_parts.insert(0, "Code model.")
    
    # Create new model entry
    new_model = {
        "id": model_id,
        "name": model_name,
        "params_b": round(params_b, 2),
        "quantization": quantization,
        "weight_gb": round(weight_gb, 2),
        "kv_per_1k_gb": round(kv_per_1k_gb, 3) if kv_per_1k_gb else None,
        "max_context_k": max_context_k,
        "layers": layers or None,
        "mmlu_score": mmlu_score,
        "swe_bench_score": swe_bench_score,
        "features": features,
        "notes": "; ".join(notes_parts)
    }
    
    print(f"Found model: {model_name}")
    print(f"  ID: {new_model['id']}")
    print(f"  Params: ~{new_model['params_b']}B")
    print(f"  Quantization: {new_model['quantization']}")
    print(f"  Weight size: {new_model['weight_gb']} GB")
    print(f"  Layers: {layers or 'N/A'}")
    print(f"  Features: {', '.join(features) if features else 'None'}")
    print("-" * 50)
    
    # Ask user to confirm before adding
    confirm = input(f"\nAdd '{model_name}' to models.json? (y/n): ")
    
    if confirm.lower() == 'y':
        add_model_to_json(str(models_path), new_model)
        print(f"✓ Added model to {models_path}")
    else:
        print("Operation cancelled.")

if __name__ == '__main__':
    main()
