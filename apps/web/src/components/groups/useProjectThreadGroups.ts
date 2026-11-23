import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import { useEnvironments } from "../../state/environments";
import { normalizeThreadGroups } from "./threadGroups.logic";

export interface ProjectThreadGroupSettings {
  readonly groups: ReadonlyArray<string>;
  readonly autoAssign: boolean;
}

const NO_GROUPS: ProjectThreadGroupSettings = { groups: [], autoAssign: false };

/** Reads each project's thread groups from its environment's settings, overrides applied. */
export function useProjectThreadGroups() {
  const { environments } = useEnvironments();
  const settingsByEnvironment = new Map(
    environments.flatMap((environment) =>
      environment.serverConfig
        ? [[environment.environmentId, environment.serverConfig.settings]]
        : [],
    ),
  );
  return (environmentId: EnvironmentId, projectId: ProjectId): ProjectThreadGroupSettings => {
    const settings = settingsByEnvironment.get(environmentId);
    if (settings === undefined) return NO_GROUPS;
    const resolved = resolveProjectSettings(settings, projectId).settings;
    return {
      groups: normalizeThreadGroups(resolved.threadGroups),
      autoAssign: resolved.autoAssignThreadGroups,
    };
  };
}
