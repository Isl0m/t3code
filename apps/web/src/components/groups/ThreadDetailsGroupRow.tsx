import {
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  THREAD_GROUP_KEYBINDING_COMMANDS,
} from "@t3tools/contracts";
import { useGT } from "gt-react";
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderMinusIcon,
  FolderPlusIcon,
} from "lucide-react";

import { shortcutLabelForCommand } from "~/keybindings";
import { cn } from "~/lib/utils";
import { useQuietThreadShell } from "../../state/entities";
import { ThreadDetailsControl } from "../chat/ThreadDetailsControl";
import {
  THREAD_DETAILS_PANEL_CHEVRON_CLASS,
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
} from "../chat/threadDetailsPanelStyles";
import {
  Menu,
  MenuItem,
  MenuItemLabel,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { openThreadGroupPicker } from "./threadGroupPickerStore";
import { threadGroupTags } from "./threadGroups.logic";
import { useMoveThreadToGroup } from "./useMoveThreadToGroup";
import { useProjectThreadGroups } from "./useProjectThreadGroups";

export function ThreadDetailsGroupRow(props: {
  readonly threadRef: ScopedThreadRef;
  readonly keybindings: ResolvedKeybindingsConfig;
}) {
  const gt = useGT();
  const thread = useQuietThreadShell(props.threadRef);
  const projectThreadGroups = useProjectThreadGroups();
  const moveThreadToGroup = useMoveThreadToGroup();
  if (thread === null) return null;

  const configured = projectThreadGroups(props.threadRef.environmentId, thread.projectId).groups;
  const currentTags = threadGroupTags(thread);
  const current = currentTags[0] ?? null;
  const groups = [...configured, ...currentTags.filter((tag) => !configured.includes(tag))];
  if (groups.length === 0) return null;
  const moveTo = (group: string | null) =>
    void moveThreadToGroup(props.threadRef, currentTags, group);
  const pickerShortcut = shortcutLabelForCommand(props.keybindings, "thread.group");

  return (
    <Menu>
      <MenuTrigger
        render={
          <ThreadDetailsControl
            size="sm"
            variant="ghost"
            aria-label={
              current === null
                ? gt("Thread group: none")
                : gt("Thread group: {group}", { group: current })
            }
          />
        }
      >
        <FolderIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            THREAD_DETAILS_PANEL_LABEL_CLASS,
            current === null && "text-muted-foreground",
          )}
        >
          {current ?? gt("No group")}
        </span>
        <ChevronDownIcon className={THREAD_DETAILS_PANEL_CHEVRON_CLASS} />
      </MenuTrigger>
      <MenuPopup align="end" className="w-(--anchor-width)">
        {groups.map((group) => {
          const command = THREAD_GROUP_KEYBINDING_COMMANDS[configured.indexOf(group)];
          const shortcut = command ? shortcutLabelForCommand(props.keybindings, command) : null;
          return (
            <MenuItem key={group} onClick={() => moveTo(group)}>
              {group === current ? (
                <CheckIcon className="size-4" />
              ) : (
                <FolderIcon className="size-4" />
              )}
              <MenuItemLabel>{group}</MenuItemLabel>
              {shortcut ? <MenuShortcut>{shortcut}</MenuShortcut> : null}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        {current !== null ? (
          <MenuItem onClick={() => moveTo(null)}>
            <FolderMinusIcon className="size-4" />
            <MenuItemLabel>{gt("Remove from group")}</MenuItemLabel>
          </MenuItem>
        ) : null}
        <MenuItem onClick={() => openThreadGroupPicker(props.threadRef)}>
          <FolderPlusIcon className="size-4" />
          <MenuItemLabel>{gt("New group…")}</MenuItemLabel>
          {pickerShortcut ? <MenuShortcut>{pickerShortcut}</MenuShortcut> : null}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
