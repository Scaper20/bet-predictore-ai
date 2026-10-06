import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import webpush from "web-push";
// http_ece ships no types; it is web-push's own encryption library.
// @ts-expect-error -- untyped CommonJS module
import ece from "http_ece";
import { dailyPayload, valueAlertsPayload } from "@/lib/push/messages";
import { isAllowedPushEndpoint, parseSubscription, parseTopics } from "@/lib/push/subscription";
import { appDayBounds } from "@/lib/format";
import type { PersonalizedPick } from "@/lib/for-you";

function pick(over: Partial<PersonalizedPick> = {}): PersonalizedPick {
  return {
    id: "m1",
    href: "/football/match/m1",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    league: { code: "premier-league", name: "English Premier League", shortName: "EPL" },
    kickoff: "2026-09-05T18:00:00.000Z",
    status: "scheduled",
    market: "ou:2.5:over",
    group: "Goals",
    label: "Over 2.5",
    probability: 0.6,
    fairOdds: 1 / 0.6,
    bookPrice: 1.85,
    confidence: 70,
    matchesUsed: 120,
    dataQuality: 88,
    ...over,
  };
}

const BOTH = { picks: true, results: true };

describe("dailyPayload", () => {
  it("leads with the picks, names two, counts the rest, and adds yesterday's record", () => {
    const picks = [pick(), pick({ id: "m2", homeTeam: "Real Madrid", awayTeam: "Getafe", label: "Home Win", bookPrice: 1.45 }), pick({ id: "m3" })];
    const p = dailyPayload({ picks, record: { won: 7, lost: 3 }, topics: BOTH })!;
    expect(p.title).toBe("Today's 3 picks are ready");
    expect(p.body.split("\n")).toEqual([
      "Arsenal v Chelsea: Over 2.5 @ 1.85",
      "Real Madrid v Getafe: Home Win @ 1.45",
      "+1 more",
      "Yesterday 7 of 10 won (70%).",
    ]);
    expect(p.url).toBe("/football/predictions");
    expect(p.tag).toBe("daily");
  });

  it("quotes fair odds when there is no SportyBet price", () => {
    const p = dailyPayload({ picks: [pick({ bookPrice: null, fairOdds: 2 })], record: null, topics: BOTH })!;
    expect(p.title).toBe("Today's pick is ready");
    expect(p.body).toBe("Arsenal v Chelsea: Over 2.5 @ 2.00");
  });

  it("reports a bad day exactly like a good one", () => {
    const p = dailyPayload({ picks: [], record: { won: 2, lost: 8 }, topics: BOTH })!;
    expect(p.title).toBe("Yesterday's results");
    expect(p.body).toContain("2 of 10 BetriX picks won (20%)");
    expect(p.url).toBe("/football/track-record");
  });

  it("respects each device's topics", () => {
    const picks = [pick()];
    const record = { won: 5, lost: 5 };
    expect(dailyPayload({ picks, record, topics: { picks: true, results: false } })!.body).not.toContain("Yesterday");
    expect(dailyPayload({ picks, record, topics: { picks: false, results: true } })!.title).toBe("Yesterday's results");
    expect(dailyPayload({ picks, record, topics: { picks: false, results: false } })).toBeNull();
  });

  it("sends nothing when there is nothing to say", () => {
    expect(dailyPayload({ picks: [], record: null, topics: BOTH })).toBeNull();
    expect(dailyPayload({ picks: [], record: { won: 0, lost: 0 }, topics: BOTH })).toBeNull();
    // Picks only, and no picks today: silence, not an empty notification.
    expect(dailyPayload({ picks: [], record: { won: 4, lost: 1 }, topics: { picks: true, results: false } })).toBeNull();
  });
});

describe("valueAlertsPayload", () => {
  const alert = { homeName: "Lyon", awayName: "Nice", label: "Over 2.5", localPrice: 2.1 };

  it("names the first alert and counts the rest", () => {
    expect(valueAlertsPayload([])).toBeNull();
    expect(valueAlertsPayload([alert])).toMatchObject({
      title: "New value price",
      body: "Lyon v Nice: Over 2.5 @ 2.10 on SportyBet",
      url: "/football/value-alerts",
    });
    expect(valueAlertsPayload([alert, alert, alert])!.title).toBe("3 new value prices");
    expect(valueAlertsPayload([alert, alert, alert])!.body).toContain("+2 more");
  });
});

describe("isAllowedPushEndpoint", () => {
  it("accepts the browsers' push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGx1dWxs",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("rejects anything the crons should not be made to call", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://evil.example.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/abc",
      "https://evilgoogleapis.com/abc",
      "https://fcm.googleapis.com:8443/abc",
      "https://user:pass@fcm.googleapis.com/abc",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
      `https://fcm.googleapis.com/${"a".repeat(1100)}`,
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });
});

