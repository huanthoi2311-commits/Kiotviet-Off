'use client';

import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * T052.03C — no shadcn Checkbox primitive existed anywhere in this repo before the RBAC permission
 * matrix needed one (confirmed: `src/components/ui/` had none, and the sole existing checkbox
 * usage anywhere, `brand-table.tsx`'s "archived" filter, is a raw native `<input type="checkbox">`
 * — fine for one filter, not for a whole matrix of accessible, tri-state checkboxes). Built on
 * `@base-ui/react/checkbox`, matching this file's own established base-ui integration pattern
 * (see `select.tsx`/`dialog.tsx` — Radix-less, `data-slot` + `cn()`-merged classNames).
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-input dark:bg-input/30 data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground dark:data-[checked]:bg-primary data-[checked]:border-primary data-[indeterminate]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
