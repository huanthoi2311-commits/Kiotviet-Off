import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { ProductCreateForm } from '@/features/product/components/product-form';

/** T043 Phase E — Product Create. */
export default function NewProductPage() {
  return (
    <PermissionGate code="product:create">
      <PageHeader
        title="Thêm sản phẩm"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Sản phẩm', href: '/products' },
          { label: 'Thêm mới' },
        ]}
      />
      <ProductCreateForm />
    </PermissionGate>
  );
}
