import { FormEvent, useState } from "react";
import { useParams } from "react-router-dom";
import { signatureApi } from "../api";
import { BrandLogo } from "../components/BrandLogo";
import { SignatureImageEditor } from "../components/app/SignatureImageEditor";
import { Button } from "../components/ui";
import { readFileAsDataUrl } from "../lib/signatureImage";
import type { SignatureQuality } from "../lib/signatureImage";

export function SignatureUploadPage() {
  const { token = "" } = useParams();
  const [source, setSource] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<SignatureQuality | null>(null);
  const [filename, setFilename] = useState("phone-signature.png");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseFile(file: File | null) {
    setError(null);
    setComplete(false);
    setSource(null);
    setPreview(null);
    setQuality(null);
    if (!file) {
      return;
    }
    try {
      setFilename(file.name || "phone-signature.png");
      setSource(await readFileAsDataUrl(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare signature image.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !quality?.isUsable) {
      setError("Choose a clear signature image and fix the blocked editor warnings before upload.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signatureApi.uploadPhoneSignature(token, {
        original_filename: filename,
        signature_image_base64: preview,
        mime_type: "image/png"
      });
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload signature.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-5 py-8">
      <form className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <BrandLogo alt="DocChain" className="h-12 w-12 rounded-xl" />
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#0b5c74]">DocChain</p>
            <h1 className="text-xl font-bold text-slate-950">Signature upload</h1>
          </div>
        </div>

        {complete ? (
          <div className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Signature uploaded. Return to your computer to confirm it.
          </div>
        ) : null}
        {error ? <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <label className="mt-6 block text-sm font-semibold text-slate-700">
          Signature photo
          <input
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm"
            onChange={(event) => void chooseFile(event.target.files?.[0] || null)}
            type="file"
          />
        </label>

        {source ? (
          <div className="mt-4">
            <SignatureImageEditor
              onChange={(dataUrl, nextQuality) => {
                setPreview(dataUrl);
                setQuality(nextQuality);
              }}
              sourceDataUrl={source}
            />
          </div>
        ) : null}

        <Button className="mt-5 w-full" disabled={submitting || !preview || !quality?.isUsable || complete} type="submit" variant="primary">
          {submitting ? "Uploading..." : "Upload signature"}
        </Button>
      </form>
    </section>
  );
}
