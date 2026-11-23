import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { FolderIcon } from "lucide-react";
import { create } from "zustand";

import type { DraftId } from "../../composerDraftStore";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { useProjectThreadGroups } from "./useProjectThreadGroups";

const NO_GROUP = "__no-group__";

const useDraftThreadGroups = create<{ byDraft: Readonly<Record<string, string>> }>(() => ({
  byDraft: {},
}));

/** The group picked on a draft; read once when the draft's first message creates the thread. */
export function takeDraftThreadGroup(draftId: DraftId): string | null {
  const group = useDraftThreadGroups.getState().byDraft[draftId] ?? null;
  if (group !== null) {
    useDraftThreadGroups.setState(({ byDraft }) => {
      const { [draftId]: _taken, ...rest } = byDraft;
      return { byDraft: rest };
    });
  }
  return group;
}

export function DraftThreadGroupSelect(props: {
  readonly draftId: DraftId;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const gt = useGT();
  const { groups, autoAssign } = useProjectThreadGroups()(props.environmentId, props.projectId);
  const picked = useDraftThreadGroups((state) => state.byDraft[props.draftId] ?? null);
  if (groups.length === 0) return null;
  const value = picked !== null && groups.includes(picked) ? picked : NO_GROUP;
  const noGroupLabel = autoAssign ? gt("Group: let AI choose") : gt("No group");

  return (
    <Select
      value={value}
      items={{
        [NO_GROUP]: noGroupLabel,
        ...Object.fromEntries(groups.map((group) => [group, group])),
      }}
      onValueChange={(next) => {
        useDraftThreadGroups.setState(({ byDraft }) => {
          if (typeof next !== "string" || next === NO_GROUP) {
            const { [props.draftId]: _cleared, ...rest } = byDraft;
            return { byDraft: rest };
          }
          return { byDraft: { ...byDraft, [props.draftId]: next } };
        });
      }}
    >
      <SelectTrigger aria-label={gt("Thread group")} size="xs" variant="ghost">
        <FolderIcon />
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        <SelectItem value={NO_GROUP}>{noGroupLabel}</SelectItem>
        {groups.map((group) => (
          <SelectItem key={group} value={group}>
            {group}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
