import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadGroupColumns,
  collectThreadGroups,
  type GroupableThread,
  moveThreadGroupsCursor,
  normalizeThreadGroupName,
  UNGROUPED_COLUMN_KEY,
} from "./threadGroups.logic";

function thread(overrides: Partial<GroupableThread> & { key: string }): GroupableThread {
  return {
    title: overrides.key,
    tags: [],
    projectKey: "env:project-a",
    projectTitle: "Project A",
    branch: null,
    bucket: "ready",
    pinned: false,
    activityAt: 0,
    ...overrides,
  };
}

const keys = (threads: ReadonlyArray<GroupableThread>) => threads.map((entry) => entry.key);

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

describe("buildThreadGroupColumns", () => {
  const threads = [
    thread({ key: "old", tags: ["routes"], activityAt: 1 }),
    thread({ key: "new", tags: ["routes", "admin"], activityAt: 5 }),
    thread({ key: "loose", activityAt: 3 }),
    thread({ key: "done", tags: ["archive-me"], bucket: "settled", activityAt: 9 }),
  ];

  it("gives each group a column, newest first, with ungrouped threads last", () => {
    const columns = buildThreadGroupColumns({
      threads,
      mode: "group",
      showSettled: false,
      query: "",
    });
    expect(columns.map((column) => [column.label, keys(column.threads)])).toEqual([
      ["admin", ["new"]],
      ["archive-me", []],
      ["routes", ["new", "old"]],
      ["Ungrouped", ["loose"]],
    ]);
    expect(columns.at(-1)?.key).toBe(UNGROUPED_COLUMN_KEY);
    expect(columns.at(-1)?.tag).toBeNull();
  });

  it("keeps a group's column when the search empties it", () => {
    const columns = buildThreadGroupColumns({
      threads,
      mode: "group",
      showSettled: true,
      query: "loose",
    });
    expect(columns.map((column) => [column.label, keys(column.threads)])).toEqual([
      ["admin", []],
      ["archive-me", []],
      ["routes", []],
      ["Ungrouped", ["loose"]],
    ]);
  });

  it("matches the search against group names", () => {
    const columns = buildThreadGroupColumns({
      threads,
      mode: "status",
      showSettled: true,
      query: "ADMIN",
    });
    expect(columns.flatMap((column) => keys(column.threads))).toEqual(["new"]);
  });

  it("puts pinned threads first", () => {
    const columns = buildThreadGroupColumns({
      threads: [thread({ key: "a", activityAt: 9 }), thread({ key: "b", pinned: true })],
      mode: "group",
      showSettled: false,
      query: "",
    });
    expect(keys(columns[0]?.threads ?? [])).toEqual(["b", "a"]);
  });

  it("drops the settled status column while settled threads are hidden", () => {
    const labels = (showSettled: boolean) =>
      buildThreadGroupColumns({ threads, mode: "status", showSettled, query: "" }).map(
        (column) => column.label,
      );
    expect(labels(false)).toEqual(["Needs you", "Working", "Ready", "Snoozed"]);
    expect(labels(true)).toContain("Settled");
  });

  it("groups by project", () => {
    const columns = buildThreadGroupColumns({
      threads: [
        thread({ key: "a", projectKey: "env:a", projectTitle: "A", activityAt: 1 }),
        thread({ key: "b", projectKey: "env:b", projectTitle: "B", activityAt: 2 }),
      ],
      mode: "project",
      showSettled: false,
      query: "",
    });
    expect(columns.map((column) => column.label)).toEqual(["B", "A"]);
  });
});

describe("collectThreadGroups", () => {
  it("lists each group once, ignoring case when sorting", () => {
    expect(
      collectThreadGroups([{ tags: ["beta", "Alpha"] }, { tags: ["alpha2", "beta"] }]),
    ).toEqual(["Alpha", "alpha2", "beta"]);
  });
});

describe("moveThreadGroupsCursor", () => {
  const columns = buildThreadGroupColumns({
    threads: [
      thread({ key: "a1", tags: ["a"], activityAt: 3 }),
      thread({ key: "a2", tags: ["a"], activityAt: 2 }),
      thread({ key: "a3", tags: ["a"], activityAt: 1 }),
      thread({ key: "b1", tags: ["b"] }),
    ],
    mode: "group",
    showSettled: false,
    query: "",
  });

  it("starts at the first thread of the first column", () => {
    expect(moveThreadGroupsCursor(columns, null, "down")).toEqual({
      columnKey: "group:a",
      threadKey: "a2",
    });
  });

  it("clamps the row when moving into a shorter column", () => {
    expect(
      moveThreadGroupsCursor(columns, { columnKey: "group:a", threadKey: "a3" }, "right"),
    ).toEqual({ columnKey: "group:b", threadKey: "b1" });
  });

  it("lands on an empty column with no thread selected", () => {
    expect(
      moveThreadGroupsCursor(columns, { columnKey: "group:b", threadKey: "b1" }, "right"),
    ).toEqual({ columnKey: UNGROUPED_COLUMN_KEY, threadKey: null });
  });

  it("jumps to a column by number and to the ends of a column", () => {
    expect(moveThreadGroupsCursor(columns, null, { column: 1 })).toEqual({
      columnKey: "group:b",
      threadKey: "b1",
    });
    expect(moveThreadGroupsCursor(columns, null, "bottom")).toEqual({
      columnKey: "group:a",
      threadKey: "a3",
    });
  });

  it("falls back to the first column when the remembered one is gone", () => {
    expect(
      moveThreadGroupsCursor(columns, { columnKey: "group:gone", threadKey: "x" }, "top"),
    ).toEqual({ columnKey: "group:a", threadKey: "a1" });
  });
});
