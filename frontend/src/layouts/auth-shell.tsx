/**
 * Composition point for the `(auth)` route group (SPEC-T031 §8). Defines
 * only the composition responsibility — no visual/component-level design
 * (background, card layout, branding) is specified anywhere in the RFC or
 * discovery evidence base; that must be sourced separately before any real
 * auth page is built on top of this shell.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}
