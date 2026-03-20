/**
 * Apply a UI zoom level change: sets webFrame zoom via the preload API
 * and updates the CSS variable used to compensate the traffic-light pad.
 */
export function applyUIZoom(level: number): void {
  window.api.ui.setZoomLevel(level)
  document.documentElement.style.setProperty('--ui-zoom-factor', String(Math.pow(1.2, level)))
}

/**
 * Sync the CSS variable with the current webFrame zoom level.
 * Call on startup after the main process has restored the zoom.
 */
export function syncZoomCSSVar(): void {
  const level = window.api.ui.getZoomLevel()
  document.documentElement.style.setProperty('--ui-zoom-factor', String(Math.pow(1.2, level)))
}
