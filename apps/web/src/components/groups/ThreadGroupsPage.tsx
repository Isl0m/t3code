import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { useNavigate } from "@tanstack/react-router";
import { FolderPlusIcon, PinIcon, SearchIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { shortcutLabelForCommand } from "../../keybindings";
import { isEditableFocused } from "../../lib/editableFocus";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { cn } from "../../lib/utils";
import { useDelegatedUnderParent, useQuietThreadShells } from "../../state/entities";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import type { SidebarThreadSummary } from "../../types";
import { useUiStateStore } from "../../uiStateStore";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { useProjectLookups } from "../CommandPaletteLookups";
import {
  filterSidebarV2VisibleThreads,
  hasUnseenCompletion,
  resolveSidebarRowStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";
import { getAppModalReturnThreadTarget } from "../sidebar/mainAppLocation";
import { getTriggerDisplayModelName } from "../chat/providerIconUtils";
import { useProviderEntryByEnvironmentAndInstanceId } from "../CommandPaletteThreadItems";
import type { ProjectFaviconProject } from "../ProjectFavicon";
import { ThreadCommandSubtitle } from "../ThreadCommandSubtitle";
import {
  ThreadRowLeadingStatus,
  ThreadRowTrailingStatus,
  ThreadSearchPullRequestNumber,
} from "../ThreadStatusIndicators";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Kbd } from "../ui/kbd";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { isThreadGroupPickerOpen, openThreadGroupPicker } from "./threadGroupPickerStore";
import {
  buildThreadGroupColumns,
  type GroupableThread,
  moveThreadGroupsCursor,
  NEEDS_YOU_COLUMN_KEY,
  needsYou,
  resolveThreadGroupsCursor,
  sectionThreads,
  THREAD_GROUPS_MODES,
  type ThreadGroupsCursor,
  type ThreadGroupsMove,
  threadGroupTags,
  threadSection,
  type ThreadStatusBucket,
} from "./threadGroups.logic";
import {
  readThreadGroupsPreferences,
  saveThreadGroupsPreferences,
} from "./threadGroupsPreferences";
import { useProjectThreadGroups } from "./useProjectThreadGroups";

// The list renders this many rows; search narrows the rest, so a 1,000-thread group stays cheap.
const COLUMN_ROW_LIMIT = 100;
const ALL_PROJECTS = "__all-projects__";
const NO_DELEGATED: ReadonlySet<string> = new Set();

interface BoardThread extends GroupableThread {
  readonly shell: SidebarThreadSummary;
}

function statusBucket(thread: SidebarThreadSummary, now: string): ThreadStatusBucket {
  if (thread.settledOverride === "settled") return "settled";
  if (effectiveSnoozed(thread, { now })) return "snoozed";
  switch (resolveSidebarRowStatus(thread)) {
    case "approval":
    case "input":
    case "request":
    case "failed":
    case "limited":
      return "attention";
    case "preparing":
    case "working":
    case "waiting":
      return "working";
    case "ready":
      return "ready";
  }
}

const KEY_MOVES: Record<string, ThreadGroupsMove> = {
  j: "down",
  arrowdown: "down",
  k: "up",
  arrowup: "up",
  h: "left",
  arrowleft: "left",
  l: "right",
  arrowright: "right",
  home: "top",
  end: "bottom",
};

const LEGEND: ReadonlyArray<readonly [string, string]> = [
  ["j k", "Move"],
  ["h l", "Prev/next group"],
  ["0–9", "Jump to group"],
  ["Enter", "Open"],
  ["g", "Move to group"],
  ["x", "Ungroup"],
  ["s", "Settle"],
  ["⇧S", "Settle idle"],
  ["p", "Pin"],
  ["a", "All projects"],
  ["v", "View"],
  ["/", "Search"],
];

function ThreadRowMeta(props: {
  thread: SidebarThreadSummary;
  project: ProjectFaviconProject | null;
  projectTitle: string | null;
  providerEntryByEnvironmentAndInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
}) {
  const { thread } = props;
  const modelInstanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerEntry =
    props.providerEntryByEnvironmentAndInstanceId.get(
      `${thread.environmentId}:${modelInstanceId}`,
    ) ?? null;
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === thread.modelSelection.model,
  );
  const modelLabel = selectedModel
    ? getTriggerDisplayModelName(selectedModel, providerEntry?.driverKind)
    : thread.modelSelection.model;
  return (
    <span className="flex w-full min-w-0 items-center gap-2 text-xs">
      <ThreadCommandSubtitle
        className="min-w-0 shrink"
        project={props.project}
        projectTitle={props.projectTitle}
        branch={thread.branch}
        worktreePath={thread.worktreePath}
        isCurrent={false}
        driverKind={providerEntry?.driverKind ?? null}
        providerDisplayName={
          thread.runtime?.providerName ?? providerEntry?.displayName ?? modelInstanceId
        }
        acpRegistryAgentId={providerEntry?.acpRegistryAgentId}
        acpRegistryIconUrl={providerEntry?.acpRegistryIconUrl}
      />
      <span className="min-w-0 flex-1 truncate text-muted-foreground/70">{modelLabel}</span>
      <ThreadSearchPullRequestNumber
        thread={thread}
        query={null}
        settled={thread.settledOverride === "settled"}
      />
      <ThreadRowTrailingStatus thread={thread} />
    </span>
  );
}

