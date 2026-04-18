-- CreateTable
CREATE TABLE "whatsapp_preferences" (
    "user_id" TEXT NOT NULL,
    "communication_style" TEXT,
    "language_level" TEXT DEFAULT 'simple',
    "preferred_name" TEXT,
    "checkin_time" TEXT,
    "checkin_enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT DEFAULT 'Asia/Kolkata',
    "last_checkin_sent_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "wellness_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "mood" INTEGER,
    "energy" INTEGER,
    "symptoms" TEXT,
    "meds_taken" BOOLEAN,
    "raw_message" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wellness_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wellness_logs_user_id_log_date_key" ON "wellness_logs"("user_id", "log_date");

-- CreateIndex
CREATE INDEX "wellness_logs_user_id_log_date_idx" ON "wellness_logs"("user_id", "log_date");

-- AddForeignKey
ALTER TABLE "whatsapp_preferences" ADD CONSTRAINT "whatsapp_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wellness_logs" ADD CONSTRAINT "wellness_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
