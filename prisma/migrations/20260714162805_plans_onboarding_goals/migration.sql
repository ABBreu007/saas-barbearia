-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "monthlyGoalCents" INTEGER,
ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "pilotPriceUntil" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
