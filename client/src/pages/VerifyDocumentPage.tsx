import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verificationApi } from "../api";
import type { VerificationResult } from "../api";
import { BrandLogo } from "../components/BrandLogo";
import { StatusBadge } from "../components/ui";

export function VerifyDocumentPage() {
  const { token = "" } = useParams();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verificationApi.verify(token)
      .then(setResult)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not verify document."));
  }, [token]);

  const status = result?.status || (error ? "invalid" : "checking");
  const valid = result?.status === "valid";

  return (
    <section className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-5 py-8">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-3">
          <BrandLogo alt="DocChain" className="h-12 w-12 rounded-xl" />
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[#0b5c74]">DocChain</p>
            <h1 className="text-xl font-bold text-slate-950">Document verification</h1>
          </div>
          <div className="ms-auto">
            <StatusBadge tone={valid ? "green" : status === "checking" ? "amber" : "red"}>{status}</StatusBadge>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {result ? (
          <div className="mt-6 space-y-4 text-sm text-slate-700">
            <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
              <Info label="Document Serial" value={result.documentSerial || "Not available"} />
              <Info label="Hash" value={result.documentHash?.matched ? "matched" : "not matched"} />
              <Info label="Subject" value={result.subject || "Not available"} />
              <Info label="Finalized At" value={result.finalizedAtShamsi || result.finalizedAt || "Not available"} />
            </div>

            {result.issuer ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Issuer</p>
                <p className="mt-1 font-semibold text-slate-950">{result.issuer.position}</p>
                <p className="text-slate-600">{result.issuer.unit}</p>
              </div>
            ) : null}

            {result.signedBy?.length ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Signed By</p>
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {result.signedBy.map((signer, index) => (
                    <li className="px-3 py-2" key={`${signer.name || signer.position}-${index}`}>
                      <span className="font-semibold text-slate-950">{signer.name || signer.position}</span>
                      {signer.position && signer.name ? <span className="text-slate-600"> - {signer.position}</span> : null}
                      {signer.unit ? <span className="text-slate-600"> - {signer.unit}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-600">Checking verification record...</p>
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}
