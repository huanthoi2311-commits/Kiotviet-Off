import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-semibold">POS ERP Enterprise v1.0</h1>
      <p className="text-muted-foreground text-sm">
        Nền tảng Frontend (Next.js 15) đã sẵn sàng — Tailwind, shadcn/ui, TanStack Query, Zustand,
        React Hook Form, Zod, Dark Mode.
      </p>
    </div>
  );
}
