import { expect, it } from "vitest";
import { parseGithubPrs } from "../core/github-prs";
it("keeps exact optional PR branch identity without inventing it for older observations", () => {
  const row = { number: 3, title: "Worktree", state: "OPEN", isDraft: true, author: { login: "operator" },
    updatedAt: "2026-09-08T12:00:00Z", url: "https://github.com/example/project/pull/3", changedFiles: 0, files: [] };
  const parse = (value: unknown) => parseGithubPrs(JSON.stringify([value]), "repo", "world", "example/project").pullRequests[0];
  expect(parse({ ...row, headRefName: "feature/agent-work" })?.headRefName).toBe("feature/agent-work");
  expect(parse(row)?.headRefName).toBeUndefined();
  expect(() => parse({ ...row, headRefName: "bad\nbranch" })).toThrow();
});
