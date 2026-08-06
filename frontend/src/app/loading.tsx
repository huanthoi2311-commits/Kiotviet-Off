import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI via Next.js App Router's native `loading.tsx`
 * convention (SPEC-T031 §21 binding rule) — no custom loading-state system.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
