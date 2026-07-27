/*
  Warnings:

  - You are about to drop the column `isTrial` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `trialEndsAt` on the `Subscription` table. All the data in the column will be lost.

  Trials are out of scope: deriveSubscriptionState never materialized a
  subscription from trial reminders alone, so isTrial only ever held a latch
  that could not be cleared and trialEndsAt was never written at all.

*/
-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "isTrial",
DROP COLUMN "trialEndsAt";
