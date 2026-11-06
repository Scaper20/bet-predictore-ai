import { describe, expect, it } from "vitest";
import { indexNowPayload, pushableUrls } from "./indexnow";

describe("indexnow", () => {
  it("leaves out club and player pages and decodes sitemap ampersands", () => {
    const urls = pushableUrls([
      "https://x.test/football/match/1",
      "https://x.test/football/team/9-arsenal",
      "https://x.test/football/player/4-saka",
      "https://x.test/football/fixtures?league=npfl&amp;days=14",
      "https://x.test/football/match/1",
    ]);
    expect(urls).toEqual(["https://x.test/football/match/1", "https://x.test/football/fixtures?league=npfl&days=14"]);
  });
  it("points the engines at the key file", () => {
    expect(indexNowPayload("x.test", "k", "https://x.test", ["https://x.test/a"])).toEqual({
      host: "x.test", key: "k", keyLocation: "https://x.test/indexnow.txt", urlList: ["https://x.test/a"],
    });
  });
});
