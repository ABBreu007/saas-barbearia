-- CreateEnum
CREATE TYPE "ClientPlanStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "clientPlanId" TEXT;

-- CreateTable
CREATE TABLE "barbershop_plans" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "visitsPerMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barbershop_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_plans" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "status" "ClientPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "barbershop_plans_barbershopId_idx" ON "barbershop_plans"("barbershopId");

-- CreateIndex
CREATE INDEX "client_plans_barbershopId_idx" ON "client_plans"("barbershopId");

-- CreateIndex
CREATE INDEX "client_plans_clientId_idx" ON "client_plans"("clientId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientPlanId_fkey" FOREIGN KEY ("clientPlanId") REFERENCES "client_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbershop_plans" ADD CONSTRAINT "barbershop_plans_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "barbershop_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
