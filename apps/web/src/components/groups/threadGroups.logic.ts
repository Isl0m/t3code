import type { SidebarThreadSummary } from "../../types";

const MAX_GROUP_NAME_LENGTH = 64;

/** The sidebar's group filter value for threads in none of the listed groups. */
export const UNGROUPED_FILTER = "__ungrouped__";

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

export function collectThreadGroups(
  threads: ReadonlyArray<{ readonly tags: ReadonlyArray<string> }>,
) {
  const groups = new Set<string>();
  for (const thread of threads) {
    for (const tag of thread.tags) groups.add(tag);
  }
  return [...groups].toSorted((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

/**
 * The sidebar's group chips: configured groups in their order, then any other group the
 * active threads use. Ungrouped is offered only while an active thread is in none of them.
 */
export function sidebarGroupFilterOptions(input: {
  readonly configuredGroups: ReadonlyArray<string>;
  readonly activeThreadTags: ReadonlyArray<ReadonlyArray<string>>;
}): { readonly groups: ReadonlyArray<string>; readonly hasUngrouped: boolean } {
  const configured = normalizeThreadGroups(input.configuredGroups);
  const extra = collectThreadGroups(input.activeThreadTags.map((tags) => ({ tags }))).filter(
    (group) => !configured.includes(group),
  );
  const groups = [...configured, ...extra];
  return {
    groups,
    hasUngrouped: input.activeThreadTags.some((tags) => !tags.some((tag) => groups.includes(tag))),
  };
}

/** A saved filter whose chip is no longer offered falls back to every thread. */
export function resolveSidebarGroupFilter(
  saved: string | null,
  options: ReturnType<typeof sidebarGroupFilterOptions>,
): string | null {
  if (saved === UNGROUPED_FILTER) return options.hasUngrouped ? saved : null;
  return saved !== null && options.groups.includes(saved) ? saved : null;
}

/** The chip a next/previous shortcut lands on, wrapping around; All is the null chip. */
export function adjacentSidebarGroupFilter(
  values: ReadonlyArray<string | null>,
  selected: string | null,
  direction: "previous" | "next",
): string | null {
  if (values.length === 0) return selected;
  const index = Math.max(0, values.indexOf(selected));
  const step = direction === "next" ? 1 : -1;
  return values[(index + step + values.length) % values.length] ?? null;
}

export function matchesSidebarGroupFilter(
  tags: ReadonlyArray<string>,
  filter: string | null,
  groups: ReadonlyArray<string>,
): boolean {
  if (filter === null) return true;
  if (filter === UNGROUPED_FILTER) return !tags.some((tag) => groups.includes(tag));
  return tags.includes(filter);
}
