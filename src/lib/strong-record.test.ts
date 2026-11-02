import { describe, expect, it } from "vitest";
import { strongRecordLine } from "./strong-record";

describe("strongRecordLine", () => {
  it("quotes the record with its sample", () => {
    expect(strongRecordLine({ wins: 54, sample: 66 })).toBe("54 of 66 landed in the last 30 days, 82%");
  });
  it("says nothing on a small sample", () => {
    expect(strongRecordLine({ wins: 9, sample: 10 })).toBeNull();
  });
});
