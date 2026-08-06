/**
 * Feature detection for cross-tab auth coordination tiering (SPEC-T031 §12).
 * Web Locks + BroadcastChannel is the primary mechanism; browsers predating
 * Safari 15.4 (March 2022) fall back to the localStorage mutex.
 */
export function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
}

export function hasBroadcastChannel(): boolean {
  return typeof window !== 'undefined' && 'BroadcastChannel' in window;
}

export function hasCoordinationPrimitives(): boolean {
  return hasWebLocks() && hasBroadcastChannel();
}
