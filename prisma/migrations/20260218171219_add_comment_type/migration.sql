-- CreateEnum
CREATE TYPE "CommentType" AS ENUM ('EDITORIAL', 'READER');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "type" "CommentType" NOT NULL DEFAULT 'EDITORIAL';
