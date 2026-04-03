-- CreateEnum
CREATE TYPE "SuggestedEditStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW';

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "publishedContent" TEXT;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "manuscriptId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "gateway" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pidx" TEXT,
    "transactionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestedEdit" (
    "id" SERIAL NOT NULL,
    "chapterId" INTEGER NOT NULL,
    "editorId" INTEGER NOT NULL,
    "originalContent" TEXT NOT NULL,
    "suggestedContent" TEXT NOT NULL,
    "status" "SuggestedEditStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuggestedEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE INDEX "Purchase_manuscriptId_idx" ON "Purchase"("manuscriptId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_userId_manuscriptId_key" ON "Purchase"("userId", "manuscriptId");

-- CreateIndex
CREATE INDEX "SuggestedEdit_chapterId_idx" ON "SuggestedEdit"("chapterId");

-- CreateIndex
CREATE INDEX "SuggestedEdit_editorId_idx" ON "SuggestedEdit"("editorId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "Manuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedEdit" ADD CONSTRAINT "SuggestedEdit_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestedEdit" ADD CONSTRAINT "SuggestedEdit_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
