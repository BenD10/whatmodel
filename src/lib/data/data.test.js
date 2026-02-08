import { describe, it, expect } from 'vitest';
import models from './models.json';
import gpus from './gpus.json';

// ---------------------------------------------------------------------------
// Allowed values
// ---------------------------------------------------------------------------

const VALID_FEATURES = ['vision', 'reasoning', 'tool_use'];
const VALID_QUANTIZATIONS = ['Q4_K_M', 'Q8_0', 'fp16'];
const VALID_MANUFACTURERS = ['NVIDIA', 'AMD', 'Intel', 'Apple'];

// ---------------------------------------------------------------------------
// models.json
// ---------------------------------------------------------------------------

describe('models.json', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it('has no duplicate IDs', () => {
    const ids = models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(models)('$id', (model) => {
    // --- required fields exist ---
    it('has a kebab-case string id (dots allowed for versions)', () => {
      expect(typeof model.id).toBe('string');
      expect(model.id).toMatch(/^[a-z0-9]+([-.][a-z0-9]+)*$/);
    });

    it('has a non-empty name', () => {
      expect(typeof model.name).toBe('string');
      expect(model.name.length).toBeGreaterThan(0);
    });

    it('has a valid quantization', () => {
      expect(VALID_QUANTIZATIONS).toContain(model.quantization);
    });

    // --- numeric fields in range ---
    it('has params_b > 0', () => {
      expect(model.params_b).toBeGreaterThan(0);
    });

    it('has weight_gb between 0.1 and 200', () => {
      expect(model.weight_gb).toBeGreaterThanOrEqual(0.1);
      expect(model.weight_gb).toBeLessThanOrEqual(200);
    });

    it('has kv_per_1k_gb between 0 and 2', () => {
      expect(model.kv_per_1k_gb).toBeGreaterThanOrEqual(0);
      expect(model.kv_per_1k_gb).toBeLessThanOrEqual(2);
    });

    it('has max_context_k > 0', () => {
      expect(model.max_context_k).toBeGreaterThan(0);
    });

    it('has mmlu_score between 0 and 100', () => {
      expect(model.mmlu_score).toBeGreaterThanOrEqual(0);
      expect(model.mmlu_score).toBeLessThanOrEqual(100);
    });

    it('has swe_bench_score that is null or a number 0–100', () => {
      if (model.swe_bench_score !== null) {
        expect(model.swe_bench_score).toBeGreaterThanOrEqual(0);
        expect(model.swe_bench_score).toBeLessThanOrEqual(100);
      }
    });

    // --- features ---
    it('has a features array with only known values', () => {
      expect(Array.isArray(model.features)).toBe(true);
      for (const f of model.features) {
        expect(VALID_FEATURES).toContain(f);
      }
    });

    it('has no duplicate features', () => {
      expect(new Set(model.features).size).toBe(model.features.length);
    });

    // --- notes ---
    it('has a non-empty notes string', () => {
      expect(typeof model.notes).toBe('string');
      expect(model.notes.length).toBeGreaterThan(0);
    });

    // --- weight sanity: Q4 < Q8 < fp16 ---
    it('has weight_gb consistent with quantization (lighter quant = smaller file)', () => {
      // Find variants of the same model name
      const variants = models.filter((m) => m.name === model.name);
      if (variants.length <= 1) return;

      const q4 = variants.find((m) => m.quantization === 'Q4_K_M');
      const q8 = variants.find((m) => m.quantization === 'Q8_0');
      const fp16 = variants.find((m) => m.quantization === 'fp16');

      if (q4 && q8) expect(q4.weight_gb).toBeLessThan(q8.weight_gb);
      if (q8 && fp16) expect(q8.weight_gb).toBeLessThan(fp16.weight_gb);
      if (q4 && fp16) expect(q4.weight_gb).toBeLessThan(fp16.weight_gb);
    });
  });

  // --- cross-variant consistency ---
  describe('cross-variant consistency', () => {
    /** Group models by name so we can compare quant variants */
    const byName = Object.groupBy(models, (m) => m.name);

    it.each(Object.entries(byName))(
      '%s variants share the same params_b',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.params_b));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same max_context_k',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.max_context_k));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same mmlu_score',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.mmlu_score));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same kv_per_1k_gb',
      (_name, variants) => {
        const values = new Set(variants.map((m) => m.kv_per_1k_gb));
        expect(values.size).toBe(1);
      },
    );

    it.each(Object.entries(byName))(
      '%s variants share the same features',
      (_name, variants) => {
        const serialized = new Set(variants.map((m) => JSON.stringify([...m.features].sort())));
        expect(serialized.size).toBe(1);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// gpus.json
// ---------------------------------------------------------------------------

describe('gpus.json', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(gpus)).toBe(true);
    expect(gpus.length).toBeGreaterThan(0);
  });

  it('has no duplicate IDs', () => {
    const ids = gpus.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(gpus)('$id', (gpu) => {
    it('has a kebab-case string id', () => {
      expect(typeof gpu.id).toBe('string');
      expect(gpu.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('has a non-empty name', () => {
      expect(typeof gpu.name).toBe('string');
      expect(gpu.name.length).toBeGreaterThan(0);
    });

    it('has a valid manufacturer', () => {
      expect(VALID_MANUFACTURERS).toContain(gpu.manufacturer);
    });

    if (gpu.manufacturer === 'Apple') {
      it('has vram_options array (Apple Silicon)', () => {
        expect(Array.isArray(gpu.vram_options)).toBe(true);
        expect(gpu.vram_options.length).toBeGreaterThan(0);
      });

      it('does not have top-level vram_gb or bandwidth_gbps', () => {
        expect(gpu.vram_gb).toBeUndefined();
        expect(gpu.bandwidth_gbps).toBeUndefined();
      });

      it('has valid vram_options entries', () => {
        for (const opt of gpu.vram_options) {
          expect(opt.vram_gb).toBeGreaterThan(0);
          expect(opt.vram_gb).toBeLessThanOrEqual(512);
          expect(opt.bandwidth_gbps).toBeGreaterThan(0);
          expect(opt.bandwidth_gbps).toBeLessThanOrEqual(2000);
        }
      });

      it('has vram_options sorted by vram_gb ascending', () => {
        for (let i = 1; i < gpu.vram_options.length; i++) {
          expect(gpu.vram_options[i].vram_gb).toBeGreaterThan(
            gpu.vram_options[i - 1].vram_gb,
          );
        }
      });
    } else {
      it('has vram_gb between 1 and 256 (discrete GPU)', () => {
        expect(gpu.vram_gb).toBeGreaterThanOrEqual(1);
        expect(gpu.vram_gb).toBeLessThanOrEqual(256);
      });

      it('has bandwidth_gbps between 50 and 2000 (discrete GPU)', () => {
        expect(gpu.bandwidth_gbps).toBeGreaterThanOrEqual(50);
        expect(gpu.bandwidth_gbps).toBeLessThanOrEqual(2000);
      });

      it('does not have vram_options', () => {
        expect(gpu.vram_options).toBeUndefined();
      });
    }
  });
});
