import { describe, it, expect } from "vitest";
import {
  memberWeight,
  memberOpacity,
  diagonalNumber,
  bearingSpan,
} from "../features/inspection/elevationLayout";
import layout from "../../../data/structures/kw51_layout.json";
import type { MetricStructure } from "../data/types";

describe("elevation line weights by member type", () => {
  it("arch and girder are heaviest, deck medium, diagonals/braces light", () => {
    expect(memberWeight("arch_A")).toBeGreaterThan(memberWeight("deck_beam"));
    expect(memberWeight("girder_C")).toBeGreaterThan(memberWeight("deck_beam"));
    expect(memberWeight("deck_beam")).toBeGreaterThan(memberWeight("diagonal_A"));
    expect(memberWeight("diagonal_C")).toBe(memberWeight("brace"));
  });

  it("light members are drawn more faintly than heavy ones", () => {
    expect(memberOpacity("arch_A")).toBeGreaterThanOrEqual(memberOpacity("deck_beam"));
    expect(memberOpacity("deck_beam")).toBeGreaterThan(memberOpacity("diagonal_A"));
  });
});

describe("diagonal numbering", () => {
  it("reads the lowest diagonal number from diagonal_ends", () => {
    expect(
      diagonalNumber({ diagonal_ends: [{ diagonal: 16 }, { diagonal: 15 }] })
    ).toBe(15);
    expect(diagonalNumber({ diagonal_ends: [{ diagonal: 1 }] })).toBe(1);
    expect(diagonalNumber({ diagonal_ends: [] })).toBeNull();
  });
});

describe("bearing span from the real layout", () => {
  const structure = layout as unknown as MetricStructure;

  it("matches the cross-checked KW51 bearing span (114.198 m)", () => {
    const span = bearingSpan(structure);
    expect(span).not.toBeNull();
    expect(span!.span).toBeCloseTo(114.198, 3);
    // Brussels end (low x) first, Leuven end (high x) last.
    expect(span!.xs[0]).toBeLessThan(span!.xs[span!.xs.length - 1]);
  });
});
