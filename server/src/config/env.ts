import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default("root"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().default("docchain_express"),
  SESSION_SECRET: z.string().min(16).default("docchain-local-development-secret"),
  SESSION_COOKIE_NAME: z.string().default("docchain.sid"),
  SIGNATURE_STORAGE_DIR: z.string().default("storage/signatures"),
  SIGNATURE_ENCRYPTION_KEY: z.string().min(16).default("docchain-local-signature-encryption-key")
});

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";
