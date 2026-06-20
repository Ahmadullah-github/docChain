const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const command = process.argv[2] || "latest";
const migrationsDir = path.resolve(process.cwd(), "server/migrations/sql");

function sslConfig() {
  return process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2" } : undefined;
}

function connectionConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "docchain_express",
    ssl: sslConfig(),
    charset: "utf8mb4",
    timezone: "Z",
    multipleStatements: true
  };
}

async function migrationFiles(direction) {
  const suffix = `.${direction}.sql`;
  return (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(suffix))
    .sort();
}

function migrationName(file) {
  return file.replace(/\.(up|down)\.sql$/, "");
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name varchar(255) NOT NULL PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function appliedMigrations(connection) {
  const [rows] = await connection.query("SELECT name FROM schema_migrations ORDER BY name ASC");
  return new Set(rows.map((row) => row.name));
}

async function executeSqlFile(connection, file) {
  const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
  if (sql.trim()) {
    await connection.query(sql);
  }
}

async function latest(connection) {
  await ensureMigrationTable(connection);
  const applied = await appliedMigrations(connection);
  const files = await migrationFiles("up");

  for (const file of files) {
    const name = migrationName(file);
    if (applied.has(name)) {
      continue;
    }

    console.log(`Migrating ${name}`);
    await executeSqlFile(connection, file);
    await connection.execute("INSERT INTO schema_migrations (name) VALUES (?)", [name]);
  }
}

async function rollbackOne(connection) {
  await ensureMigrationTable(connection);
  const [rows] = await connection.query("SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1");
  const latestMigration = rows[0];

  if (!latestMigration) {
    console.log("No migrations to roll back.");
    return false;
  }

  const file = `${latestMigration.name}.down.sql`;
  console.log(`Rolling back ${latestMigration.name}`);
  await executeSqlFile(connection, file);
  await connection.execute("DELETE FROM schema_migrations WHERE name = ?", [latestMigration.name]);
  return true;
}

async function reset(connection) {
  await ensureMigrationTable(connection);
  while (await rollbackOne(connection)) {
    // Roll back until the migration table is empty.
  }
}

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    if (command === "latest" || command === "migrate") {
      await latest(connection);
    } else if (command === "rollback") {
      await rollbackOne(connection);
    } else if (command === "reset") {
      await reset(connection);
    } else {
      throw new Error(`Unknown migration command: ${command}`);
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
