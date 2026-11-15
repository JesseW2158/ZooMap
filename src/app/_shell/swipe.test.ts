import { describe, expect, it } from "vitest";
import { lockAxis, resist, shouldCommit } from "./swipe";

describe("tab swipe", () => {
  it("waits for enough movement, then picks the clearer axis", () => {
    expect(lockAxis(4, 3)).toBeNull();
    expect(lockAxis(-30, 5)).toBe("x");
    expect(lockAxis(12, 40)).toBe("y");
    // a diagonal counts as a scroll, so the page still scrolls when the thumb drifts
    expect(lockAxis(20, 18)).toBe("y");
  });

  it("goes to the next tab after a third of the screen or a quick flick", () => {
    const base = { width: 390, hasNeighbor: true };
    expect(shouldCommit({ ...base, dx: -140, ms: 600 })).toBe(true);
    expect(shouldCommit({ ...base, dx: 60, ms: 90 })).toBe(true); // flick
    expect(shouldCommit({ ...base, dx: 60, ms: 600 })).toBe(false); // slow and short
    expect(shouldCommit({ ...base, dx: 30, ms: 20 })).toBe(false); // too short to be meant
  });

  it("never leaves the first or last tab, and resists past it", () => {
    expect(shouldCommit({ dx: -300, ms: 100, width: 390, hasNeighbor: false })).toBe(false);
    expect(resist(90, false)).toBe(30);
    expect(resist(90, true)).toBe(90);
  });
});
