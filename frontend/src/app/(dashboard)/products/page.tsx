import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { ProductTable } from '@/features/product/components/product-table';

/** T043 Phase D — Product List + Create entry point + Archive/Restore actions. */
export default function ProductsPage() {
  return (
    <PermissionGate code="product:view">
      <PageHeader
        title="Sản phẩm"
        breadcrumbs={[{ label: 'Master Data' }, { label: 'Sản phẩm' }]}
        action={
          <PermissionButton
            permission="product:create"
            render={<Link href="/products/new">Thêm sản phẩm</Link>}
          />
        }
      />
      <ProductTable />
    </PermissionGate>
  );
}
