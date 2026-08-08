import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { CategoryTree } from './category-tree';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderTree() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryTree />
    </QueryClientProvider>,
  );
}

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    parentId: null,
    code: 'THOI-TRANG',
    name: 'Thời trang',
    slug: 'thoi-trang',
    description: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    children: [],
    ...overrides,
  };
}

function mockTree(tree: unknown[]) {
  server.use(http.get(`${API_BASE_URL}/categories/tree`, () => HttpResponse.json(envelope(tree))));
}

describe('CategoryTree (T040)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore
      .getState()
      .setAccessToken(
        buildAccessToken({
          sub: 'user-1',
          organizationId: 'org-1',
          permissions: ['category:view'],
        }),
      );
  });

  it('renders root categories', async () => {
    mockTree([
      buildNode({ id: 'root-1', name: 'Thời trang' }),
      buildNode({ id: 'root-2', name: 'Điện tử', code: 'DIEN-TU' }),
    ]);

    renderTree();

    expect(await screen.findByText('Thời trang')).toBeInTheDocument();
    expect(screen.getByText('Điện tử')).toBeInTheDocument();
  });

  it('collapses nested children by default and reveals them on expand click', async () => {
    const user = userEvent.setup();
    mockTree([
      buildNode({
        id: 'root-1',
        name: 'Thời trang',
        children: [
          buildNode({ id: 'child-1', parentId: 'root-1', name: 'Áo nam', code: 'AO-NAM' }),
        ],
      }),
    ]);

    renderTree();
    await screen.findByText('Thời trang');

    expect(screen.queryByText('Áo nam')).not.toBeInTheDocument();

    const toggle = screen.getByRole('treeitem', { name: 'Thời trang' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { hidden: true }));
    expect(await screen.findByText('Áo nam')).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Thời trang' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('renders multiple hierarchy levels (3 deep) once fully expanded', async () => {
    const user = userEvent.setup();
    mockTree([
      buildNode({
        id: 'l1',
        name: 'Cấp 1',
        children: [
          buildNode({
            id: 'l2',
            parentId: 'l1',
            name: 'Cấp 2',
            code: 'L2',
            children: [buildNode({ id: 'l3', parentId: 'l2', name: 'Cấp 3', code: 'L3' })],
          }),
        ],
      }),
    ]);

    renderTree();
    await screen.findByText('Cấp 1');

    await user.click(screen.getByRole('treeitem', { name: 'Cấp 1' }));
    await user.keyboard('{ArrowRight}');
    expect(await screen.findByText('Cấp 2')).toBeInTheDocument();
    expect(screen.queryByText('Cấp 3')).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(await screen.findByText('Cấp 3')).toBeInTheDocument();

    expect(screen.getByRole('treeitem', { name: 'Cấp 2' })).toHaveAttribute('aria-level', '2');
    expect(screen.getByRole('treeitem', { name: 'Cấp 3' })).toHaveAttribute('aria-level', '3');
  });

  it('shows the empty state for a tree with no categories', async () => {
    mockTree([]);

    renderTree();

    expect(await screen.findByText('Chưa có danh mục nào')).toBeInTheDocument();
  });

  it('shows loading skeletons before data resolves', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/categories/tree`,
        () => new Promise(() => {}), // never resolves
      ),
    );

    const { container } = renderTree();

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('shows an error message with a retry action on API failure, and recovers on retry', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/categories/tree`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            {
              success: false,
              code: 'INTERNAL_ERROR',
              message: 'Lỗi hệ thống',
              errors: [],
              traceId: 't-1',
              timestamp: new Date().toISOString(),
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope([buildNode({ id: 'root-1', name: 'Thời trang' })]));
      }),
    );

    renderTree();

    expect(await screen.findByText('Lỗi hệ thống')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Thời trang')).toBeInTheDocument();
  });

  it('renders nodes regardless of DRAFT/ACTIVE/INACTIVE status without client-side filtering (archived rows never appear per backend contract)', async () => {
    mockTree([
      buildNode({ id: 'root-draft', name: 'Nháp', code: 'DRAFT-1', status: 'DRAFT' }),
      buildNode({ id: 'root-active', name: 'Hoạt động', code: 'ACTIVE-1', status: 'ACTIVE' }),
      buildNode({ id: 'root-inactive', name: 'Ngừng', code: 'INACTIVE-1', status: 'INACTIVE' }),
    ]);

    renderTree();

    expect(await screen.findByText('Nháp')).toBeInTheDocument();
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Ngừng')).toBeInTheDocument();
  });

  it('supports full keyboard navigation: ArrowDown/Up, ArrowRight/Left, Home/End', async () => {
    const user = userEvent.setup();
    mockTree([
      buildNode({
        id: 'root-1',
        name: 'Thời trang',
        children: [
          buildNode({ id: 'child-1', parentId: 'root-1', name: 'Áo nam', code: 'AO-NAM' }),
        ],
      }),
      buildNode({ id: 'root-2', name: 'Điện tử', code: 'DIEN-TU' }),
    ]);

    renderTree();
    await screen.findByText('Thời trang');

    const root1 = screen.getByRole('treeitem', { name: 'Thời trang' });
    await user.click(root1);
    expect(root1).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(root1).toHaveAttribute('aria-expanded', 'true'));

    await user.keyboard('{ArrowDown}');
    const child1 = await screen.findByRole('treeitem', { name: 'Áo nam' });
    expect(child1).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(root1).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('treeitem', { name: 'Điện tử' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(root1).toHaveFocus();
  });

  it('keeps roving focus correct 3 levels deep (regression: nested treeitems are DOM descendants of their ancestors, so onFocus/onKeyDown must stop propagation or an ancestor reprocesses the same key)', async () => {
    const user = userEvent.setup();
    mockTree([
      buildNode({
        id: 'root-1',
        name: 'Thời trang',
        children: [
          buildNode({
            id: 'child-1',
            parentId: 'root-1',
            name: 'Áo nam',
            code: 'AO-NAM',
            children: [
              buildNode({
                id: 'grandchild-1',
                parentId: 'child-1',
                name: 'Áo sơ mi',
                code: 'AO-SO-MI',
              }),
            ],
          }),
        ],
      }),
    ]);

    renderTree();
    const root1 = await screen.findByRole('treeitem', { name: 'Thời trang' });
    await user.click(root1);

    await user.keyboard('{ArrowRight}'); // expand root-1
    await user.keyboard('{ArrowDown}'); // focus child-1
    const child1 = screen.getByRole('treeitem', { name: 'Áo nam' });
    expect(child1).toHaveFocus();

    await user.keyboard('{ArrowRight}'); // expand child-1, reveal grandchild-1
    await user.keyboard('{ArrowDown}'); // focus grandchild-1
    const grandchild1 = await screen.findByRole('treeitem', { name: 'Áo sơ mi' });
    expect(grandchild1).toHaveFocus();
    expect(grandchild1).toHaveAttribute('aria-level', '3');

    await user.keyboard('{ArrowLeft}'); // leaf with no children -> focus parent
    expect(child1).toHaveFocus();
  });

  it('navigates to the category Edit page on Enter (focused treeitem)', async () => {
    const user = userEvent.setup();
    mockTree([buildNode({ id: 'root-1', name: 'Thời trang' })]);

    renderTree();
    const root1 = await screen.findByRole('treeitem', { name: 'Thời trang' });
    await user.click(root1);

    const link = screen.getByRole('link', { name: 'Thời trang' });
    expect(link).toHaveAttribute('href', '/categories/root-1');
  });

  it('has correct ARIA tree/treeitem/group semantics', async () => {
    mockTree([
      buildNode({
        id: 'root-1',
        name: 'Thời trang',
        children: [
          buildNode({ id: 'child-1', parentId: 'root-1', name: 'Áo nam', code: 'AO-NAM' }),
        ],
      }),
    ]);

    renderTree();
    await screen.findByText('Thời trang');

    expect(screen.getByRole('tree', { name: 'Cây danh mục' })).toBeInTheDocument();
    const root1 = screen.getByRole('treeitem', { name: 'Thời trang' });
    expect(root1).toHaveAttribute('aria-level', '1');
    expect(root1).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no accessibility violations once data is loaded and expanded', async () => {
    mockTree([
      buildNode({
        id: 'root-1',
        name: 'Thời trang',
        children: [
          buildNode({ id: 'child-1', parentId: 'root-1', name: 'Áo nam', code: 'AO-NAM' }),
        ],
      }),
    ]);

    const { container } = renderTree();
    await screen.findByText('Thời trang');

    expect(await axe(container)).toHaveNoViolations();
  });
});
