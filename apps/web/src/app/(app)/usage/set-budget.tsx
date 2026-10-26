'use client';

import { Button, buttonClassName } from '@andrewbehma/glass-ui/button';
import { toast } from '@andrewbehma/glass-ui/toast';
import type { AdminUser, ProjectSummary } from '@nautelle/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BudgetFormDialog } from '../../../components/budgets/budget-form-dialog';
import { DisabledReason } from '../../../components/prerequisites/disabled-reason';
import { api } from '../../../lib/api';
import { settingsItemHref } from '../../../lib/projects/settings-sections';

/**
 * "Set a budget" (#213) — the page's one primary. With a project in view it
 * opens that project's Budget block in Settings, the one place a project
 * budget is edited (C-395); an administrator with none picks the project or
 * user in the dialog, as on Admin › Budgets. Anyone else picks a project
 * first: a budget always has a scope.
 */
export function SetBudget({
  projectId,
  projects,
  isAdmin,
  onSaved,
}: {
  projectId: string;
  projects: ProjectSummary[];
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    api<AdminUser[]>('/admin/users?status=active')
      .then((list) => {
        if (Array.isArray(list)) setUsers(list);
      })
      .catch(() => {
        // The dialog still offers every project; a user budget waits.
      });
  }, [open, isAdmin]);

  if (projectId) {
    return (
      <Link
        href={settingsItemHref(projectId, 'budget')}
        className={buttonClassName({ variant: 'solid' })}
      >
        Set a budget
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="solid"
        disabled={!isAdmin}
        aria-describedby={isAdmin ? undefined : 'usage-budget-reason'}
        onClick={() => setOpen(true)}
      >
        Set a budget
      </Button>
      {isAdmin ? null : (
        <DisabledReason id="usage-budget-reason">
          Pick a project to set its budget.
        </DisabledReason>
      )}
      <BudgetFormDialog
        open={open}
        projects={projects.map((p) => ({ id: p.id, label: p.displayName }))}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          toast.success('Budget saved');
          onSaved();
        }}
      />
    </div>
  );
}
