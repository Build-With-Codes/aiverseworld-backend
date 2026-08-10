-- Drop the orphaned EnglishTutor* tables.
--
-- Verified safe before writing this migration (2026-08-09 verification pass):
--   * Zero code references anywhere in src/ (feature fully removed from both
--     the frontend routes/API and this backend's module/controller/service).
--   * All three tables have 0 rows in the local database.
--   * Every FK constraint touching these tables is entirely self-contained
--     within the three tables themselves (Turn -> Session, Mistake -> Session,
--     Mistake -> Turn) -- nothing else in the schema references them.
--
-- NOT applied automatically. Run explicitly when ready:
--   npx prisma migrate deploy
-- (or the project's established db push + migrate resolve --applied flow).

DROP TABLE IF EXISTS "aiverse_world"."EnglishTutorMistake";
DROP TABLE IF EXISTS "aiverse_world"."EnglishTutorTurn";
DROP TABLE IF EXISTS "aiverse_world"."EnglishTutorSession";
