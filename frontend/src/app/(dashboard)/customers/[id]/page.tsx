import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CustomerEditForm } from '@/features/customer/components/customer-edit-form';

/** T048 — combined detail/edit page (master-data precedent, T048 spec §1). */
export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="customer:view">
      <PageHeader
        title="Chi tiết khách hàng"
        breadcrumbs={[
          { label: 'CRM' },
          { label: 'Khách hàng', href: '/customers' },
          { label: 'Chi tiết' },
        ]}
      />
      <CustomerEditForm id={id} />
    </PermissionGate>
  );
}
