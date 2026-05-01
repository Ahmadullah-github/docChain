declare module "express-mysql-session" {
  import session from "express-session";

  type MySQLSessionStore = new (options: Record<string, unknown>) => session.Store;

  export default function createMySQLSession(expressSession: typeof session): MySQLSessionStore;
}

