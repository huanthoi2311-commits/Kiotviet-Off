import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';

export interface PageHeaderProps {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Primary action, e.g. a "New Category" button — caller renders it (often a `PermissionButton`), T034.01 §10. */
  action?: React.ReactNode;
}

export function PageHeader({ title, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 pb-4">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        {action}
      </div>
    </div>
  );
}
