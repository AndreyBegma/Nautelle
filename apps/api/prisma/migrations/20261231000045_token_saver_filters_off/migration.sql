-- C-442 (#669): the filter families a project's launches switch off.

-- AlterTable
ALTER TABLE "token_saver_settings" ADD COLUMN     "filtersOff" TEXT[] DEFAULT ARRAY[]::TEXT[];
