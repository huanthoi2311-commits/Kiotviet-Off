import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * T034.01 §11/§21 — parameterized, no module-specific copy baked in.
 * Callers distinguish "no results for this search/filter" from "nothing
 * exists yet" (the latter typically passing an `action` CTA) by supplying
 * different props, not by this component branching internally.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      {Icon ? <Icon className="text-muted-foreground mb-2 size-8" aria-hidden="true" /> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
