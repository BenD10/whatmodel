import { describe, it, expect } from 'vitest';
import {
  calcMaxContext,
  calcTokPerSec,
  contextLabel,
  tokLabel,
  qualityTier,
  codingQualityTier,
  bucketModels,
  INFERENCE_OVERHEAD_GB,
  TIGHT_FIT_CONTEXT_K,
  AGENTIC_MIN_CONTEXT_K,
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

  // Agentic coding mode tests

  it('enforces 64K minimum context in agentic mode', () => {
    // 24 GB VRAM, medium model: (24 - 8.99) / 0.25 = 60K context
    // In agentic mode, 60K < 64K minimum → tight
    const result = bucketModels([mediumModel], 24, 500, null, null, [], true);
    expect(result.fits).toHaveLength(0);
    expect(result.tight).toHaveLength(1);
  });

  it('allows models meeting 64K in agentic mode', () => {
    // 26 GB VRAM, medium model: (26 - 8.99) / 0.25 = 68K context → passes 64K
    const result = bucketModels([mediumModel], 26, 500, null, null, [], true);
    expect(result.fits).toHaveLength(1);
  });

  it('uses max(userMinCtx, 64K) in agentic mode', () => {
    // User sets minContextK = 128, agentic mode → effective min = 128K (higher than 64K)
    // 26 GB VRAM, medium model: 68K context < 128K → tight
    const result = bucketModels([mediumModel], 26, 500, 128, null, [], true);
    expect(result.fits).toHaveLength(0);
    expect(result.tight).toHaveLength(1);
  });

  it('sorts by swe_bench_score in agentic mode', () => {
    // All models fit at 200 GB, should be sorted by swe_bench_score descending
    const result = bucketModels([smallModel, mediumModel, largeModel], 200, 1000, null, null, [], true);
    // largeModel: 33.4, mediumModel: 22.6, smallModel: null → null at bottom
    expect(result.fits[0].id).toBe('test-large');
    expect(result.fits[1].id).toBe('test-medium');
    expect(result.fits[2].id).toBe('test-small'); // null score → bottom
  });

  it('puts null swe_bench_score models at bottom in agentic mode', () => {
    const modelWithScore = { ...smallModel, id: 'has-score', swe_bench_score: 5.0, mmlu_score: 30 };
    const modelWithoutScore = { ...smallModel, id: 'no-score', swe_bench_score: null, mmlu_score: 90 };
    const result = bucketModels([modelWithoutScore, modelWithScore], 200, 1000, null, null, [], true);
    // Despite lower MMLU, has-score should be above no-score in agentic mode
    expect(result.fits[0].id).toBe('has-score');
    expect(result.fits[1].id).toBe('no-score');
  });

  it('uses codingQualityTier in agentic mode', () => {
    const result = bucketModels([mediumModel], 200, 1000, null, null, [], true);
    // mediumModel has swe_bench_score = 22.6 → Great tier (>= 22)
    expect(result.fits[0].tier).toEqual({ label: 'Great', cls: 'tier-great' });
  });

  it('uses qualityTier (MMLU) when not in agentic mode', () => {
    const result = bucketModels([mediumModel], 200, 1000, null, null, [], false);
    // mediumModel has mmlu_score = 79.9 → Great tier (>= 75)
    expect(result.fits[0].tier).toEqual({ label: 'Great', cls: 'tier-great' });
  });

  it('uses AGENTIC_MIN_CONTEXT_K constant', () => {
    expect(AGENTIC_MIN_CONTEXT_K).toBe(64);
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
