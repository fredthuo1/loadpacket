ALTER TABLE "loads"
ADD CONSTRAINT "loads_rate_components_match_total"
CHECK (
  "linehaul" IS NULL
  OR "fuel_surcharge" IS NULL
  OR "total_rate" = "linehaul" + "fuel_surcharge"
);
