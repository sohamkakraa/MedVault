-- Enable pgcrypto extension for pgp_sym_encrypt/pgp_sym_decrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "user_llm_credentials" (
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "api_key_cipher" BYTEA NOT NULL,
  "api_key_last_four" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_llm_credentials_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_llm_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
