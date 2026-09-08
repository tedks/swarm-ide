import { z } from "zod";
import { PROTOCOL_VERSION } from "./common";
import { RepositoryPathSchema } from "./repository";

export const GITHUB_PR_LIMIT = 20;
export const GITHUB_PR_PATH_LIMIT = 100;
export const GithubRepositorySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/)
  .refine((value) => ![".", ".."].includes(value.split("/")[1]));
const label = (max: number) => z.string().min(1).max(max).refine((value) => !/[\x00-\x1f\x7f]/.test(value));
export const GithubPullRequestSchema = z.object({
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), title: label(512),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]), isDraft: z.boolean(), author: label(100),
  updatedAt: z.string().datetime({ offset: true }),
  headRefName: label(256).optional(),
  url: z.string().max(300), changedFiles: z.number().int().nonnegative().max(1_000_000),
  paths: z.array(RepositoryPathSchema).max(GITHUB_PR_PATH_LIMIT),
}).strict().superRefine((pr, ctx) => {
  if (new Set(pr.paths).size !== pr.paths.length || pr.paths.length > pr.changedFiles)
    ctx.addIssue({ code: "custom", message: "Invalid changed-file coverage" });
});
export const GithubPrRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: z.string().min(1).max(256),
  type: z.literal("githubPrs.refresh"), repositoryId: z.string().min(1).max(256), worldId: z.string().min(1).max(256),
}).strict();
export const GithubPrObservationSchema = z.object({
  repositoryId: z.string().min(1).max(256), worldId: z.string().min(1).max(256),
  githubRepository: GithubRepositorySchema, observedAt: z.string().datetime(),
  pullRequests: z.array(GithubPullRequestSchema).max(GITHUB_PR_LIMIT),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.pullRequests.map((pr) => pr.number)).size !== value.pullRequests.length)
    ctx.addIssue({ code: "custom", message: "Duplicate pull request" });
  for (const pr of value.pullRequests) {
    const url = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/([1-9][0-9]*)$/.exec(pr.url);
    if (!url || url[1].toLowerCase() !== value.githubRepository.toLowerCase() || url[2] !== String(pr.number))
      ctx.addIssue({ code: "custom", message: "Pull request URL does not match the observed repository" });
  }
});
export type GithubPrObservation = z.infer<typeof GithubPrObservationSchema>;
export type GithubPrRequest = z.infer<typeof GithubPrRequestSchema>;
