-- Additive B1b lifecycle and audit vocabulary; no existing data is rewritten.
ALTER TYPE "LoadStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "LoadEventType" ADD VALUE 'LOAD_CORRECTED';
ALTER TYPE "LoadEventType" ADD VALUE 'DRIVER_UNASSIGNED';
ALTER TYPE "LoadEventType" ADD VALUE 'LOAD_CANCELLED';
