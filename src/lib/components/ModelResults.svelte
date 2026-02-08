<script>
  import allModels from '$lib/data/models.json';
  import { contextLabel, tokLabel, bucketModels } from '$lib/calculations.js';

  let { vram, bandwidth = null, minContextK = null, minTokPerSec = null } = $props();

  let results = $derived.by(() => {
    if (vram == null) return null;
    return bucketModels(allModels, vram, bandwidth, minContextK, minTokPerSec);
  });

  let totalFit = $derived(results ? results.fits.length + results.tight.length : 0);

  const mmluExplainer = 'MMLU (Massive Multitask Language Understanding) measures general knowledge across 57 subjects. Higher = more capable. Sorted best-first.';
</script>

{#if results == null}
  <section class="empty">
    <p>Select a GPU or enter your VRAM to see which models you can run.</p>
  </section>
{:else}
  <section class="results">
    <p class="summary">
      <strong>{totalFit}</strong> of {allModels.length} model configurations can run on
      <strong>{vram} GB</strong>
      {#if minContextK != null} with at least <strong>{contextLabel(minContextK)}</strong> context{/if}
      {#if minTokPerSec != null} at <strong>{minTokPerSec}+ tok/s</strong>{/if}
      — sorted by quality
    </p>
    <p class="mmlu-note">
      Ranked by <strong>MMLU</strong> benchmark
      <span class="tooltip-wrap" tabindex="0" role="button" aria-label="What is MMLU?">
        <span class="info-icon">?</span>
        <span class="tooltip">{mmluExplainer}</span>
      </span>
    </p>

    {#if results.fits.length > 0}
      <div class="group fits">
        <h3>Runs well</h3>
        <ul>
          {#each results.fits as m}
            <li>
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{m.name}</span>
                  <span class="badge quant">{m.quantization}</span>
                  <span class="badge params">{m.params_b}B</span>
                  <span class="badge quality {m.tier.cls}">{m.tier.label}</span>
                </div>
                <div class="model-stats">
                  <span class="stat quality-stat">
                    <span class="stat-label">MMLU</span>
                    <span class="stat-value">{m.mmlu_score}</span>
                  </span>
                  <span class="stat context">
                    <span class="stat-label">Max context</span>
                    <span class="stat-value">{contextLabel(m.maxCtxK)}</span>
                  </span>
                  {#if m.tokPerSec != null}
                    <span class="stat speed">
                      <span class="stat-label">Est. speed</span>
                      <span class="stat-value">{tokLabel(m.tokPerSec)}</span>
                    </span>
                  {/if}
                </div>
              </div>
              {#if m.notes}<p class="notes">{m.notes}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if results.tight.length > 0}
      <div class="group tight">
        <h3>Tight fit</h3>
        <ul>
          {#each results.tight as m}
            <li>
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{m.name}</span>
                  <span class="badge quant">{m.quantization}</span>
                  <span class="badge params">{m.params_b}B</span>
                  <span class="badge quality {m.tier.cls}">{m.tier.label}</span>
                </div>
                <div class="model-stats">
                  <span class="stat quality-stat">
                    <span class="stat-label">MMLU</span>
                    <span class="stat-value">{m.mmlu_score}</span>
                  </span>
                  <span class="stat context">
                    <span class="stat-label">Max context</span>
                    <span class="stat-value">{m.maxCtxK > 0 ? contextLabel(m.maxCtxK) : '—'}</span>
                  </span>
                  {#if m.tokPerSec != null}
                    <span class="stat speed">
                      <span class="stat-label">Est. speed</span>
                      <span class="stat-value">{tokLabel(m.tokPerSec)}</span>
                    </span>
                  {/if}
                </div>
              </div>
              {#if !m.meetsMinCtx && m.fitsAtAll}
                <p class="reason">Only {contextLabel(m.maxCtxK)} context — below your {contextLabel(minContextK)} minimum</p>
              {:else if m.maxCtxK < 4}
                <p class="reason">Very limited context window ({contextLabel(m.maxCtxK)})</p>
              {/if}
              {#if !m.meetsMinSpeed && m.tokPerSec != null}
                <p class="reason">~{m.tokPerSec} tok/s — below your {minTokPerSec} tok/s minimum</p>
              {/if}
              {#if m.notes}<p class="notes">{m.notes}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if results.noFit.length > 0}
      <div class="group no-fit">
        <h3>Doesn't fit</h3>
        <ul>
          {#each results.noFit as m}
            <li>
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{m.name}</span>
                  <span class="badge quant">{m.quantization}</span>
                  <span class="badge params">{m.params_b}B</span>
                  <span class="badge quality {m.tier.cls}">{m.tier.label}</span>
                </div>
                <div class="model-stats">
                  <span class="stat quality-stat">
                    <span class="stat-label">MMLU</span>
                    <span class="stat-value">{m.mmlu_score}</span>
                  </span>
                  <span class="stat context">
                    <span class="stat-label">Need</span>
                    <span class="stat-value">{(m.weight_gb + m.kv_per_1k_gb).toFixed(1)} GB+</span>
                  </span>
                </div>
              </div>
              <p class="reason">Needs at least {(m.weight_gb + m.kv_per_1k_gb).toFixed(1)} GB — {(m.weight_gb + m.kv_per_1k_gb - vram).toFixed(1)} GB over budget</p>
              {#if m.notes}<p class="notes">{m.notes}</p>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>
{/if}

<style>
  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .summary {
    font-size: 0.95rem;
    color: var(--text-muted);
    margin-bottom: -0.9rem;
  }

  .summary strong {
    color: var(--text);
  }

  .mmlu-note {
    font-size: 0.8rem;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .mmlu-note strong {
    color: var(--text);
  }

  .tooltip-wrap {
    position: relative;
    display: inline-flex;
    cursor: help;
    outline: none;
  }

  .info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    border: 1px solid var(--text-muted);
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
    transition: border-color 0.15s, color 0.15s;
  }

  .tooltip-wrap:hover .info-icon,
  .tooltip-wrap:focus .info-icon {
    border-color: var(--accent);
    color: var(--accent);
  }

  .tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: 280px;
    padding: 0.55rem 0.75rem;
    background: var(--surface, #1e1e2e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text, #e0e0e0);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 100;
    pointer-events: none;
  }

  .tooltip-wrap:hover .tooltip,
  .tooltip-wrap:focus .tooltip {
    display: block;
  }

  /* Groups */
  .group {
    padding: 1rem 1.25rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .group.fits {
    background: var(--fits-dim);
    border-color: var(--fits-border);
  }

  .group.tight {
    background: var(--tight-dim);
    border-color: var(--tight-border);
  }

  .group.no-fit {
    background: var(--no-fit-dim);
    border-color: var(--no-fit-border);
  }

  .group h3 {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.75rem;
  }

  .group.fits h3 { color: var(--fits); }
  .group.tight h3 { color: var(--tight); }
  .group.no-fit h3 { color: var(--no-fit); }

  /* List */
  ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li {
    padding: 0.65rem 0.85rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-sm);
  }

  .model-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .model-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .model-name {
    font-weight: 600;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .badge.quant {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .badge.params {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-muted);
  }

  .model-stats {
    display: flex;
    gap: 1rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 0.8rem;
    line-height: 1.3;
  }

  .stat-label {
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .stat-value {
    font-weight: 600;
  }

  .stat.quality-stat .stat-value {
    font-weight: 700;
  }

  .stat.context .stat-value {
    color: var(--accent);
  }

  .stat.speed .stat-value {
    color: var(--fits);
  }

  /* Quality tier badges */
  .badge.quality {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .badge.quality.tier-excellent {
    background: rgba(76, 175, 80, 0.15);
    color: #66bb6a;
  }

  .badge.quality.tier-great {
    background: rgba(33, 150, 243, 0.15);
    color: #42a5f5;
  }

  .badge.quality.tier-good {
    background: rgba(156, 39, 176, 0.15);
    color: #ab47bc;
  }

  .badge.quality.tier-fair {
    background: rgba(255, 167, 38, 0.15);
    color: #ffa726;
  }

  .badge.quality.tier-basic {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-muted);
  }

  .reason {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-muted);
  }

  .notes {
    margin-top: 0.2rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.7;
  }

  @media (max-width: 600px) {
    .model-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .model-stats {
      width: 100%;
      justify-content: flex-start;
    }

    .stat {
      align-items: flex-start;
    }

    .group {
      padding: 0.75rem 0.85rem;
    }

    li {
      padding: 0.55rem 0.65rem;
    }
  }
</style>
