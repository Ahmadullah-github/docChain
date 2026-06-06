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

export async function renderHtmlToPngThumbnail(html: string, options: { height?: number; width?: number } = {}) {
  await acquirePdfRenderSlot();

  const executablePath = chromeExecutablePath();
  const state: { browser?: Browser } = {};
  const a4WidthPx = 210 * (96 / 25.4);
  const a4HeightPx = 297 * (96 / 25.4);
  const width = Math.max(options.width || 0, Math.ceil(a4WidthPx + 160));
  const height = Math.max(options.height || 0, Math.ceil(a4HeightPx + 120));
  let timeout: NodeJS.Timeout | null = null;

  const render = async () => {
    state.browser = await puppeteer.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });
    const page = await state.browser.newPage();
    await page.setViewport({ deviceScaleFactor: 1, height, width });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.addStyleTag({
      content: `
        html, body {
          margin: 0 !important;
          padding: 0 !important;
        }
        body > .dc-page:not(:first-of-type) {
          display: none !important;
        }
      `
    });
    await page.evaluate(async () => {
      const browserDocument = (globalThis as any).document;
      if (browserDocument?.fonts?.ready) {
        await browserDocument.fonts.ready;
      }
    });
    const pageElement = await page.$(".dc-word-page, .dc-page");
    if (!pageElement) {
      throw new AppError(500, "thumbnail_page_not_found", "Document page could not be captured for thumbnail.");
    }
    return Buffer.from(await pageElement.screenshot({ type: "png" }));
  };

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void state.browser?.close().catch(() => undefined);
      reject(new AppError(504, "thumbnail_render_timeout", "Document thumbnail rendering timed out."));
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
