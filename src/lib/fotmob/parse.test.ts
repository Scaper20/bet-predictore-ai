import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normKey, parseMatch, playerUuid, toInt, type MatchBundle } from "./parse";
import expected from "./__fixtures__/python-parse.json";

/**
 * Parity with the Python parser (ingestion/betrix_ingest/sources/fotmob.py):
 * the same saved FotMob responses must give the same records, field for
 * field, so the live lane and the Python jobs write identical rows. The
 * expected side is the Python parser's own output (regenerate it with the
 * snippet in docs/fotmob-match-data.md when either parser changes).
 */

const FIXTURES = path.join(process.cwd(), "ingestion/tests/fixtures/fotmob");
const load = (name: string) => JSON.parse(gunzipSync(readFileSync(path.join(FIXTURES, `${name}.json.gz`))).toString("utf8"));

/** The TS bundle in the Python dataclasses' shape. */
function asPython(b: MatchBundle) {
  const sortById = <T extends { fotmob_id: number }>(xs: T[]) => xs.sort((a, c) => a.fotmob_id - c.fotmob_id);
  return {
    fotmob_id: b.fotmobId, finished: b.finished, started: b.started,
    kickoff: b.kickoff, home_team_id: b.homeTeamId, away_team_id: b.awayTeamId,
    details: b.details, lineups: b.lineups,
    players: sortById([...b.players.values()].map((p) => ({
      fotmob_id: p.fotmobId, name: p.name, first_name: p.firstName, last_name: p.lastName,
      country_code: p.countryCode, usual_position: p.usualPosition, fotmob_team_id: p.fotmobTeamId,
    }))),
    lineup_rows: b.lineupRows.map((r) => ({
      fotmob_player_id: r.fotmobPlayerId, side: r.side, role: r.role, shirt: r.shirt, position_id: r.positionId,
      usual_position: r.usualPosition, pitch_x: r.pitchX, pitch_y: r.pitchY, rating: r.rating, minutes: r.minutes,
      sub_in: r.subIn, sub_out: r.subOut, is_captain: r.isCaptain, age: r.age, absence_kind: r.absenceKind,
      expected_return: r.expectedReturn,
    })),
    stat_rows: b.statRows.map((s) => ({ fotmob_player_id: s.fotmobPlayerId, side: s.side, is_goalkeeper: s.isGoalkeeper, columns: s.columns, stats: s.stats })),
    shots: b.shots.map((s) => ({ id: s.id, fotmob_player_id: s.fotmobPlayerId, side: s.side, columns: s.columns })),
    events: b.events.map((e) => ({ seq: e.seq, columns: e.columns, fotmob_player_id: e.fotmobPlayerId, fotmob_related_id: e.fotmobRelatedId })),
    team_stats: b.teamStats,
    warnings: b.warnings,
  };
}

/** Python's datetime.isoformat() vs JS toISOString(): compare instants. */
function sameKickoff(a: string | null, b: string | null) {
  expect(a === null ? null : Date.parse(a)).toBe(b === null ? null : Date.parse(b));
}

/** Row order of player stats follows JSON object order, which JS sorts for numeric keys: compare as sets. */
const byPlayer = (xs: { fotmob_player_id: number }[]) => [...xs].sort((a, b) => a.fotmob_player_id - b.fotmob_player_id);

describe("FotMob parser parity with Python", () => {
  for (const name of ["match_4193569", "match_old", "match_upcoming"] as const) {
    it(`${name}: same records as the Python parser`, () => {
      const ts = asPython(parseMatch(load(name))!);
      const py = (expected as unknown as Record<string, ReturnType<typeof asPython>>)[name];
      sameKickoff(ts.kickoff, py.kickoff);
      expect(ts.details).toEqual(py.details);
      expect(ts.lineups).toEqual(py.lineups);
      expect(ts.players).toEqual(py.players);
      expect(ts.lineup_rows).toEqual(py.lineup_rows);
      expect(byPlayer(ts.stat_rows)).toEqual(byPlayer(py.stat_rows));
      expect(ts.shots).toEqual(py.shots);
      expect(ts.events).toEqual(py.events);
      expect(ts.team_stats).toEqual(py.team_stats);
      expect(ts.warnings).toEqual(py.warnings);
      expect([ts.fotmob_id, ts.finished, ts.started, ts.home_team_id, ts.away_team_id]).toEqual([py.fotmob_id, py.finished, py.started, py.home_team_id, py.away_team_id]);
    });
  }

  it("player ids are the same uuid5 as the Python writer", () => {
    for (const [id, uuid] of Object.entries((expected as unknown as { _uuids: Record<string, string> })._uuids)) {
      expect(playerUuid(Number(id))).toBe(uuid);
    }
  });

  it("helpers behave like Python's", () => {
    expect(normKey("matchstats.headers.tackles")).toBe("tackles");
    expect(normKey("accurateLongBalls")).toBe("accurate_long_balls");
    expect(normKey(null, "Expected goals (xG)")).toBe("expected_goals_x_g"); // as Python
    expect(toInt("3.7")).toBe(3);
    expect(toInt("x")).toBeNull();
    expect(parseMatch({})).toBeNull();
  });
});
