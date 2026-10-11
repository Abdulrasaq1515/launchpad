import { metadataUriSchema } from "../schemas";

describe("metadataUriSchema", () => {
  it("accepts https:// and ipfs:// URIs and trims whitespace", () => {
    expect(metadataUriSchema.parse({ uri: " https://example.com/m.json " })).toEqual({
      uri: "https://example.com/m.json",
    });
    expect(
      metadataUriSchema.safeParse({ uri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" })
        .success,
    ).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.com/m.json",
    "",
  ])("rejects %j", (uri) => {
    expect(metadataUriSchema.safeParse({ uri }).success).toBe(false);
  });

  it("enforces the contract's 256-byte cap", () => {
    const prefix = "https://example.com/";
    const atLimit = prefix + "a".repeat(256 - prefix.length);
    expect(metadataUriSchema.safeParse({ uri: atLimit }).success).toBe(true);
    expect(metadataUriSchema.safeParse({ uri: atLimit + "a" }).success).toBe(false);
  });
});
