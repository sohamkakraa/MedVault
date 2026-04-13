-- Add Google OAuth fields to User table
ALTER TABLE "User" ADD COLUMN "google_id" TEXT UNIQUE;
ALTER TABLE "User" ADD COLUMN "google_email" TEXT;
