import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors";
import { uuid } from "../../shared/ids";

export type StoredEncryptedSignature = {
  byteSize: number;
  checksum: string;
  metadata: Record<string, unknown>;
  mimeType: string;
  originalFilename: string;
  storagePath: string;
  storedFilename: string;
};

function encryptionKey() {
  return createHash("sha256").update(env.SIGNATURE_ENCRYPTION_KEY).digest();
}

export function parseBase64Image(value: string, fallbackMimeType?: string) {
  const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = dataUrlMatch?.[1] || fallbackMimeType || "image/png";
  const base64 = dataUrlMatch?.[2] || value;
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new AppError(422, "invalid_signature_image", "Signature image payload is not valid base64.");
  }

  return { buffer, mimeType };
}

export async function encryptAndStoreSignature(input: {
  imageBase64: string;
  mimeType?: string;
  originalFilename: string;
}) {
  const { buffer, mimeType } = parseBase64Image(input.imageBase64, input.mimeType);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedPayload = Buffer.concat([iv, tag, ciphertext]);
  const storageUuid = uuid();
  const storageDir = path.resolve(process.cwd(), env.SIGNATURE_STORAGE_DIR);
  const relativePath = path.join(env.SIGNATURE_STORAGE_DIR, `${storageUuid}.sigenc`);
  const absolutePath = path.resolve(process.cwd(), relativePath);

  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(absolutePath, encryptedPayload);

  return {
    storagePath: relativePath,
    originalFilename: input.originalFilename,
    storedFilename: `${storageUuid}.sigenc`,
    mimeType,
    byteSize: encryptedPayload.length,
    checksum,
    metadata: {
      encrypted: true,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      plaintextByteSize: buffer.length
    }
  } satisfies StoredEncryptedSignature;
}

export async function decryptSignatureFile(input: { mimeType: string; storagePath: string }) {
  const absolutePath = path.resolve(process.cwd(), input.storagePath);
  const storageRoot = path.resolve(process.cwd(), env.SIGNATURE_STORAGE_DIR);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new AppError(403, "invalid_signature_storage_path", "Signature storage path is not allowed.");
  }

  const encryptedPayload = await fs.readFile(absolutePath);
  if (encryptedPayload.length <= 28) {
    throw new AppError(422, "invalid_signature_asset", "Stored signature asset is not readable.");
  }

  const iv = encryptedPayload.subarray(0, 12);
  const tag = encryptedPayload.subarray(12, 28);
  const ciphertext = encryptedPayload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const buffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return {
    buffer,
    dataUrl: `data:${input.mimeType};base64,${buffer.toString("base64")}`,
    mimeType: input.mimeType
  };
}
