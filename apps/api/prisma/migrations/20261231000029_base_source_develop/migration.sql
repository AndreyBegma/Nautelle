-- C-396: the base branch may come from an in-use `origin/develop`.
ALTER TYPE "BaseSource" ADD VALUE 'develop';
