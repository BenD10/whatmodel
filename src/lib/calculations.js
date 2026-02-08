/**
 * Shared calculation functions for model-GPU compatibility.
 *
 * These are pure functions with no side effects, extracted here so they
 * can be unit-tested independently of the Svelte component layer.
 */

/**
 * Additional memory overhead for inference engine internals (activations,
 * scratch buffers, etc.). Empirically derived from real-world benchmarks
 * on consumer GPUs using llama.cpp-based engines.
 */
export const INFERENCE_OVERHEAD_GB = 1.0;

/**
 * Models with less than this context (in K tokens) are considered a
 * "tight fit" regardless of other criteria.
 */
export const TIGHT_FIT_CONTEXT_K = 4;

/**
 * Minimum context (in K tokens) enforced when agentic coding mode is active.
 * Agentic coding tools (Roo Code, Cline, etc.) need large context windows
 * to send file contents, tool results, and conversation history.
 */
export const AGENTIC_MIN_CONTEXT_K = 64;

/**
 * For a given model and user VRAM, calculate the max context (in K tokens)
 * that fits. Capped at the model's trained max_context_k.
 *
 * @param {{ weight_gb: number, kv_per_1k_gb: number, max_context_k: number }} model
 * @param {number} userVram  Available VRAM in GB
 * @returns {number} Max context in K tokens (0 if model doesn't fit)
 */
export function calcMaxContext(model, userVram) {
  const availableForKv = userVram - model.weight_gb;
  if (availableForKv <= 0) return 0;
  if (model.kv_per_1k_gb <= 0) return model.max_context_k;
  const maxTokensK = availableForKv / model.kv_per_1k_gb;
  return Math.min(Math.floor(maxTokensK), model.max_context_k);
}

/**
 * Estimate decode tokens/sec from memory bandwidth.
 * During autoregressive generation, every token requires reading all weights
 * plus additional memory for KV cache reads, activations, and engine overhead.
 *
 * tok/s ≈ bandwidth / (weight_gb + overhead)
 *
 * @param {{ weight_gb: number }} model
 * @param {number|null} bandwidth  Memory bandwidth in GB/s, or null if unknown
 * @returns {number|null} Estimated tokens per second, or null if bandwidth unknown
 */
export function calcTokPerSec(model, bandwidth) {
  if (bandwidth == null) return null;
  return Math.round(bandwidth / (model.weight_gb + INFERENCE_OVERHEAD_GB));
}

/**
 * Format a context value (in K tokens) for display.
 * @param {number} k  Context in K tokens
 * @returns {string}
 */
export function contextLabel(k) {
  if (k >= 1000) return `${(k / 1000).toFixed(0)}M`;
  return `${k}K`;
}

/**
 * Format a tokens/sec value for display.
 * @param {number|null} tps  Tokens per second, or null
 * @returns {string|null}
 */
export function tokLabel(tps) {
  if (tps == null) return null;
  return `~${tps} tok/s`;
}

/**
 * Quality tier based on MMLU score.
 * @param {number} score  MMLU score
 * @returns {{ label: string, cls: string }}
 */
export function qualityTier(score) {
  if (score >= 83) return { label: 'Excellent', cls: 'tier-excellent' };
  if (score >= 75) return { label: 'Great', cls: 'tier-great' };
  if (score >= 67) return { label: 'Good', cls: 'tier-good' };
  if (score >= 55) return { label: 'Fair', cls: 'tier-fair' };
  return { label: 'Basic', cls: 'tier-basic' };
}

/**
 * Quality tier based on SWE-bench Verified score (% resolved).
 * SWE-bench ranges ~0–50% for local models, so thresholds are different from MMLU.
 * @param {number|null} score  SWE-bench score (null if unavailable)
 * @returns {{ label: string, cls: string }}
 */
export function codingQualityTier(score) {
  if (score == null) return { label: 'N/A', cls: 'tier-na' };
  if (score >= 30) return { label: 'Excellent', cls: 'tier-excellent' };
  if (score >= 22) return { label: 'Great', cls: 'tier-great' };
  if (score >= 15) return { label: 'Good', cls: 'tier-good' };
  if (score >= 8) return { label: 'Fair', cls: 'tier-fair' };
  return { label: 'Basic', cls: 'tier-basic' };
}

