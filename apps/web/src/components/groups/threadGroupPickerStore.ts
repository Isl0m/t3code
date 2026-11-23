import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

export const useThreadGroupPickerTarget = create<{ target: ScopedThreadRef | null }>(() => ({
  target: null,
}));

export function openThreadGroupPicker(target: ScopedThreadRef): void {
  useThreadGroupPickerTarget.setState({ target });
}

export function closeThreadGroupPicker(): void {
  useThreadGroupPickerTarget.setState({ target: null });
}

export function isThreadGroupPickerOpen(): boolean {
  return useThreadGroupPickerTarget.getState().target !== null;
}
