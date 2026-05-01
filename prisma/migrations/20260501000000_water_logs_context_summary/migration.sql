-- Add context_summary to threads (caveman-compressed history for LLM context)
ALTER TABLE "threads" ADD COLUMN "context_summary" TEXT;

-- Create water_logs table for hydration tracking
CREATE TABLE "water_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_ml" INTEGER NOT NULL DEFAULT 800,
    "notes" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "water_logs_user_id_logged_at_idx" ON "water_logs"("user_id", "logged_at");

ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
