'use client';

import { useEffect } from 'react';

/**
 * Global Error Boundary (SPEC-T031 §21 binding rule): uses Next.js App
 * Router's native `error.tsx` convention rather than a hand-rolled React
 * error-boundary system.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Đã xảy ra lỗi</h1>
      <p className="text-muted-foreground text-sm">{error.message || 'Vui lòng thử lại.'}</p>
      <button
        type="button"
        onClick={reset}
        className="hover:bg-muted rounded-md border px-4 py-2 text-sm"
      >
        Thử lại
      </button>
    </div>
  );
}
