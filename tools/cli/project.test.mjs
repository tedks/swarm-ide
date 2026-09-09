import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProject, prepareProject } from "./project.mjs";

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), "swarm-project-start-"));
  const environment = { PATH: process.env.PATH, HOME: join(directory, "home"), XDG_CONFIG_HOME: join(directory, "config"), XDG_STATE_HOME: join(directory, "state") };
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { env: { ...environment, GIT_CONFIG_NOSYSTEM: "1" }, stdio: "pipe", encoding: "utf8" });
  const repo = join(directory, "project with spaces"); mkdirSync(repo);
  git(repo, "init", "-b", "main"); git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
  try { return run({ directory, environment, git, repo, prepare: (cwd, options = {}) => prepareProject(options, { cwd, environment }) }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test("clone, nested cwd and symlink resolve one real root without inherited Git redirection", () => fixture(({ repo, directory, environment, git }) => {
  const clone = join(directory, "clone"), nested = join(clone, "nested");
  git(directory, "clone", repo, clone); mkdirSync(nested); symlinkSync(nested, join(directory, "alias"));
  const result = discoverProject(join(directory, "alias"), { ...environment, GIT_DIR: join(repo, ".git"), GIT_WORK_TREE: repo });
  assert.equal(result.invoking, clone); assert.equal(result.identity, join(clone, ".git")); assert.equal(result.worktrees.length, 1);
}));

for (const hidden of [false, true]) test(`actual ${hidden ? ".git-container" : "direct bare"} selects main, remembers an explicit linked worktree and recovers from stale preference`, () => fixture(({ repo, directory, environment, git, prepare }) => {
  const container = join(directory, "bare project"), bare = hidden ? join(container, ".git") : container;
  mkdirSync(container); git(directory, "clone", "--bare", repo, bare);
  const main = join(container, "main"), feature = join(container, "feature");
  git(bare, "worktree", "add", main, "main"); git(bare, "worktree", "add", "-b", "feature", feature);
  const first = prepare(container); assert.equal(first.workspace, main); assert.equal(first.identity, bare);
  assert.equal(first.worktrees.length, 2);
  const explicit = prepare(container, { workspace: "feature" }); assert.equal(explicit.workspace, feature);
  assert.equal(prepare(container).workspace, feature); assert.equal(prepare(main).workspace, main);
  assert.notEqual(first.profile, explicit.profile); assert.equal(first.configPath, explicit.configPath);
  const saved = JSON.parse(readFileSync(first.configPath)); saved.workspace = join(container, "missing"); writeFileSync(first.configPath, JSON.stringify(saved));
  assert.equal(prepare(container).workspace, main);
  git(bare, "worktree", "remove", feature); assert.equal(discoverProject(container, environment).worktrees.length, 1);
  git(bare, "worktree", "remove", main);
  assert.throws(() => prepare(container), /No accessible worktree/);
}));

test("private settings/profile/empty registry are reusable and do not touch checkout or credentials", () => fixture(({ repo, directory, prepare, git }) => {
  const before = git(repo, "status", "--porcelain");
  const initial = prepare(repo); writeFileSync(join(initial.profile, "marker"), "keep");
  writeFileSync(join(directory, "config", "credentials-marker"), "keep-auth");
  const second = prepare(repo);
  assert.equal(second.configPath, initial.configPath); assert.equal(second.profile, initial.profile);
  assert.equal(readFileSync(join(second.profile, "marker"), "utf8"), "keep");
  assert.equal(readFileSync(join(directory, "config", "credentials-marker"), "utf8"), "keep-auth");
  assert.deepEqual(JSON.parse(readFileSync(second.registry)), { version: 1, sessions: [] });
  assert.equal(statSync(second.configPath).mode & 0o777, 0o600); assert.equal(statSync(second.profile).mode & 0o777, 0o700);
  assert.equal(git(repo, "status", "--porcelain"), before);
}));

test("explicit registry/profile remain invocation-local and environment registry stays supported", () => fixture(({ repo, directory, prepare, environment }) => {
  const initial = prepare(repo), registry = join(directory, "external.json"); writeFileSync(registry, "leave this untouched");
  const explicit = prepare(repo, { agentRegistry: registry, userDataDir: "../chosen-profile" });
  assert.equal(explicit.registry, registry); assert.equal(explicit.profile, join(directory, "chosen-profile"));
  assert.equal(readFileSync(registry, "utf8"), "leave this untouched");
  assert.equal(prepare(repo).registry, initial.registry);
  assert.equal(prepareProject({}, { cwd: repo, environment: { ...environment, SWARM_EXTERNAL_AGENTS_REGISTRY: registry } }).registry, registry);
}));

test("malformed or symlink configuration is retained and reported, never overwritten", () => fixture(({ repo, directory, prepare }) => {
  const initial = prepare(repo); writeFileSync(initial.configPath, "broken");
  assert.throws(() => prepare(repo), /left unchanged/); assert.equal(readFileSync(initial.configPath, "utf8"), "broken");
  rmSync(initial.configPath); const marker = join(directory, "untouched"); writeFileSync(marker, "secret"); symlinkSync(marker, initial.configPath);
  assert.throws(() => prepare(repo), /left unchanged/); assert.equal(readFileSync(marker, "utf8"), "secret");
}));

test("settings inside source and relative XDG paths are rejected before creating config", () => fixture(({ repo, environment }) => {
  assert.throws(() => prepareProject({}, { cwd: repo, environment: { ...environment, XDG_CONFIG_HOME: join(repo, ".config") } }), /outside the project/);
  assert.throws(() => prepareProject({}, { cwd: repo, environment: { ...environment, XDG_STATE_HOME: "relative" } }), /absolute/);
}));

test("ordinary non-Git directory remains supported with its own private configuration", () => fixture(({ directory, prepare }) => {
  const plain = join(directory, "plain"); mkdirSync(plain);
  assert.equal(prepare(plain).workspace, plain); assert.equal(prepare(plain).git, false);
}));

test("symlinked XDG bases into source are rejected before any directory is created", () => fixture(({ repo, directory, environment }) => {
  const sourceConfig = join(repo, ".local-config"); mkdirSync(sourceConfig); writeFileSync(join(sourceConfig, "marker"), "untouched");
  const alias = join(directory, "xdg-alias"); symlinkSync(sourceConfig, alias);
  assert.throws(() => prepareProject({}, { cwd: repo, environment: { ...environment, XDG_CONFIG_HOME: alias } }), /outside the project/);
  assert.deepEqual(readdirSync(sourceConfig), ["marker"]); assert.equal(readFileSync(join(sourceConfig, "marker"), "utf8"), "untouched");
}));

test("symlinked external XDG roots are supported using canonical private paths", () => fixture(({ repo, directory, environment }) => {
  const external = join(directory, "external-config"); mkdirSync(external); const alias = join(directory, "config-alias"); symlinkSync(external, alias);
  const first = prepareProject({}, { cwd: repo, environment: { ...environment, XDG_CONFIG_HOME: alias } });
  assert(first.configPath.startsWith(`${external}/`));
}));

test("removed saved association falls back to the managed empty registry", () => fixture(({ repo, directory, prepare }) => {
  const initial = prepare(repo); initial.rememberRegistry(join(directory, "old-removed-association.json"));
  assert.equal(prepare(repo).registry, initial.registry);
}));
