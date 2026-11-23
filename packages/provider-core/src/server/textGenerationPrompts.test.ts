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
  it("names the project to leave out and puts the user's instructions above the limits", () => {
    for (const previousTitle of [undefined, "Hyperdrive Config Crash"]) {
      const { prompt } = buildThreadTitlePrompt({
        message: "hyperdrive init crashes without a config",
        previousTitle,
        projectTitle: "Hyperdrive",
        instructions: "Prefix every title with the team name.",
      });
      expect(prompt).toContain('Never include the project name ("Hyperdrive")');
      expect(prompt).not.toContain("fewer than 40 characters");
      expect(prompt).toContain("Title instructions from the user:\nPrefix every title");
    }
    expect(buildThreadTitlePrompt({ message: "Fix login", instructions: " " }).prompt).toContain(
      "3-8 words, fewer than 40 characters.",
    );
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
