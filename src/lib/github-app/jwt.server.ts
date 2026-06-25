// Sign a GitHub App JWT (RS256) using Web Crypto. Worker-compatible.

function b64urlEncode(bytes: Uint8Array | string): string {
  let bin = "";
  if (typeof bytes === "string") {
    bin = unescape(encodeURIComponent(bytes));
  } else {
    for (const b of bytes) bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const stripped = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(stripped);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedKey: { pem: string; key: CryptoKey } | null = null;

async function getKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.pem === pem) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  cachedKey = { pem, key };
  return key;
}

export async function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 30, exp: now + 9 * 60, iss: appId };
  const signingInput = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const key = await getKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}
