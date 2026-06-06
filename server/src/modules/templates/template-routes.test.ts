import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { verificationOriginForRequest, verificationUrlForToken, verificationUrlMatchesOrigin } from "./template.routes";

function requestWithHeaders(headers: Record<string, string>, protocol = "http") {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    get(name: string) {
      return normalized[name.toLowerCase()] || "";
    },
    protocol
  } as Request;
}

describe("template verification QR origin helpers", () => {
  it("prefers a configured non-localhost app origin", () => {
    const request = requestWithHeaders({ origin: "http://192.168.1.22:5173", host: "localhost:4000" });

    expect(verificationOriginForRequest(request, "https://docchain.example")).toBe("https://docchain.example");
  });

  it("uses the browser origin when the configured app origin is local", () => {
    const request = requestWithHeaders({ origin: "http://192.168.1.22:5173", host: "localhost:4000" });

    expect(verificationOriginForRequest(request, "http://localhost:5173")).toBe("http://192.168.1.22:5173");
  });

  it("falls back to the request host when origin and referer are absent", () => {
    const request = requestWithHeaders({ host: "192.168.1.22:4000" }, "http");

    expect(verificationOriginForRequest(request, "http://localhost:5173")).toBe("http://192.168.1.22:4000");
  });

  it("builds and matches verification URLs by origin", () => {
    const url = verificationUrlForToken("abc123", "http://192.168.1.22:5173");

    expect(url).toBe("http://192.168.1.22:5173/verify/abc123");
    expect(verificationUrlMatchesOrigin(url, "http://192.168.1.22:5173")).toBe(true);
    expect(verificationUrlMatchesOrigin(url, "http://localhost:5173")).toBe(false);
  });
});