export function ThreadGroupsPage() {
  const navigate = useNavigate();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [preferences, setPreferences] = useState(readThreadGroupsPreferences);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<ThreadGroupsCursor | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollToKeyRef = useRef<string | null>(null);
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const { projectByKey } = useProjectLookups();
  const providerEntryByEnvironmentAndInstanceId = useProviderEntryByEnvironmentAndInstanceId();
  const projectThreadGroups = useProjectThreadGroups();
  const settle = useAtomCommand(threadEnvironment.settle);
  const unsettle = useAtomCommand(threadEnvironment.unsettle);
  const pin = useAtomCommand(threadEnvironment.pin);
  const unpin = useAtomCommand(threadEnvironment.unpin);
  const setTag = useAtomCommand(threadEnvironment.setTag);
  const [now] = useState(() => new Date().toISOString());
  const localLastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById);
  const [openedOverProjectKey, setOpenedOverProjectKey] = useState(() => {
    const target = getAppModalReturnThreadTarget();
    if (target?.kind !== "server") return null;
    const shell = threads.find(
      (entry) =>
        entry.environmentId === target.threadRef.environmentId &&
        entry.id === target.threadRef.threadId,
    );
    return shell ? `${shell.environmentId}:${shell.projectId}` : null;
  });

  const allBoardThreads: BoardThread[] = filterSidebarV2VisibleThreads(
    threads,
    null,
    delegatedUnderParent ?? NO_DELEGATED,
  ).map((shell) => {
    const project = projectByKey.get(`${shell.environmentId}:${shell.projectId}`);
    const lastVisitedAt = resolveThreadLastVisitedAt(
      shell.lastVisitedAt,
      localLastVisitedAt[scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id))],
    );
    return {
      key: `${shell.environmentId}:${shell.id}`,
      title: shell.title,
      tags: threadGroupTags(shell),
      projectKey: `${shell.environmentId}:${shell.projectId}`,
      projectTitle: project?.title ?? "Unknown project",
      branch: shell.branch,
      bucket: statusBucket(shell, now),
      pinned: shell.pinnedAt != null,
      activityAt: Date.parse(shell.updatedAt) || 0,
      unread: hasUnseenCompletion({ ...shell, lastVisitedAt }),
      shell,
    };
  });
  const scopeProjects = [
    ...new Map(
      allBoardThreads
        .toSorted((left, right) => left.projectTitle.localeCompare(right.projectTitle))
        .map((thread) => [thread.projectKey, thread.projectTitle] as const),
    ),
  ];
  const scopedProjectKey =
    preferences.allProjects === true
      ? null
      : ([openedOverProjectKey, preferences.projectKey].find(
          (key) => key != null && scopeProjects.some(([projectKey]) => projectKey === key),
        ) ?? null);
  const boardThreads =
    scopedProjectKey === null
      ? allBoardThreads
      : allBoardThreads.filter((thread) => thread.projectKey === scopedProjectKey);
  const columns = buildThreadGroupColumns({
    threads: boardThreads,
    mode: preferences.mode,
    showSettled: preferences.showSettled,
    query,
    includeNeedsYou: true,
    configuredGroups: [...projectByKey.values()]
      .filter(
        (project) =>
          scopedProjectKey === null ||
          `${project.environmentId}:${project.id}` === scopedProjectKey,
      )
      .flatMap((project) => projectThreadGroups(project.environmentId, project.id).groups),
  });
  const leadsWithNeedsYou = columns[0]?.key === NEEDS_YOU_COLUMN_KEY;
  const at = resolveThreadGroupsCursor(columns, cursor);
  const selectedColumn = at === null ? null : (columns[at.column] ?? null);
  const selected =
    at === null || at.row < 0 || at.row >= COLUMN_ROW_LIMIT
      ? null
      : (selectedColumn?.threads[at.row] ?? null);

  const updatePreferences = (patch: Partial<typeof preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    saveThreadGroupsPreferences(next);
  };
  const setScope = (projectKey: string | null) => {
    setOpenedOverProjectKey(null);
    updatePreferences(
      projectKey === null ? { allProjects: true } : { allProjects: false, projectKey },
    );
  };
  const moveTo = (next: ThreadGroupsCursor | null) => {
    scrollToKeyRef.current = next?.threadKey ?? null;
    setCursor(next);
  };
  const openThread = (thread: BoardThread) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.shell.environmentId, thread.shell.id)),
    });
  const target = (thread: BoardThread) => ({
    environmentId: thread.shell.environmentId,
    input: { threadId: thread.shell.id },
  });
  const toggleSettled = (thread: BoardThread) =>
    void (thread.bucket === "settled"
      ? unsettle({ ...target(thread), input: { ...target(thread).input, reason: "user" } })
      : settle(target(thread)));
  const settleIdle = () => {
    for (const thread of selectedColumn?.threads ?? []) {
      if (threadSection(thread) === "ready") void settle(target(thread));
    }
  };
  const togglePinned = (thread: BoardThread) =>
    void (thread.pinned ? unpin(target(thread)) : pin(target(thread)));
  const removeFromGroup = (thread: BoardThread) => {
    for (const tag of selectedColumn?.tag != null ? [selectedColumn.tag] : thread.tags) {
      void setTag({ ...target(thread), input: { ...target(thread).input, tag, tagged: false } });
    }
  };

  const onBoardKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || isCommandPaletteOpen()) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isThreadGroupPickerOpen()) return;
    const key = event.key.toLowerCase();
    if (isEditableFocused(event.target)) {
      if (event.target !== searchRef.current) return;
      if (key === "escape" && query.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
      } else if (key === "arrowdown" || key === "enter") {
        event.preventDefault();
        searchRef.current?.blur();
        moveTo(moveThreadGroupsCursor(columns, cursor, "top"));
      }
      return;
    }
    const columnNumber = /^[0-9]$/.test(key) ? Number(key) - (leadsWithNeedsYou ? 0 : 1) : -1;
    const move = KEY_MOVES[key] ?? (columnNumber >= 0 ? { column: columnNumber } : null);
    const handled = (() => {
      if (move !== null) {
        moveTo(moveThreadGroupsCursor(columns, cursor, move));
        return true;
      }
      if (key === "/") {
        searchRef.current?.focus();
        return true;
      }
      if (key === "v") {
        const index = THREAD_GROUPS_MODES.findIndex((mode) => mode.value === preferences.mode);
        const nextMode = THREAD_GROUPS_MODES[(index + 1) % THREAD_GROUPS_MODES.length];
        if (nextMode) updatePreferences({ mode: nextMode.value });
        return true;
      }
      if (key === ".") {
        updatePreferences({ showSettled: !preferences.showSettled });
        return true;
      }
      if (key === "a") {
        setScope(
          scopedProjectKey === null
            ? (openedOverProjectKey ?? preferences.projectKey ?? selected?.projectKey ?? null)
            : null,
        );
        return true;
      }
      if (key === "s" && event.shiftKey) {
        settleIdle();
        return true;
      }
      if (selected === null) return false;
      if (key === "enter" || key === "o") openThread(selected);
      else if (key === "g")
        openThreadGroupPicker(scopeThreadRef(selected.shell.environmentId, selected.shell.id));
      else if (key === "x") removeFromGroup(selected);
      else if (key === "s") toggleSettled(selected);
      else if (key === "p") togglePinned(selected);
      else return false;
      return true;
    })();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window capture keydown listener for board navigation keys
  useEffect(() => {
    window.addEventListener("keydown", onBoardKeyDown, true);
    return () => window.removeEventListener("keydown", onBoardKeyDown, true);
  }, []);

  const groupShortcut = shortcutLabelForCommand(keybindings, "thread.group");
  const listThreads = selectedColumn?.threads.slice(0, COLUMN_ROW_LIMIT) ?? [];
  const sections = sectionThreads(listThreads);

  return (
    <AppRouteModal label="Thread groups">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b py-2 ps-5 pe-2">
          <h1 className="font-medium text-sm">Thread groups</h1>
          <Select
            value={scopedProjectKey ?? ALL_PROJECTS}
            items={{
              [ALL_PROJECTS]: "All projects",
              ...Object.fromEntries(scopeProjects),
            }}
            onValueChange={(next) =>
              setScope(typeof next === "string" && next !== ALL_PROJECTS ? next : null)
            }
          >
            <SelectTrigger aria-label="Project" size="sm" className="w-auto min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
              {scopeProjects.map(([projectKey, title]) => (
                <SelectItem key={projectKey} value={projectKey}>
                  {title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <ToggleGroup
            aria-label="Group threads by"
            variant="segmented"
            value={[preferences.mode]}
            onValueChange={(next) => {
              const mode = THREAD_GROUPS_MODES.find((option) => option.value === next[0]);
              if (mode) updatePreferences({ mode: mode.value });
            }}
          >
            {THREAD_GROUPS_MODES.map((mode) => (
              <Toggle key={mode.value} value={mode.value} title={`${mode.label} (v)`}>
                {mode.label}
              </Toggle>
            ))}
          </ToggleGroup>
          <label className="flex items-center gap-2 text-muted-foreground text-xs">
            <Switch
              checked={preferences.showSettled}
              onCheckedChange={(checked) => updatePreferences({ showSettled: checked })}
            />
            Settled (.)
          </label>
          <InputGroup className="ms-auto w-56 min-w-32">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              aria-label="Search threads"
              placeholder="Search threads, groups…"
              size="sm"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </InputGroup>
          <Button
            size="sm"
            variant="outline"
            disabled={selected === null}
            title={
              groupShortcut
                ? `Move selected thread to a group (g, ${groupShortcut} in a thread)`
                : "Move selected thread to a group (g)"
            }
            onClick={() => {
              if (selected)
                openThreadGroupPicker(
                  scopeThreadRef(selected.shell.environmentId, selected.shell.id),
                );
            }}
          >
            <FolderPlusIcon />
            Group…
          </Button>
          <AppRouteModalClose />
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Groups"
            className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-e bg-muted/24 p-2"
          >
            {columns.map((column, columnIndex) => {
              const number = columnIndex + (leadsWithNeedsYou ? 0 : 1);
              const waiting =
                column.key === NEEDS_YOU_COLUMN_KEY ? 0 : column.threads.filter(needsYou).length;
              return (
                <button
                  key={column.key}
                  type="button"
                  aria-current={at?.column === columnIndex ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent/64",
                    at?.column === columnIndex && "bg-accent",
                    column.key === NEEDS_YOU_COLUMN_KEY && "mb-1",
                  )}
                  onClick={() =>
                    moveTo(moveThreadGroupsCursor(columns, null, { column: columnIndex }))
                  }
                >
                  {number <= 9 ? <Kbd>{number}</Kbd> : <span className="w-5" />}
                  <span className="min-w-0 flex-1 truncate">{column.label}</span>
                  {waiting > 0 ? (
                    <span className="rounded-full bg-warning/16 px-1.5 text-2xs text-warning tabular-nums">
                      {waiting}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {column.threads.length}
                  </span>
                </button>
              );
            })}
          </nav>

          <section
            aria-label={selectedColumn?.label ?? "Threads"}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto py-1"
          >
            {sections.map((section) => (
              <div key={section.key}>
                <h2 className="flex items-center gap-2 px-5 pt-3 pb-1 font-medium text-2xs text-muted-foreground uppercase tracking-wide">
                  {section.label}
                  <span className="tabular-nums">{section.threads.length}</span>
                  {section.key === "ready" && selectedColumn?.key !== NEEDS_YOU_COLUMN_KEY ? (
                    <span className="ms-auto flex items-center gap-1.5 normal-case tracking-normal">
                      <Kbd>⇧S</Kbd> settle all idle
                    </span>
                  ) : null}
                </h2>
                <ol>
                  {section.threads.map((thread) => {
                    const isSelected = selected?.key === thread.key;
                    const otherGroups = thread.tags.filter((tag) => tag !== selectedColumn?.tag);
                    return (
                      <li
                        key={thread.key}
                        ref={(node) => {
                          if (node && scrollToKeyRef.current === thread.key && isSelected) {
                            scrollToKeyRef.current = null;
                            node.scrollIntoView({ block: "nearest" });
                          }
                        }}
                      >
                        <button
                          type="button"
                          aria-current={isSelected ? "true" : undefined}
                          className={cn(
                            "flex w-full min-w-0 flex-col gap-0.5 px-5 py-1.5 text-start hover:bg-accent/64",
                            isSelected && "bg-accent ring-1 ring-ring/48 ring-inset",
                          )}
                          onClick={() =>
                            moveTo({ columnKey: selectedColumn?.key ?? "", threadKey: thread.key })
                          }
                          onDoubleClick={() => openThread(thread)}
                        >
                          <span className="flex w-full min-w-0 items-center gap-2">
                            <ThreadRowLeadingStatus thread={thread.shell} />
                            <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
                            {thread.pinned ? (
                              <PinIcon
                                aria-label="Pinned"
                                role="img"
                                className="size-3 shrink-0 text-muted-foreground/65"
                              />
                            ) : null}
                            {otherGroups.map((tag) => (
                              <span
                                key={tag}
                                className="max-w-32 shrink-0 truncate rounded bg-foreground/[0.07] px-1.5 text-2xs text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                            <span className="w-16 shrink-0 text-end text-muted-foreground text-xs tabular-nums">
                              {formatRelativeTimeLabel(thread.shell.updatedAt)}
                            </span>
                          </span>
                          <ThreadRowMeta
                            thread={thread.shell}
                            project={
                              scopedProjectKey === null
                                ? (projectByKey.get(thread.projectKey) ?? null)
                                : null
                            }
                            projectTitle={scopedProjectKey === null ? thread.projectTitle : null}
                            providerEntryByEnvironmentAndInstanceId={
                              providerEntryByEnvironmentAndInstanceId
                            }
                          />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            {(selectedColumn?.threads.length ?? 0) > COLUMN_ROW_LIMIT ? (
              <p className="px-5 py-2 text-muted-foreground text-xs">
                {(selectedColumn?.threads.length ?? 0) - COLUMN_ROW_LIMIT} more. Search to narrow.
              </p>
            ) : null}
            {listThreads.length === 0 ? (
              <p className="px-5 py-4 text-muted-foreground text-sm">
                {selectedColumn?.key === NEEDS_YOU_COLUMN_KEY
                  ? "Nothing is waiting on you."
                  : selectedColumn?.tag != null
                    ? "Empty. Press g on a thread to move it here."
                    : "Nothing here."}
              </p>
            ) : null}
          </section>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-5 py-2 text-muted-foreground text-xs">
          {LEGEND.map(([keys, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <Kbd>{keys}</Kbd>
              {label}
            </span>
          ))}
        </footer>
      </div>
    </AppRouteModal>
  );
}
