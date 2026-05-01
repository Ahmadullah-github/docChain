const mysql = require("mysql2/promise");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const database = process.env.DB_NAME || "docchain_express";
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: false
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
  console.log(`Database ready: ${database}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
