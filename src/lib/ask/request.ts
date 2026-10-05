/**
 * Shapes shared by the Ask BetriX route and panel, plus the request
 * validation and context framing — pure, so it's unit-tested.
 */

export const ASK_FREE_DAILY = 5;
/** Fair-use ceiling for paid tiers, which the panel advertises as unlimited. */
export const ASK_PAID_DAILY = 150;

export const ASK_MAX_QUESTION = 500;
const MAX_HISTORY = 12;
const MAX_ASSISTANT_CHARS = 2500;

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AskSlipLeg {
  matchId: string;
  fixture: string;
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
  bookmakerOdds?: number;
}

export interface AskContext {
  /** The match page the user has open. */
  matchId?: string;
  matchLabel?: string;
  /** The selection builder's legs, when the user is on the slip page. */
  slip?: AskSlipLeg[];
}

/** A pick card the chat renders, with "+ Slip". Built by the show_picks tool, never by the model. */
export interface AskPickCard {
  matchId: string;
  fixture: string;
  homeName: string;
  awayName: string;
  league: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
  /** SportyBet's price, when it lists the selection. */
  price: number | null;
}

export interface AskRequest {
  turns: AskTurn[];
  context: AskContext;
}

/** Events streamed back to the panel, one JSON object per line. */
export type AskEvent =
  | { type: "text"; delta: string }
  | { type: "status"; label: string }
  | { type: "picks"; picks: AskPickCard[] }
  | { type: "done"; used: number | null; limit: number | null }
  | { type: "error"; message: string; code?: "limit" | "sign_in" | "unavailable" };

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validates the body; returns an error string for anything malformed. */
export function parseAskRequest(body: unknown): AskRequest | string {
  if (!body || typeof body !== "object") return "Invalid request.";
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.turns) || b.turns.length === 0) return "Ask a question.";

  const turns: AskTurn[] = b.turns.slice(-MAX_HISTORY).flatMap((t) => {
    const o = t as Record<string, unknown>;
    if (o?.role !== "user" && o?.role !== "assistant") return [];
    const text = clip(o.text, o.role === "user" ? ASK_MAX_QUESTION : MAX_ASSISTANT_CHARS).trim();
    return text ? [{ role: o.role, text }] : [];
  });
  // The API needs the conversation to open with the user and alternate.
  while (turns.length && turns[0].role !== "user") turns.shift();
  const merged: AskTurn[] = [];
  for (const t of turns) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === t.role) prev.text = `${prev.text}\n\n${t.text}`;
    else merged.push({ ...t });
  }
  const last = merged[merged.length - 1];
  if (!last || last.role !== "user") return "Ask a question.";
  if (last.text.length > ASK_MAX_QUESTION) return `Keep questions under ${ASK_MAX_QUESTION} characters.`;

  const c = (b.context ?? {}) as Record<string, unknown>;
  const context: AskContext = {};
  const matchId = clip(c.matchId, 64);
  if (/^[a-z]+:[\w.-]{1,60}$/i.test(matchId)) {
    context.matchId = matchId;
    context.matchLabel = clip(c.matchLabel, 120) || undefined;
  }
  if (Array.isArray(c.slip)) {
    context.slip = c.slip.slice(0, 12).flatMap((l) => {
      const o = l as Record<string, unknown>;
      const p = Number(o?.probability);
      const f = Number(o?.fairOdds);
      if (!o || !Number.isFinite(p) || !Number.isFinite(f)) return [];
      const bo = Number(o.bookmakerOdds);
      return [
        {
          matchId: clip(o.matchId, 64),
          fixture: clip(o.fixture, 120),
          market: clip(o.market, 40),
          label: clip(o.label, 80),
          probability: p,
          fairOdds: f,
          ...(Number.isFinite(bo) && bo > 1 ? { bookmakerOdds: bo } : {}),
        },
      ];
    });
    if (context.slip.length === 0) delete context.slip;
  }

  return { turns: merged, context };
}

/**
 * The framing put in front of the user's latest question: the date, the page
 * they're on and their slip. Lives in the user turn, not the system prompt,
 * so the cached system prefix never changes.
 */
export function contextPreamble(context: AskContext, now: Date): string {
  const when = now.toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  });
  const lines = [`[Context — not from the user] Now: ${when} WAT.`];
  if (context.matchId) {
    lines.push(
      `The user has the match page open for ${context.matchLabel ?? "a fixture"} (match_id ${context.matchId}). "This game" means this fixture.`,
    );
  }
  if (context.slip?.length) {
    lines.push("The user's current slip:");
    for (const l of context.slip) {
      const price = l.bookmakerOdds ? `, their price ${l.bookmakerOdds.toFixed(2)}` : "";
      lines.push(
        `- ${l.fixture}: ${l.label} (match_id ${l.matchId}, market ${l.market}) — model ${(l.probability * 100).toFixed(1)}%, break-even ${l.fairOdds.toFixed(2)}${price}`,
      );
    }
  }
  return lines.join("\n");
}
