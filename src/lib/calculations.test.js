import { describe, it, expect } from 'vitest';
import {
  calcMaxContext,
  calcMaxContextWithOffload,
  calcOffloadConfig,
  calcOffloadPenalty,
  calcTokPerSec,
  contextLabel,
  tokLabel,
  qualityTier,
  codingQualityTier,
  bucketModels,
  groupVariants,
  INFERENCE_OVERHEAD_GB,
  TIGHT_FIT_CONTEXT_K,
  MAX_OFFLOAD_RATIO,
} from './calculations.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A small model that fits easily on most GPUs */
const smallModel = {
  id: 'test-small',
  name: 'Test Small',
  params_b: 1.24,
  quantization: 'Q8_0',
  weight_gb: 1.32,
  kv_per_1k_gb: 0.031,
  max_context_k: 128,
  layers: 16,
  mmlu_score: 49.3,
  swe_bench_score: null,
};

/** A medium model that needs ~9 GB for weights alone */
const mediumModel = {
  id: 'test-medium',
  name: 'Test Medium',
  params_b: 14,
  quantization: 'Q4_K_M',
  weight_gb: 8.99,
  kv_per_1k_gb: 0.25,
  max_context_k: 128,
  layers: 48,
  mmlu_score: 79.9,
  swe_bench_score: 22.6,
};

/** A large model that won't fit on consumer GPUs */
const largeModel = {
  id: 'test-large',
  name: 'Test Large',
  params_b: 72,
  quantization: 'Q4_K_M',
  weight_gb: 43.5,
  kv_per_1k_gb: 1.25,
  max_context_k: 128,
  layers: 80,
  mmlu_score: 86.1,
  swe_bench_score: 33.4,
};

/** A model with vision feature */
const visionModel = {
  id: 'test-vision',
  name: 'Test Vision',
  params_b: 12,
  quantization: 'Q8_0',
  weight_gb: 12.5,
  kv_per_1k_gb: 0.466,
  max_context_k: 128,
  layers: 48,
  mmlu_score: 74.0,
  swe_bench_score: 12.8,
  features: ['vision'],
};

/** A model with reasoning feature */
const reasoningModel = {
  id: 'test-reasoning',
  name: 'Test Reasoning',
  params_b: 14,
  quantization: 'Q4_K_M',
  weight_gb: 8.99,
  kv_per_1k_gb: 0.183,
  max_context_k: 128,
  layers: 48,
  mmlu_score: 72.0,
  swe_bench_score: 20.4,
  features: ['reasoning'],
};

/** A model with multiple features */
const multiFeatureModel = {
  id: 'test-multi',
  name: 'Test Multi',
  params_b: 24,
  quantization: 'Q8_0',
  weight_gb: 25.0,
  kv_per_1k_gb: 0.153,
  max_context_k: 128,
  layers: 40,
  mmlu_score: 81.0,
  swe_bench_score: 20.8,
  features: ['vision', 'tool_use'],
};

// ---------------------------------------------------------------------------
// calcMaxContext
// ---------------------------------------------------------------------------

describe('calcMaxContext', () => {
  it('returns 0 when VRAM is less than weight', () => {
    expect(calcMaxContext(mediumModel, 5)).toBe(0);
  });

  it('returns 0 when VRAM exactly equals weight (no room for KV cache)', () => {
    expect(calcMaxContext(mediumModel, mediumModel.weight_gb)).toBe(0);
  });

  it('calculates correct context for a model that fits', () => {
    // 24 GB VRAM, 8.99 GB weights → 15.01 GB for KV
    // 15.01 / 0.25 = 60.04 → floor = 60K
    const result = calcMaxContext(mediumModel, 24);
    expect(result).toBe(60);
  });

  it('caps at model max_context_k when plenty of VRAM', () => {
    // 192 GB VRAM, 1.32 GB weights → 190.68 GB for KV
    // 190.68 / 0.031 = 6151K, but max_context_k = 128
    const result = calcMaxContext(smallModel, 192);
    expect(result).toBe(128);
  });

  it('handles fractional VRAM values', () => {
    // 10.5 GB VRAM, 8.99 weights → 1.51 GB for KV
    // 1.51 / 0.25 = 6.04 → floor = 6K
    const result = calcMaxContext(mediumModel, 10.5);
    expect(result).toBe(6);
  });

  it('returns 0 for negative VRAM', () => {
    expect(calcMaxContext(smallModel, -1)).toBe(0);
  });

  it('returns 0 for zero VRAM', () => {
    expect(calcMaxContext(smallModel, 0)).toBe(0);
  });

  it('handles a model with zero kv_per_1k_gb gracefully', () => {
    const zeroCost = { ...smallModel, kv_per_1k_gb: 0 };
    // Should return max_context_k (no KV cost = unlimited context up to model max)
    expect(calcMaxContext(zeroCost, 8)).toBe(128);
  });
});

