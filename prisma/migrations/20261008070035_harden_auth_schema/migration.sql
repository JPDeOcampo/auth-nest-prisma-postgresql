/*
  Warnings:

  - The primary key for the `Account` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `providerAccountId` on the `Account` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - The primary key for the `AuthToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `ipAddress` on the `AuthToken` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(45)`.
  - You are about to alter the column `userAgent` on the `AuthToken` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(512)`.
  - The primary key for the `EmailChangeRequest` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `newEmail` on the `EmailChangeRequest` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `ipAddress` on the `EmailChangeRequest` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(45)`.
  - You are about to alter the column `userAgent` on the `EmailChangeRequest` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(512)`.
  - You are about to drop the column `token` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to alter the column `firstName` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `lastName` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `email` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `displayName` on the `UserProfile` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `bio` on the `UserProfile` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `profileValue` on the `UserProfile` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(2048)`.
  - You are about to alter the column `coverValue` on the `UserProfile` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(2048)`.
  - A unique constraint covering the columns `[tokenHash]` on the table `EmailChangeRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `EmailChangeRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tokenHash]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `id` on the `Account` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `AuthToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `expiresAt` to the `EmailChangeRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenHash` to the `EmailChangeRequest` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `id` on the `EmailChangeRequest` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `familyId` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenHash` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- DropIndex
DROP INDEX "AuthToken_expiresAt_idx";

-- DropIndex
DROP INDEX "AuthToken_revokedAt_idx";

-- DropIndex
DROP INDEX "AuthToken_type_idx";

-- DropIndex
DROP INDEX "AuthToken_usedAt_idx";

-- DropIndex
DROP INDEX "AuthToken_userId_idx";

-- DropIndex
DROP INDEX "EmailChangeRequest_newEmail_idx";

-- DropIndex
DROP INDEX "EmailChangeRequest_newEmail_key";

-- DropIndex
DROP INDEX "EmailChangeRequest_userId_idx";

-- DropIndex
DROP INDEX "RefreshToken_token_idx";

-- DropIndex
DROP INDEX "RefreshToken_token_key";

-- AlterTable
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "providerAccountId" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "AuthToken" DROP CONSTRAINT "AuthToken_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "ipAddress" SET DATA TYPE VARCHAR(45),
ALTER COLUMN "userAgent" SET DATA TYPE VARCHAR(512),
ADD CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EmailChangeRequest" DROP CONSTRAINT "EmailChangeRequest_pkey",
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "tokenHash" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "newEmail" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "ipAddress" SET DATA TYPE VARCHAR(45),
ALTER COLUMN "userAgent" SET DATA TYPE VARCHAR(512),
ADD CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "RefreshToken" DROP COLUMN "token",
ADD COLUMN     "familyId" UUID NOT NULL,
ADD COLUMN     "ipAddress" VARCHAR(45),
ADD COLUMN     "replacedById" UUID,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "tokenHash" TEXT NOT NULL,
ADD COLUMN     "userAgent" VARCHAR(512);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER',
ALTER COLUMN "firstName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "lastName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255);

-- AlterTable
ALTER TABLE "UserProfile" ALTER COLUMN "displayName" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "bio" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "profileValue" SET DATA TYPE VARCHAR(2048),
ALTER COLUMN "coverValue" SET DATA TYPE VARCHAR(2048);

-- DropEnum
DROP TYPE "DocumentType";

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "event" VARCHAR(64) NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_event_createdAt_idx" ON "AuditLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeRequest_tokenHash_key" ON "EmailChangeRequest"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeRequest_userId_key" ON "EmailChangeRequest"("userId");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_expiresAt_idx" ON "EmailChangeRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
