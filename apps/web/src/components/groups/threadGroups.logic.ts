import { foldSearchQuery } from "@t3tools/shared/paletteSearch";

import type { SidebarThreadSummary } from "../../types";

export type ThreadGroupsMode = "group" | "status" | "project";

export type ThreadStatusBucket = "attention" | "working" | "ready" | "snoozed" | "settled";

export interface GroupableThread {
  readonly key: string;
  readonly title: string;
  readonly tags: ReadonlyArray<string>;
  readonly projectKey: string;
  readonly projectTitle: string;
  readonly branch: string | null;
  readonly bucket: ThreadStatusBucket;
  readonly pinned: boolean;
  readonly activityAt: number;
}

export interface ThreadGroupColumn<T extends GroupableThread> {
  readonly key: string;
  readonly label: string;
  /** The group a thread joins when filed here; null for columns that are not a group. */
  readonly tag: string | null;
  readonly threads: ReadonlyArray<T>;
}

export interface ThreadGroupsCursor {
  readonly columnKey: string;
  readonly threadKey: string | null;
}

export type ThreadGroupsMove =
  | "up"
  | "down"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | { readonly column: number };

export const THREAD_GROUPS_MODES: ReadonlyArray<{
  readonly value: ThreadGroupsMode;
  readonly label: string;
}> = [
  { value: "group", label: "Groups" },
  { value: "status", label: "Status" },
  { value: "project", label: "Projects" },
];

export const UNGROUPED_COLUMN_KEY = "ungrouped";
const MAX_GROUP_NAME_LENGTH = 64;

const STATUS_COLUMNS: ReadonlyArray<{
  readonly bucket: ThreadStatusBucket;
  readonly label: string;
}> = [
  { bucket: "attention", label: "Needs you" },
  { bucket: "working", label: "Working" },
  { bucket: "ready", label: "Ready" },
  { bucket: "snoozed", label: "Snoozed" },
  { bucket: "settled", label: "Settled" },
];

/** Mirrors the server's ThreadTag rules so a name the picker offers is never rejected. */
export function normalizeThreadGroupName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > MAX_GROUP_NAME_LENGTH) return null;
  return /[\p{Cc}]/u.test(name) ? null : name;
}

/** A project's configured group names, cleaned and deduplicated in their configured order. */
export function normalizeThreadGroups(raw: ReadonlyArray<string>): ReadonlyArray<string> {
  const groups: string[] = [];
  for (const entry of raw) {
    const name = normalizeThreadGroupName(entry);
    if (name !== null && !groups.includes(name)) groups.push(name);
  }
  return groups;
}

export function threadGroupTags(thread: Pick<SidebarThreadSummary, "source">) {
  return (thread.source.tags ?? []).filter((tag) => normalizeThreadGroupName(tag) === tag);
}

