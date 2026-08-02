function keyBytes(value: string) {
  if (/^[a-f\d]{64}$/i.test(value)) return Uint8Array.from(value.match(/../g)!.map((part) => Number.parseInt(part, 16)));
  try { const binary = atob(value); if (binary.length === 32) return Uint8Array.from(binary, (character) => character.charCodeAt(0)); } catch { /* invalid key */ }
  throw new Error("INVALID_ENCRYPTION_KEY");
}

async function cryptoKey(value: string) {
  return crypto.subtle.importKey("raw", keyBytes(value), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function encryptionKey() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("INTEGRATION_ENCRYPTION_NOT_CONFIGURED");
  return value;
}

export async function encryptIntegrationSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(encryptionKey()), new TextEncoder().encode(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}

export async function decryptIntegrationSecret(value: string) {
  const [ivPart, payloadPart] = value.split(".");
  if (!ivPart || !payloadPart) throw new Error("INVALID_TOKEN_PAYLOAD");
  const iv = Uint8Array.from(atob(ivPart), (character) => character.charCodeAt(0));
  const payload = Uint8Array.from(atob(payloadPart), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await cryptoKey(encryptionKey()), payload));
}
