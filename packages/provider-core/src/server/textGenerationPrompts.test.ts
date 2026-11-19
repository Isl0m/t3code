import { describe, expect, it } from "vite-plus/test";

import { buildThreadTitlePrompt, matchThreadGroup } from "./textGenerationPrompts.ts";
import { normalizeCliError } from "./textGenerationUtils.ts";

describe("normalizeCliError", () => {
  it("does not expose CLI failure details in the public error message", () => {
    const result = normalizeCliError(
      "codex",
      "generateCommitMessage",
      new Error("request failed with access_token=secret-token"),
      "Failed to generate a commit message",
    );

    expect(result.detail).toBe("Failed to generate a commit message");
    expect(result.message).not.toContain("secret-token");
  });
});

describe("buildThreadTitlePrompt", () => {
  it("names the project to leave out of initial and regenerated titles", () => {
    for (const previousTitle of [undefined, "Hyperdrive Config Crash"]) {
      const { prompt } = buildThreadTitlePrompt({
        message: "hyperdrive init crashes without a config",
        previousTitle,
        projectTitle: "Hyperdrive",
      });
      expect(prompt).toContain('Never include the project name ("Hyperdrive")');
    }
  });

  it("offers the project's groups only when it has some", () => {
    const message = "courier map shows stale orders";
    expect(buildThreadTitlePrompt({ message }).prompt).not.toContain("Thread groups");
    expect(buildThreadTitlePrompt({ message, groups: ["Courier app", "Admin"] }).prompt).toContain(
      'Thread groups in this project: ["Courier app","Admin"]',
    );
  });
});

describe("matchThreadGroup", () => {
  it.each([
    ["courier APP ", "Courier app"],
    ["Billing", undefined],
    [null, undefined],
  ])("maps %j to %j", (named, expected) => {
    expect(matchThreadGroup(["Courier app", "Admin"], named)).toBe(expected);
  });
});
