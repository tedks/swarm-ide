// Fixed harmless stdio MCP server. Only runs inside the disposable test namespace.
import { appendFileSync } from 'node:fs';
const fail = process.argv[2] === 'fail';
let bytes = 0, records = 0, buffer = '';
function mark(name) {
  if (++records > 16) process.exit(2);
  appendFileSync('/state/mcp-canary', name + '\n');
}
mark('boot');
process.stdin.on('data', chunk => {
  if ((bytes += chunk.length) > 16384) process.exit(2);
  buffer += chunk.toString('utf8');
  let end;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    let request; try { request = JSON.parse(line); } catch { process.exit(2); }
    let result;
    if (request.method === 'initialize') {
      mark('initialize'); if (fail) process.exit(1);
      if (typeof request.params?.protocolVersion !== 'string' || request.params.protocolVersion.length > 32) process.exit(2);
      result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} },
        serverInfo: { name: 'swarm-fixed-canary', version: '1' } };
    } else if (request.method === 'notifications/initialized') { mark('initialized'); continue; }
    else if (request.method === 'tools/list') { mark('tools/list'); result = { tools: [] }; }
    else if (request.method === 'ping') result = {};
    else process.exit(2); // No tools/call, arbitrary scripts, or network operations.
    if (!(typeof request.id === 'number' || (typeof request.id === 'string' && request.id.length <= 64))) process.exit(2);
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  }
});
