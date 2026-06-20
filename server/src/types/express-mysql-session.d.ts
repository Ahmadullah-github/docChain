declare module "express-mysql-session" {
  import session from "express-session";
  import type { Pool } from "mysql2/promise";

  type MySQLSessionStore = new (options: Record<string, unknown>, connection?: Pool) => session.Store;

  export default function createMySQLSession(expressSession: typeof session): MySQLSessionStore;
}
