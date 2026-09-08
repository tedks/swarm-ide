/** Release only the exact ID returned by this proof's docker create. */
export function disposeContainer(id, docker, evidence) {
  try {
    try { evidence('container.log', docker('logs', id)); }
    catch (error) { evidence('log-error.txt', String(error)); }
  } finally {
    try { docker('stop', '--time', '10', id); }
    finally {
      docker('rm', '--force', id);
      evidence('cleanup.txt', 'Only owned container removed; cleanup_complete=1\n');
    }
  }
}
