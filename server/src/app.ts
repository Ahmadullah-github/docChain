import compression from "compression";
import cors from "cors";
import express from "express";
import session from "express-session";
import createMySQLSession from "express-mysql-session";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import { env, isProduction } from "./config/env";
import { logger } from "./config/logger";
import { csrfGuard } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { adminRouter } from "./modules/admin/admin.routes";
import { assignmentRouter } from "./modules/assignments/assignment.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { commentRouter } from "./modules/collaboration/comment.routes";
import { adminDelegationRouter } from "./modules/delegations/delegation.routes";
import { documentRouter } from "./modules/documents/document.routes";
import { adminExternalDirectoryRouter } from "./modules/external-directory/external-directory.routes";
import { adminApiClientRouter } from "./modules/integrations/api-client.routes";
import { notificationRouter } from "./modules/notifications/notification.routes";
import { documentOcrRouter } from "./modules/ocr/document-ocr.routes";
import { adminPolicyRouter } from "./modules/policies/policy.routes";
import { adminStructureRouter } from "./modules/admin/structure.routes";
import { globalSearchRouter } from "./modules/search/global-search.routes";
import { savedSearchRouter } from "./modules/search/saved-search.routes";
import { adminSignatureRouter, publicSignatureUploadRouter, signatureRouter } from "./modules/signatures/signature.routes";
import { adminTemplateRouter, templateRouter } from "./modules/templates/template.routes";
import { transmissionRouter } from "./modules/transmissions/transmission.routes";
import { documentVerificationRouter, publicDocumentVerificationRouter } from "./modules/verification/document-verification.routes";
import { walkInIssuanceRouter } from "./modules/walk-in-issuance/walk-in-issuance.routes";
import { workspaceRouter } from "./modules/workspace/workspace.routes";

const MySQLStore = createMySQLSession(session);

export function createApp() {
  const app = express();

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  const sessionStore = new MySQLStore({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    createDatabaseTable: false,
    charset: "utf8mb4_bin",
    schema: {
      tableName: "sessions",
      columnNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data"
      }
    }
  });

  app.use(pinoHttp({ logger }));
  app.use(compression());
  app.use(helmet({
    contentSecurityPolicy: isProduction ? undefined : false
  }));
  app.use(cors({
    origin: env.APP_ORIGIN,
    credentials: true
  }));
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  }));
  app.use(csrfGuard);

  app.get("/api/health", (_request, response) => {
    response.json({ data: { status: "ok", service: "docchain-api" } });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/assignments", assignmentRouter);
  app.use("/api/documents", documentRouter);
  app.use("/api/walk-in-issuance", walkInIssuanceRouter);
  app.use("/api/workspace", workspaceRouter);
  app.use("/api/signatures", signatureRouter);
  app.use("/api", publicSignatureUploadRouter);
  app.use("/api/templates", templateRouter);
  app.use("/api", publicDocumentVerificationRouter);
  app.use("/api", transmissionRouter);
  app.use("/api", commentRouter);
  app.use("/api", notificationRouter);
  app.use("/api", savedSearchRouter);
  app.use("/api", documentVerificationRouter);
  app.use("/api", documentOcrRouter);
  app.use("/api/admin/structure", adminStructureRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin/search", globalSearchRouter);
  app.use("/api/admin", adminSignatureRouter);
  app.use("/api/admin/templates", adminTemplateRouter);
  app.use("/api/admin", adminExternalDirectoryRouter);
  app.use("/api/admin", adminPolicyRouter);
  app.use("/api/admin", adminApiClientRouter);
  app.use("/api/admin", adminDelegationRouter);

  const clientDistPath = path.resolve(process.cwd(), "client/dist");
  if (isProduction && fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get(/.*/, (_request, response) => {
      response.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
