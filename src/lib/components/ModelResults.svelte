<script>
  import allModels from '$lib/data/models.json';
  import { contextLabel, tokLabel, bucketModels, groupVariants } from '$lib/calculations.js';
  import { trackFilterChanged } from '$lib/analytics.js';

  let { vram, bandwidth = null, minContextK = null, minTokPerSec = null, requiredFeatures = [], systemRamGB = null, sortBy = $bindable('mmlu'), onsortchange = () => {} } = $props();

  function onSortByChange(e) {
    sortBy = e.target.value;
    trackFilterChanged('sort_by', sortBy);
    onsortchange(sortBy);
  }

  const FEATURE_LABELS = { vision: 'Vision', reasoning: 'Reasoning', tool_use: 'Tool use' };

  let results = $derived.by(() => {
    if (vram == null) return null;
    return bucketModels(allModels, vram, bandwidth, minContextK, minTokPerSec, requiredFeatures, sortBy, systemRamGB);
  });

  let groupedFits = $derived(results ? groupVariants(results.fits) : []);
  let groupedTight = $derived(results ? groupVariants(results.tight) : []);
  let groupedNoFit = $derived(results ? groupVariants(results.noFit) : []);

  let totalFit = $derived(results ? results.fits.length + results.tight.length : 0);

  const mmluExplainer = 'MMLU (Massive Multitask Language Understanding) measures general knowledge across 57 subjects. Higher = more capable. Sorted best-first.';
  const sweBenchExplainer = 'SWE-bench Verified measures a model\'s ability to resolve real-world GitHub issues. Higher = better at coding tasks. Sorted best-first.';

  let benchmarkName = $derived(sortBy === 'swe-bench' ? 'SWE-Bench' : 'MMLU');
  let benchmarkExplainer = $derived(sortBy === 'swe-bench' ? sweBenchExplainer : mmluExplainer);

  let copyState = $state('idle'); // 'idle' | 'copied' | 'error'
  let copyTimeout;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyState = 'copied';
    } catch {
      copyState = 'error';
    }
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => (copyState = 'idle'), 2000);
  }
</script>

