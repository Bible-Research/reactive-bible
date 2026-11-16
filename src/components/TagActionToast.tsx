import { useEffect } from 'react';
import {
  Affix,
  Button,
  Group,
  Notification,
} from '@mantine/core';

/** What the toast currently says. */
export interface TagToast {
  title: string;
  message?: React.ReactNode;
  color?: string;
  /**
   * `true` = the just-created toast that carries Undo +
   * Move under…; `false` = a plain result/error toast.
   */
  actions: boolean;
}

interface TagActionToastProps {
  toast: TagToast | null;
  onUndo: () => void;
  onMoveUnder: () => void;
  onClose: () => void;
}

const ACTION_MS = 10000;
const RESULT_MS = 4000;

/**
 * The post-create toast and the Undo/Move result toasts.
 *
 * Deliberately NOT `showNotification`: the note form lives
 * inside Mantine `Modal`s, which `aria-hidden` every other
 * top-level element — including the notifications portal —
 * while open. Rendered inside the combobox's own DOM, this
 * stays reachable and `role="status"` keeps it a polite
 * live region. Nothing auto-focuses, so typing continues.
 */
export function TagActionToast({
  toast,
  onUndo,
  onMoveUnder,
  onClose,
}: TagActionToastProps) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(
      onClose,
      toast.actions ? ACTION_MS : RESULT_MS
    );
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <Affix position={{ top: 20, right: 20 }}>
      <Notification
        role="status"
        color={toast.color}
        title={toast.title}
        onClose={onClose}
        maw={360}
      >
        {toast.message}
        {toast.actions && (
          <Group spacing="xs" mt={6}>
            <Button size="xs" variant="light" onClick={onUndo}>
              Undo
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={onMoveUnder}
            >
              Move under…
            </Button>
          </Group>
        )}
      </Notification>
    </Affix>
  );
}

export default TagActionToast;
