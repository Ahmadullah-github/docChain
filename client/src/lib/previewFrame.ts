const previewShellCss = `
<style id="dc-preview-shell-css">
@media screen {
  html { background: #e5e7eb; }
  body {
    min-width: 100%;
    margin: 0;
    padding: 24px;
    box-sizing: border-box;
    background: #e5e7eb !important;
    direction: ltr;
  }
  .dc-word-page,
  .dc-page {
    margin-inline: auto;
    box-shadow: 0 18px 50px rgba(15, 23, 42, .18);
  }
  html[dir="rtl"] .dc-word-page,
  html[dir="rtl"] .dc-page {
    direction: rtl;
  }
  html[dir="ltr"] .dc-word-page,
  html[dir="ltr"] .dc-page {
    direction: ltr;
  }
  .dc-page:not(:last-child) {
    margin-bottom: 24px;
  }
}
@media screen and (max-width: 1100px) {
  body { padding: 12px; }
}
@media screen and (max-width: 700px) {
  body {
    --dc-preview-scale: min(1, calc((100vw - 24px) / 794px));
    overflow-x: hidden;
  }
  .dc-word-page,
  .dc-page {
    margin-inline: 0;
    transform: scale(var(--dc-preview-scale));
    transform-origin: top left;
  }
  .dc-word-page {
    margin-bottom: calc((297mm * var(--dc-preview-scale)) - 297mm + 16px);
  }
  .dc-page:not(:last-child) {
    margin-bottom: calc((297mm * var(--dc-preview-scale)) - 297mm + 24px);
  }
}
</style>`;

export function previewHtmlForFrame(html: string) {
  if (!html) {
    return "";
  }
  if (html.includes("dc-preview-shell-css")) {
    return html;
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${previewShellCss}</head>`);
  }
  return `${previewShellCss}${html}`;
}