{#snippet modelHeader(g)}
  <div class="model-row">
    <div class="model-info">
      <span class="model-name">{g.name}</span>
      <span class="badge params">{g.params_b}B</span>
      <span class="badge quality {g.tier.cls}">{g.tier.label}</span>
      {#each g.features as feat}
        <span class="badge feature feature-{feat}">{FEATURE_LABELS[feat] ?? feat}</span>
      {/each}
    </div>
    <div class="model-stats">
      <span class="stat quality-stat">
        <span class="stat-label">{benchmarkName}</span>
        <span class="stat-value">{sortBy === 'swe-bench' ? (g.swe_bench_score != null ? g.swe_bench_score : 'N/A') : g.mmlu_score}</span>
      </span>
    </div>
  </div>
{/snippet}

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
    <div class="results-meta">
      <div class="sort-control">
        <label for="sort-select">Ranked by</label>
        <select id="sort-select" value={sortBy} onchange={onSortByChange}>
          <option value="mmlu">MMLU</option>
          <option value="swe-bench">SWE-Bench</option>
        </select>
        <span class="tooltip-wrap" tabindex="0" role="button" aria-label="What is {benchmarkName}?">
          <span class="info-icon">?</span>
          <span class="tooltip">{benchmarkExplainer}</span>
        </span>
      </div>
      <button class="copy-btn" onclick={copyLink} aria-label="Copy link to clipboard">
        {#if copyState === 'copied'}
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Copied
        {:else if copyState === 'error'}
          Failed
        {:else}
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Copy link
        {/if}
      </button>
    </div>

    {#if groupedFits.length > 0}
      <div class="group fits">
        <h3>Runs well</h3>
        <ul>
          {#each groupedFits as g}
            <li>
              {@render modelHeader(g)}
              <div class="variants">
                {#each g.variants as v}
                  <div class="variant-row">
                    <span class="badge quant">{v.quantization}</span>
                    <div class="variant-stats">
                      <span class="stat context">
                        <span class="stat-label">Context</span>
                        <span class="stat-value">{contextLabel(v.maxCtxK)}</span>
                      </span>
                      {#if v.tokPerSec != null}
                        <span class="stat speed">
                          <span class="stat-label">Speed</span>
                          <span class="stat-value">{tokLabel(v.tokPerSec)}</span>
                        </span>
                      {/if}
                    </div>
                  </div>
                  {#if v.ctxInfo}
                    <p class="reason variant-reason ram-note">{contextLabel(v.ctxInfo.vramCtxK)} on GPU, {contextLabel(v.ctxInfo.ramCtxK)} extended via system RAM</p>
                  {/if}
                {/each}
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if groupedTight.length > 0}
      <div class="group tight">
        <h3>Tight fit</h3>
        <ul>
          {#each groupedTight as g}
            <li>
              {@render modelHeader(g)}
              <div class="variants">
                {#each g.variants as v}
                  <div class="variant-row">
                    <span class="badge quant">{v.quantization}</span>
                    <div class="variant-stats">
                      <span class="stat context">
                        <span class="stat-label">Context</span>
                        <span class="stat-value">{v.maxCtxK > 0 ? contextLabel(v.maxCtxK) : '—'}</span>
                      </span>
                      {#if v.tokPerSec != null}
                        <span class="stat speed">
                          <span class="stat-label">Speed</span>
                          <span class="stat-value">{tokLabel(v.tokPerSec)}</span>
                        </span>
                      {/if}
                    </div>
                  </div>
                  {#if v.offloadInfo}
                    <p class="reason variant-reason offload-note">Requires {v.offloadInfo.gpuWeightGB.toFixed(1)} GB GPU + {v.offloadInfo.ramWeightGB.toFixed(1)} GB system RAM (~{v.offloadInfo.estimatedLayers} layers offloaded) — ~{v.offloadInfo.penaltyPercent}% slower</p>
                  {/if}
                  {#if v.ctxInfo}
                    <p class="reason variant-reason ram-note">{contextLabel(v.ctxInfo.vramCtxK)} on GPU, {contextLabel(v.ctxInfo.ramCtxK)} extended via system RAM</p>
                  {/if}
                  {#if !v.meetsMinCtx && v.fitsAtAll && !v.offloadInfo}
                    <p class="reason variant-reason">Only {contextLabel(v.maxCtxK)} context — below your {contextLabel(minContextK)} minimum</p>
                  {:else if v.maxCtxK < 4 && !v.offloadInfo}
                    <p class="reason variant-reason">Very limited context window ({contextLabel(v.maxCtxK)})</p>
                  {/if}
                  {#if !v.meetsMinSpeed && v.tokPerSec != null && !v.offloadInfo}
                    <p class="reason variant-reason">~{v.tokPerSec} tok/s — below your {minTokPerSec} tok/s minimum</p>
                  {/if}
                  {#if !v.meetsFeatures}
                    <p class="reason variant-reason">Missing features: {requiredFeatures.filter((f) => !(v.features ?? []).includes(f)).map((f) => FEATURE_LABELS[f] ?? f).join(', ')}</p>
                  {/if}
                {/each}
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if groupedNoFit.length > 0}
      <div class="group no-fit">
        <h3>Doesn't fit</h3>
        <ul>
          {#each groupedNoFit as g}
            <li>
              {@render modelHeader(g)}
              <div class="variants">
                {#each g.variants as v}
                  <div class="variant-row">
                    <span class="badge quant">{v.quantization}</span>
                    {#if !v.fitsAtAll}
                      <span class="variant-need">Needs {(v.weight_gb + v.kv_per_1k_gb).toFixed(1)} GB — {(v.weight_gb + v.kv_per_1k_gb - vram).toFixed(1)} GB over</span>
                    {:else if !v.modelSupportsCtx}
                      <span class="variant-need">Max context {contextLabel(v.max_context_k)} — needs {contextLabel(minContextK)}</span>
                    {/if}
                  </div>
                {/each}
              </div>
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

  .results-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .sort-control {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .sort-control label {
    font-weight: 500;
    white-space: nowrap;
  }

  .sort-control select {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .sort-control select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .sort-control select:hover {
    border-color: var(--accent);
  }

  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .copy-btn:hover {
    color: var(--text);
    border-color: var(--accent);
    background: var(--surface-hover);
  }

  .copy-icon {
    width: 0.9rem;
    height: 0.9rem;
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
    flex-wrap: wrap;
    gap: 0.35rem 0.5rem;
    min-width: 0;
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
    margin-left: auto;
    flex-shrink: 0;
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

  .badge.quality.tier-na {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-muted);
    font-style: italic;
  }

  /* Feature badges */
  .badge.feature {
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .badge.feature-vision {
    background: rgba(0, 188, 212, 0.15);
    color: #4dd0e1;
  }

  .badge.feature-reasoning {
    background: rgba(233, 30, 99, 0.15);
    color: #f06292;
  }

  .badge.feature-tool_use {
    background: rgba(255, 152, 0, 0.15);
    color: #ffb74d;
  }

  /* Variant rows */
  .variants {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-top: 0.45rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .variant-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.35rem;
    border-radius: 3px;
    font-size: 0.82rem;
  }

  .variant-stats {
    display: flex;
    gap: 1rem;
    margin-left: auto;
  }

  .variant-need {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .reason {
    margin-top: 0.3rem;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-muted);
  }

  .reason.variant-reason {
    margin-top: 0;
    margin-bottom: 0.15rem;
    padding-left: 1.85rem; /* indent past the quant badge */
    font-size: 0.75rem;
  }

  .reason.offload-note {
    color: var(--tight, #ffa726);
    font-style: normal;
  }

  .reason.ram-note {
    color: var(--text-muted);
    font-style: normal;
    opacity: 0.85;
  }

  @media (max-width: 600px) {
    .model-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .model-stats {
      width: 100%;
      justify-content: flex-start;
      margin-left: 0;
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

    .variant-stats {
      margin-left: 0;
    }

    .reason.variant-reason {
      padding-left: 0;
    }
  }
</style>
