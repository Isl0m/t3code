import { describe, expect, it } from "vite-plus/test";

import {
  collectThreadGroups,
  matchesSidebarGroupFilter,
  normalizeThreadGroupName,
  normalizeThreadGroups,
  resolveSidebarGroupFilter,
  sidebarGroupFilterOptions,
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
