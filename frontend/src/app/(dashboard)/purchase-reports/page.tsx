import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseReportView } from '@/features/purchase-report/components/purchase-report-view';

/** T050 — Purchase Report (AD-1: Purchase-only, `report:view`/`report:export`). */
export default function PurchaseReportsPage() {
  return (
    <PermissionGate code="report:view">
      <PageHeader
        title="Báo cáo mua hàng"
        breadcrumbs={[{ label: 'Mua hàng' }, { label: 'Báo cáo mua hàng' }]}
      />
      <PurchaseReportView />
    </PermissionGate>
  );
}
