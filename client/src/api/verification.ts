import { getJson } from "./http";
import type { VerificationResult } from "./types";

export const verificationApi = {
  verify(token: string) {
    return getJson<VerificationResult>(`/api/verify/${token}`);
  }
};
