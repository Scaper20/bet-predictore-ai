import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { htmlToText } = await import("./email");

describe("htmlToText", () => {
  it("keeps the words and the links, drops the markup", () => {
    const html = `<html><head><style>p{}</style></head><body><p>Hi there,</p><p>Try <strong>VIP</strong> &amp; more.</p>
      <ul><li>One</li><li>Two</li></ul><a href="https://kiqstat.app/x">Claim it</a><img src="a.png" alt="KiqStat"></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Hi there,");
    expect(text).toContain("Try VIP & more.");
    expect(text).toContain("- One");
    expect(text).toContain("Claim it (https://kiqstat.app/x)");
    expect(text).not.toContain("<");
    expect(text).not.toContain("p{}");
  });
});
