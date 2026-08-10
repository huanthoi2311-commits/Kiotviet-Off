import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { SupplierEditForm } from '@/features/supplier/components/supplier-edit-form';

/** T049 — combined detail/edit page (master-data precedent). */
export default async function SupplierEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="supplier:view">
      <PageHeader
        title="Chi tiết nhà cung cấp"
        breadcrumbs={[
          { label: 'Mua hàng' },
          { label: 'Nhà cung cấp', href: '/suppliers' },
          { label: 'Chi tiết' },
        ]}
      />
      <SupplierEditForm id={id} />
    </PermissionGate>
  );
}
