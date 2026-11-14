DELETE FROM "loads"
WHERE
  "id" = '302d510c-3fc7-4eb1-8d8b-e81731908bad'::uuid
  OR "load_number" LIKE 'MONEY-TEST-%';
