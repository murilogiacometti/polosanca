import { createContext, useContext, useEffect } from 'react';
import type { ModalFuncProps } from 'antd';

export interface UiShellContextValue {
  topBarLeftNode: HTMLDivElement | null;
  topBarRightNode: HTMLDivElement | null;
  setTopBarLeftNode: (node: HTMLDivElement | null) => void;
  setTopBarRightNode: (node: HTMLDivElement | null) => void;
  areShortcutsSuspended: boolean;
  acquireShortcutLock: () => () => void;
}

const noopRelease = () => () => {};

export const UiShellContext = createContext<UiShellContextValue>({
  topBarLeftNode: null,
  topBarRightNode: null,
  setTopBarLeftNode: () => {},
  setTopBarRightNode: () => {},
  areShortcutsSuspended: false,
  acquireShortcutLock: noopRelease,
});

export const useUiShell = (): UiShellContextValue => useContext(UiShellContext);

/**
 * Suspende declarativamente os atalhos globais de navegação (Esc / J / K)
 * enquanto qualquer Modal, Drawer, Popover, Select ou Dropdown estiver aberto,
 * sem recorrer a consultas imperativas no DOM (`document.querySelector`).
 */
export function useSuspendShortcuts(active: boolean): void {
  const { acquireShortcutLock } = useUiShell();

  useEffect(() => {
    if (!active) return undefined;
    return acquireShortcutLock();
  }, [active, acquireShortcutLock]);
}

/**
 * Abre um `modal.confirm` do Ant Design mantendo os atalhos globais suspensos
 * até o encerramento completo da janela de confirmação.
 */
export function confirmWithShortcutLock(
  modalApi: { confirm: (cfg: ModalFuncProps) => unknown },
  config: ModalFuncProps,
  acquireShortcutLock: () => () => void
): void {
  const release = acquireShortcutLock();
  const originalAfterClose = config.afterClose;
  modalApi.confirm({
    ...config,
    afterClose: () => {
      release();
      originalAfterClose?.();
    },
  });
}
