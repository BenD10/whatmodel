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
    systemRamGB = $bindable(null),
    initialGpuId = '',
    initialMemIdx = '',
    initialManualVram = '',
    initialContextK = '',
    initialSpeed = '',
    initialFeatures = [],
    initialSystemRam = '',
    onstatechange = () => {},
  } = $props();

  let selectedGpuId = $state(initialGpuId);
  let manualVram = $state(initialManualVram);
  let contextSelection = $state(initialContextK !== '' ? Number(initialContextK) : '');
  let speedSelection = $state(initialSpeed !== '' ? Number(initialSpeed) : '');
  let selectedMemoryIdx = $state(initialMemIdx !== '' ? Number(initialMemIdx) : '');
  let featureSelection = $state(initialFeatures.length > 0 ? [...initialFeatures] : []);
  let systemRamInput = $state(initialSystemRam);

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
      systemRam: systemRamInput,
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

  function onSystemRamInput() {
    const val = parseFloat(systemRamInput);
    systemRamGB = !Number.isNaN(val) && val > 0 ? val : null;
    if (systemRamGB != null) {
      trackFilterChanged('system_ram', systemRamGB);
    }
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

    if (initialSystemRam !== '') {
      const val = parseFloat(initialSystemRam);
      if (!Number.isNaN(val) && val > 0) {
        systemRamGB = val;
      }
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

    <div class="field ram-field">
      <label for="system-ram">
        System RAM
        <span class="optional-label">(optional)</span>
        <span class="tooltip-wrap" tabindex="0" role="button" aria-label="What is system RAM offloading?">
          <span class="info-icon">?</span>
          <span class="tooltip">Enter your system RAM to enable offloading. Models can use system memory to extend context windows or run larger models at reduced speed.</span>
        </span>
      </label>
      <div class="ram-input-wrap">
        <input
          id="system-ram"
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 32"
          bind:value={systemRamInput}
          oninput={onSystemRamInput}
        />
        <span class="input-suffix">GB</span>
      </div>
    </div>

  </div>

  <div class="effective">
    {#if vram != null}
      Using <strong>{vram} GB</strong> VRAM{#if systemRamGB != null} + <strong>{systemRamGB} GB</strong> system RAM{/if}{#if minContextK != null}, need at least <strong>{minContextK}K</strong> context{/if}{#if minTokPerSec != null}, need at least <strong>{minTokPerSec} tok/s</strong>{/if}
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

  .optional-label {
    font-weight: 400;
    font-size: 0.7rem;
    color: var(--text-muted);
    opacity: 0.7;
    text-transform: none;
    letter-spacing: normal;
  }

  .tooltip-wrap {
    position: relative;
    display: inline-flex;
    cursor: help;
    outline: none;
    vertical-align: middle;
  }

  .info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    border: 1px solid var(--text-muted);
    font-size: 0.55rem;
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
    max-width: 260px;
    padding: 0.55rem 0.75rem;
    background: var(--surface, #1e1e2e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 400;
    line-height: 1.45;
    color: var(--text, #e0e0e0);
    text-transform: none;
    letter-spacing: normal;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 100;
    pointer-events: none;
  }

  .tooltip-wrap:hover .tooltip,
  .tooltip-wrap:focus .tooltip {
    display: block;
  }

  .ram-field {
    flex-shrink: 0;
  }

  .ram-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .ram-input-wrap input[type="number"] {
    width: 80px;
  }

  .input-suffix {
    font-size: 0.85rem;
    color: var(--text-muted);
    padding-bottom: 0.1rem;
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

    .ram-input-wrap input[type="number"] {
      width: 100%;
    }

    .divider {
      text-align: center;
      padding: 0.25rem 0;
    }

    .field {
      width: 100%;
    }

    .ram-field {
      flex-shrink: 1;
    }
  }
</style>
