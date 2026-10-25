'use client';

import { toast } from '@andrewbehma/glass-ui/toast';
import type { BoardCardView } from '@nautelle/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canAccept,
  canRetry,
  canRun,
  isSuggestion,
} from '../../lib/board/format';
import { isFreeKeyTarget, moveCursor } from '../../lib/board/shortcuts';
import type { CardActions } from './use-card-actions';

/** An open dialog, sheet or menu owns the keyboard. */
const overlayOpen = () =>
  document.querySelector(
    '[role="dialog"], [role="alertdialog"], [role="menu"]',
  ) !== null;

/**
 * C-393: the Board's keyboard. j/k or ↓/↑ move a cursor over the cards in
 * the order the Board shows them, Enter opens the card under it, r runs it,
 * a accepts it, n starts a new card and ? lists the keys. Nothing fires while
 * a field, button or link has the focus, a dialog is open, or a modifier is
 * held — those keys are theirs. Operators only for r, a and n.
 */
export function useBoardShortcuts({
  cards,
  canOperate,
  actions,
  onOpen,
  onNewCard,
}: {
  /** The cards on screen, in Board order. */
  cards: readonly BoardCardView[];
  canOperate: boolean;
  actions: CardActions;
  onOpen: (card: BoardCardView) => void;
  onNewCard: () => void;
}): {
  cursor: number | undefined;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
} {
  const [cursor, setCursor] = useState<number>();
  const [helpOpen, setHelpOpen] = useState(false);
  const numbers = useMemo(() => cards.map((card) => card.number), [cards]);
  const latest = useRef({ cards, canOperate, actions, onOpen, onNewCard });
  latest.current = { cards, canOperate, actions, onOpen, onNewCard };

  // A card that left the Board is no longer under the cursor.
  useEffect(() => {
    setCursor((current) =>
      current !== undefined && !numbers.includes(current) ? undefined : current,
    );
  }, [numbers]);

  useEffect(() => {
    if (cursor === undefined) return;
    document
      .querySelector(`[data-card-number="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (!isFreeKeyTarget(event.target) || overlayOpen()) return;
      const { cards, canOperate, actions, onOpen, onNewCard } = latest.current;
      const order = cards.map((card) => card.number);
      const current = cards.find((card) => card.number === cursor);

      const step = (by: 1 | -1) => {
        event.preventDefault();
        setCursor((at) => moveCursor(order, at, by));
      };
      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          return step(1);
        case 'k':
        case 'ArrowUp':
          return step(-1);
        case '?':
          event.preventDefault();
          return setHelpOpen(true);
        case 'n':
          if (!canOperate) return;
          event.preventDefault();
          return onNewCard();
        case 'Enter':
          if (!current) return;
          event.preventDefault();
          return onOpen(current);
        case 'r':
        case 'a': {
          if (!canOperate) return;
          event.preventDefault();
          if (!current) {
            toast.error('Move to a card first with j and k.');
            return;
          }
          if (event.key === 'r') {
            if (canRun(current) || canRetry(current)) void actions.run(current);
            else toast.error(`${current.label} cannot run now.`);
          } else if (isSuggestion(current)) {
            void actions.acceptSuggestion(current);
          } else if (canAccept(current)) actions.accept(current);
          else toast.error(`${current.label} is not ready to accept.`);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cursor]);

  return { cursor, helpOpen, setHelpOpen };
}
