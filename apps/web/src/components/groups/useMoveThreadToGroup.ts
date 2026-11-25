import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useGT, useMessages } from "gt-react";

import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { threadGroupMoveSteps } from "./threadGroups.logic";

/** Puts a thread in exactly one group (or none), stopping at the first failed tag change. */
export function useMoveThreadToGroup() {
  const gt = useGT();
  const m = useMessages();
  const setTag = useAtomCommand(threadEnvironment.setTag);
  return async (
    target: ScopedThreadRef,
    currentTags: ReadonlyArray<string>,
    group: string | null,
  ): Promise<boolean> => {
    for (const step of threadGroupMoveSteps(currentTags, group)) {
      const result = await setTag({
        environmentId: target.environmentId,
        input: { threadId: target.threadId, tag: step.tag, tagged: step.tagged },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: gt("Failed to move thread to group"),
              description:
                thrownErrorMessage(squashAtomCommandFailure(result), m) ?? gt("An error occurred."),
            }),
          );
        }
        return false;
      }
    }
    return true;
  };
}
