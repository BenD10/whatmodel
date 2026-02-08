# What Models?

[![Deploy](https://github.com/BenD10/whatmodel/actions/workflows/deploy.yml/badge.svg)](https://github.com/BenD10/whatmodel/actions/workflows/deploy.yml)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fwhatmodelscanirun.com&label=whatmodelscanirun.com)](https://whatmodelscanirun.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

A static website that helps users find out which AI models their GPU can run — and how well. Pick your GPU (or enter VRAM manually), optionally set a minimum context window, and instantly see which models fit, how much context you can afford, and estimated generation speed.

### **[Try it out at whatmodelscanirun.com →](https://whatmodelscanirun.com/)**

---

## Architecture

### Tech stack

- **SvelteKit** (Svelte 5) with `adapter-static` — builds to pure HTML/JS/CSS, no server required
- **Vite 6** — dev server and bundler
- **Static JSON** — GPU and model data imported at build time (no runtime fetches)

### Project structure

```
src/
├── app.html                        # HTML shell
├── app.css                         # Global styles / design tokens
├── routes/
│   ├── +layout.js                  # prerender = true (static output)
│   ├── +layout.svelte              # Shell: header, logo, global CSS import
│   └── +page.svelte                # Main page: wires GpuInput ↔ ModelResults
└── lib/
    ├── data/
    │   ├── gpus.json               # GPU database (VRAM, bandwidth, manufacturer)
    │   └── models.json             # Model database (weights, KV cache, quantizations)
    └── components/
        ├── GpuInput.svelte         # GPU picker + manual VRAM + context filter
        ├── SearchSelect.svelte     # Reusable searchable dropdown with grouping
        └── ModelResults.svelte     # Matching logic + results display
```

### Data flow

```
User input (GPU or VRAM)
        │
        ▼
   GpuInput.svelte
   ├── vram (number | null)         ← from GPU lookup or manual entry
   ├── bandwidth (number | null)    ← from GPU lookup (null if manual)
   └── minContextK (number | null)  ← from context dropdown
        │
        ▼  (bound props)
   +page.svelte
        │
        ▼  (passed as props)
   ModelResults.svelte
   ├── calcMaxContext()              → max context tokens per model
   ├── calcTokPerSec()              → estimated generation speed
   └── bucket into: fits / tight / doesn't fit
        │
        ▼
   Rendered results (cards with stats)
```

All state is reactive via Svelte 5 runes (`$state`, `$derived`, `$bindable`). There is no store, no backend, and no API calls — everything runs client-side with data baked in at build time.

---

## Algorithm details

### 1. VRAM budget: weights + KV cache

Total GPU memory usage for an LLM is:

```
total_vram = weight_gb + (kv_per_1k_gb × context_length_k)
```

Where:
- **`weight_gb`** — size of the model weights in memory (depends on parameter count and quantization)
- **`kv_per_1k_gb`** — KV cache cost per 1,000 tokens of context
- **`context_length_k`** — number of tokens in the context window, in thousands

### 2. KV cache calculation

The KV cache stores key and value tensors for every layer and every token in the context. Per token:

```
kv_bytes_per_token = 2 × num_layers × num_kv_heads × head_dim × bytes_per_value
```

- **Factor of 2** — one for keys, one for values
- **`num_layers`** — transformer layers (e.g. 28 for Llama 3.2 3B, 32 for Llama 3.1 8B)
- **`num_kv_heads`** — KV heads after GQA (typically 8 for Llama models)
- **`head_dim`** — dimension per head (typically 128)
- **`bytes_per_value`** — 2 for fp16 (the default KV cache precision)

We precompute `kv_per_1k_gb = kv_bytes_per_token × 1000 / 1024³` and store it in `models.json`.

### 3. Maximum context window

Given the user's VRAM, the max context for a model is:

```
available_for_kv = user_vram - weight_gb
max_context_k = floor(available_for_kv / kv_per_1k_gb)
```

This is capped at the model's trained context limit (`max_context_k` in the data).

### 4. Estimated generation speed

LLM token generation (decode phase) is memory-bandwidth bound — every token requires reading all model weights from VRAM. The raw theoretical ceiling is `bandwidth / weight_gb`, but real-world inference also reads KV cache entries, moves activations, and incurs engine overhead. We model this as a fixed effective overhead added to the weight size:

```
tokens_per_sec ≈ memory_bandwidth_gbps / (weight_gb + overhead_gb)
```

Where **`overhead_gb`** ≈ **1.0 GB** is an empirical constant representing the additional per-token memory traffic beyond reading weights (KV cache at typical context lengths, intermediate activations, and inference engine overhead).

This was calibrated against real-world benchmarks on a Radeon RX 9070 XT (640 GB/s) running LM Studio:

| Model | Weight GB | Predicted tok/s | Actual tok/s | Error |
|---|---|---|---|---|
| Llama 3.1 8B Q8_0 | 8.54 | 67 | 67.89 | −1.3% |
| Qwen 2.5 7B Q8_0 | 8.10 | 70 | 72.44 | −3.4% |
| Qwen 2.5 7B Q6_K | 6.25 | 88 | 89.50 | −1.7% |
| Llama 3.1 8B Q4_K_M | 4.92 | 108 | 109.07 | −0.9% |
| Qwen 2.5 7B Q4_K_M | 4.68 | 113 | 107.51 | +5.1% |
| Llama 3.2 3B Q8_0 | 3.42 | 145 | 143.85 | +0.8% |
| Llama 3.2 3B Q4_K_M | 2.02 | 212 | 205.60 | +3.1% |
| Llama 3.2 1B Q4_K_M | 0.77 | 362 | 391.48 | −7.5% |

All predictions within ±5% for models 2–8.5 GB, and within ±7.5% at the extreme small end (0.77 GB). Tested across two model families (Llama, Qwen), three quantization formats (Q4_K_M, Q6_K, Q8_0), and four model sizes (1B, 3B, 7B, 8B). For comparison, the raw `bandwidth / weight_gb` formula overestimated by 10–35% on the same benchmarks.

Speed estimates are only shown when a GPU is selected from the list (which provides bandwidth). Manual VRAM entry does not produce speed estimates.

### 5. Result bucketing

Each model is placed into one of three buckets:

| Bucket | Condition |
|---|---|
| **Runs well** | Fits in VRAM with ≥ 4K context, meets any user-set minimums |
| **Tight fit** | Fits but with < 4K context, or below user's minimum context/speed |
| **Doesn't fit** | Weights alone exceed available VRAM |

---

## Data schemas

### GPU entry (`gpus.json`)

Discrete GPUs use top-level `vram_gb` and `bandwidth_gbps`:

```json
{
  "id": "rtx-4090",
  "name": "GeForce RTX 4090",
  "manufacturer": "NVIDIA",
  "vram_gb": 24,
  "bandwidth_gbps": 1008
}
```

Apple Silicon chips use `vram_options` instead — an array of memory configurations, each with its own bandwidth (since bandwidth can vary by memory config on chips like M3 Max / M4 Max):

```json
{
  "id": "m4-max",
  "name": "M4 Max",
  "manufacturer": "Apple",
  "vram_options": [
    { "vram_gb": 36,  "bandwidth_gbps": 410 },
    { "vram_gb": 64,  "bandwidth_gbps": 546 },
    { "vram_gb": 128, "bandwidth_gbps": 546 }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Display name (without manufacturer prefix) |
| `manufacturer` | string | `"NVIDIA"`, `"AMD"`, `"Intel"`, or `"Apple"` — used for dropdown grouping |
| `vram_gb` | number | Video memory in GB (discrete GPUs only) |
| `bandwidth_gbps` | number | Memory bandwidth in GB/s (discrete GPUs only) |
| `vram_options` | array | Memory configurations (Apple Silicon only). Each entry has `vram_gb` and `bandwidth_gbps` |

### Model entry (`models.json`)

```json
{
  "id": "llama-3.1-8b-q4",
  "name": "Llama 3.1 8B",
  "params_b": 8.03,
  "quantization": "Q4_K_M",
  "weight_gb": 4.92,
  "kv_per_1k_gb": 0.122,
  "max_context_k": 128,
  "notes": "32 layers, 8 KV heads, head_dim 128. GGUF Q4_K_M file size."
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Model family and size |
| `params_b` | number | Parameter count in billions |
| `quantization` | string | Quantization format (fp16, Q8_0, Q4_K_M, etc.) |
| `weight_gb` | number | Weight file size in GB (≈ VRAM for weights) |
| `kv_per_1k_gb` | number | KV cache cost per 1K tokens in GB (fp16 KV cache) |
| `max_context_k` | number | Model's trained max context length in thousands |
| `notes` | string | Architecture details and data sources |

---

## Data sources

- **Weight sizes**: Actual GGUF file sizes from HuggingFace (deterministic per model architecture and quantization format)
- **KV cache**: Calculated from model `config.json` architecture parameters (layers, KV heads, head_dim)
- **GPU VRAM**: Official manufacturer specifications
- **GPU bandwidth**: Official specs, Wikipedia GeForce/Radeon series articles, NVIDIA datasheets, AMD reference docs

---

## Adding data

### Adding a GPU

Add an entry to `src/lib/data/gpus.json`. Keep entries grouped by manufacturer, sorted newest-first within each group.

### Adding a model

Add entries to `src/lib/data/models.json`. For each model, you need:

1. **Weight size** — use the actual GGUF file size for each quantization level (any HuggingFace GGUF repo will give the same size for a given model + quant)
2. **KV cache per 1K tokens** — calculate from the model architecture:
   ```
   kv_per_1k_gb = 2 × layers × kv_heads × head_dim × 2 × 1000 / (1024³)
   ```
   (The inner `× 2` is for fp16 = 2 bytes per value)
3. **Max context** — from the model card (e.g. 128K for Llama 3.1/3.2)

---

## Development

```bash
npm install
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Build static site to ./build
npm run preview   # Preview the built site
```
