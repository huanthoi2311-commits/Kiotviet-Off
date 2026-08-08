import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { BrandCreateForm } from '@/features/brand/components/brand-form';

/** T041 Phase D — Brand Create. */
export default function NewBrandPage() {
  return (
    <PermissionGate code="brand:create">
      <PageHeader
        title="Thêm thương hiệu"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Thương hiệu', href: '/brands' },
          { label: 'Thêm mới' },
        ]}
      />
      <BrandCreateForm />
    </PermissionGate>
  );
}