/**
 * Compare function for sorting by a score field (descending).
 * Null scores always sort to the bottom.
 * @param {number|null} a
 * @param {number|null} b
 * @returns {number}
 */
function compareScores(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

/**
 * Bucket a list of models into "fits", "tight", and "noFit" categories
 * based on available VRAM and optional minimum-context / minimum-speed /
 * required-features filters.
 * Results are sorted by MMLU score (descending), with context/weight as tiebreakers.
 *
 * When agenticCoding is true:
 * - Minimum context is raised to at least 64K (AGENTIC_MIN_CONTEXT_K)
 * - Models are sorted by swe_bench_score instead of mmlu_score
 * - Quality tier uses codingQualityTier() thresholds
 * - Models without swe_bench_score sort to the bottom
 *
 * @param {Array} allModels       Full list of model objects
 * @param {number} vram           Available VRAM in GB
 * @param {number|null} bandwidth Memory bandwidth in GB/s (null if unknown)
 * @param {number|null} minContextK  Minimum required context in K tokens (null = any)
 * @param {number|null} minTokPerSec Minimum required tok/s (null = any)
 * @param {string[]} requiredFeatures  Features the model must support (empty = any)
 * @param {boolean} agenticCoding  Enable agentic coding mode (default false)
 * @returns {{ fits: Array, tight: Array, noFit: Array }}
 */
export function bucketModels(allModels, vram, bandwidth, minContextK, minTokPerSec, requiredFeatures = [], agenticCoding = false) {
  // In agentic mode, enforce a minimum 64K context
  const effectiveMinCtx = agenticCoding
    ? Math.max(minContextK ?? 0, AGENTIC_MIN_CONTEXT_K)
    : minContextK;

  const entries = allModels.map((m) => {
    const maxCtxK = calcMaxContext(m, vram);
    const totalAtMinCtx = m.weight_gb + m.kv_per_1k_gb; // 1K min context
    const fitsAtAll = vram >= totalAtMinCtx;
    const meetsMinCtx = effectiveMinCtx != null ? maxCtxK >= effectiveMinCtx : true;
    const tokPerSec = calcTokPerSec(m, bandwidth);
    const meetsMinSpeed = minTokPerSec != null && tokPerSec != null ? tokPerSec >= minTokPerSec : true;
    const modelFeatures = m.features ?? [];
    const meetsFeatures = requiredFeatures.length > 0
      ? requiredFeatures.every((f) => modelFeatures.includes(f))
      : true;
    const tier = agenticCoding
      ? codingQualityTier(m.swe_bench_score ?? null)
      : qualityTier(m.mmlu_score);
    return { ...m, maxCtxK, fitsAtAll, meetsMinCtx, meetsMinSpeed, meetsFeatures, tokPerSec, tier };
  });

  const fits = [];
  const tight = [];
  const noFit = [];

  for (const e of entries) {
    if (!e.fitsAtAll) {
      noFit.push(e);
    } else if (!e.meetsMinCtx || !e.meetsMinSpeed || !e.meetsFeatures) {
      tight.push(e);
    } else if (e.maxCtxK < TIGHT_FIT_CONTEXT_K) {
      // Less than 4K context is a tight fit regardless
      tight.push(e);
    } else {
      fits.push(e);
    }
  }

  if (agenticCoding) {
    // Sort by SWE-bench score (descending), null scores to bottom, context as tiebreaker
    const sortFn = (a, b) => compareScores(a.swe_bench_score, b.swe_bench_score) || b.maxCtxK - a.maxCtxK;
    fits.sort(sortFn);
    tight.sort(sortFn);
    noFit.sort((a, b) => compareScores(a.swe_bench_score, b.swe_bench_score) || b.weight_gb - a.weight_gb);
  } else {
    // Sort by quality (MMLU) descending, then by context/weight as tiebreaker
    fits.sort((a, b) => b.mmlu_score - a.mmlu_score || b.maxCtxK - a.maxCtxK);
    tight.sort((a, b) => b.mmlu_score - a.mmlu_score || b.maxCtxK - a.maxCtxK);
    noFit.sort((a, b) => b.mmlu_score - a.mmlu_score || b.weight_gb - a.weight_gb);
  }

  return { fits, tight, noFit };
}
