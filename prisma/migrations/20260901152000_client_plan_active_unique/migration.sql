CREATE UNIQUE INDEX "client_plans_one_open_per_client_key"
ON "client_plans"("clientId")
WHERE "status" IN ('PENDING', 'ACTIVE');
