import { realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { queryRepositoryGit } from "./repository-boundary";

/** Root and committed HEAD registration is intentionally independent of dirty
 * content enumeration. These read-only builtins do not execute Git hooks. */
export async function registerRepository(inputRoot: string): Promise<{ root: string; id: string; name: string }> {
  const root = await realpath(inputRoot);
  if (!(await stat(root)).isDirectory()) throw new Error("Workspace root is not a directory");
  const query = async (args: string[]) => {
    try {
      const output = new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(await queryRepositoryGit(root, args, { timeoutMs: 2_000, maximumBytes: 16_384 }));
      if (!output.endsWith("\n")) throw new Error("Missing Git record terminator");
      return output.slice(0, -1); // The pathname may itself end in whitespace.
    }
    catch { throw new Error("A canonical local Git working tree with a committed HEAD is required"); }
  };
  const [top, head] = await Promise.all([query(["rev-parse", "--show-toplevel"]), query(["rev-parse", "--verify", "HEAD^{commit}"])]);
  if (await realpath(top) !== root || !/^[a-f0-9]{40,64}$/.test(head)) throw new Error("Register the canonical Git working-tree root with a committed HEAD");
  const identity = createHash("sha256").update(root).digest("hex");
  return { root, id: `repository:${identity}`, name: basename(root) || root };
}
