import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptCredential, encryptCredential } from "./credentialVault.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5) output += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return output;
}

function base32Decode(input: string) {
  let bits = "";
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(secret: string) {
  return encryptCredential(secret);
}

export function decryptTotpSecret(encrypted: string) {
  return decryptCredential<string>(encrypted);
}

function hotp(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(now / 30_000);
  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + delta));
    const actual = Buffer.from(clean);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
}

export function totpUri(email: string, secret: string) {
  const issuer = encodeURIComponent("TradePilot Professional");
  const label = encodeURIComponent(`TradePilot:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
