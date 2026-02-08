-- CreateEnum
CREATE TYPE "ManuscriptStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Manuscript" ADD COLUMN     "price" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "reads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ManuscriptStatus" NOT NULL DEFAULT 'DRAFT';
