// Pure, test-only P5 fixture; never imports network, filesystem, or process APIs.
// Assumptions: an isolated credential-free Codex sends one fresh turn with
// include_environment_context=false. System/developer text and tool definitions
// are bounded metadata from that synthetic installation, not evidence of their
// provenance. This validator does not authorize execution or inspect host data.
// Source shapes: pinned 3d2ee51, codex-rs/core/tests/common/responses.rs:717-795,
// codex-api/src/common.rs:275, protocol/src/models.rs, tools/src/responses_api.rs.
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';

export const P5_PROMPT = 'Synthetic policy SessionStart probe.';
export const P5_TEXT = 'POLICY_P5_TEXT_ONLY';
export const P5_PORT = 43129;
export const P5_PROVIDER = 'policy_p5_text_once';
export const P5_MODEL = 'gpt-5.2';
const BODY_LIMIT = 128 * 1024;
const MAX_DEPTH = 16, MAX_NODES = 8192, MAX_STRING = 64 * 1024;
const dangerousKey = /^(?:__proto__|prototype|constructor|authorization|proxy[-_]authorization|api[-_]?key|access[-_]token|refresh[-_]token|id[-_]token|credentials?|cookies?|bearer[-_]token|experimental_bearer_token)$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const shortString = value => typeof value === 'string' && value.length <= 256;

// JSON.parse alone silently discards duplicate keys. Preflight rejects ambiguity
// and excessive nesting before parsing; the JSON parser owns grammar validation.
function preflight(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++;
        i++;
      }
      if (i >= text.length) return false;
      let next = i + 1;
      while (/[\t\n\r ]/.test(text[next] ?? '') && next < text.length) next++;
      if (text[next] === ':') {
        const frame = stack.at(-1), key = JSON.parse(text.slice(start, i + 1));
        if (!(frame instanceof Set) || frame.has(key) || dangerousKey.test(key)) return false;
        frame.add(key);
      }
    } else if (char === '{' || char === '[') {
      stack.push(char === '{' ? new Set() : null);
      if (stack.length > MAX_DEPTH) return false;
    } else if (char === '}' || char === ']') {
      if (!stack.length) return false;
      stack.pop();
    }
  }
  return stack.length === 0;
}

function boundedTree(root) {
  let nodes = 0;
  const pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (++nodes > MAX_NODES) return false;
    if (typeof value === 'string' && (value.length > MAX_STRING || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.length > 256 || dangerousKey.test(key)) return false;
        pending.push(child);
      }
    }
  }
  return true;
}

function validHeaders(headers, size) {
  if (!object(headers) || Object.keys(headers).length > 64) return false;
  const normalized = new Map();
  let total = 0;
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name) || typeof value !== 'string' ||
        /[\u0000-\u001f\u007f]/.test(value) || (total += key.length + value.length) > 16 * 1024 ||
        normalized.has(name) || /auth|cookie|api[-_]?key|token|credential|secret|proxy|forwarded|^via$|^x-real-ip$|^upgrade$|^sec-websocket|^content-encoding$|^transfer-encoding$/.test(name)) return false;
    normalized.set(name, value);
  }
  if (normalized.get('host') !== `127.0.0.1:${P5_PORT}` ||
      !/^application\/json(?:;\s*charset=utf-8)?$/i.test(normalized.get('content-type') ?? '')) return false;
  if (normalized.has('content-length') && normalized.get('content-length') !== String(size)) return false;
  return !normalized.has('connection') || /^(?:close|keep-alive)$/i.test(normalized.get('connection'));
}

function toolDefinition(tool, nested = false) {
  if (!object(tool) || !shortString(tool.name) || !tool.name.length || typeof tool.description !== 'string') return false;
  if (tool.type === 'namespace' && !nested) {
    return keysOnly(tool, ['type', 'name', 'description', 'tools']) && Array.isArray(tool.tools) &&
      tool.tools.length <= 64 && tool.tools.every(child => toolDefinition(child, true));
  }
  if (tool.type === 'function') {
    return keysOnly(tool, ['type', 'name', 'description', 'strict', 'defer_loading', 'parameters']) &&
      typeof tool.strict === 'boolean' && object(tool.parameters) && tool.parameters.type === 'object' &&
      (!Object.hasOwn(tool, 'defer_loading') || typeof tool.defer_loading === 'boolean');
  }
  if (tool.type === 'custom') {
    return keysOnly(tool, ['type', 'name', 'description', 'defer_loading', 'format']) &&
      (!Object.hasOwn(tool, 'defer_loading') || typeof tool.defer_loading === 'boolean') &&
      keysOnly(tool.format, ['type', 'syntax', 'definition']) && tool.format.type === 'grammar' &&
      ['lark', 'regex'].includes(tool.format.syntax) && typeof tool.format.definition === 'string';
  }
  return false;
}

