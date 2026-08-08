'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FolderTree } from 'lucide-react';
import {
  getCategoryControllerFindOneQueryKey,
  getCategoryControllerListQueryKey,
  useCategoryControllerFindOne,
  useCategoryControllerList,
  useCategoryControllerUpdate,
} from '@/generated/category/category';
import type { CategoryResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrudForm } from '@/hooks/use-crud-form';
import { usePermission } from '@/hooks/use-permission';
import type { NormalizedError } from '@/services/api-client';
import { editCategorySchema, type EditCategoryFormValues } from '../edit-schema';

const STATUS_OPTIONS: { value: EditCategoryFormValues['status']; label: string }[] = [
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

const NO_PARENT_VALUE = '__none__';

/**
 * SPEC-T037 §20 (descendant-exclusion algorithm, finalized in T037.02) —
 * adjacency map + explicit-stack DFS + visited/excluded-set cycle guard,
 * mirroring the *shape* of the backend's own `assertNoActiveDescendant`
 * traversal (category.service.ts), not its code. O(n) overall, n bounded
 * by the picker's own fetch cap (limit: 100, T036.02 AD-1).
 */
function getExcludedParentIds(categories: CategoryResponseDto[], currentId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const list = childrenByParent.get(c.parentId) ?? [];
    list.push(c.id);
    childrenByParent.set(c.parentId, list);
  }

  const excluded = new Set<string>([currentId]);
  const stack = [...(childrenByParent.get(currentId) ?? [])];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (excluded.has(nodeId)) continue;
    excluded.add(nodeId);
    stack.push(...(childrenByParent.get(nodeId) ?? []));
  }
  return excluded;
}

function toFormValues(category: CategoryResponseDto): EditCategoryFormValues {
  return {
    version: category.version,
    code: category.code,
    name: category.name,
    description: category.description ?? '',
    imageUrl: category.imageUrl ?? '',
    parentId: category.parentId ?? undefined,
    status: category.status as EditCategoryFormValues['status'],
    isActive: category.isActive,
  };
}

/**
 * SPEC-T037 §16 — no `sortOrder` field here even though `UpdateCategoryDto`
 * supports it and Create's own schema includes it: `editCategorySchema`
 * (§6, as approved in T037.02) omits it. Implemented exactly as specified;
 * flagged in the implementation report as a probable spec gap rather than
 * silently added back.
 */
