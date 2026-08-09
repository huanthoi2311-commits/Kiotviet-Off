import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CustomerTable } from '@/features/customer/components/customer-table';

/** T048 — Customer List + Create entry point. */
export default function CustomersPage() {
  return (
    <PermissionGate code="customer:view">
      <PageHeader
        title="Khách hàng"
        breadcrumbs={[{ label: 'CRM' }, { label: 'Khách hàng' }]}
        action={
          <PermissionButton
            permission="customer:create"
            render={<Link href="/customers/new">Thêm khách hàng</Link>}
          />
        }
      />
      <CustomerTable />
    </PermissionGate>
  );
}
