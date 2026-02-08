<script>
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import gpus from '$lib/data/gpus.json';
  import GpuInput from '$lib/components/GpuInput.svelte';
  import ModelResults from '$lib/components/ModelResults.svelte';

  /** Validate and sanitize URL query parameters */
  function parseUrlParams(params) {
    let gpuId = '';
    let memIdx = '';
    let manualVram = '';
    let contextK = '';
    let speed = '';

    // Validate GPU ID — must match a known GPU
    const rawGpu = params.get('gpu') ?? '';
    if (rawGpu && gpus.some((g) => g.id === rawGpu)) {
      gpuId = rawGpu;

      // Validate memory index — must be in range for this GPU
      const rawMem = params.get('mem') ?? '';
      if (rawMem !== '') {
        const gpu = gpus.find((g) => g.id === gpuId);
        const idx = Number(rawMem);
        if (gpu?.vram_options && Number.isInteger(idx) && idx >= 0 && idx < gpu.vram_options.length) {
          memIdx = rawMem;
        }
      }
    }

    // Validate manual VRAM — must be a positive number
    const rawVram = params.get('vram') ?? '';
    if (rawVram !== '') {
      const val = parseFloat(rawVram);
      if (!Number.isNaN(val) && val > 0 && val <= 1000) {
        manualVram = rawVram;
      }
    }

    // Validate context — must be a positive number
    const rawCtx = params.get('ctx') ?? '';
    if (rawCtx !== '') {
      const val = Number(rawCtx);
      if (!Number.isNaN(val) && val > 0) {
        contextK = rawCtx;
      }
    }

    // Validate speed — must be a positive number
    const rawSpeed = params.get('speed') ?? '';
    if (rawSpeed !== '') {
      const val = Number(rawSpeed);
      if (!Number.isNaN(val) && val > 0) {
        speed = rawSpeed;
      }
    }

    // Validate features — comma-separated list of known feature keys
    const validFeatures = ['vision', 'reasoning', 'tool_use'];
    let features = [];
    const rawFeat = params.get('feat') ?? '';
    if (rawFeat) {
      features = rawFeat.split(',').filter((f) => validFeatures.includes(f));
    }

    // Validate agentic coding flag — must be "1"
    const agentic = params.get('agentic') === '1';

    return { gpuId, memIdx, manualVram, contextK, speed, features, agentic };
  }

  /** Derive initial vram/bandwidth from parsed URL params so results render immediately */
  function computeInitialHardware(p) {
    if (p.gpuId) {
      const gpu = gpus.find((g) => g.id === p.gpuId);
      if (gpu?.vram_options && p.memIdx !== '') {
        const opt = gpu.vram_options[Number(p.memIdx)];
        if (opt) return { vram: opt.vram_gb, bandwidth: opt.bandwidth_gbps };
      } else if (gpu) {
        return { vram: gpu.vram_gb, bandwidth: gpu.bandwidth_gbps };
      }
    } else if (p.manualVram) {
      const val = parseFloat(p.manualVram);
      if (!Number.isNaN(val) && val > 0) return { vram: val, bandwidth: null };
    }
    return { vram: null, bandwidth: null };
  }

  // Parse URL params synchronously on the client to avoid layout shift.
  // During SSR (static build) browser is false so we get safe defaults.
  const urlParams = browser
    ? parseUrlParams(new URL(window.location.href).searchParams)
    : { gpuId: '', memIdx: '', manualVram: '', contextK: '', speed: '', features: [], agentic: false };

  const initialHw = computeInitialHardware(urlParams);

  let vram = $state(initialHw.vram);
  let bandwidth = $state(initialHw.bandwidth);
  let minContextK = $state(urlParams.contextK !== '' ? Number(urlParams.contextK) : null);
  let minTokPerSec = $state(urlParams.speed !== '' ? Number(urlParams.speed) : null);
  let requiredFeatures = $state(urlParams.features.length > 0 ? [...urlParams.features] : []);
  let agenticCoding = $state(urlParams.agentic);

  // Initial values passed to GpuInput (constant after parse, no need for $state)
  const initialGpuId = urlParams.gpuId;
  const initialMemIdx = urlParams.memIdx;
  const initialManualVram = urlParams.manualVram;
  const initialContextK = urlParams.contextK;
  const initialSpeed = urlParams.speed;
  const initialFeatures = urlParams.features;
  const initialAgentic = urlParams.agentic;

  function onStateChange(state) {
    if (!browser) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('gpu');
    url.searchParams.delete('mem');
    url.searchParams.delete('vram');
    url.searchParams.delete('ctx');
    url.searchParams.delete('speed');
    url.searchParams.delete('feat');
    url.searchParams.delete('agentic');

    if (state.gpuId) url.searchParams.set('gpu', state.gpuId);
    if (state.memIdx !== '') url.searchParams.set('mem', state.memIdx);
    if (state.manualVram) url.searchParams.set('vram', state.manualVram);
    if (state.contextK !== '') url.searchParams.set('ctx', state.contextK);
    if (state.speed !== '') url.searchParams.set('speed', state.speed);
    if (state.features?.length > 0) url.searchParams.set('feat', state.features.join(','));
    if (state.agentic) url.searchParams.set('agentic', '1');

    replaceState(url, {});
  }
</script>

<svelte:head>
  <meta name="description" content="Pick the right AI model for your GPU — in seconds. Check VRAM, bandwidth, and context size compatibility." />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://whatmodelscanirun.com" />
  <meta property="og:title" content="What Models? — Pick the right model for your GPU in seconds" />
  <meta property="og:description" content="Pick the right AI model for your GPU — in seconds. Check VRAM, bandwidth, and context size compatibility." />
  <meta property="og:site_name" content="What Models?" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="What Models? — Pick the right model for your GPU in seconds" />
  <meta name="twitter:description" content="Pick the right AI model for your GPU — in seconds. Check VRAM, bandwidth, and context size compatibility." />

  <!-- Structured Data -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "What Models?",
    "url": "https://whatmodelscanirun.com",
    "description": "Pick the right AI model for your GPU — in seconds. Check VRAM, bandwidth, and context size compatibility.",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Any",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "author": { "@type": "Person", "name": "BenD10", "url": "https://github.com/BenD10" },
    "browserRequirements": "Requires JavaScript",
    "softwareHelp": { "@type": "WebPage", "url": "https://github.com/BenD10/whatmodels" }
  })}</script>`}
</svelte:head>

<div class="page">
  <GpuInput
    bind:vram
    bind:bandwidth
    bind:minContextK
    bind:minTokPerSec
    bind:requiredFeatures
    bind:agenticCoding
    {initialGpuId}
    {initialMemIdx}
    {initialManualVram}
    {initialContextK}
    {initialSpeed}
    {initialFeatures}
    {initialAgentic}
    onstatechange={onStateChange}
  />

  <section class="results-section">
    <h2>Results</h2>
    <ModelResults {vram} {bandwidth} {minContextK} {minTokPerSec} {requiredFeatures} {agenticCoding} />
  </section>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  h2 {
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }
</style>