export function collectThreadGroups(threads: ReadonlyArray<Pick<GroupableThread, "tags">>) {
  const groups = new Set<string>();
  for (const thread of threads) {
    for (const tag of thread.tags) groups.add(tag);
  }
  return [...groups].toSorted((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function matchesQuery(thread: GroupableThread, foldedTokens: ReadonlyArray<string>): boolean {
  if (foldedTokens.length === 0) return true;
  const haystack = foldSearchQuery(
    [thread.title, thread.projectTitle, thread.branch ?? "", ...thread.tags].join(" "),
  );
  return foldedTokens.every((token) => haystack.includes(token));
}

function byPinThenActivity(left: GroupableThread, right: GroupableThread): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  return right.activityAt - left.activityAt || left.key.localeCompare(right.key);
}

export function buildThreadGroupColumns<T extends GroupableThread>(input: {
  readonly threads: ReadonlyArray<T>;
  readonly mode: ThreadGroupsMode;
  readonly showSettled: boolean;
  readonly query: string;
  /** Groups set up in project settings; they get a column before any thread joins them. */
  readonly configuredGroups?: ReadonlyArray<string>;
}): ReadonlyArray<ThreadGroupColumn<T>> {
  const foldedTokens = foldSearchQuery(input.query).split(" ").filter(Boolean);
  const shown = input.threads
    .filter((thread) => input.showSettled || thread.bucket !== "settled")
    .filter((thread) => matchesQuery(thread, foldedTokens))
    .toSorted(byPinThenActivity);

  if (input.mode === "status") {
    return STATUS_COLUMNS.filter((column) => input.showSettled || column.bucket !== "settled").map(
      (column) => ({
        key: `status:${column.bucket}`,
        label: column.label,
        tag: null,
        threads: shown.filter((thread) => thread.bucket === column.bucket),
      }),
    );
  }

  if (input.mode === "project") {
    const columns = new Map<string, { label: string; threads: T[] }>();
    for (const thread of shown) {
      const column = columns.get(thread.projectKey) ?? { label: thread.projectTitle, threads: [] };
      column.threads.push(thread);
      columns.set(thread.projectKey, column);
    }
    return [...columns].map(([projectKey, column]) => ({
      key: `project:${projectKey}`,
      label: column.label,
      tag: null,
      threads: column.threads,
    }));
  }

  // Every known group keeps its column while a filter empties it, so it stays a place to file into.
  const groups = collectThreadGroups([...input.threads, { tags: input.configuredGroups ?? [] }]);
  return [
    ...groups.map((group) => ({
      key: `group:${group}`,
      label: group,
      tag: group,
      threads: shown.filter((thread) => thread.tags.includes(group)),
    })),
    {
      key: UNGROUPED_COLUMN_KEY,
      label: "Ungrouped",
      tag: null,
      threads: shown.filter((thread) => thread.tags.length === 0),
    },
  ];
}

export function resolveThreadGroupsCursor<T extends GroupableThread>(
  columns: ReadonlyArray<ThreadGroupColumn<T>>,
  cursor: ThreadGroupsCursor | null,
): { readonly column: number; readonly row: number } | null {
  if (columns.length === 0) return null;
  const column = Math.max(
    0,
    cursor === null ? 0 : columns.findIndex((candidate) => candidate.key === cursor.columnKey),
  );
  const threads = columns[column]?.threads ?? [];
  if (threads.length === 0) return { column, row: -1 };
  const row =
    cursor?.threadKey == null ? 0 : threads.findIndex((thread) => thread.key === cursor.threadKey);
  return { column, row: Math.max(0, row) };
}

export function moveThreadGroupsCursor<T extends GroupableThread>(
  columns: ReadonlyArray<ThreadGroupColumn<T>>,
  cursor: ThreadGroupsCursor | null,
  move: ThreadGroupsMove,
): ThreadGroupsCursor | null {
  const at = resolveThreadGroupsCursor(columns, cursor);
  if (at === null) return null;
  const clampRow = (column: number, row: number) => {
    const threads = columns[column]?.threads ?? [];
    return threads.length === 0 ? -1 : Math.min(Math.max(row, 0), threads.length - 1);
  };
  let column = at.column;
  let row = at.row;
  if (typeof move === "object") {
    column = Math.min(Math.max(move.column, 0), columns.length - 1);
    row = clampRow(column, 0);
  } else if (move === "left" || move === "right") {
    column = Math.min(Math.max(column + (move === "left" ? -1 : 1), 0), columns.length - 1);
    row = clampRow(column, row);
  } else if (move === "up" || move === "down") {
    row = clampRow(column, row + (move === "up" ? -1 : 1));
  } else {
    row = clampRow(column, move === "top" ? 0 : Number.MAX_SAFE_INTEGER);
  }
  const target = columns[column];
  if (target === undefined) return null;
  return { columnKey: target.key, threadKey: row < 0 ? null : (target.threads[row]?.key ?? null) };
}