export function CategoryEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('category:update');

  const {
    data: category,
    isLoading,
    isError,
    error,
    refetch,
  } = useCategoryControllerFindOne<CategoryResponseDto, NormalizedError>(id);
  const { data: parentOptions } = useCategoryControllerList({ limit: 100 });

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Memoized on `category`'s own reference, not recomputed on every render:
  // RHF's `values` option resets the form whenever the object it's given
  // changes reference, regardless of whether its contents actually differ —
  // an unmemoized `toFormValues(category)` call here would produce a new
  // object on every keystroke's own re-render, silently discarding the
  // user's edit immediately after each character. `category` itself is
  // referentially stable across re-renders unless the query actually
  // refetches (initial load, explicit CATEGORY_009 reload, or this form's
  // own post-save reset — the three cases §6/§9 actually want a reset for).
  const formValues = useMemo(() => (category ? toFormValues(category) : undefined), [category]);

  const form = useCrudForm({
    schema: editCategorySchema,
    values: formValues,
  });
  // RHF's formState is a Proxy that only re-renders a subscriber once it has
  // *read* a given key during render — CrudForm reads `errors.root`
  // internally, but as a child receiving `form` by prop, that alone doesn't
  // register this component's own subscription (T036.10 finding).
  void form.formState.errors.root;

  // Unsaved-changes guard (SPEC-T037 §20 AD-4) — beforeunload only.
  // Internal navigation blocking is explicitly out of scope: Next.js App
  // Router has no built-in equivalent to React Router's `useBlocker`.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const updateMutation = useCategoryControllerUpdate<NormalizedError>({
    mutation: {
      // T038.08B (SPEC-T038A) — every branch below already renders the
      // error in-context (a field, the form's own root alert, or the
      // CATEGORY_009 conflict alert); without this flag the global
      // mutation-error toast duplicates the same message on top of it.
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getCategoryControllerListQueryKey() });
        queryClient.invalidateQueries({ queryKey: getCategoryControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật danh mục');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'CATEGORY_002') {
            form.setError('code', { type: 'server', message: err.message });
            return;
          }
          if (err.code === 'CATEGORY_006' || err.code === 'CATEGORY_005') {
            form.setError('parentId', { type: 'server', message: err.message });
            return;
          }
          if (err.code === 'CATEGORY_009') {
            setConflictMessage(err.message);
            return;
          }
          form.setServerError(err);
          return;
        }
        form.setError('root', { type: 'server', message: err.message });
      },
    },
  });

  const onSubmit = (values: EditCategoryFormValues) => {
    setConflictMessage(null);
    updateMutation.mutate({
      id,
      data: {
        version: values.version,
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        imageUrl: values.imageUrl || undefined,
        // §7/§8 — an explicit `null` clears the parent; `undefined` (never
        // sent) would leave it unchanged, which is wrong here since the
        // user may have deliberately cleared the picker.
        parentId: values.parentId ?? null,
        status: values.status,
        isActive: values.isActive,
      },
    });
  };

  const handleReload = () => {
    setConflictMessage(null);
    refetch();
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/categories');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'CATEGORY_001') {
    return (
      <EmptyState
        icon={FolderTree}
        title="Không tìm thấy danh mục"
        description="Danh mục này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/categories">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !category) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-destructive text-sm">
          {error?.message ?? 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  const excludedParentIds = getExcludedParentIds(parentOptions?.items ?? [], id);
  const selectableParents = (parentOptions?.items ?? []).filter(
    (c) => !excludedParentIds.has(c.id),
  );
  const parentItems = [
    { value: NO_PARENT_VALUE, label: '— Không có danh mục cha —' },
    ...selectableParents.map((c) => ({ value: c.id, label: c.name })),
  ];
  const currentParentName =
    (category.parentId &&
      (parentOptions?.items ?? []).find((c) => c.id === category.parentId)?.name) ||
    '— Không có danh mục cha —';

  if (!canUpdate) {
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã danh mục</Label>
          <Input id="code" value={category.code} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Tên danh mục</Label>
          <Input id="name" value={category.name} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="parentId">Danh mục cha</Label>
          <Input id="parentId" value={currentParentName} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" value={category.description ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="imageUrl">Ảnh (URL)</Label>
          <Input id="imageUrl" value={category.imageUrl ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Input
            id="status"
            value={STATUS_LABELS[category.status] ?? category.status}
            disabled
            readOnly
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            className="size-4"
            checked={category.isActive}
            disabled
            readOnly
          />
          <Label htmlFor="isActive">Đang hoạt động</Label>
        </div>
      </div>
    );
  }

  return (
    <>
      {conflictMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{conflictMessage}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã danh mục</Label>
          <Input
            id="code"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register('code')}
          />
          {form.formState.errors.code && (
            <p className="text-destructive text-sm">{form.formState.errors.code.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Tên danh mục</Label>
          <Input
            id="name"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="parentId">Danh mục cha</Label>
          <Select
            items={parentItems}
            value={form.watch('parentId') ?? NO_PARENT_VALUE}
            onValueChange={(value) =>
              form.setValue('parentId', !value || value === NO_PARENT_VALUE ? undefined : value, {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="parentId" className="w-full" aria-label="Danh mục cha">
              <SelectValue placeholder="— Không có danh mục cha —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT_VALUE}>— Không có danh mục cha —</SelectItem>
              {selectableParents.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.parentId && (
            <p className="text-destructive text-sm">{form.formState.errors.parentId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" {...form.register('description')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="imageUrl">Ảnh (URL)</Label>
          <Input id="imageUrl" {...form.register('imageUrl')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Select
            items={STATUS_OPTIONS}
            value={form.watch('status')}
            onValueChange={(value) =>
              form.setValue('status', value as EditCategoryFormValues['status'], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="status" className="w-full" aria-label="Trạng thái">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <input id="isActive" type="checkbox" className="size-4" {...form.register('isActive')} />
          <Label htmlFor="isActive">Đang hoạt động</Label>
        </div>
      </CrudForm>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/categories')}
      />
    </>
  );
}
