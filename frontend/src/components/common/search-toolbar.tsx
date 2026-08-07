'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface SearchToolbarProps {
  /** Current search value, typically read from the URL by the caller (T034.01 §14). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Additional filter controls (e.g. a status Select), rendered alongside the search input. */
  filters?: React.ReactNode;
  debounceMs?: number;
}

/**
 * T034.01 §11 — owns only debouncing of the search text; does not own URL
 * state itself (the caller reads/writes the URL, T034.01 §14), so this
 * component stays usable even for a caller that doesn't use URL state.
 */
export function SearchToolbar({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  filters,
  debounceMs = 300,
}: SearchToolbarProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) {
      return;
    }
    const timer = setTimeout(() => onChange(draft), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-debounce on `draft` changes, `onChange`/`value` intentionally excluded
  }, [draft, debounceMs]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative max-w-sm flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          aria-label={placeholder}
        />
      </div>
      {filters}
    </div>
  );
}
