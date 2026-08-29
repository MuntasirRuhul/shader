import { useCallback, useState } from 'react';

const STORAGE_KEY = 'shader-builder.inspector-groups';

type CollapseState = Record<string, boolean>;

function read(storage: Pick<Storage, 'getItem'> | null): CollapseState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as CollapseState) : {};
  } catch {
    return {};
  }
}

export interface GroupCollapse {
  readonly isOpen: (shaderId: string, group: string) => boolean;
  readonly setOpen: (shaderId: string, group: string, open: boolean) => void;
}

/**
 * Remembers which parameter groups are folded away, per shader.
 *
 * Keyed by shader as well as group so collapsing "Motion" on one shader does
 * not fold a differently-meaning "Motion" on another, and so the arrangement
 * survives reselecting the shader.
 */
export function useGroupCollapse(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
): GroupCollapse {
  const [state, setState] = useState<CollapseState>(() => read(storage));

  const isOpen = useCallback(
    (shaderId: string, group: string) => state[`${shaderId}:${group}`] !== false,
    [state],
  );

  const setOpen = useCallback(
    (shaderId: string, group: string, open: boolean) => {
      setState((current) => {
        const next = { ...current, [`${shaderId}:${group}`]: open };
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Losing the arrangement must never break the panel.
        }
        return next;
      });
    },
    [storage],
  );

  return { isOpen, setOpen };
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
