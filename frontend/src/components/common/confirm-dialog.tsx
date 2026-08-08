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
          {/*
           * T038.08D — native `disabled` on the *currently focused* button
           * (the one just clicked, right as `isConfirming` turns true)
           * forces the browser to blur it to `document.body`; nothing in
           * base-ui's own focus trap (FloatingFocusManager) intervenes in
           * that specific browser-forced blur, so on error settlement focus
           * was left outside the still-open dialog. `aria-disabled` + a
           * click-guard achieves the same "can't confirm/cancel while
           * pending" behavior without ever removing the button from the
           * focus/tab order, so no forced blur ever occurs.
           */}
          <Button
            variant="outline"
            aria-disabled={isConfirming}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (isConfirming) return;
              onOpenChange(false);
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            aria-disabled={isConfirming}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (isConfirming) return;
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
