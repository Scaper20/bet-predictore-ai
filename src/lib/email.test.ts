import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: resendSend }; } }));
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

describe("sendEmail provider order", () => {
  const msg = { to: "a@b.co", subject: "Receipt", html: "<p>Hi</p>" };

  function setup(env: { sendbyte?: string; resend?: string }) {
    vi.stubEnv("SENDBYTE_API_KEY", env.sendbyte ?? "");
    vi.stubEnv("RESEND_API_KEY", env.resend ?? "");
    resendSend.mockReset().mockResolvedValue({ data: { id: "re_1" }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  }
  function sendbyteAnswers(status: number, body: unknown) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends through Sendbyte first, with text, idempotency key and no tracking", async () => {
    setup({ sendbyte: "sk_live_x", resend: "re_x" });
    const fetch = sendbyteAnswers(201, { id: "em_1", status: "queued" });
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ ...msg, idempotencyKey: "receipt:paystack:ref1" });
    expect(res).toEqual({ ok: true, provider: "sendbyte", id: "em_1" });
    expect(resendSend).not.toHaveBeenCalled();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.sendbyte.africa/v1/emails");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_x");
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ to: "a@b.co", subject: "Receipt", text: "Hi", idempotency_key: "receipt:paystack:ref1", tracking: { opens: false, clicks: false } });
  });

  it("falls back to Resend when Sendbyte is down, out of quota or rejects the domain", async () => {
    for (const [status, code] of [[500, "internal_error"], [402, "quota_exceeded"], [403, "domain_not_verified"], [429, "rate_limit_exceeded"]] as const) {
      setup({ sendbyte: "sk_live_x", resend: "re_x" });
      sendbyteAnswers(status, { error: { code, message: "no" } });
      const { sendEmail } = await import("./email");
      expect(await sendEmail(msg)).toEqual({ ok: true, provider: "resend", id: "re_1" });
      vi.restoreAllMocks();
    }
  });

  it("falls back to Resend when Sendbyte can't be reached", async () => {
    setup({ sendbyte: "sk_live_x", resend: "re_x" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const { sendEmail } = await import("./email");
    expect(await sendEmail(msg)).toMatchObject({ ok: true, provider: "resend" });
  });

  it("does not resend to a suppressed address", async () => {
    setup({ sendbyte: "sk_live_x", resend: "re_x" });
    sendbyteAnswers(422, { error: { code: "suppressed_recipient", message: "bounced" } });
    const { sendEmail } = await import("./email");
    expect(await sendEmail(msg)).toEqual({ ok: false, reason: "suppressed_recipient" });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("uses Resend alone when Sendbyte has no key, and never rejects when both fail", async () => {
    setup({ resend: "re_x" });
    const fetch = vi.spyOn(globalThis, "fetch");
    const { sendEmail } = await import("./email");
    expect(await sendEmail(msg)).toMatchObject({ ok: true, provider: "resend" });
    expect(fetch).not.toHaveBeenCalled();
    resendSend.mockResolvedValue({ data: null, error: { name: "application_error", message: "down", statusCode: 500 } });
    expect(await sendEmail(msg)).toMatchObject({ ok: false });
  });

  it("skips quietly with no provider", async () => {
    setup({});
    const { sendEmail, canSendEmail } = await import("./email");
    expect(canSendEmail()).toBe(false);
    expect(await sendEmail(msg)).toEqual({ ok: false, reason: "no-provider" });
  });
});
