'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Destructive-style confirm button (e.g. archive) vs. a neutral one (e.g. restore) — T034.01 §5. */
  danger?: boolean;
  isConfirming?: boolean;
  /**
   * T038.10 — a business-rule failure (e.g. Category's CATEGORY_004/007)
   * renders here, inside the still-open dialog, instead of closing it.
   * Optional and additive: omitted by every existing caller (Create/Edit's
   * unsaved-changes guard), so their behavior is unchanged.
   */
  errorMessage?: string | null;
}

/**
 * T034.01 §5/§21 — one reusable dialog for archive/restore confirmations,
 * built on the shadcn `dialog` primitive (@base-ui/react underneath, which
 * already handles focus-trap/aria-modal/escape-to-close — T034.01 §16).
 * Create/Edit are full pages, not dialogs (T033.02 §2 — restated here, not
 * re-decided).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  onConfirm,
  danger = false,
  isConfirming = false,
  errorMessage = null,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
