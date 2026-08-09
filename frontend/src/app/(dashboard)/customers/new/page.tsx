import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CustomerCreateForm } from '@/features/customer/components/customer-form';

/** T048 — Create only. */
export default function NewCustomerPage() {
  return (
    <PermissionGate code="customer:create">
      <PageHeader
        title="Thêm khách hàng"
        breadcrumbs={[
          { label: 'CRM' },
          { label: 'Khách hàng', href: '/customers' },
          { label: 'Thêm mới' },
        ]}
      />
      <CustomerCreateForm />
    </PermissionGate>
  );
}
