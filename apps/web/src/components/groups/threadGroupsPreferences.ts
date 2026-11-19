import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "../../hooks/useLocalStorage";

const STORAGE_KEY = "t3code:thread-groups-preferences:v1";
const ThreadGroupsPreferencesSchema = Schema.Struct({
  mode: Schema.Literals(["group", "status", "project"]),
  showSettled: Schema.Boolean,
});
export type ThreadGroupsPreferences = typeof ThreadGroupsPreferencesSchema.Type;

const DEFAULT_PREFERENCES: ThreadGroupsPreferences = { mode: "group", showSettled: false };

export function readThreadGroupsPreferences(): ThreadGroupsPreferences {
  try {
    return getLocalStorageItem(STORAGE_KEY, ThreadGroupsPreferencesSchema) ?? DEFAULT_PREFERENCES;
  } catch (error) {
    console.error("Could not read thread groups preferences.", error);
    return DEFAULT_PREFERENCES;
  }
}

export function saveThreadGroupsPreferences(preferences: ThreadGroupsPreferences): void {
  try {
    setLocalStorageItem(STORAGE_KEY, preferences, ThreadGroupsPreferencesSchema);
  } catch (error) {
    console.error("Could not save thread groups preferences.", error);
  }
}
