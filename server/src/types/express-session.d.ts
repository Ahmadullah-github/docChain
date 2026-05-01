import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    activeAssignmentId?: number;
    csrfToken?: string;
  }
}

