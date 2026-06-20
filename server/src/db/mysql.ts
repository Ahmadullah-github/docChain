import mysql from "mysql2/promise";
import type { Pool, PoolConnection } from "mysql2/promise";
import { env, isProduction } from "../config/env";

export type Database = Pool | PoolConnection;

const ssl = env.DB_SSL ? { minVersion: "TLSv1.2" as const } : undefined;

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl,
  charset: "utf8mb4",
  timezone: "Z",
  waitForConnections: true,
  connectionLimit: isProduction ? 20 : 10,
  queueLimit: 0
});

export async function closePool() {
  await pool.end();
}
