import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  const configured = process.env.APP_DATA_ENCRYPTION_KEY?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_DATA_ENCRYPTION_KEY is required in production.");
    }
    return createHash("sha256").update("tradepilot-development-encryption-key").digest();
  }

  // Accept a 64-char hex key, base64 key, or derive a fixed 256-bit key from a long secret.
  if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
  try {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to SHA-256 derivation.
  }
  return createHash("sha256").update(configured).digest();
}

export type EncryptedCredentialEnvelope = {
  v: 1;
  keyVersion: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export function encryptCredential(value: unknown, keyVersion = process.env.APP_DATA_ENCRYPTION_KEY_VERSION ?? "v1") {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EncryptedCredentialEnvelope = {
    v: 1,
    keyVersion,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
  return JSON.stringify(envelope);
}

export function decryptCredential<T = Record<string, unknown>>(encrypted: string): T {
  const envelope = JSON.parse(encrypted) as EncryptedCredentialEnvelope;
  if (envelope.v !== 1) throw new Error("Unsupported encrypted credential envelope version.");
  const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
