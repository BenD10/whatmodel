<script>
  import { onMount } from 'svelte';
  import gpus from '$lib/data/gpus.json';
  import SearchSelect from './SearchSelect.svelte';
  import MultiSelect from './MultiSelect.svelte';
  import { trackGpuSelected, trackManualVram, trackFilterChanged } from '$lib/analytics.js';

  const gpuItems = gpus.map((g) => ({
    id: g.id,
    label: g.vram_options
      ? g.name
      : `${g.name} (${g.vram_gb} GB)`,
    group: g.manufacturer,
  }));

  const CONTEXT_OPTIONS = [
    { value: null, label: 'Any' },
    { value: 2, label: '2K' },
    { value: 4, label: '4K' },
    { value: 8, label: '8K' },
    { value: 16, label: '16K' },
    { value: 32, label: '32K' },
    { value: 64, label: '64K' },
    { value: 128, label: '128K' },
  ];

  const SPEED_OPTIONS = [
    { value: null, label: 'Any' },
    { value: 5, label: '5 tok/s' },
    { value: 10, label: '10 tok/s' },
    { value: 20, label: '20 tok/s' },
    { value: 30, label: '30 tok/s' },
    { value: 50, label: '50 tok/s' },
    { value: 100, label: '100 tok/s' },
  ];

  const FEATURE_OPTIONS = [
    { id: 'vision', label: 'Vision' },
    { id: 'reasoning', label: 'Reasoning' },
    { id: 'tool_use', label: 'Tool use' },
  ];

  let {
    vram = $bindable(null),
    bandwidth = $bindable(null),
    minContextK = $bindable(null),
    minTokPerSec = $bindable(null),
    requiredFeatures = $bindable([]),
    agenticCoding = $bindable(false),
    initialGpuId = '',
    initialMemIdx = '',
    initialManualVram = '',
    initialContextK = '',
    initialSpeed = '',
    initialFeatures = [],
    initialAgentic = false,
    onstatechange = () => {},
  } = $props();

  let selectedGpuId = $state(initialGpuId);
  let manualVram = $state(initialManualVram);
  let contextSelection = $state(initialContextK !== '' ? Number(initialContextK) : '');
  let speedSelection = $state(initialSpeed !== '' ? Number(initialSpeed) : '');
  let selectedMemoryIdx = $state(initialMemIdx !== '' ? Number(initialMemIdx) : '');
  let featureSelection = $state(initialFeatures.length > 0 ? [...initialFeatures] : []);
  let agenticSelection = $state(initialAgentic);

  // Derived: does the selected GPU have configurable memory?
  let selectedGpu = $derived(gpus.find((g) => g.id === selectedGpuId) ?? null);
  let hasMemoryOptions = $derived(!!selectedGpu?.vram_options);

  function fireStateChange() {
    onstatechange({
      gpuId: selectedGpuId,
      memIdx: selectedMemoryIdx,
      manualVram,
      contextK: contextSelection,
      speed: speedSelection,
      features: featureSelection,
      agentic: agenticSelection,
    });
  }

  function onGpuChange() {
    manualVram = '';
    selectedMemoryIdx = '';
    const gpu = selectedGpu;
    if (!gpu) {
      vram = null;
      bandwidth = null;
    } else if (gpu.vram_options) {
      // Two-step: wait for memory selection
      vram = null;
      bandwidth = null;
    } else {
      vram = gpu.vram_gb;
      bandwidth = gpu.bandwidth_gbps;
      trackGpuSelected(gpu.name, gpu.vram_gb, gpu.bandwidth_gbps);
    }
    fireStateChange();
  }

  function onMemoryChange() {
    if (selectedMemoryIdx === '' || !selectedGpu?.vram_options) {
      vram = null;
      bandwidth = null;
      fireStateChange();
      return;
    }
    const idx = Number(selectedMemoryIdx);
    const opt = selectedGpu.vram_options[idx];
    if (!opt) {
      vram = null;
      bandwidth = null;
      fireStateChange();
      return;
    }
    vram = opt.vram_gb;
    bandwidth = opt.bandwidth_gbps;
    trackGpuSelected(selectedGpu.name, opt.vram_gb, opt.bandwidth_gbps);
    fireStateChange();
  }

  function onManualInput() {
    selectedGpuId = '';
    const val = parseFloat(manualVram);
    vram = !Number.isNaN(val) && val > 0 ? val : null;
    bandwidth = null; // unknown for manual entry
    if (vram != null) {
      trackManualVram(vram);
    }
    fireStateChange();
  }

  function onContextChange() {
    minContextK = contextSelection === '' ? null : Number(contextSelection);
    trackFilterChanged('min_context', minContextK);
    fireStateChange();
  }

  function onSpeedChange() {
    minTokPerSec = speedSelection === '' ? null : Number(speedSelection);
    trackFilterChanged('min_speed', minTokPerSec);
    fireStateChange();
  }

  function onFeaturesChange() {
    requiredFeatures = [...featureSelection];
    trackFilterChanged('features', featureSelection.join(','));
    fireStateChange();
  }

  function onAgenticChange() {
    agenticCoding = agenticSelection;
    trackFilterChanged('agentic_coding', agenticSelection);
    fireStateChange();
  }

  // Apply initial values on mount (from URL query params)
  onMount(() => {
    if (initialGpuId) {
      const gpu = gpus.find((g) => g.id === initialGpuId) ?? null;
      if (gpu) {
        if (gpu.vram_options) {
          if (initialMemIdx !== '') {
            const opt = gpu.vram_options[Number(initialMemIdx)];
            if (opt) {
              vram = opt.vram_gb;
              bandwidth = opt.bandwidth_gbps;
            }
          }
        } else {
          vram = gpu.vram_gb;
          bandwidth = gpu.bandwidth_gbps;
        }
      }
    } else if (initialManualVram) {
      const val = parseFloat(initialManualVram);
      if (!Number.isNaN(val) && val > 0) {
        vram = val;
        bandwidth = null;
      }
    }

    if (initialContextK !== '') {
      minContextK = Number(initialContextK);
    }
    if (initialSpeed !== '') {
      minTokPerSec = Number(initialSpeed);
    }
    if (initialFeatures.length > 0) {
      requiredFeatures = [...initialFeatures];
    }
    if (initialAgentic) {
      agenticCoding = true;
    }
  });
