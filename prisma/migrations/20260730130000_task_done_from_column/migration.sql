-- "done" is now derived from column === LISTO instead of tracked separately;
-- verified against current data that done was always in sync with column === listo.
ALTER TABLE "Task" DROP COLUMN "done";
