import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * T034.01 §10 — plain, caller-supplied trail (no route-tree introspection):
 * each page passes its own list, resolving the final segment's label from
 * loaded record data where relevant (e.g. a Category's name, not its id) —
 * that resolution is the caller's responsibility, not this component's.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
      <ol className="flex items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <li>
                {item.href && !isLast ? (
                  <Link href={item.href} className="hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={isLast ? 'text-foreground' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
