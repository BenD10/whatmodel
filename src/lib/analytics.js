/**
 * Lightweight PostHog event helpers.
 * Safe to call during SSR / dev (no-ops when posthog isn't loaded).
 */

function capture(event, properties) {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, properties);
  }
}

export function trackGpuSelected(gpuName, vramGb, bandwidthGbps) {
  capture('gpu_selected', {
    gpu_name: gpuName,
    vram_gb: vramGb,
    bandwidth_gbps: bandwidthGbps,
  });
}

export function trackManualVram(vramGb) {
  capture('manual_vram_entered', { vram_gb: vramGb });
}

export function trackFilterChanged(filterName, value) {
  capture('filter_changed', { filter_name: filterName, value });
}