describe("parseSubscription / parseTopics", () => {
  const keys = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

  it("keeps a well-formed subscription and nothing else", () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys, expirationTime: null, extra: 1 };
    expect(parseSubscription(sub)).toEqual({ endpoint: sub.endpoint, keys });
  });

  it("rejects bad endpoints and malformed keys", () => {
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ endpoint: "https://evil.example.com/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "short" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, p256dh: `${"B".repeat(80)}<>` } })).toBeNull();
  });

  it("passes through only boolean topics", () => {
    expect(parseTopics({ picks: false, results: "no", valueAlerts: true, admin: true })).toEqual({ picks: false, valueAlerts: true });
    expect(parseTopics(undefined)).toEqual({});
  });
});

describe("appDayBounds", () => {
  it("is the Lagos calendar day, not the UTC one", () => {
    // 23:30 UTC on 1 Oct is already 00:30 on 2 Oct in Lagos.
    const now = new Date("2026-10-01T23:30:00Z");
    expect(appDayBounds(now).start.toISOString()).toBe("2026-10-01T23:00:00.000Z");
    const y = appDayBounds(now, -1);
    expect(y.start.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(y.end.toISOString()).toBe("2026-10-01T23:00:00.000Z");
  });
});

describe("web-push encryption", () => {
  it("produces a message the subscribed browser can decrypt", () => {
    // Stand in for a browser: its own key pair and auth secret, as
    // PushManager.subscribe() would create.
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const authSecret = randomBytes(16);
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      keys: { p256dh: browser.getPublicKey("base64url"), auth: authSecret.toString("base64url") },
    };
    const vapid = webpush.generateVAPIDKeys();
    const payload = dailyPayload({ picks: [pick()], record: { won: 3, lost: 1 }, topics: BOTH })!;

    const req = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
      TTL: 3600,
      topic: "daily",
      vapidDetails: { subject: "mailto:support@betrix.com.ng", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    });

    expect(req.endpoint).toBe(subscription.endpoint);
    expect(req.headers.TTL).toBe(3600);
    expect(req.headers.Topic).toBe("daily");
    expect(String(req.headers.Authorization)).toMatch(/^vapid t=.+, k=/);

    const plain = ece.decrypt(req.body, {
      version: "aes128gcm",
      privateKey: browser,
      authSecret: authSecret.toString("base64url"),
    });
    expect(JSON.parse(plain.toString("utf8"))).toEqual(payload);
  });
});

describe("Strong pick alerts", () => {
  const e = { matchId: "sdb:1", home: "Arsenal", away: "Leeds", label: "Under 3.5 Goals", probability: 0.757, kickoff: "2026-10-10T11:30:00Z" };

  it("announces a kickoff with the pick and time in WAT", async () => {
    const { strongKickoffPayload } = await import("./messages");
    const p = strongKickoffPayload(e);
    expect(p.body).toContain("Arsenal v Leeds at 12:30");
    expect(p.body).toContain("Under 3.5 Goals");
    expect(p.tag).toBe("kickoff-sdb:1");
  });

  it("reports losses as well as wins, and nothing for a push", async () => {
    const { strongResultPayload } = await import("./messages");
    expect(strongResultPayload({ ...e, result: "win", score: { home: 1, away: 0 } })?.title).toContain("won");
    expect(strongResultPayload({ ...e, result: "lose", score: { home: 3, away: 2 } })?.body).toContain("Arsenal 3–2 Leeds");
    expect(strongResultPayload({ ...e, result: "push" })).toBeNull();
  });
});

describe("paid devices", () => {
  it("counts running passes and paid-through subscriptions only", async () => {
    const { paidUserIds } = await import("./plan");
    const now = new Date("2026-10-07T12:00:00Z");
    const ids = paidUserIds([
      { user_id: "pro", tier: "pro", status: "active", current_period_end: "2026-11-01T00:00:00Z", pass_expires_at: null },
      { user_id: "lapsed", tier: "pro", status: "cancelled", current_period_end: "2026-10-01T00:00:00Z", pass_expires_at: null },
      { user_id: "pass", tier: "pass", status: "active", current_period_end: null, pass_expires_at: "2026-10-08T00:00:00Z" },
      { user_id: "oldpass", tier: "pass", status: "active", current_period_end: null, pass_expires_at: "2026-10-01T00:00:00Z" },
    ], now);
    expect([...ids].sort()).toEqual(["pass", "pro"]);
  });
});
