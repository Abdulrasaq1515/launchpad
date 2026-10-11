import React from "react";
import { render, screen } from "@testing-library/react";
import { SafeExternalLink } from "@/components/ui/SafeExternalLink";

describe("SafeExternalLink", () => {
  it("renders a new-tab link for an https:// contract URI", () => {
    const uri = "https://example.com/token-metadata.json";
    render(<SafeExternalLink href={uri}>{uri}</SafeExternalLink>);

    const link = screen.getByRole("link", { name: uri });
    expect(link).toHaveAttribute("href", uri);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a non-clickable element for a javascript: contract URI", () => {
    const uri = "javascript:alert(1)";
    const { container } = render(
      <SafeExternalLink href={uri}>{uri}</SafeExternalLink>,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();

    const blocked = screen.getByText(uri);
    expect(blocked.tagName).toBe("SPAN");
    expect(blocked).toHaveAttribute("aria-disabled", "true");
  });

  it.each(["data:text/html,<script>alert(1)</script>", "http://example.com", ""])(
    "does not link %j",
    (uri) => {
      const { container } = render(
        <SafeExternalLink href={uri}>label</SafeExternalLink>,
      );
      expect(container.querySelector("a")).toBeNull();
    },
  );
});
