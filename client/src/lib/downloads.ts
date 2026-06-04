export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function openBlobInNewWindow(blob: Blob, targetWindow?: Window | null) {
  const url = URL.createObjectURL(blob);
  if (targetWindow) {
    targetWindow.location.replace(url);
  } else {
    window.open(url, "_blank", "noreferrer");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
