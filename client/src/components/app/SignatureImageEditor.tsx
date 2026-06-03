import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "../../lib/classNames";
import { autoCropForSignature, defaultSignatureEditSettings, processSignatureImage } from "../../lib/signatureImage";
import type { SignatureEditSettings, SignatureQuality } from "../../lib/signatureImage";
import { Button } from "../ui";

type SignatureImageEditorProps = {
  className?: string;
  onChange: (dataUrl: string | null, quality: SignatureQuality | null) => void;
  sourceDataUrl: string;
};

const sliderClassName = "mt-1 w-full accent-[#061d49]";

export function SignatureImageEditor({ className = "", onChange, sourceDataUrl }: SignatureImageEditorProps) {
  const [settings, setSettings] = useState<SignatureEditSettings>(defaultSignatureEditSettings);
  const [processed, setProcessed] = useState<string | null>(null);
  const [quality, setQuality] = useState<SignatureQuality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setSettings(defaultSignatureEditSettings);
    setProcessed(null);
    setQuality(null);
    setError(null);
  }, [sourceDataUrl]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    const timer = window.setTimeout(() => {
      processSignatureImage(sourceDataUrl, settings)
        .then((result) => {
          if (!active) {
            return;
          }
          setProcessed(result.dataUrl);
          setQuality(result.quality);
          setError(null);
          onChangeRef.current(result.quality.isUsable ? result.dataUrl : null, result.quality);
        })
        .catch((caught) => {
          if (!active) {
            return;
          }
          setProcessed(null);
          setQuality(null);
          setError(caught instanceof Error ? caught.message : "Could not process signature image.");
          onChangeRef.current(null, null);
        })
        .finally(() => {
          if (active) {
            setBusy(false);
          }
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [settings, sourceDataUrl]);

  const status = useMemo(() => {
    if (busy) {
      return { className: "bg-amber-50 text-amber-700 ring-amber-200", label: "Processing" };
    }
    if (quality?.isUsable) {
      return { className: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Usable" };
    }
    return { className: "bg-red-50 text-red-700 ring-red-200", label: "Blocked" };
  }, [busy, quality]);

  function update<K extends keyof SignatureEditSettings>(key: K, value: SignatureEditSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateCrop(key: keyof SignatureEditSettings["crop"], value: number) {
    setSettings((current) => ({
      ...current,
      crop: {
        ...current.crop,
        [key]: value
      }
    }));
  }

  async function autoCrop() {
    try {
      const crop = await autoCropForSignature(sourceDataUrl, settings.threshold);
      setSettings((current) => ({ ...current, crop }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not auto-crop this image.");
    }
  }

  return (
    <div className={cx("signature-editor", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950">Signature editor</p>
          <p className="text-xs text-slate-500">Crop tightly and remove paper before saving.</p>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${status.className}`}>{status.label}</span>
      </div>

      <div className="signature-editor__body">
        <div className="signature-editor__previews">
          <Preview title="Original" src={sourceDataUrl} />
          <Preview title="Processed" src={processed} />
        </div>

        <div className="signature-editor__controls">
          <div className="signature-editor__actions">
            <Button className="px-3 py-1.5 text-xs" onClick={() => void autoCrop()}>Auto crop</Button>
            <Button className="px-3 py-1.5 text-xs" onClick={() => setSettings(defaultSignatureEditSettings)}>Reset</Button>
            <Button className="px-3 py-1.5 text-xs" onClick={() => update("rotate", ((settings.rotate + 270) % 360) as SignatureEditSettings["rotate"])}>Rotate left</Button>
            <Button className="px-3 py-1.5 text-xs" onClick={() => update("rotate", ((settings.rotate + 90) % 360) as SignatureEditSettings["rotate"])}>Rotate right</Button>
          </div>

          <Slider label="Background removal" max={230} min={120} onChange={(value) => update("threshold", value)} step={1} value={settings.threshold} />
          <Slider label="Ink contrast" max={2.4} min={0.8} onChange={(value) => update("contrast", value)} step={0.05} value={settings.contrast} />
          <Slider label="Zoom" max={1.8} min={0.7} onChange={(value) => update("zoom", value)} step={0.05} value={settings.zoom} />

          <div className="signature-editor__crop-controls">
            <Slider label="Crop top" max={0.65} min={0} onChange={(value) => updateCrop("top", value)} step={0.01} value={settings.crop.top} />
            <Slider label="Crop bottom" max={0.65} min={0} onChange={(value) => updateCrop("bottom", value)} step={0.01} value={settings.crop.bottom} />
            <Slider label="Crop left" max={0.65} min={0} onChange={(value) => updateCrop("left", value)} step={0.01} value={settings.crop.left} />
            <Slider label="Crop right" max={0.65} min={0} onChange={(value) => updateCrop("right", value)} step={0.01} value={settings.crop.right} />
          </div>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {quality?.errors.length ? (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {quality.errors.map((item) => <p key={item}>{item}</p>)}
        </div>
      ) : null}
      {quality?.warnings.length ? (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {quality.warnings.map((item) => <p key={item}>{item}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function Preview({ src, title }: { src: string | null; title: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="signature-editor__preview-frame">
        {src ? <img alt="" className="signature-editor__preview-image" src={src} /> : <span className="text-xs text-slate-500">No preview</span>}
      </div>
    </div>
  );
}

function Slider({ label, max, min, onChange, step, value }: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono text-[11px] text-slate-500">{step < 1 ? Math.round(value * 100) : Math.round(value)}</span>
      </span>
      <input className={sliderClassName} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
    </label>
  );
}
