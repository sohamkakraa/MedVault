-- CreateTable
CREATE TABLE "whatsapp_deliveries" (
    "e_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_deliveries_pkey" PRIMARY KEY ("e_id")
);

-- CreateTable
CREATE TABLE "pending_links" (
    "token" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_links_pkey" PRIMARY KEY ("token")
);
