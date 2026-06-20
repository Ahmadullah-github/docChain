const mysql = require("mysql2/promise");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function sslConfig() {
  return process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2" } : undefined;
}

function baseConnectionConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    ssl: sslConfig(),
    multipleStatements: false
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function main() {
  const database = process.env.DB_NAME || "docchain_express";
  const connection = await mysql.createConnection(baseConnectionConfig());
  await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();

  run("node", ["server/scripts/migrate-database.cjs", "latest"]);
  run("node", ["server/scripts/seed-database.cjs"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