function validBody(body) {
  if (!keysOnly(body, ['model', 'instructions', 'input', 'tools', 'tool_choice', 'parallel_tool_calls',
    'reasoning', 'store', 'stream', 'stream_options', 'include', 'service_tier', 'prompt_cache_key', 'text', 'client_metadata']) ||
      body.model !== P5_MODEL || body.stream !== true || body.store !== false ||
      body.tool_choice !== 'auto' || typeof body.parallel_tool_calls !== 'boolean' ||
      !Array.isArray(body.input) || !body.input.length || body.input.length > 16) return false;
  if (Object.hasOwn(body, 'instructions') && typeof body.instructions !== 'string') return false;
  let users = 0;
  for (const [index, item] of body.input.entries()) {
    if (!keysOnly(item, ['type', 'role', 'content', 'id']) || item.type !== 'message' ||
        !['user', 'system', 'developer'].includes(item.role) ||
        (Object.hasOwn(item, 'id') && !shortString(item.id)) ||
        !Array.isArray(item.content) || !item.content.length || item.content.length > 16 ||
        !item.content.every(part => keysOnly(part, ['type', 'text']) && part.type === 'input_text' && typeof part.text === 'string')) return false;
    if (item.role === 'user') {
      if (++users !== 1 || index !== body.input.length - 1 || item.content.length !== 1 || item.content[0].text !== P5_PROMPT) return false;
    }
  }
  if (users !== 1) return false;
  if (Object.hasOwn(body, 'tools') && (!Array.isArray(body.tools) || body.tools.length > 64 || !body.tools.every(tool => toolDefinition(tool)))) return false;
  if (body.reasoning != null && (!keysOnly(body.reasoning, ['effort', 'summary']) ||
      Object.values(body.reasoning).some(value => !shortString(value)))) return false;
  if (body.stream_options != null && (!keysOnly(body.stream_options, ['reasoning_summary_delivery']) ||
      body.stream_options.reasoning_summary_delivery !== 'sequential_cutoff')) return false;
  if (!Array.isArray(body.include) || body.include.some(value => value !== 'reasoning.encrypted_content') || body.include.length > 1) return false;
  for (const field of ['service_tier', 'prompt_cache_key']) if (body[field] != null && !shortString(body[field])) return false;
  if (body.text != null && (!keysOnly(body.text, ['verbosity']) ||
      (Object.hasOwn(body.text, 'verbosity') && !['low', 'medium', 'high'].includes(body.text.verbosity)))) return false;
  if (body.client_metadata != null && (!object(body.client_metadata) ||
      Object.keys(body.client_metadata).length > 32 || Object.values(body.client_metadata).some(value => typeof value !== 'string' || value.length > 4096))) return false;
  return true;
}

function requestMatches(method, path, headers, bodyBuffer) {
  try {
    if (method !== 'POST' || path !== '/v1/responses' || !Buffer.isBuffer(bodyBuffer) ||
        !bodyBuffer.length || bodyBuffer.length > BODY_LIMIT || !validHeaders(headers, bodyBuffer.length)) return false;
    // Preserve and reject a UTF-8 BOM instead of silently stripping it.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bodyBuffer);
    if (!preflight(text)) return false;
    const body = JSON.parse(text);
    return boundedTree(body) && validBody(body);
  } catch { return false; }
}

export class P5RequestError extends Error {
  constructor() {
    super('P5_SYNTHETIC_REQUEST_INVALID');
    this.name = 'P5RequestError';
    this.code = 'P5_SYNTHETIC_REQUEST_INVALID';
  }
}

/** Returns true or a fixed typed error; no request bytes or parser errors escape. */
export function validateSyntheticRequest(method, path, headers, bodyBuffer) {
  if (!requestMatches(method, path, headers, bodyBuffer)) throw new P5RequestError();
  return true;
}

// An immutable string (not an externally mutable shared Buffer), including the
// terminal blank line. Listener owns Content-Type, Content-Length and EOF.
export const P5_SSE = [
  { type: 'response.created', response: { id: 'resp-policy-p5' } },
  { type: 'response.output_item.done', item: { type: 'message', role: 'assistant', id: 'msg-policy-p5',
    content: [{ type: 'output_text', text: P5_TEXT }] } },
  { type: 'response.completed', response: { id: 'resp-policy-p5', usage: { input_tokens: 0,
    input_tokens_details: null, output_tokens: 0, output_tokens_details: null, total_tokens: 0 } } },
].map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
