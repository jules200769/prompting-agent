/** Pure hotkey gate — blocks concurrent capture/optimize/apply. */
export function shouldIgnoreHotkey(state: {
  hotkeyInFlight: boolean;
  isOptimizing: boolean;
  applyInFlight: boolean;
}): boolean {
  return state.hotkeyInFlight || state.isOptimizing || state.applyInFlight;
}
