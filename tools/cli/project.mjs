import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const within = (root, path) => { const part = relative(root, path); return part === "" || (part !== ".." && !part.startsWith(`../`) && !isAbsolute(part)); };
const key = (path) => `${basename(path === dirname(path) ? path : path.endsWith("/.git") ? dirname(path) : path).replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 48) || "project"}-${createHash("sha256").update(path).digest("hex").slice(0, 16)}`;
const git = (directory, args, environment) => execFileSync("git", ["-C", directory, ...args], {
  encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  env: { ...Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("GIT_"))), GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
});
const maybeGit = (directory, args, environment) => { try { return git(directory, args, environment).trimEnd(); } catch { return undefined; } };

export function discoverProject(directory, environment = process.env) {
  let requested;
  try { requested = realpathSync(directory); if (!lstatSync(requested).isDirectory()) throw new Error(); }
  catch { throw new Error(`Workspace is not an accessible directory: ${directory}`); }
  const common = maybeGit(requested, ["rev-parse", "--path-format=absolute", "--git-common-dir"], environment);
  // Preserve the existing ability to inspect an ordinary, non-Git directory.
  if (!common) return { identity: requested, worktrees: [{ path: requested }], invoking: requested, git: false };
  const identity = realpathSync(common);
  const bare = git(requested, ["rev-parse", "--is-bare-repository"], environment).trim() === "true";
  const invoking = bare ? undefined : realpathSync(git(requested, ["rev-parse", "--show-toplevel"], environment).trimEnd());
  const entries = git(requested, ["worktree", "list", "--porcelain", "-z"], environment).split("\0\0");
  const worktrees = [];
  for (const entry of entries) {
    const fields = entry.split("\0"), pathField = fields.find((part) => part.startsWith("worktree "));
    if (!pathField || fields.includes("bare") || fields.some((part) => part === "prunable" || part.startsWith("prunable "))) continue;
    try {
      const path = realpathSync(pathField.slice(9));
      const candidate = maybeGit(path, ["rev-parse", "--path-format=absolute", "--git-common-dir"], environment);
      const top = maybeGit(path, ["rev-parse", "--show-toplevel"], environment);
      if (!candidate || !top || realpathSync(candidate) !== identity || realpathSync(top) !== path) continue;
      worktrees.push({ path, branch: fields.find((part) => part.startsWith("branch "))?.slice(7) });
    } catch { /* Missing, stale or inaccessible worktrees are not launch candidates. */ }
  }
  if (!worktrees.length) throw new Error(`No accessible worktree belongs to ${requested}. Create a Git worktree, then run swarm-ide there.`);
  const remoteDefault = maybeGit(requested, ["symbolic-ref", "refs/remotes/origin/HEAD"], environment)?.replace(/^refs\/remotes\/origin\//, "refs/heads/");
  const localDefault = maybeGit(identity, ["symbolic-ref", "HEAD"], environment);
  return { identity, worktrees, invoking, defaultBranch: remoteDefault ?? localDefault, git: true };
}

function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0 || realpathSync(path) !== path) throw new Error(`Project settings directory must be private and not a symlink: ${path}`);
}

// Resolve existing ancestors before creating anything, including when an XDG
// base is a symlink. Missing trailing directories remain literal path segments.
function canonicalFuture(path) {
  let ancestor = path; const trailing = [];
  for (;;) {
    try { return resolve(realpathSync(ancestor), ...trailing); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      // A dangling symlink is not an absent directory we may replace.
      try { lstatSync(ancestor); throw new Error(`Settings path has a dangling symlink: ${ancestor}`); }
      catch (missing) { if (missing.code !== "ENOENT") throw missing; }
      trailing.unshift(basename(ancestor)); ancestor = dirname(ancestor);
    }
  }
}

function readPrivate(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0 || info.size > 1024 * 1024) throw new Error("not a private regular settings file");
    return JSON.parse(readFileSync(fd, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new Error(`Cannot read project settings ${path}: ${error.message}. File left unchanged.`);
  } finally { if (fd !== undefined) closeSync(fd); }
}

function publish(path, value, create = false) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    if (create) { try { linkSync(temporary, path); } catch (error) { if (error.code !== "EEXIST") throw error; } }
    else renameSync(temporary, path);
  }
  finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
}

