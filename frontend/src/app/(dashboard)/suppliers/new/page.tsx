import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { SupplierCreateForm } from '@/features/supplier/components/supplier-form';

/** T049 — Create only. */
export default function NewSupplierPage() {
  return (
    <PermissionGate code="supplier:create">
      <PageHeader
        title="Thêm nhà cung cấp"
        breadcrumbs={[
          { label: 'Mua hàng' },
          { label: 'Nhà cung cấp', href: '/suppliers' },
          { label: 'Thêm mới' },
        ]}
      />
      <SupplierCreateForm />
    </PermissionGate>
  );
}
