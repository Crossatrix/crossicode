// Binary file support for GitHub sync.
// Binary files are stored in the editor's string-keyed file map using a sentinel
// prefix followed by raw base64. The leading SOH (\u0001) byte makes accidental
// collisions with real source code essentially impossible.

export const BIN_MARKER = "\u0001GHBIN1:";

const BINARY_EXT = /\.(png|jpg|jpeg|gif|webp|bmp|ico|tiff|avif|heic|heif|pdf|zip|tar|gz|tgz|bz2|xz|7z|rar|mp3|mp4|m4a|mov|avi|mkv|webm|wav|ogg|flac|woff|woff2|ttf|otf|eot|class|jar|war|exe|dll|so|dylib|wasm|bin|dat|psd|ai|sketch|fig|key|numbers|pages|db|sqlite|node)$/i;

export function isBinaryPath(path: string): boolean {
  return BINARY_EXT.test(path);
}

export function isBinaryEncoded(content: string | undefined | null): boolean {
  return typeof content === "string" && content.startsWith(BIN_MARKER);
}

export function encodeBinary(base64: string): string {
  return BIN_MARKER + base64.replace(/\s/g, "");
}

export function decodeBinaryBase64(content: string): string {
  if (!isBinaryEncoded(content)) return "";
  return content.slice(BIN_MARKER.length);
}

export function binaryByteLength(content: string): number {
  if (!isBinaryEncoded(content)) return 0;
  const b64 = decodeBinaryBase64(content);
  // Base64: 4 chars -> 3 bytes, minus padding
  const padding = (b64.match(/=+$/)?.[0].length ?? 0);
  return Math.max(0, Math.floor(b64.length * 3 / 4) - padding);
}

// Decide whether a path/content pair should be treated as binary for sync.
// We treat it as binary if either the extension is binary or the existing
// editor content is already a binary-encoded blob.
export function shouldTreatAsBinary(path: string, content?: string): boolean {
  if (isBinaryEncoded(content)) return true;
  return isBinaryPath(path);
}
