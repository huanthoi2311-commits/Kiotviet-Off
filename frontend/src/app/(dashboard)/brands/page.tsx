import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { BrandTable } from '@/features/brand/components/brand-table';

/** T041 Phase C/D/F — Brand List + Create entry point + Archive/Restore actions. */
export default function BrandsPage() {
  return (
    <PermissionGate code="brand:view">
      <PageHeader
        title="Thương hiệu"
        breadcrumbs={[{ label: 'Master Data' }, { label: 'Thương hiệu' }]}
        action={
          <PermissionButton
            permission="brand:create"
            render={<Link href="/brands/new">Thêm thương hiệu</Link>}
          />
        }
      />
      <BrandTable />
    </PermissionGate>
  );
}
