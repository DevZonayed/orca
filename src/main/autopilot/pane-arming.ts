/**
 * Which panes the human has armed for Autopilot, this run.
 *
 * Main owns the send gate but the toggle renders in the renderer, so the
 * renderer pushes each change here. Anything main has not been told about is
 * **not** armed — a dropped or late message fails closed, which is the only
 * direction this may fail in.
 *
 * Deliberately not persisted: "session wise" is what was asked for, and an
 * arming flag that survives a restart arms a pane nobody is watching.
 */
const armedPaneKeys = new Set<string>()

/** Bounds the set against a long run that opens and closes many panes. */
const MAX_ARMED_PANES = 500

export function setPaneArmed(paneKey: string, armed: boolean): void {
  if (!armed) {
    armedPaneKeys.delete(paneKey)
    return
  }
  if (armedPaneKeys.size >= MAX_ARMED_PANES) {
    // Why: refuse rather than evict. Evicting would silently disarm a pane the
    // human armed, and silently doing *less* than asked is the safe failure.
    console.warn('[autopilot] refusing to arm more panes; limit reached')
    return
  }
  armedPaneKeys.add(paneKey)
}

export function isPaneArmed(paneKey: string): boolean {
  return armedPaneKeys.has(paneKey)
}

/** Forget a pane, so a recycled key cannot inherit an old arming. */
export function forgetPaneArming(paneKey: string): void {
  armedPaneKeys.delete(paneKey)
}

export function countArmedPanes(): number {
  return armedPaneKeys.size
}

export function _resetPaneArmingForTests(): void {
  armedPaneKeys.clear()
}
