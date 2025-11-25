import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { UiShellContext, type UiShellContextValue } from './uiShellContextObject';

export function UiShellProvider({ children }: { children: ReactNode }) {
  const [topBarLeftNode, setTopBarLeftNode] = useState<HTMLDivElement | null>(null);
  const [topBarRightNode, setTopBarRightNode] = useState<HTMLDivElement | null>(null);
  const [lockCount, setLockCount] = useState(0);
  const nextTokenRef = useRef(1);
  const activeTokensRef = useRef<Set<number>>(new Set());

  const acquireShortcutLock = useCallback(() => {
    const token = nextTokenRef.current;
    nextTokenRef.current += 1;
    activeTokensRef.current.add(token);
    setLockCount(activeTokensRef.current.size);

    return () => {
      if (activeTokensRef.current.delete(token)) {
        setLockCount(activeTokensRef.current.size);
      }
    };
  }, []);

  const value = useMemo<UiShellContextValue>(
    () => ({
      topBarLeftNode,
      topBarRightNode,
      setTopBarLeftNode,
      setTopBarRightNode,
      areShortcutsSuspended: lockCount > 0,
      acquireShortcutLock,
    }),
    [topBarLeftNode, topBarRightNode, lockCount, acquireShortcutLock]
  );

  return <UiShellContext value={value}>{children}</UiShellContext>;
}
