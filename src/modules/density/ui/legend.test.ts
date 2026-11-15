import { describe, expect, it } from "vitest";
import { LEGEND_BOTTOM } from "./Legend";

describe("legend position", () => {
  // An inline style is not rewritten by Tailwind: a `+` or `-` in calc() without spaces makes
  // the whole declaration invalid, and the legend falls to the top of the map.
  it("spaces every + inside calc()", () => {
    expect(LEGEND_BOTTOM).toContain("calc(");
    expect(LEGEND_BOTTOM).not.toMatch(/\S\+|\+\S/);
  });
});