</script>

<section class="gpu-input">
  <div class="row gpu-row">
    <div class="field gpu-field">
      <label for="gpu-select">Select your GPU</label>
      <SearchSelect
        id="gpu-select"
        items={gpuItems}
        bind:value={selectedGpuId}
        placeholder="Search GPUs…"
        onchange={onGpuChange}
      />
    </div>

    {#if hasMemoryOptions}
      <div class="field memory-field">
        <label for="memory-select">Memory</label>
        <select id="memory-select" bind:value={selectedMemoryIdx} onchange={onMemoryChange}>
          <option value="">Select memory…</option>
          {#each selectedGpu.vram_options as opt, i}
            <option value={i}>{opt.vram_gb} GB</option>
          {/each}
        </select>
      </div>
    {/if}

    <span class="divider">or</span>

    <div class="field vram-field">
      <label for="vram-manual">VRAM (GB)</label>
      <input
        id="vram-manual"
        type="number"
        min="0"
        step="0.5"
        placeholder="e.g. 8"
        bind:value={manualVram}
        oninput={onManualInput}
      />
    </div>
  </div>

  <div class="row">
    <div class="field">
      <label for="context-select">Minimum context window</label>
      <select id="context-select" bind:value={contextSelection} onchange={onContextChange}>
        {#each CONTEXT_OPTIONS as opt}
          <option value={opt.value ?? ''}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="speed-select">Minimum tokens/sec</label>
      <select id="speed-select" bind:value={speedSelection} onchange={onSpeedChange}>
        {#each SPEED_OPTIONS as opt}
          <option value={opt.value ?? ''}>{opt.label}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <label for="features-select">Required features</label>
      <MultiSelect
        id="features-select"
        items={FEATURE_OPTIONS}
        bind:selected={featureSelection}
        placeholder="Any"
        onchange={onFeaturesChange}
      />
    </div>

    <div class="field agentic-field">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={agenticSelection} onchange={onAgenticChange} />
        <span class="checkbox-text">Agentic coding</span>
      </label>
      <span class="filter-hint">For Roo Code, Cline, etc.</span>
    </div>
  </div>

  <div class="effective">
    {#if vram != null}
      Using <strong>{vram} GB</strong> VRAM{#if agenticSelection}, <strong>agentic coding</strong> mode (64K+ context, ranked by SWE-bench){/if}{#if minContextK != null && !agenticSelection}, need at least <strong>{minContextK}K</strong> context{/if}{#if minTokPerSec != null}, need at least <strong>{minTokPerSec} tok/s</strong>{/if}
    {:else}
      <span class="muted">Pick a GPU or enter VRAM to get started</span>
    {/if}
  </div>
</section>

<style>
  .gpu-input {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
  }

  .gpu-row {
    justify-content: space-between;
  }

  .gpu-field {
    flex: 1;
    min-width: 0;
  }

  .vram-field {
    flex-shrink: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  select, input {
    padding: 0.55rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color 0.15s;
  }

  select:focus, input:focus {
    outline: none;
    border-color: var(--accent);
  }

  select {
    min-width: 180px;
    cursor: pointer;
  }

  input[type="number"] {
    width: 110px;
  }

  .divider {
    color: var(--text-muted);
    font-size: 0.85rem;
    padding-bottom: 0.55rem;
  }

  .effective {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
    font-size: 0.9rem;
  }

  .effective strong {
    color: var(--accent);
  }

  .muted {
    color: var(--text-muted);
  }

  .agentic-field {
    justify-content: flex-end;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    text-transform: none;
    font-size: 0.9rem;
    color: var(--text);
    letter-spacing: normal;
  }

  .checkbox-label input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .checkbox-text {
    font-weight: 500;
  }

  .filter-hint {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  @media (max-width: 600px) {
    .gpu-input {
      padding: 1rem;
    }

    .row {
      flex-direction: column;
      align-items: stretch;
    }

    .gpu-field,
    .vram-field {
      width: 100%;
    }

    .vram-field {
      flex-shrink: 1;
    }

    select {
      min-width: 0;
      width: 100%;
    }

    input[type="number"] {
      width: 100%;
    }

    .divider {
      text-align: center;
      padding: 0.25rem 0;
    }

    .field {
      width: 100%;
    }
  }
</style>
