import { useRef } from "react";

import { normalizeThreadGroups } from "../groups/threadGroups.logic";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingResetButton } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

export function ThreadGroupsSettings() {
  const settings = useScopedSettings();
  const { targets } = useSettingsScope();
  const scopeKey = targets.map((target) => `${target.environmentId}:${target.projectId}`).join(",");
  const edited = useRef(false);
  const updateSettings = useUpdateScopedSettings();
  const mixedGroups = useScopedSettingsMixed(["threadGroups"]);
  const mixedAutoAssign = useScopedSettingsMixed(["autoAssignThreadGroups"]);
  const groups = normalizeThreadGroups(settings.threadGroups);

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["threadGroups"]}
        {...searchableSetting("thread-groups")}
        description="Groups offered when starting a thread, in the group picker, and on the Thread groups board. One per line."
        resetAction={
          mixedGroups || groups.length > 0 ? (
            <SettingResetButton
              label="thread groups"
              onClick={() => updateSettings({ threadGroups: [] })}
            />
          ) : null
        }
      >
        <div className="mt-3 max-w-2xl pb-3.5">
          <Textarea
            key={`${scopeKey}:${mixedGroups}:${groups.join("\n")}`}
            aria-label="Thread groups"
            onChange={() => {
              edited.current = true;
            }}
            rows={5}
            defaultValue={mixedGroups ? "" : groups.join("\n")}
            placeholder={
              mixedGroups
                ? "Mixed. Enter groups to apply to all selected targets."
                : "Courier app\nAdmin panel\nBugs"
            }
            onBlur={(event) => {
              const next = normalizeThreadGroups(event.target.value.split("\n"));
              if (edited.current && (mixedGroups || next.join("\n") !== groups.join("\n")))
                updateSettings({ threadGroups: [...next] });
              edited.current = false;
            }}
          />
        </div>
      </SettingsRow>
      <SettingsRow
        serverScoped
        settingKeys={["autoAssignThreadGroups"]}
        mixed={mixedAutoAssign}
        {...searchableSetting("auto-assign-thread-groups")}
        description="When a new thread is titled, the text generation model also files it into the best-fitting group above. Threads you already grouped are left alone."
        resetAction={
          settings.autoAssignThreadGroups ? (
            <SettingResetButton
              label="automatic grouping"
              onClick={() => updateSettings({ autoAssignThreadGroups: false })}
            />
          ) : null
        }
        control={
          <Switch
            aria-label="Assign groups to new threads automatically"
            mixed={mixedAutoAssign}
            checked={mixedAutoAssign ? false : settings.autoAssignThreadGroups}
            onCheckedChange={(enabled) => updateSettings({ autoAssignThreadGroups: enabled })}
          />
        }
      />
    </>
  );
}
