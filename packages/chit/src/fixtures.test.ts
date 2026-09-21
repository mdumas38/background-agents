import { describe, expect, it } from "vitest";

import { focusRefSchema } from "./control.js";
import { MOVE_FIXTURES, TASK_HANDOFF_FIXTURES, fixturesForMove } from "./fixtures.js";
import { MOVE_DEFINITIONS, NON_PRIMARY_CANDIDATES, PRIMARY_MOVES, isPrimaryMove } from "./moves.js";

describe("taxonomy fixtures", () => {
  it("gives every primary move at least two fixture cases", () => {
    for (const move of PRIMARY_MOVES) {
      expect(fixturesForMove(move).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps fixture moves and focus refs valid", () => {
    for (const fixture of MOVE_FIXTURES) {
      expect(isPrimaryMove(fixture.move)).toBe(true);
      expect(focusRefSchema.safeParse(fixture.focusRef).success).toBe(true);
      expect(fixture.userTurn.length).toBeGreaterThan(0);
      expect(fixture.note.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate fixture ids", () => {
    const ids = MOVE_FIXTURES.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents every move with two examples and non-empty guidance", () => {
    for (const move of PRIMARY_MOVES) {
      const definition = MOVE_DEFINITIONS[move];
      expect(definition.move).toBe(move);
      expect(definition.intent.length).toBeGreaterThan(0);
      expect(definition.useWhen.length).toBeGreaterThan(0);
      expect(definition.commonFailures.length).toBeGreaterThan(0);
      expect(definition.examples.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers explicit task handoff cases", () => {
    expect(TASK_HANDOFF_FIXTURES.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps expand and joke out of the primary-move enum", () => {
    for (const candidate of NON_PRIMARY_CANDIDATES) {
      expect(PRIMARY_MOVES as readonly string[]).not.toContain(candidate);
    }
  });
});