export function prepareProject(options, { cwd, environment }) {
  const project = discoverProject(resolve(cwd, options.workspace ?? "."), environment);
  const home = environment.HOME || homedir();
  const configBase = environment.XDG_CONFIG_HOME || join(home, ".config");
  const stateBase = environment.XDG_STATE_HOME || join(home, ".local/state");
  if (!isAbsolute(configBase) || !isAbsolute(stateBase)) throw new Error("XDG_CONFIG_HOME and XDG_STATE_HOME must be absolute paths.");
  const projectKey = key(project.identity);
  const configDirectory = canonicalFuture(join(resolve(configBase), "swarm-ide/projects", projectKey));
  const stateDirectory = canonicalFuture(join(resolve(stateBase), "swarm-ide/projects", projectKey));
  for (const path of [configDirectory, stateDirectory]) {
    if ([project.identity, ...project.worktrees.map((row) => row.path)].some((root) => within(root, path))) throw new Error("Swarm project settings must be outside the project. Set XDG_CONFIG_HOME/XDG_STATE_HOME to an external directory.");
  }
  for (const path of [configDirectory, stateDirectory]) privateDirectory(path);
  const configPath = join(configDirectory, "project.json");
  let saved = readPrivate(configPath);
  const valid = (value) => value?.version === 1 && value.gitCommonDirectory === project.identity && typeof value.workspace === "string" && isAbsolute(value.workspace) && typeof value.registry === "string" && isAbsolute(value.registry);
  if (saved !== undefined && !valid(saved)) throw new Error(`Malformed project configuration: ${configPath}. File left unchanged.`);
  const remembered = project.worktrees.find((row) => row.path === saved?.workspace);
  const selected = project.worktrees.find((row) => row.path === project.invoking) ?? remembered
    ?? [project.defaultBranch, "refs/heads/main", "refs/heads/master"].map((branch) => project.worktrees.find((row) => row.branch && row.branch === branch)).find(Boolean)
    ?? [...project.worktrees].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)[0];
  let rememberedRegistry = saved?.registry;
  if (rememberedRegistry) {
    const data = readPrivate(rememberedRegistry);
    if (data === undefined) rememberedRegistry = undefined;
    else if (data.version !== 1 || !Array.isArray(data.sessions)) throw new Error(`Malformed private registry: ${rememberedRegistry}. File left unchanged.`);
  }
  const registry = options.agentRegistry !== undefined ? realpathSync(resolve(cwd, options.agentRegistry))
    : environment.SWARM_EXTERNAL_AGENTS_REGISTRY ? realpathSync(resolve(cwd, environment.SWARM_EXTERNAL_AGENTS_REGISTRY))
      : rememberedRegistry ?? join(stateDirectory, "agents.json");
  if (!saved) {
    publish(configPath, { version: 1, gitCommonDirectory: project.identity, workspace: selected.path, registry: join(stateDirectory, "agents.json") }, true);
    saved = readPrivate(configPath);
    if (!valid(saved)) throw new Error(`Malformed project configuration: ${configPath}. File left unchanged.`);
  }
  const defaultRegistry = join(stateDirectory, "agents.json");
  publish(defaultRegistry, { version: 1, sessions: [] }, true);
  const registryData = readPrivate(defaultRegistry);
  if (registryData?.version !== 1 || !Array.isArray(registryData.sessions)) throw new Error(`Malformed private registry: ${defaultRegistry}. File left unchanged.`);
  // Explicit flags are invocation-local; a bare-parent launch remembers only
  // the most recently selected valid workspace and its managed registry.
  if (saved.workspace !== selected.path) publish(configPath, { ...saved, workspace: selected.path });
  const profile = options.userDataDir !== undefined ? resolve(cwd, options.userDataDir) : canonicalFuture(join(stateDirectory, "profiles", key(selected.path)));
  if (options.userDataDir === undefined) {
    if ([project.identity, ...project.worktrees.map((row) => row.path)].some((root) => within(root, profile))) throw new Error("Swarm profile must be outside the project. Existing settings left in place.");
    privateDirectory(profile);
  }
  return { ...project, workspace: selected.path, registry, profile, configPath, stateDirectory,
    rememberRegistry(path) {
      const current = readPrivate(configPath);
      if (!valid(current)) throw new Error(`Malformed project configuration: ${configPath}. File left unchanged.`);
      publish(configPath, { ...current, registry: path });
    } };
}
