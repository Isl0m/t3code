import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useUiStateStore } from "../../uiStateStore";
import {
  filterSidebarV2VisibleThreads,
  resolveSidebarFolderDot,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";
import type { SidebarGroupChip } from "./SidebarGroupChips";
import {
  matchesSidebarGroupFilter,
  resolveSidebarGroupFilter,
  sidebarGroupFilterOptions,
  threadGroupTags,
  UNGROUPED_FILTER,
} from "./threadGroups.logic";
import { useProjectThreadGroups } from "./useProjectThreadGroups";

const GROUP_FILTER_KEY = "t3code:sidebar:group-filter";
const groupFilterSchema = Schema.NullOr(Schema.String);

const threadKey = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

/**
 * The sidebar's group chips and the threads the picked chip leaves listed. Subagent threads
 * stay for their parent rows, and the open thread stays so the route never loses its row.
 */
export function useSidebarGroupFilter(input: {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly scopedProjectKeys: ReadonlySet<string> | null;
  readonly delegatedUnderParent: ReadonlySet<string>;
  readonly projectRefs: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId;
  }>;
  readonly routeRowThreadKey: string | null;
}) {
  const [saved, setSaved] = useLocalStorage(GROUP_FILTER_KEY, null, groupFilterSchema);
  const projectThreadGroups = useProjectThreadGroups();
  const localLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);

  const listed = filterSidebarV2VisibleThreads(
    input.threads,
    input.scopedProjectKeys,
    input.delegatedUnderParent,
  );
  const active = listed.filter((thread) => thread.settledOverride !== "settled");
  const options = sidebarGroupFilterOptions({
    configuredGroups: input.projectRefs.flatMap(
      (ref) => projectThreadGroups(ref.environmentId, ref.projectId).groups,
    ),
    activeThreadTags: active.map(threadGroupTags),
  });
  const selected = resolveSidebarGroupFilter(saved, options);

  const chipOf = (value: string | null, label: string): SidebarGroupChip => {
    const members = active.filter((thread) =>
      matchesSidebarGroupFilter(threadGroupTags(thread), value, options.groups),
    );
    return {
      value,
      label,
      count: members.length,
      dot: resolveSidebarFolderDot(
        members.map((thread) => ({
          ...thread,
          lastVisitedAt: resolveThreadLastVisitedAt(
            thread.lastVisitedAt,
            localLastVisitedAtById[threadKey(thread)],
          ),
        })),
      ),
    };
  };
  const chips =
    options.groups.length === 0
      ? []
      : [
          chipOf(null, "All"),
          ...options.groups.map((group) => chipOf(group, group)),
          ...(options.hasUngrouped ? [chipOf(UNGROUPED_FILTER, "Ungrouped")] : []),
        ];

  const listedKeys = new Set(
    filterSidebarV2VisibleThreads(input.threads, null, input.delegatedUnderParent).map(threadKey),
  );
  const threads =
    selected === null
      ? input.threads
      : input.threads.filter((thread) => {
          const key = threadKey(thread);
          return (
            !listedKeys.has(key) ||
            key === input.routeRowThreadKey ||
            matchesSidebarGroupFilter(threadGroupTags(thread), selected, options.groups)
          );
        });

  return { threads, chips, selected, select: setSaved, filtering: selected !== null };
}
