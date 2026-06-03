import QRCode from "qrcode";
import { FormEvent, useEffect, useState } from "react";
import { signatureApi } from "../../api";
import type { SignatureProfile, SignatureUploadSession } from "../../api";
import { SignatureImageEditor } from "../../components/app/SignatureImageEditor";
import { Button, PanelCard, StatusBadge } from "../../components/ui";
import { readFileAsDataUrl } from "../../lib/signatureImage";
import type { SignatureQuality } from "../../lib/signatureImage";
import { formatDateTime } from "./appPageUtils";

export function SignatureProfilePage() {
  const [profile, setProfile] = useState<SignatureProfile | null>(null);
  const [storedPreview, setStoredPreview] = useState<string | null>(null);
  const [desktopSource, setDesktopSource] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pendingQuality, setPendingQuality] = useState<SignatureQuality | null>(null);
  const [pendingFilename, setPendingFilename] = useState("signature.png");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [phonePin, setPhonePin] = useState("");
  const [phoneConfirmPin, setPhoneConfirmPin] = useState("");
  const [uploadSession, setUploadSession] = useState<SignatureUploadSession | null>(null);
  const [uploadQr, setUploadQr] = useState<string | null>(null);
  const [phoneSourcePreview, setPhoneSourcePreview] = useState<string | null>(null);
  const [phonePreview, setPhonePreview] = useState<string | null>(null);
  const [phoneQuality, setPhoneQuality] = useState<SignatureQuality | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const nextProfile = await signatureApi.getProfile().catch(() => null);
    setProfile(nextProfile);
    if (nextProfile?.activeAssetUuid) {
      const asset = await signatureApi.getProfileAsset().catch(() => null);
      setStoredPreview(asset?.data_url || null);
    } else {
      setStoredPreview(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!uploadSession || !["pending", "uploaded"].includes(uploadSession.status)) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      const next = await signatureApi.getUploadSession(uploadSession.id).catch(() => null);
      if (!next) {
        return;
      }
      setUploadSession(next);
      if (next.status === "uploaded" && !phonePreview) {
        const asset = await signatureApi.getUploadSessionAsset(next.id).catch(() => null);
        setPhoneSourcePreview(asset?.data_url || null);
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [phonePreview, uploadSession]);

  async function chooseFile(file: File | null) {
    setError(null);
    setMessage(null);
    setDesktopSource(null);
    setPendingPreview(null);
    setPendingQuality(null);
    if (!file) {
      return;
    }
    try {
      setPendingFilename(file.name || "signature.png");
      setDesktopSource(await readFileAsDataUrl(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare signature preview.");
    }
  }

  async function submitDesktop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!pendingPreview || !pendingQuality?.isUsable) {
      setError("Choose a clear signature image and fix the blocked editor warnings before saving.");
      return;
    }
    if (pin.length < 4 || pin !== confirmPin) {
      setError("PIN must be at least 4 characters and match confirmation.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await signatureApi.enrollProfile({
        original_filename: pendingFilename,
        pin,
        signature_image_base64: pendingPreview,
        mime_type: "image/png"
      });
      setProfile(result);
      setStoredPreview(pendingPreview);
      setPendingPreview(null);
      setDesktopSource(null);
      setPendingQuality(null);
      setPin("");
      setConfirmPin("");
      setMessage("Signature profile saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save signature profile.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createPhoneSession() {
    setMessage(null);
    setError(null);
    setPhonePreview(null);
    setPhoneSourcePreview(null);
    setPhoneQuality(null);
    try {
      const session = await signatureApi.createUploadSession();
      setUploadSession(session);
      const url = new URL(session.upload_url || "", window.location.origin).toString();
      setUploadQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create phone upload session.");
    }
  }

  async function confirmPhoneUpload() {
    setMessage(null);
    setError(null);
    if (!uploadSession || uploadSession.status !== "uploaded") {
      setError("Upload a signature from your phone first.");
      return;
    }
    if (!phonePreview || !phoneQuality?.isUsable) {
      setError("Fix the uploaded signature preview before confirming.");
      return;
    }
    if (phonePin.length < 4 || phonePin !== phoneConfirmPin) {
      setError("PIN must be at least 4 characters and match confirmation.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await signatureApi.confirmUpload({
        upload_session_id: uploadSession.id,
        pin: phonePin,
        signature_image_base64: phonePreview,
        mime_type: "image/png",
        original_filename: "phone-signature-edited.png"
      });
      setProfile(result);
      setStoredPreview(phonePreview);
      setPhonePin("");
      setPhoneConfirmPin("");
      setUploadSession(null);
      setUploadQr(null);
      setPhoneSourcePreview(null);
      setPhonePreview(null);
      setPhoneQuality(null);
      setMessage("Phone signature confirmed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not confirm phone upload.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-[#0b5c74]">Signing identity</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Signature profile</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Create the visual signature and signing PIN used for official approval slots.</p>
      </div>

      {message ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <PanelCard className="self-start" title="Current profile">
          {profile ? (
            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Status</span>
                <StatusBadge>{profile.status}</StatusBadge>
              </div>
              {storedPreview ? (
                <div className="rounded-lg border border-slate-200 bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] p-4">
                  <img alt="" className="mx-auto max-h-28 max-w-full object-contain" src={storedPreview} />
                </div>
              ) : null}
              <p><span className="font-semibold">File:</span> {profile.activeOriginalFilename || "Signature asset enrolled"}</p>
              <p><span className="font-semibold">Locked until:</span> {formatDateTime(profile.lockedUntil)}</p>
              <p><span className="font-semibold">Failed attempts:</span> {profile.failedPinAttempts || 0}</p>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-600">No active signature profile is enrolled yet.</p>
          )}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard title={profile ? "Update from this computer" : "Set up from this computer"}>
            <form className="space-y-4" onSubmit={submitDesktop}>
              <label className="block text-sm font-semibold text-slate-700">
                Signature image
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm"
                  onChange={(event) => void chooseFile(event.target.files?.[0] || null)}
                  type="file"
                />
              </label>

              {desktopSource ? (
                <SignatureImageEditor
                  onChange={(dataUrl, quality) => {
                    setPendingPreview(dataUrl);
                    setPendingQuality(quality);
                  }}
                  sourceDataUrl={desktopSource}
                />
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  PIN
                  <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setPin(event.target.value)} type="password" value={pin} />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Confirm PIN
                  <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setConfirmPin(event.target.value)} type="password" value={confirmPin} />
                </label>
              </div>

              <Button disabled={submitting || !pendingPreview || !pendingQuality?.isUsable} type="submit" variant="primary">{submitting ? "Saving..." : "Confirm and save"}</Button>
            </form>
          </PanelCard>

          <PanelCard
            actions={<Button onClick={() => void createPhoneSession()} variant="secondary">New QR</Button>}
            title="Upload from phone"
          >
            <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="mx-auto flex min-h-64 w-full max-w-[17rem] items-center justify-center rounded-lg border border-slate-200 bg-white p-4">
                  {uploadQr ? <img alt="" className="h-56 w-56 max-w-full" src={uploadQr} /> : <p className="text-center text-sm text-slate-500">Create a QR code to start phone upload.</p>}
                </div>
                <div className="mx-auto flex w-full max-w-[17rem] items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-700">Status</span>
                  <StatusBadge tone={uploadSession?.status === "uploaded" ? "green" : "amber"}>{uploadSession?.status || "not started"}</StatusBadge>
                </div>
              </div>
              <div className="min-w-0 space-y-4">
                {phoneSourcePreview ? (
                  <SignatureImageEditor
                    onChange={(dataUrl, quality) => {
                      setPhonePreview(dataUrl);
                      setPhoneQuality(quality);
                    }}
                    sourceDataUrl={phoneSourcePreview}
                  />
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    PIN
                    <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setPhonePin(event.target.value)} type="password" value={phonePin} />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Confirm PIN
                    <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setPhoneConfirmPin(event.target.value)} type="password" value={phoneConfirmPin} />
                  </label>
                </div>
                <Button disabled={submitting || uploadSession?.status !== "uploaded" || !phonePreview || !phoneQuality?.isUsable} onClick={() => void confirmPhoneUpload()} variant="primary">Confirm phone upload</Button>
              </div>
            </div>
          </PanelCard>
        </div>
      </div>
    </section>
  );
}
