<script>
  import GpuInput from '$lib/components/GpuInput.svelte';
  import ModelResults from '$lib/components/ModelResults.svelte';

  let vram = $state(null);
  let bandwidth = $state(null);
  let minContextK = $state(null);
  let minTokPerSec = $state(null);
</script>

<svelte:head>
  <meta name="description" content="Pick the right AI model for your GPU — in seconds. Check VRAM, bandwidth, and context size compatibility." />
</svelte:head>

<div class="page">
  <GpuInput bind:vram bind:bandwidth bind:minContextK bind:minTokPerSec />

  <section class="results-section">
    <h2>Results</h2>
    <ModelResults {vram} {bandwidth} {minContextK} {minTokPerSec} />
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
