import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { ProductEditForm } from '@/features/product/components/product-edit-form';

/** T043 Phase F/I — combined detail/edit page (Category T033.02 §2 precedent). */
export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="product:view">
      <PageHeader
        title="Chi tiết sản phẩm"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Sản phẩm', href: '/products' },
          { label: 'Chi tiết' },
        ]}
      />
      <ProductEditForm id={id} />
    </PermissionGate>
  );
}
