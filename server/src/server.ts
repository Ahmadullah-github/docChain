import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { closePool } from "./db/mysql";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`DocChain API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down server");
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
