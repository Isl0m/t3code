import { useGT } from "gt-react";
import { useRef } from "react";

import { normalizeThreadGroups } from "../groups/threadGroups.logic";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingResetButton } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { useSearchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

export function ThreadGroupsSettings() {
  const settings = useScopedSettings();
  const setting = useSearchableSetting();
  const gt = useGT();
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
        {...setting("thread-groups")}
        description={gt(
          "Groups offered when starting a thread, in the group picker, and on the Thread groups board. One per line.",
        )}
        resetAction={
          mixedGroups || groups.length > 0 ? (
            <SettingResetButton
              ariaLabel={gt("Reset thread groups")}
              onClick={() => updateSettings({ threadGroups: [] })}
            />
          ) : null
        }
      >
        <div className="mt-3 max-w-2xl pb-3.5">
          <Textarea
            key={`${scopeKey}:${mixedGroups}:${groups.join("\n")}`}
            aria-label={gt("Thread groups")}
            onChange={() => {
              edited.current = true;
            }}
            rows={5}
            defaultValue={mixedGroups ? "" : groups.join("\n")}
            placeholder={
              mixedGroups
                ? gt("Mixed. Enter groups to apply to all selected targets.")
                : gt("Courier app\nAdmin panel\nBugs")
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
        {...setting("auto-assign-thread-groups")}
        description={gt(
          "When a new thread is titled, the text generation model also files it into the best-fitting group above. Threads you already grouped are left alone.",
        )}
        resetAction={
          settings.autoAssignThreadGroups ? (
            <SettingResetButton
              ariaLabel={gt("Reset automatic grouping")}
              onClick={() => updateSettings({ autoAssignThreadGroups: false })}
            />
          ) : null
        }
        control={
          <Switch
            aria-label={gt("Assign groups to new threads automatically")}
            mixed={mixedAutoAssign}
            checked={mixedAutoAssign ? false : settings.autoAssignThreadGroups}
            onCheckedChange={(enabled) => updateSettings({ autoAssignThreadGroups: enabled })}
          />
        }
      />
    </>
  );
}
