import { useEffect } from "react";
import { Button } from "../ui";
import { previewHtmlForFrame } from "../../lib/previewFrame";

type FullscreenDocumentPreviewProps = {
  html?: string;
  onClose: () => void;
  pdfUrl?: string;
  subtitle?: string;
  title: string;
};

export function FullscreenDocumentPreview({ html, onClose, pdfUrl, subtitle, title }: FullscreenDocumentPreviewProps) {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-dvw flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black">{title}</p>
          {subtitle ? <p className="mt-1 truncate text-xs font-semibold text-slate-300">{subtitle}</p> : null}
        </div>
        <Button className="border-white/20 bg-white/10 text-white hover:bg-white/15" icon="x" onClick={onClose}>Close</Button>
      </header>
      {pdfUrl ? (
        <iframe className="min-h-0 flex-1 border-0 bg-slate-200" src={pdfUrl} title={`${title} fullscreen preview`} />
      ) : (
        <iframe className="min-h-0 flex-1 border-0 bg-slate-200" srcDoc={previewHtmlForFrame(html || "")} title={`${title} fullscreen preview`} />
      )}
    </div>
  );
}
