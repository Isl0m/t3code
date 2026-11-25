import { describe, expect, it } from "vite-plus/test";

import {
  adjacentSidebarGroupFilter,
  collectThreadGroups,
  matchesSidebarGroupFilter,
  normalizeThreadGroupName,
  normalizeThreadGroups,
  resolveSidebarGroupFilter,
  sidebarGroupFilterOptions,
  threadGroupMoveSteps,
  UNGROUPED_FILTER,
} from "./threadGroups.logic";

describe("normalizeThreadGroupName", () => {
  it.each([
    ["  Courier   app ", "Courier app"],
    ["", null],
    ["   ", null],
    ["a".repeat(65), null],
    ["bad\u0007name", null],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeThreadGroupName(raw)).toBe(expected);
  });
});

describe("normalizeThreadGroups", () => {
  it("keeps configured order, dropping blanks and repeats", () => {
    expect(normalizeThreadGroups([" Bugs ", "", "Admin", "Bugs", "a".repeat(65)])).toEqual([
      "Bugs",
      "Admin",
    ]);
  });
});

describe("collectThreadGroups", () => {
  it("lists each group once, ignoring case when sorting", () => {
    expect(
      collectThreadGroups([{ tags: ["beta", "Alpha"] }, { tags: ["alpha2", "beta"] }]),
    ).toEqual(["Alpha", "alpha2", "beta"]);
  });
});

describe("sidebarGroupFilterOptions", () => {
  it("keeps configured order, then other groups active threads use", () => {
    expect(
      sidebarGroupFilterOptions({
        configuredGroups: ["Fix", "Feature"],
        activeThreadTags: [["Fix"], ["Ad hoc"], ["Feature"]],
      }),
    ).toEqual({ groups: ["Fix", "Feature", "Ad hoc"], hasUngrouped: false });
  });

  it("offers Ungrouped only while an active thread has no group", () => {
    expect(
      sidebarGroupFilterOptions({ configuredGroups: ["Fix"], activeThreadTags: [["Fix"], []] })
        .hasUngrouped,
    ).toBe(true);
  });
});

describe("resolveSidebarGroupFilter", () => {
  const options = { groups: ["Fix", "Check"], hasUngrouped: false };

  it.each([
    [null, null],
    ["Fix", "Fix"],
    ["Courier app", null],
    [UNGROUPED_FILTER, null],
  ])("resolves %j to %j", (saved, expected) => {
    expect(resolveSidebarGroupFilter(saved, options)).toBe(expected);
  });
});

describe("threadGroupMoveSteps", () => {
  it("drops every other group before adding the new one", () => {
    expect(threadGroupMoveSteps(["Fix", "Check"], "Feature")).toEqual([
      { tag: "Fix", tagged: false },
      { tag: "Check", tagged: false },
      { tag: "Feature", tagged: true },
    ]);
  });

  it.each([
    [["Fix"], "Fix", []],
    [["Fix", "Check"], "Fix", [{ tag: "Check", tagged: false }]],
    [["Fix"], null, [{ tag: "Fix", tagged: false }]],
    [[], "Fix", [{ tag: "Fix", tagged: true }]],
  ] as const)("moves %j to %j with %j", (tags, target, expected) => {
    expect(threadGroupMoveSteps(tags, target)).toEqual(expected);
  });
});

describe("adjacentSidebarGroupFilter", () => {
  const values = [null, "Feature", "Fix", UNGROUPED_FILTER];

  it.each([
    [null, "next", "Feature"],
    ["Fix", "next", UNGROUPED_FILTER],
    [UNGROUPED_FILTER, "next", null],
    [null, "previous", UNGROUPED_FILTER],
    ["Feature", "previous", null],
    ["Gone", "next", "Feature"],
  ] as const)("from %j going %s lands on %j", (selected, direction, expected) => {
    expect(adjacentSidebarGroupFilter(values, selected, direction)).toBe(expected);
  });
});

describe("matchesSidebarGroupFilter", () => {
  const groups = ["Fix", "Check"];

  it.each([
    [["Fix"], null, true],
    [["Fix"], "Fix", true],
    [["Check"], "Fix", false],
    [[], UNGROUPED_FILTER, true],
    [["hidden-tag"], UNGROUPED_FILTER, true],
    [["Fix"], UNGROUPED_FILTER, false],
  ] as const)("tags %j with filter %j match: %j", (tags, filter, expected) => {
    expect(matchesSidebarGroupFilter(tags, filter, groups)).toBe(expected);
  });
});
