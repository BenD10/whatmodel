<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import gpus from '$lib/data/gpus.json';
  import GpuInput from '$lib/components/GpuInput.svelte';
  import ModelResults from '$lib/components/ModelResults.svelte';

  let vram = $state(null);
  let bandwidth = $state(null);
  let minContextK = $state(null);
  let minTokPerSec = $state(null);
  let requiredFeatures = $state([]);
  let agenticCoding = $state(false);

  // Read initial values from URL query params (client-side only)
  let initialGpuId = $state('');
  let initialMemIdx = $state('');
  let initialManualVram = $state('');
  let initialContextK = $state('');
  let initialSpeed = $state('');
  let initialFeatures = $state([]);
  let initialAgentic = $state(false);
  let ready = $state(false);

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

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    const validated = parseUrlParams(params);
    initialGpuId = validated.gpuId;
    initialMemIdx = validated.memIdx;
    initialManualVram = validated.manualVram;
    initialContextK = validated.contextK;
    initialSpeed = validated.speed;
    initialFeatures = validated.features;
    initialAgentic = validated.agentic;
    ready = true;
  });

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
  {#key ready}
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
  {/key}

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
