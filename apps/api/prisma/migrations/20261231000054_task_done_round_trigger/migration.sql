-- C-511: a code card that raised a task with `need_person` resumes its
-- session in a `task_done` round once the task is Done. Existing rows are
-- unchanged.

-- AlterEnum
ALTER TYPE "CardRoundTrigger" ADD VALUE 'task_done';