// ---------------------------------------------------------------------------
// calcTokPerSec
// ---------------------------------------------------------------------------

describe('calcTokPerSec', () => {
  it('returns null when bandwidth is null', () => {
    expect(calcTokPerSec(mediumModel, null)).toBeNull();
  });

  it('returns null when bandwidth is undefined', () => {
    expect(calcTokPerSec(mediumModel, undefined)).toBeNull();
  });

  it('calculates correct tok/s for known bandwidth', () => {
    // bandwidth = 504 GB/s, weight = 8.99 GB, overhead = 1.0
    // 504 / (8.99 + 1.0) = 504 / 9.99 ≈ 50.45 → round = 50
    const result = calcTokPerSec(mediumModel, 504);
    expect(result).toBe(50);
  });

  it('handles small model with high bandwidth', () => {
    // bandwidth = 1008 GB/s, weight = 1.32 GB, overhead = 1.0
    // 1008 / 2.32 ≈ 434.48 → round = 434
    const result = calcTokPerSec(smallModel, 1008);
    expect(result).toBe(434);
  });

  it('handles large model', () => {
    // bandwidth = 960 GB/s, weight = 43.5 GB, overhead = 1.0
    // 960 / 44.5 ≈ 21.57 → round = 22
    const result = calcTokPerSec(largeModel, 960);
    expect(result).toBe(22);
  });

  it('uses the documented overhead constant', () => {
    expect(INFERENCE_OVERHEAD_GB).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// contextLabel
// ---------------------------------------------------------------------------

describe('contextLabel', () => {
  it('formats small values as K', () => {
    expect(contextLabel(4)).toBe('4K');
    expect(contextLabel(32)).toBe('32K');
    expect(contextLabel(128)).toBe('128K');
  });

  it('formats values >= 1000 as M', () => {
    expect(contextLabel(1000)).toBe('1M');
    expect(contextLabel(2000)).toBe('2M');
  });

  it('formats 0 correctly', () => {
    expect(contextLabel(0)).toBe('0K');
  });
});

// ---------------------------------------------------------------------------
// tokLabel
// ---------------------------------------------------------------------------

describe('tokLabel', () => {
  it('returns null for null input', () => {
    expect(tokLabel(null)).toBeNull();
  });

  it('formats a value with ~ prefix and tok/s suffix', () => {
    expect(tokLabel(50)).toBe('~50 tok/s');
    expect(tokLabel(120)).toBe('~120 tok/s');
  });
});

// ---------------------------------------------------------------------------
// qualityTier
// ---------------------------------------------------------------------------

describe('qualityTier', () => {
  it('returns Excellent for score >= 83', () => {
    expect(qualityTier(83)).toEqual({ label: 'Excellent', cls: 'tier-excellent' });
    expect(qualityTier(90)).toEqual({ label: 'Excellent', cls: 'tier-excellent' });
  });

  it('returns Great for score 75–82', () => {
    expect(qualityTier(75)).toEqual({ label: 'Great', cls: 'tier-great' });
    expect(qualityTier(82.9)).toEqual({ label: 'Great', cls: 'tier-great' });
  });

  it('returns Good for score 67–74', () => {
    expect(qualityTier(67)).toEqual({ label: 'Good', cls: 'tier-good' });
    expect(qualityTier(74.9)).toEqual({ label: 'Good', cls: 'tier-good' });
  });

  it('returns Fair for score 55–66', () => {
    expect(qualityTier(55)).toEqual({ label: 'Fair', cls: 'tier-fair' });
    expect(qualityTier(66.9)).toEqual({ label: 'Fair', cls: 'tier-fair' });
  });

  it('returns Basic for score < 55', () => {
    expect(qualityTier(54.9)).toEqual({ label: 'Basic', cls: 'tier-basic' });
    expect(qualityTier(0)).toEqual({ label: 'Basic', cls: 'tier-basic' });
  });
});

// ---------------------------------------------------------------------------
// bucketModels
// ---------------------------------------------------------------------------

describe('bucketModels', () => {
  const models = [smallModel, mediumModel, largeModel];

  it('puts all models in noFit when VRAM is tiny', () => {
    const result = bucketModels(models, 0.5, 500, null, null);
    expect(result.fits).toHaveLength(0);
    expect(result.tight).toHaveLength(0);
    expect(result.noFit).toHaveLength(3);
  });

  it('puts small model in fits with enough VRAM', () => {
    // 8 GB: small model fits well (weight 1.32 + kv = plenty of context)
    // medium model: weight 8.99 + kv 0.25 = 9.24 needed, 8 GB < 9.24 → noFit
    const result = bucketModels(models, 8, 500, null, null);
    expect(result.fits.some((m) => m.id === 'test-small')).toBe(true);
    expect(result.noFit.some((m) => m.id === 'test-large')).toBe(true);
  });

  it('puts model in tight when context < 4K', () => {
    // Medium model: weight 8.99, kv 0.25 per 1K
    // 9.5 GB: 9.5 - 8.99 = 0.51 GB for KV → 0.51/0.25 = 2K context → tight fit
    const result = bucketModels([mediumModel], 9.5, 500, null, null);
    expect(result.tight).toHaveLength(1);
    expect(result.fits).toHaveLength(0);
  });

  it('applies minimum context filter', () => {
    // With 12 GB: medium model gets (12-8.99)/0.25 = 12K context
    // minContextK = 16 → doesn't meet minimum → tight
    const result = bucketModels([mediumModel], 12, 500, 16, null);
    expect(result.tight).toHaveLength(1);
    expect(result.fits).toHaveLength(0);
  });

  it('applies minimum speed filter', () => {
    // Medium model with 504 GB/s bandwidth: 504/9.99 ≈ 50 tok/s
    // minTokPerSec = 100 → doesn't meet minimum → tight
    const result = bucketModels([mediumModel], 24, 504, null, 100);
    expect(result.tight).toHaveLength(1);
    expect(result.fits).toHaveLength(0);
  });

  it('handles null bandwidth (manual VRAM) gracefully for speed filter', () => {
    // When bandwidth is null and minTokPerSec is set, meetsMinSpeed should
    // still be true (can't evaluate, so don't penalize)
    const result = bucketModels([mediumModel], 24, null, null, 100);
    expect(result.fits).toHaveLength(1);
    expect(result.tight).toHaveLength(0);
  });

  it('sorts fits by MMLU score descending', () => {
    // All three models with 200 GB VRAM → all fit
    const result = bucketModels(models, 200, 1000, null, null);
    expect(result.fits.length).toBeGreaterThan(1);
    for (let i = 1; i < result.fits.length; i++) {
      expect(result.fits[i - 1].mmlu_score).toBeGreaterThanOrEqual(result.fits[i].mmlu_score);
    }
  });

  it('returns empty arrays when model list is empty', () => {
    const result = bucketModels([], 24, 500, null, null);
    expect(result.fits).toHaveLength(0);
    expect(result.tight).toHaveLength(0);
    expect(result.noFit).toHaveLength(0);
  });

  it('uses TIGHT_FIT_CONTEXT_K threshold', () => {
    expect(TIGHT_FIT_CONTEXT_K).toBe(4);
  });

  // Feature filtering tests

  it('returns all models in fits when no features required', () => {
    const models = [visionModel, reasoningModel, multiFeatureModel];
    const result = bucketModels(models, 200, 1000, null, null, []);
    expect(result.fits).toHaveLength(3);
    expect(result.tight).toHaveLength(0);
  });

  it('filters to only models with required vision feature', () => {
    const models = [visionModel, reasoningModel, multiFeatureModel];
    const result = bucketModels(models, 200, 1000, null, null, ['vision']);
    // visionModel and multiFeatureModel have vision
    expect(result.fits.map((m) => m.id)).toContain('test-vision');
    expect(result.fits.map((m) => m.id)).toContain('test-multi');
    // reasoningModel goes to tight (missing vision)
    expect(result.tight.map((m) => m.id)).toContain('test-reasoning');
  });

  it('filters to only models matching all required features', () => {
    const models = [visionModel, reasoningModel, multiFeatureModel];
    // Require both vision and tool_use — only multiFeatureModel has both
    const result = bucketModels(models, 200, 1000, null, null, ['vision', 'tool_use']);
    expect(result.fits).toHaveLength(1);
    expect(result.fits[0].id).toBe('test-multi');
    expect(result.tight).toHaveLength(2);
  });

  it('puts models without features array in tight when features required', () => {
    // smallModel has no features field
    const result = bucketModels([smallModel], 200, 1000, null, null, ['vision']);
    expect(result.fits).toHaveLength(0);
    expect(result.tight).toHaveLength(1);
    expect(result.tight[0].meetsFeatures).toBe(false);
  });

  it('sets meetsFeatures true when no features required', () => {
    const result = bucketModels([smallModel], 200, 1000, null, null, []);
    expect(result.fits).toHaveLength(1);
    expect(result.fits[0].meetsFeatures).toBe(true);
  });

  // sortBy benchmark tests

  it('sorts by swe_bench_score when sortBy is swe-bench', () => {
    // All models fit at 200 GB, should be sorted by swe_bench_score descending
    const result = bucketModels([smallModel, mediumModel, largeModel], 200, 1000, null, null, [], 'swe-bench');
    // largeModel: 33.4, mediumModel: 22.6, smallModel: null → null at bottom
    expect(result.fits[0].id).toBe('test-large');
    expect(result.fits[1].id).toBe('test-medium');
    expect(result.fits[2].id).toBe('test-small'); // null score → bottom
  });

  it('puts null swe_bench_score models at bottom when sortBy is swe-bench', () => {
    const modelWithScore = { ...smallModel, id: 'has-score', swe_bench_score: 5.0, mmlu_score: 30 };
    const modelWithoutScore = { ...smallModel, id: 'no-score', swe_bench_score: null, mmlu_score: 90 };
    const result = bucketModels([modelWithoutScore, modelWithScore], 200, 1000, null, null, [], 'swe-bench');
    // Despite lower MMLU, has-score should be above no-score when sorting by SWE-bench
    expect(result.fits[0].id).toBe('has-score');
    expect(result.fits[1].id).toBe('no-score');
  });

  it('uses codingQualityTier when sortBy is swe-bench', () => {
    const result = bucketModels([mediumModel], 200, 1000, null, null, [], 'swe-bench');
    // mediumModel has swe_bench_score = 22.6 → Great tier (>= 22)
    expect(result.fits[0].tier).toEqual({ label: 'Great', cls: 'tier-great' });
  });

  it('uses qualityTier (MMLU) when sortBy is mmlu', () => {
    const result = bucketModels([mediumModel], 200, 1000, null, null, [], 'mmlu');
    // mediumModel has mmlu_score = 79.9 → Great tier (>= 75)
    expect(result.fits[0].tier).toEqual({ label: 'Great', cls: 'tier-great' });
  });

  it('defaults to MMLU sorting when sortBy is omitted', () => {
    const result = bucketModels([smallModel, mediumModel, largeModel], 200, 1000, null, null);
    // Should sort by mmlu_score: largeModel 86.1, mediumModel 79.9, smallModel 49.3
    expect(result.fits[0].id).toBe('test-large');
    expect(result.fits[1].id).toBe('test-medium');
    expect(result.fits[2].id).toBe('test-small');
  });

  it('does not enforce 64K minimum context when sortBy is swe-bench', () => {
    // 24 GB VRAM, medium model: (24 - 8.99) / 0.25 = 60K context
    // Without agentic mode, no 64K enforcement → model fits (60K > 4K tight threshold)
    const result = bucketModels([mediumModel], 24, 500, null, null, [], 'swe-bench');
    expect(result.fits).toHaveLength(1);
    expect(result.tight).toHaveLength(0);
  });

  it('puts model in noFit when max_context_k < user minContextK', () => {
    // Model max_context_k = 32 can never reach user's requested 64K
    const lowCtxModel = { ...mediumModel, id: 'low-ctx', max_context_k: 32 };
    const result = bucketModels([lowCtxModel], 200, 1000, 64, null, []);
    expect(result.noFit).toHaveLength(1);
    expect(result.noFit[0].id).toBe('low-ctx');
  });
});

// ---------------------------------------------------------------------------
// groupVariants
// ---------------------------------------------------------------------------

describe('groupVariants', () => {
  // Build enriched entries like bucketModels would produce
  const makeEntry = (overrides) => ({
    name: 'Test Model',
    params_b: 8,
    mmlu_score: 70,
    swe_bench_score: null,
    features: [],
    tier: { label: 'Good', cls: 'tier-good' },
    maxCtxK: 64,
    tokPerSec: 50,
    weight_gb: 5,
    quantization: 'Q8_0',
    ...overrides,
  });

  it('groups entries with the same name', () => {
    const models = [
      makeEntry({ quantization: 'Q8_0', weight_gb: 8.5, tokPerSec: 45 }),
      makeEntry({ quantization: 'Q4_K_M', weight_gb: 4.9, tokPerSec: 62 }),
    ];
    const groups = groupVariants(models);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Test Model');
    expect(groups[0].variants).toHaveLength(2);
  });

  it('keeps different models as separate groups', () => {
    const models = [
      makeEntry({ name: 'Model A', quantization: 'Q8_0' }),
      makeEntry({ name: 'Model B', quantization: 'Q8_0' }),
    ];
    const groups = groupVariants(models);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe('Model A');
    expect(groups[1].name).toBe('Model B');
  });

  it('sorts variants within a group by weight_gb ascending', () => {
    const models = [
      makeEntry({ quantization: 'Q8_0', weight_gb: 8.5 }),
      makeEntry({ quantization: 'fp16', weight_gb: 16.0 }),
      makeEntry({ quantization: 'Q4_K_M', weight_gb: 4.9 }),
    ];
    const groups = groupVariants(models);
    expect(groups[0].variants.map((v) => v.quantization)).toEqual(['Q4_K_M', 'Q8_0', 'fp16']);
  });

  it('preserves order of first appearance across groups', () => {
    const models = [
      makeEntry({ name: 'Better Model', mmlu_score: 85 }),
      makeEntry({ name: 'Worse Model', mmlu_score: 60 }),
      makeEntry({ name: 'Better Model', mmlu_score: 85, quantization: 'Q4_K_M', weight_gb: 3 }),
    ];
    const groups = groupVariants(models);
    expect(groups[0].name).toBe('Better Model');
    expect(groups[1].name).toBe('Worse Model');
    expect(groups[0].variants).toHaveLength(2);
  });

  it('copies shared metadata from first entry', () => {
    const models = [
      makeEntry({ params_b: 14, mmlu_score: 79.9, swe_bench_score: 22.6, features: ['tool_use'] }),
    ];
    const groups = groupVariants(models);
    expect(groups[0].params_b).toBe(14);
    expect(groups[0].mmlu_score).toBe(79.9);
    expect(groups[0].swe_bench_score).toBe(22.6);
    expect(groups[0].features).toEqual(['tool_use']);
  });

  it('returns empty array for empty input', () => {
    expect(groupVariants([])).toEqual([]);
  });

  it('handles single variant per model', () => {
    const models = [makeEntry({ name: 'Solo Model' })];
    const groups = groupVariants(models);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toHaveLength(1);
  });

  it('defaults swe_bench_score to null when undefined', () => {
    const models = [makeEntry({ swe_bench_score: undefined })];
    const groups = groupVariants(models);
    expect(groups[0].swe_bench_score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// codingQualityTier
// ---------------------------------------------------------------------------

describe('codingQualityTier', () => {
  it('returns N/A for null score', () => {
    expect(codingQualityTier(null)).toEqual({ label: 'N/A', cls: 'tier-na' });
  });

  it('returns Excellent for score >= 30', () => {
    expect(codingQualityTier(30)).toEqual({ label: 'Excellent', cls: 'tier-excellent' });
    expect(codingQualityTier(45)).toEqual({ label: 'Excellent', cls: 'tier-excellent' });
  });

  it('returns Great for score 22–29', () => {
    expect(codingQualityTier(22)).toEqual({ label: 'Great', cls: 'tier-great' });
    expect(codingQualityTier(29.9)).toEqual({ label: 'Great', cls: 'tier-great' });
  });

  it('returns Good for score 15–21', () => {
    expect(codingQualityTier(15)).toEqual({ label: 'Good', cls: 'tier-good' });
    expect(codingQualityTier(21.9)).toEqual({ label: 'Good', cls: 'tier-good' });
  });

  it('returns Fair for score 8–14', () => {
    expect(codingQualityTier(8)).toEqual({ label: 'Fair', cls: 'tier-fair' });
    expect(codingQualityTier(14.9)).toEqual({ label: 'Fair', cls: 'tier-fair' });
  });

  it('returns Basic for score < 8', () => {
    expect(codingQualityTier(7.9)).toEqual({ label: 'Basic', cls: 'tier-basic' });
    expect(codingQualityTier(0)).toEqual({ label: 'Basic', cls: 'tier-basic' });
  });
});

// ---------------------------------------------------------------------------
// calcMaxContextWithOffload
// ---------------------------------------------------------------------------

describe('calcMaxContextWithOffload', () => {
  it('behaves like calcMaxContext when systemRamGB is null', () => {
    // 24 GB VRAM, 8.99 GB weights → 15.01 / 0.25 = 60K (same as calcMaxContext)
    const result = calcMaxContextWithOffload(mediumModel, 24, null);
    expect(result.maxCtxK).toBe(60);
    expect(result.ramCtxK).toBe(0);
    expect(result.usingSystemRam).toBe(false);
  });

  it('behaves like calcMaxContext when systemRamGB is undefined', () => {
    const result = calcMaxContextWithOffload(mediumModel, 24, undefined);
    expect(result.maxCtxK).toBe(60);
    expect(result.usingSystemRam).toBe(false);
  });

  it('extends context with system RAM', () => {
    // 12 GB VRAM, 8.99 GB weights → VRAM for KV: 3.01 → vramCtxK = 12K
    // 32 GB system RAM → 32 / 0.25 = 128K from RAM
    // Total: 12 + 128 = 140K, capped at max_context_k = 128K
    const result = calcMaxContextWithOffload(mediumModel, 12, 32);
    expect(result.maxCtxK).toBe(128);
    expect(result.vramCtxK).toBe(12);
    expect(result.ramCtxK).toBe(116); // 128 - 12 = 116K from RAM
    expect(result.usingSystemRam).toBe(true);
  });

  it('does not use system RAM when VRAM is sufficient for max context', () => {
    // Small model: 1.32 GB weights, very low KV. 8 GB VRAM → plenty of context
    // vramCtxK = floor((8 - 1.32) / 0.031) = floor(215.48) = 215K, capped at 128K
    const result = calcMaxContextWithOffload(smallModel, 8, 32);
    expect(result.maxCtxK).toBe(128);
    expect(result.ramCtxK).toBe(0);
    expect(result.usingSystemRam).toBe(false);
  });

  it('returns 0 when VRAM is less than model weights', () => {
    const result = calcMaxContextWithOffload(mediumModel, 5, 32);
    expect(result.maxCtxK).toBe(0);
    expect(result.usingSystemRam).toBe(false);
  });

  it('handles zero kv_per_1k_gb gracefully', () => {
    const zeroCost = { ...smallModel, kv_per_1k_gb: 0 };
    const result = calcMaxContextWithOffload(zeroCost, 8, 32);
    expect(result.maxCtxK).toBe(128);
    expect(result.usingSystemRam).toBe(false);
  });

  it('limits extension to what system RAM can provide', () => {
    // 10 GB VRAM, 8.99 weights → 1.01 GB for KV → vramCtxK = 4K
    // 2 GB system RAM → 2 / 0.25 = 8K from RAM
    // Total: 4 + 8 = 12K (under model max 128K)
    const result = calcMaxContextWithOffload(mediumModel, 10, 2);
    expect(result.maxCtxK).toBe(12);
    expect(result.vramCtxK).toBe(4);
    expect(result.ramCtxK).toBe(8);
    expect(result.usingSystemRam).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calcOffloadConfig
// ---------------------------------------------------------------------------

describe('calcOffloadConfig', () => {
  it('returns feasible with 0 offload when model fits in VRAM', () => {
    // 24 GB VRAM, 8.99 GB weights → fits (8.99 < 24 - 1.0)
    const result = calcOffloadConfig(mediumModel, 24, 32);
    expect(result.feasible).toBe(true);
    expect(result.offloadRatio).toBe(0);
    expect(result.ramWeightGB).toBe(0);
  });

  it('returns feasible with offloading when model slightly exceeds VRAM', () => {
    // 8 GB VRAM → available for weights = 8 - 1.0 = 7 GB
    // 8.99 GB weights → 1.99 GB overflow → offloadRatio = 1.99/8.99 ≈ 0.221
    const result = calcOffloadConfig(mediumModel, 8, 32);
    expect(result.feasible).toBe(true);
    expect(result.ramWeightGB).toBeCloseTo(1.99, 1);
    expect(result.offloadRatio).toBeCloseTo(0.221, 2);
    expect(result.estimatedLayers).toBeGreaterThan(0);
  });

  it('returns infeasible when offload ratio exceeds 50%', () => {
    // 4 GB VRAM → available = 3 GB, model = 8.99 GB → 5.99 GB to offload
    // offloadRatio = 5.99/8.99 = 0.67 → exceeds MAX_OFFLOAD_RATIO
    const result = calcOffloadConfig(mediumModel, 4, 32);
    expect(result.feasible).toBe(false);
    expect(MAX_OFFLOAD_RATIO).toBe(0.5);
  });

  it('returns infeasible when system RAM is null', () => {
    const result = calcOffloadConfig(mediumModel, 8, null);
    expect(result.feasible).toBe(false);
  });

  it('returns infeasible when system RAM is insufficient', () => {
    // 8 GB VRAM → 1.99 GB overflow, but only 1 GB system RAM
    const result = calcOffloadConfig(mediumModel, 8, 1);
    expect(result.feasible).toBe(false);
  });

  it('calculates correct estimated layers', () => {
    // mediumModel: 48 layers, 8.99 GB weights
    // 8 GB VRAM → offloadRatio ≈ 0.221 → estimated layers = round(0.221 * 48) ≈ 11
    const result = calcOffloadConfig(mediumModel, 8, 32);
    expect(result.estimatedLayers).toBe(Math.round(result.offloadRatio * 48));
  });

  it('handles 0 VRAM', () => {
    const result = calcOffloadConfig(smallModel, 0, 32);
    // 0 VRAM → available = -1, ramWeightGB = 1.32 - 0 = 1.32
    // offloadRatio = 1.32/1.32 = 1.0 → exceeds MAX_OFFLOAD_RATIO
    expect(result.feasible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calcOffloadPenalty
// ---------------------------------------------------------------------------

describe('calcOffloadPenalty', () => {
  it('returns 0 penalty for 0 offload ratio', () => {
    const result = calcOffloadPenalty(0, 500);
    expect(result.penaltyPercent).toBe(0);
    expect(result.speedMultiplier).toBe(1.0);
  });

  it('returns positive penalty for positive offload ratio', () => {
    const result = calcOffloadPenalty(0.25, 500);
    expect(result.penaltyPercent).toBeGreaterThan(0);
    expect(result.speedMultiplier).toBeLessThan(1.0);
  });

  it('applies lower penalty for low-bandwidth GPUs', () => {
    const lowBw = calcOffloadPenalty(0.3, 300);
    const highBw = calcOffloadPenalty(0.3, 800);
    expect(lowBw.penaltyPercent).toBeLessThan(highBw.penaltyPercent);
  });

  it('caps penalty at 50%', () => {
    const result = calcOffloadPenalty(0.5, 1000);
    expect(result.penaltyPercent).toBeLessThanOrEqual(50);
    expect(result.speedMultiplier).toBeGreaterThanOrEqual(0.5);
  });

  it('handles null bandwidth (uses full penalty)', () => {
    const result = calcOffloadPenalty(0.3, null);
    expect(result.penaltyPercent).toBeGreaterThan(0);
  });

  it('penalty increases with offload ratio', () => {
    const low = calcOffloadPenalty(0.1, 500);
    const high = calcOffloadPenalty(0.4, 500);
    expect(high.penaltyPercent).toBeGreaterThan(low.penaltyPercent);
  });
});

// ---------------------------------------------------------------------------
// bucketModels with systemRamGB (offloading)
// ---------------------------------------------------------------------------

describe('bucketModels with offloading', () => {
  const models = [smallModel, mediumModel, largeModel];

  it('behaves identically when systemRamGB is null', () => {
    const without = bucketModels(models, 8, 500, null, null, [], 'mmlu', null);
    const withNull = bucketModels(models, 8, 500, null, null, [], 'mmlu');
    expect(without.fits.length).toBe(withNull.fits.length);
    expect(without.tight.length).toBe(withNull.tight.length);
    expect(without.noFit.length).toBe(withNull.noFit.length);
  });

  it('moves offloadable models from noFit to tight', () => {
    // mediumModel (8.99 GB) on 8 GB VRAM without RAM → noFit
    const noRam = bucketModels([mediumModel], 8, 500, null, null, [], 'mmlu', null);
    expect(noRam.noFit.some((m) => m.id === 'test-medium')).toBe(true);

    // With 32 GB system RAM → tight (offloadable, ~22% offload)
    const withRam = bucketModels([mediumModel], 8, 500, null, null, [], 'mmlu', 32);
    expect(withRam.tight.some((m) => m.id === 'test-medium')).toBe(true);
    expect(withRam.noFit.some((m) => m.id === 'test-medium')).toBe(false);
  });

  it('keeps models in noFit when offload ratio exceeds 50%', () => {
    // largeModel (43.5 GB) on 24 GB → offloadRatio = (43.5 - 23) / 43.5 ≈ 0.47
    // Actually: available = 24 - 1.0 = 23, overflow = 43.5 - 23 = 20.5, ratio = 20.5/43.5 ≈ 0.47
    // That's under 0.5, so it should be feasible with enough RAM
    const result = bucketModels([largeModel], 24, 500, null, null, [], 'mmlu', 64);
    expect(result.tight.some((m) => m.id === 'test-large')).toBe(true);

    // On 16 GB → available = 15, overflow = 28.5, ratio = 28.5/43.5 ≈ 0.655 → infeasible
    const result2 = bucketModels([largeModel], 16, 500, null, null, [], 'mmlu', 64);
    expect(result2.noFit.some((m) => m.id === 'test-large')).toBe(true);
  });

  it('enriches offloaded models with offloadInfo', () => {
    const result = bucketModels([mediumModel], 8, 500, null, null, [], 'mmlu', 32);
    const m = result.tight.find((m) => m.id === 'test-medium');
    expect(m.offloadInfo).not.toBeNull();
    expect(m.offloadInfo.type).toBe('weights');
    expect(m.offloadInfo.offloadRatio).toBeGreaterThan(0);
    expect(m.offloadInfo.penaltyPercent).toBeGreaterThan(0);
  });

  it('extends context with system RAM for models that fit', () => {
    // smallModel (1.32 GB) on 2 GB VRAM: vramCtxK = floor((2-1.32)/0.031) = 21K
    // With 32 GB system RAM: extends to 128K (model max)
    const result = bucketModels([smallModel], 2, 500, null, null, [], 'mmlu', 32);
    const m = result.fits[0];
    expect(m.maxCtxK).toBe(128);
    expect(m.ctxInfo).not.toBeNull();
    expect(m.ctxInfo.ramCtxK).toBeGreaterThan(0);
  });

  it('does not add ctxInfo when no RAM extension needed', () => {
    // smallModel on 8 GB → already gets 128K (max) in VRAM alone
    const result = bucketModels([smallModel], 8, 500, null, null, [], 'mmlu', 32);
    const m = result.fits[0];
    expect(m.ctxInfo).toBeNull();
  });

  it('applies speed penalty for offloaded models', () => {
    // mediumModel: tok/s = round(500 / (8.99 + 1.0)) = round(50.05) = 50
    const noRam = bucketModels([mediumModel], 24, 500, null, null, [], 'mmlu', null);
    const fullSpeed = noRam.fits[0].tokPerSec;

    // With offloading on 8 GB VRAM
    const withRam = bucketModels([mediumModel], 8, 500, null, null, [], 'mmlu', 32);
    const offloadSpeed = withRam.tight[0].tokPerSec;

    expect(offloadSpeed).toBeLessThan(fullSpeed);
  });

  it('offloaded models never go to fits (always tight)', () => {
    // Even with no context/speed filters, offloaded models stay in tight
    const result = bucketModels([mediumModel], 8, 500, null, null, [], 'mmlu', 32);
    expect(result.fits.some((m) => m.id === 'test-medium')).toBe(false);
    expect(result.tight.some((m) => m.id === 'test-medium')).toBe(true);
  });
});
