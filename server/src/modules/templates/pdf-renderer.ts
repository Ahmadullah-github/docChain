import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors";

function chromeExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => {
    try {
      return require("node:fs").existsSync(candidate);
    } catch {
      return false;
    }
  });
}

let activePdfRenders = 0;
const waitingPdfRenders: Array<() => void> = [];

async function acquirePdfRenderSlot() {
  if (activePdfRenders < env.PDF_RENDER_CONCURRENCY) {
    activePdfRenders += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    waitingPdfRenders.push(resolve);
  });
}

function releasePdfRenderSlot() {
  const next = waitingPdfRenders.shift();
  if (next) {
    next();
    return;
  }

  activePdfRenders = Math.max(0, activePdfRenders - 1);
}

export async function renderHtmlToPdf(html: string) {
  await acquirePdfRenderSlot();

  const executablePath = chromeExecutablePath();
  const state: { browser?: Browser } = {};
  let timeout: NodeJS.Timeout | null = null;

  const render = async () => {
    state.browser = await puppeteer.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });
    const page = await state.browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    }));
  };

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void state.browser?.close().catch(() => undefined);
      reject(new AppError(504, "pdf_render_timeout", "PDF rendering timed out."));
    }, env.PDF_RENDER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([render(), timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    await state.browser?.close().catch(() => undefined);
    releasePdfRenderSlot();
  }
}
