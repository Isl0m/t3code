import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { useNavigate } from "@tanstack/react-router";
import { FolderPlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { shortcutLabelForCommand } from "../../keybindings";
import { isEditableFocused } from "../../lib/editableFocus";
import { cn } from "../../lib/utils";
import { useDelegatedUnderParent, useQuietThreadShells } from "../../state/entities";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import type { SidebarThreadSummary } from "../../types";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { useProjectLookups } from "../CommandPaletteLookups";
import { filterSidebarV2VisibleThreads, resolveSidebarRowStatus } from "../Sidebar.logic";
import { ThreadRowLeadingStatus } from "../ThreadStatusIndicators";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Kbd } from "../ui/kbd";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { isThreadGroupPickerOpen, openThreadGroupPicker } from "./threadGroupPickerStore";
import {
  buildThreadGroupColumns,
  type GroupableThread,
  moveThreadGroupsCursor,
  resolveThreadGroupsCursor,
  THREAD_GROUPS_MODES,
  type ThreadGroupsCursor,
  type ThreadGroupsMove,
  threadGroupTags,
  type ThreadStatusBucket,
} from "./threadGroups.logic";
import {
  readThreadGroupsPreferences,
  saveThreadGroupsPreferences,
} from "./threadGroupsPreferences";

// Columns render this many rows; search narrows the rest, so a 1,000-thread column stays cheap.
const COLUMN_ROW_LIMIT = 100;
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
  ["↑↓←→ / hjkl", "Move"],
  ["Enter", "Open"],
  ["g", "Group…"],
  ["x", "Remove from group"],
  ["s", "Settle"],
  ["p", "Pin"],
  ["1–9", "Column"],
  ["v", "View"],
  [".", "Settled"],
  ["/", "Search"],
];

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
  const settle = useAtomCommand(threadEnvironment.settle);
  const unsettle = useAtomCommand(threadEnvironment.unsettle);
  const pin = useAtomCommand(threadEnvironment.pin);
  const unpin = useAtomCommand(threadEnvironment.unpin);
  const setTag = useAtomCommand(threadEnvironment.setTag);
  const [now] = useState(() => new Date().toISOString());

  const boardThreads: BoardThread[] = filterSidebarV2VisibleThreads(
    threads,
    null,
    delegatedUnderParent ?? NO_DELEGATED,
  ).map((shell) => {
    const project = projectByKey.get(`${shell.environmentId}:${shell.projectId}`);
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
      shell,
    };
  });
  const columns = buildThreadGroupColumns({
    threads: boardThreads,
    mode: preferences.mode,
    showSettled: preferences.showSettled,
    query,
  });
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
  const togglePinned = (thread: BoardThread) =>
    void (thread.pinned ? unpin(target(thread)) : pin(target(thread)));
  const removeFromColumnGroup = (thread: BoardThread) => {
    const tag = selectedColumn?.tag ?? null;
    if (tag === null) return;
    void setTag({ ...target(thread), input: { ...target(thread).input, tag, tagged: false } });
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
    const move = KEY_MOVES[key] ?? (/^[1-9]$/.test(key) ? { column: Number(key) - 1 } : null);
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
      if (selected === null) return false;
      if (key === "enter" || key === "o") openThread(selected);
      else if (key === "g")
        openThreadGroupPicker(scopeThreadRef(selected.shell.environmentId, selected.shell.id));
      else if (key === "x") removeFromColumnGroup(selected);
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
  const totalShown = new Set(
    columns.flatMap((column) => column.threads.map((thread) => thread.key)),
  ).size;

  return (
    <AppRouteModal label="Thread groups">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b py-2 ps-5 pe-2">
          <h1 className="font-medium text-sm">Thread groups</h1>
          <span className="text-muted-foreground text-xs tabular-nums">{totalShown} shown</span>
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
            Settled
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
                ? `Group selected thread (g, ${groupShortcut} in a thread)`
                : "Group selected thread (g)"
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

        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {columns.map((column, columnIndex) => (
            <section
              key={column.key}
              aria-label={column.label}
              className={cn(
                "flex min-h-0 w-72 shrink-0 flex-col rounded-lg border bg-muted/24",
                at?.column === columnIndex && "border-ring/48",
              )}
            >
              <header className="flex items-center gap-2 border-b px-3 py-2">
                {columnIndex < 9 ? <Kbd>{columnIndex + 1}</Kbd> : null}
                <h2 className="min-w-0 flex-1 truncate font-medium text-sm">{column.label}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {column.threads.length}
                </span>
              </header>
              <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                {column.threads.slice(0, COLUMN_ROW_LIMIT).map((thread, rowIndex) => {
                  const isSelected = at?.column === columnIndex && at.row === rowIndex;
                  const otherGroups = thread.tags.filter((tag) => tag !== column.tag);
                  return (
                    <li
                      key={thread.key}
                      ref={(node) => {
                        if (node && scrollToKeyRef.current === thread.key && isSelected) {
                          scrollToKeyRef.current = null;
                          node.scrollIntoView({ block: "nearest", inline: "nearest" });
                        }
                      }}
                    >
                      <button
                        type="button"
                        aria-current={isSelected ? "true" : undefined}
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-start hover:bg-accent/64",
                          isSelected && "bg-accent ring-1 ring-ring/48",
                        )}
                        onClick={() => moveTo({ columnKey: column.key, threadKey: thread.key })}
                        onDoubleClick={() => openThread(thread)}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <ThreadRowLeadingStatus thread={thread.shell} />
                          <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                          <span className="min-w-0 truncate">
                            {preferences.mode === "project"
                              ? (thread.branch ?? "")
                              : thread.projectTitle}
                          </span>
                          <span className="ms-auto shrink-0 tabular-nums">
                            {formatRelativeTimeLabel(thread.shell.updatedAt)}
                          </span>
                        </span>
                        {otherGroups.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {otherGroups.map((tag) => (
                              <span
                                key={tag}
                                className="max-w-full truncate rounded bg-foreground/[0.07] px-1.5 text-2xs text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {column.threads.length > COLUMN_ROW_LIMIT ? (
                  <li className="px-2 py-1.5 text-muted-foreground text-xs">
                    {column.threads.length - COLUMN_ROW_LIMIT} more. Search to narrow.
                  </li>
                ) : null}
                {column.threads.length === 0 ? (
                  <li className="px-2 py-1.5 text-muted-foreground text-xs">
                    {column.tag === null
                      ? "Nothing here."
                      : "Empty. Press g on a thread to file it here."}
                  </li>
                ) : null}
              </ol>
            </section>
          ))}
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
