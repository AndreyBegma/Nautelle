'use client';

import { DialogContent, DialogRoot } from '@andrewbehma/glass-ui/dialog';
import { SHORTCUT_GROUPS } from '../../lib/board/shortcuts';

/** C-393: the `?` cheat sheet — every shortcut, grouped by where it works. */
export function ShortcutHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Keyboard shortcuts"
        description="The Board keys work when no field or button has the focus."
        className="sm:max-w-md"
      >
        <div className="flex flex-col gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-ink-3">
                {group.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <dt className="text-ink-2">{shortcut.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="glass-sm rounded-control px-1.5 py-0.5 font-mono text-xs text-ink"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
