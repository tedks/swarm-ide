// Operator-invoked read-only diagnostic. No project scripts or environment data.
import { ProjectContextProvider } from "../../core/project-context/provider";
async function main() { for (const root of process.argv.slice(2)) {
  const provider = new ProjectContextProvider(root, "probe", root);
  try { console.log(JSON.stringify({ root, observation: await provider.observe() })); }
  finally { await provider.dispose(); }
} }
void main().catch((error) => { console.error(error.message); process.exitCode = 1; });
