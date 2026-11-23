import { useGT, useMessages } from "gt-react";

import { cn } from "~/lib/utils";
import type { resolveSidebarFolderDot } from "../Sidebar.logic";
import { FOLDER_DOT_CLASS_NAME, FOLDER_DOT_LABEL } from "../sidebar/SidebarProjectFolderHeader";

export interface SidebarGroupChip {
  /** null is the All chip. */
  readonly value: string | null;
  readonly label: string;
  readonly count: number;
  readonly dot: ReturnType<typeof resolveSidebarFolderDot>;
}

export function SidebarGroupChips(props: {
  readonly chips: ReadonlyArray<SidebarGroupChip>;
  readonly selected: string | null;
  readonly onSelect: (value: string | null) => void;
}) {
  const gt = useGT();
  const m = useMessages();
  return (
    <div
      role="toolbar"
      aria-label={gt("Thread groups")}
      className="flex flex-wrap gap-1 px-1 pt-1.5"
    >
      {props.chips.map((chip) => {
        const isSelected = chip.value === props.selected;
        return (
          <button
            key={chip.value ?? ""}
            type="button"
            aria-pressed={isSelected}
            onClick={() => props.onSelect(chip.value)}
            className={cn(
              "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              isSelected
                ? "bg-sidebar-row-active font-medium text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70"
                : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
            )}
          >
            {chip.label}
            {chip.dot && !isSelected ? (
              <span
                className={cn("size-1.5 shrink-0 rounded-full", FOLDER_DOT_CLASS_NAME[chip.dot])}
              >
                <span className="sr-only">{m(FOLDER_DOT_LABEL[chip.dot])}</span>
              </span>
            ) : null}
            <span className="tabular-nums text-sidebar-muted-foreground">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}
