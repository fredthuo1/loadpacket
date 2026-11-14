-- Forward-only additive fields. Existing stop evidence and historical data remain intact.
ALTER TABLE "load_stops"
  ADD COLUMN "arrived_at" TIMESTAMP(3),
  ADD COLUMN "departed_at" TIMESTAMP(3),
  ADD CONSTRAINT "load_stops_departure_after_arrival_check"
    CHECK ("departed_at" IS NULL OR ("arrived_at" IS NOT NULL AND "departed_at" >= "arrived_at"));
