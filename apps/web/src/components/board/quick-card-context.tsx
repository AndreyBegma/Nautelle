'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { QuickCardDialog } from './quick-card-dialog';

interface Target {
  projectId: string;
  text?: string;
}

type OpenQuickCard = (projectId: string, text?: string) => void;

const QuickCardContext = createContext<OpenQuickCard>(() => {});

/**
 * C-391: one Quick card dialog for the whole shell, so New work, ⌘K and the
 * phone `+` open the same one. `open` names the project the card goes to.
 */
export function QuickCardProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target>();
  const [open, setOpen] = useState(false);
  const show = useCallback<OpenQuickCard>((projectId, text) => {
    setTarget({ projectId, text });
    setOpen(true);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <QuickCardContext.Provider value={value}>
      {children}
      {target ? (
        <QuickCardDialog
          projectId={target.projectId}
          open={open}
          initialText={target.text}
          onOpenChange={setOpen}
        />
      ) : null}
    </QuickCardContext.Provider>
  );
}

/** Opens the Quick card dialog for a project, optionally with text carried over. */
export const useQuickCard = (): OpenQuickCard => useContext(QuickCardContext);
