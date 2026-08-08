'use client';

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, FolderTree } from 'lucide-react';
import { useCategoryControllerGetTree } from '@/generated/category/category';
import type { CategoryTreeResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/empty-state';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { cn } from '@/lib/utils';

interface FlatNode {
  id: string;
  parentId: string | null;
}

/**
 * T040 AD-1 — read-only hierarchy view. Archived categories never appear
 * here: the backend's `GET /categories/tree` excludes soft-deleted rows at
 * the query level (`listAll()` filters `deletedAt: null`), so no
 * client-side status filtering is applied or needed.
 */
function flattenVisible(
  nodes: CategoryTreeResponseDto[],
  expanded: Set<string>,
  parentId: string | null = null,
): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, parentId });
    if (node.children.length > 0 && expanded.has(node.id)) {
      result.push(...flattenVisible(node.children, expanded, node.id));
    }
  }
  return result;
}

export function CategoryTree() {
  const { data, isLoading, isError, error, refetch } = useCategoryControllerGetTree();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const roots = useMemo(() => data ?? [], [data]);
  const flatVisible = useMemo(() => flattenVisible(roots, expanded), [roots, expanded]);

  // A direct query off the (stable) container ref, rather than a per-node
  // ref callback map — those are recreated every render (inline closures),
  // churning React's internal ref bookkeeping on every keystroke for no
  // benefit here.
  const focusNode = useCallback((id: string) => {
    setFocusedId(id);
    containerRef.current?.querySelector<HTMLDivElement>(`[data-node-id="${id}"]`)?.focus();
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, node: CategoryTreeResponseDto) => {
      const hasChildren = node.children.length > 0;
      const index = flatVisible.findIndex((n) => n.id === node.id);

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const next = flatVisible[index + 1];
          if (next) focusNode(next.id);
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          const prev = flatVisible[index - 1];
          if (prev) focusNode(prev.id);
          break;
        }
        case 'ArrowRight': {
          event.preventDefault();
          if (!hasChildren) break;
          if (!expanded.has(node.id)) {
            toggleExpanded(node.id);
          } else {
            const first = flatVisible[index + 1];
            if (first && first.parentId === node.id) focusNode(first.id);
          }
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          if (hasChildren && expanded.has(node.id)) {
            toggleExpanded(node.id);
          } else {
            const parentId = flatVisible[index]?.parentId;
            if (parentId) focusNode(parentId);
          }
          break;
        }
        case 'Home': {
          event.preventDefault();
          if (flatVisible[0]) focusNode(flatVisible[0].id);
          break;
        }
        case 'End': {
          event.preventDefault();
          const last = flatVisible[flatVisible.length - 1];
          if (last) focusNode(last.id);
          break;
        }
        case 'Enter':
        case ' ': {
          event.preventDefault();
          (event.currentTarget as HTMLDivElement).querySelector('a')?.click();
          break;
        }
        default:
          break;
      }
    },
    [flatVisible, expanded, toggleExpanded, focusNode],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (normalizedError) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-destructive text-sm">{normalizedError.message}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="Chưa có danh mục nào"
        description="Cây danh mục sẽ hiển thị ở đây sau khi có danh mục được tạo."
      />
    );
  }

  const activeFocusId = focusedId ?? flatVisible[0]?.id ?? null;

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label="Cây danh mục"
      className="flex flex-col gap-0.5 overflow-x-auto"
    >
      {roots.map((node, i) => (
        <CategoryTreeNode
          key={node.id}
          node={node}
          depth={0}
          posinset={i + 1}
          setsize={roots.length}
          expanded={expanded}
          onToggle={toggleExpanded}
          focusedId={activeFocusId}
          onFocus={setFocusedId}
          onKeyDown={handleKeyDown}
        />
      ))}
    </div>
  );
}

function CategoryTreeNode({
  node,
  depth,
  posinset,
  setsize,
  expanded,
  onToggle,
  focusedId,
  onFocus,
  onKeyDown,
}: {
  node: CategoryTreeResponseDto;
  depth: number;
  posinset: number;
  setsize: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, node: CategoryTreeResponseDto) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isFocused = focusedId === node.id;

  return (
    <div
      data-node-id={node.id}
      role="treeitem"
      aria-label={node.name}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={depth + 1}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-selected={false}
      tabIndex={isFocused ? 0 : -1}
      onFocus={(e) => {
        // Child treeitems are DOM descendants of their parent's own
        // treeitem div (required so `role="group"` nests correctly inside
        // `role="treeitem"` per the ARIA tree pattern) — without stopping
        // propagation here, focusing a child also bubbles into every
        // ancestor treeitem's own onFocus, which then overwrites
        // `focusedId` right back to itself.
        e.stopPropagation();
        onFocus(node.id);
      }}
      onKeyDown={(e) => {
        // Same bubbling concern as onFocus above: a keydown fired on a
        // nested treeitem bubbles natively through every ancestor
        // treeitem's own onKeyDown too, each of which would otherwise
        // reprocess the same key from its own (wrong) tree position.
        e.stopPropagation();
        onKeyDown(e, node);
      }}
      className="focus-visible:ring-ring rounded-md py-1.5 pr-2 outline-none focus-visible:ring-2"
    >
      <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        {hasChildren ? (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => onToggle(node.id)}
            className="text-muted-foreground flex size-5 shrink-0 items-center justify-center"
          >
            <ChevronRight
              className={cn('size-4 transition-transform', isExpanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden="true" />
        )}
        <Link
          href={`/categories/${node.id}`}
          tabIndex={-1}
          className="truncate text-sm hover:underline"
        >
          {node.name}
        </Link>
      </div>
      {hasChildren && isExpanded ? (
        <div role="group">
          {node.children.map((child, i) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              posinset={i + 1}
              setsize={node.children.length}
              expanded={expanded}
              onToggle={onToggle}
              focusedId={focusedId}
              onFocus={onFocus}
              onKeyDown={onKeyDown}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
