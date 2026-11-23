import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { CheckIcon, FolderIcon, FolderPlusIcon } from "lucide-react";
import { useState } from "react";

import { useQuietThreadShell, useQuietThreadShells } from "../../state/entities";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "../CommandPalette.logic";
import { CommandPaletteContent } from "../CommandPaletteContent";
import { CommandPaletteResults } from "../CommandPaletteResults";
import { CommandDialog, CommandDialogPopup } from "../ui/command";
import {
  collectThreadGroups,
  normalizeThreadGroupName,
  threadGroupTags,
} from "./threadGroups.logic";
import { closeThreadGroupPicker, useThreadGroupPickerTarget } from "./threadGroupPickerStore";
import { useProjectThreadGroups } from "./useProjectThreadGroups";

export function ThreadGroupPickerHost() {
  const target = useThreadGroupPickerTarget((state) => state.target);
  return (
    <CommandDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) closeThreadGroupPicker();
      }}
    >
      {target !== null ? (
        <ThreadGroupPicker key={`${target.environmentId}:${target.threadId}`} target={target} />
      ) : null}
    </CommandDialog>
  );
}

function ThreadGroupPicker({ target }: { readonly target: ScopedThreadRef }) {
  const gt = useGT();
  const [query, setQuery] = useState("");
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const thread = useQuietThreadShell(target);
  const threads = useQuietThreadShells();
  const setTag = useAtomCommand(threadEnvironment.setTag);
  const projectThreadGroups = useProjectThreadGroups();
  const projectGroups =
    thread === null ? [] : projectThreadGroups(target.environmentId, thread.projectId).groups;
  const otherGroups = collectThreadGroups(
    threads.map((entry) => ({ tags: threadGroupTags(entry) })),
  ).filter((group) => !projectGroups.includes(group));
  const groups = [...projectGroups, ...otherGroups];
  const current = new Set(thread === null ? [] : threadGroupTags(thread));
  const newName = normalizeThreadGroupName(query);
  const toggle = (tag: string, tagged: boolean) =>
    setTag({
      environmentId: target.environmentId,
      input: { threadId: target.threadId, tag, tagged },
    }).then(() => undefined);
  const moveTo = async (tag: string) => {
    await toggle(tag, true);
    for (const other of current) {
      if (other !== tag) await toggle(other, false);
    }
  };

  const items: CommandPaletteActionItem[] = [
    ...(newName !== null &&
    !groups.some((group) => group.localeCompare(newName, undefined, { sensitivity: "base" }) === 0)
      ? [
          {
            kind: "action" as const,
            value: `thread-group:new:${newName}`,
            searchTerms: [query],
            title: gt("Create group “{name}”", { name: newName }),
            icon: <FolderPlusIcon className={ITEM_ICON_CLASS} />,
            run: () => moveTo(newName),
          },
        ]
      : []),
    ...groups.map((group) => ({
      kind: "action" as const,
      value: `thread-group:${group}`,
      searchTerms: [group],
      title: group,
      description: current.has(group)
        ? gt("Remove from this group")
        : projectGroups.includes(group)
          ? gt("Project group")
          : undefined,
      checked: current.has(group),
      icon: current.has(group) ? (
        <CheckIcon className={ITEM_ICON_CLASS} />
      ) : (
        <FolderIcon className={ITEM_ICON_CLASS} />
      ),
      run: () => (current.has(group) ? toggle(group, false) : moveTo(group)),
    })),
  ];
  const foldedQuery = query.trim().toLowerCase();
  const shownItems = items.filter(
    (item) =>
      foldedQuery.length === 0 ||
      item.value.startsWith("thread-group:new:") ||
      item.searchTerms.some((term) => term.toLowerCase().includes(foldedQuery)),
  );

  return (
    <CommandDialogPopup
      aria-label={gt("Group thread")}
      className="overflow-hidden"
      onBackdropPointerDown={closeThreadGroupPicker}
    >
      <CommandPaletteContent
        aria-label={gt("Group thread")}
        autoHighlight="always"
        escapeLabel={gt("Close")}
        footerActionLabel={gt("Move to group")}
        inputProps={{ placeholder: gt("Find or create a group…") }}
        mode="none"
        onItemHighlighted={(value) => {
          setHighlightedItemValue(typeof value === "string" ? value : null);
        }}
        onValueChange={(value) => {
          setHighlightedItemValue(null);
          setQuery(value);
        }}
        panelSize="tall-list"
        testId="thread-group-picker"
        value={query}
      >
        <CommandPaletteResults
          groups={
            shownItems.length > 0
              ? [
                  {
                    value: "thread-groups",
                    label: thread?.title ?? gt("Groups"),
                    items: shownItems,
                  },
                ]
              : []
          }
          highlightedItemValue={highlightedItemValue}
          isActionsOnly={false}
          keybindings={keybindings}
          onExecuteItem={(item) => {
            if (item.kind !== "action") return;
            closeThreadGroupPicker();
            void item.run();
          }}
          emptyStateMessage={gt("Type a name to create a group.")}
        />
      </CommandPaletteContent>
    </CommandDialogPopup>
  );
}
