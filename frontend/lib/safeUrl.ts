/**
 * Allowlisting for URLs that come from untrusted sources (on-chain
 * `contract_uri`, user-supplied token metadata such as logo / website /
 * twitter / discord) and end up in an `href` or `src`.
 *
 * `rel="noopener noreferrer"` only controls the opened window — it does not
 * stop a `javascript:` or `data:` URL from executing in this origin when
 * clicked, so every such URL must go through `safeExternalUrl()` first.
 */

/** Schemes an external link may use. Mirrors the token contract's check. */
export const SAFE_URL_SCHEMES = ["https", "ipfs"] as const;

/**
 * Longest contract URI the token contract accepts, in bytes
 * (`MAX_CONTRACT_URI_LEN` in `contracts/token/src/lib.rs`).
 */
export const MAX_CONTRACT_URI_LENGTH = 256;

const SCHEME_PREFIX = new RegExp(`^(${SAFE_URL_SCHEMES.join("|")})://`, "i");

function hasSpaceOrControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Return a normalised URL that is safe to use as an external `href`, or
 * `null` if `raw` is not an absolute `https://` or `ipfs://` URL.
 *
 * The rule matches the token contract's `contract_uri` validation: an
 * explicit `scheme://` prefix (case-insensitive), at least one character
 * after it, and no whitespace or control characters anywhere.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!SCHEME_PREFIX.test(value) || hasSpaceOrControlChars(value)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // Nothing after "scheme://" (e.g. a bare "ipfs://", which URL accepts).
  if (value.length <= url.protocol.length + 2) return null;

  return url.href;
}
