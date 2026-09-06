import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { P5_MODEL, P5_PORT, P5_PROMPT, P5_PROVIDER, P5_SSE, P5_TEXT, P5RequestError, validateSyntheticRequest as validateRequest } from '../tools/policy/sessionstart-response.mjs';

function validateSyntheticRequest(...args: [unknown, unknown, unknown, unknown]) {
  try { return validateRequest(...args); } catch (error) {
    expect(error).toBeInstanceOf(P5RequestError);
    expect((error as P5RequestError).code).toBe('P5_SYNTHETIC_REQUEST_INVALID');
    expect((error as Error).message).toBe('P5_SYNTHETIC_REQUEST_INVALID');
    return false;
  }
}

const user = () => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text: P5_PROMPT }] });
function request(): Record<string, unknown> {
  return { model: P5_MODEL, instructions: 'Fixed synthetic installation instructions.', input: [user()],
    tools: [], tool_choice: 'auto', parallel_tool_calls: true, reasoning: { effort: 'low' },
    store: false, stream: true, include: ['reasoning.encrypted_content'], text: { verbosity: 'low' },
    client_metadata: { session_id: 'synthetic-session', turn_id: 'synthetic-turn' } };
}
const bytes = (body: unknown) => Buffer.from(JSON.stringify(body));
const headers = () => ({ host: `127.0.0.1:${P5_PORT}`, 'content-type': 'application/json' });
const valid = (body: unknown) => validateSyntheticRequest('POST', '/v1/responses', headers(), bytes(body));

describe('pure one-response synthetic provider contract, not an installed-process proof', () => {
  it('exports only the fixed synthetic identity and finite text SSE fixture', () => {
    expect(P5_PROVIDER).toBe('policy_p5_text_once'); expect(P5_MODEL).toBe('gpt-5.2');
    expect(P5_PORT).toBe(43129); expect(P5_PROMPT).toBe('Synthetic policy SessionStart probe.');
    expect(Buffer.byteLength(P5_SSE)).toBeLessThan(2048);
    expect(P5_SSE.endsWith('\n\n')).toBe(true);
    const events = P5_SSE.trim().split('\n\n').map(frame => {
      const [event, data] = frame.split('\n');
      const value = JSON.parse(data!.slice(6));
      expect(event).toBe(`event: ${value.type}`);
      return value;
    });
    expect(events.map(event => event.type)).toEqual(['response.created', 'response.output_item.done', 'response.completed']);
    expect(events[1].item).toEqual({ type: 'message', role: 'assistant', id: 'msg-policy-p5',
      content: [{ type: 'output_text', text: P5_TEXT }] });
    expect(events[2].response).toEqual({ id: events[0].response.id, usage: {
      input_tokens: 0, input_tokens_details: null, output_tokens: 0, output_tokens_details: null, total_tokens: 0,
    } });
    expect(P5_SSE).not.toMatch(/tool_call|function_call|end_turn|\[DONE\]/);
  });
  it('accepts the pinned fresh-turn body and ordinary headers', () => {
    const body = bytes(request());
    expect(validateSyntheticRequest('POST', '/v1/responses', { ...headers(), 'content-length': String(body.length),
      connection: 'keep-alive', 'user-agent': 'codex synthetic', 'content-type': 'application/json; charset=utf-8' }, body)).toBe(true);
  });
  it('allows bounded synthetic system/developer text, never arbitrary additional user text', () => {
    const body = request();
    body.input = ['system', 'developer'].map(role => ({ type: 'message', role,
      content: [{ type: 'input_text', text: 'Synthetic fixture metadata.' }] }));
    (body.input as unknown[]).push(user());
    expect(valid(body)).toBe(true);
    (body.input as unknown[]).unshift({ ...user(), content: [{ type: 'input_text', text: '<environment_context>anything</environment_context>' }] });
    expect(valid(body)).toBe(false);
  });
  it('allows function, namespace and grammar definitions as inert metadata', () => {
    const fn = { type: 'function', name: 'update_plan', description: 'Synthetic definition.', strict: false,
      parameters: { type: 'object', properties: { explanation: { type: 'string' } }, additionalProperties: false } };
    const custom = { type: 'custom', name: 'apply_patch', description: 'Synthetic definition.',
      format: { type: 'grammar', syntax: 'lark', definition: 'start: "synthetic"' } };
    expect(valid({ ...request(), tools: [fn, { type: 'namespace', name: 'functions', description: '', tools: [fn, custom] }] })).toBe(true);
    expect(valid({ ...request(), tools: [{ ...fn, arguments: '{}' }] })).toBe(false);
    expect(valid({ ...request(), tools: [{ type: 'function_call', name: 'exec_command', arguments: '{}' }] })).toBe(false);
    expect(valid({ ...request(), tools: [{ type: 'web_search' }] })).toBe(false);
  });
  it.each(['GET', 'post', 'CONNECT', '', null])('rejects method %s', method => {
    expect(validateSyntheticRequest(method, '/v1/responses', headers(), bytes(request()))).toBe(false);
  });
  it.each(['/responses', '/v1/responses?x=1', '/v1/responses/', 'http://127.0.0.1:43129/v1/responses', '/v1/models', '/v1/responses/compact'])
  ('rejects route %s', path => expect(validateSyntheticRequest('POST', path, headers(), bytes(request()))).toBe(false));
  it.each(['authorization', 'Authorization', 'x-auth', 'proxy-authorization', 'cookie', 'x-api-key', 'x-access-token',
    'upgrade', 'sec-websocket-key', 'forwarded', 'x-forwarded-host', 'via', 'x-real-ip', 'content-encoding', 'transfer-encoding'])
  ('rejects unsafe header %s', name => {
    expect(validateSyntheticRequest('POST', '/v1/responses', { ...headers(), [name]: 'synthetic' }, bytes(request()))).toBe(false);
  });
  it('rejects wrong host, malformed headers, duplicate casing, upgrades, and conflicting lengths', () => {
    for (const header of [null, [], { ...headers(), host: 'localhost:43129' }, { ...headers(), Host: '127.0.0.1:43129' },
      { ...headers(), connection: 'keep-alive, upgrade' }, { ...headers(), 'content-length': '1' },
      { ...headers(), 'content-type': ['application/json'] }, { ...headers(), 'x-invalid': 'a\r\nb' },
      { ...headers(), 'x-huge': 'x'.repeat(17000) }]) {
      expect(validateSyntheticRequest('POST', '/v1/responses', header, bytes(request()))).toBe(false);
    }
  });
  it('requires exact text, model, streaming, and non-persistent request structure', () => {
    for (const body of [null, [], 'text', {}, { ...request(), model: 'gpt-other' }, { ...request(), stream: false },
      { ...request(), store: true }, { ...request(), tool_choice: 'required' }, { ...request(), previous_response_id: 'old' },
      { ...request(), input: [] }, { ...request(), input: [user(), user()] },
      { ...request(), input: [{ ...user(), content: [{ type: 'input_text', text: `${P5_PROMPT}\nextra` }] }] },
      { ...request(), input: [{ ...user(), content: [{ type: 'input_text', text: P5_PROMPT }, { type: 'input_text', text: '' }] }] },
      { ...request(), input: [{ ...user(), role: 'assistant' }] }, { ...request(), text: { format: { type: 'json_schema' } } }]) {
      expect(valid(body)).toBe(false);
    }
  });
  it.each(['function_call', 'function_call_output', 'custom_tool_call', 'custom_tool_call_output', 'reasoning', 'computer_call', 'agent_message'])
  ('rejects unsafe input item %s', type => expect(valid({ ...request(), input: [{ type }, user()] })).toBe(false));
  it.each(['input_image', 'input_audio', 'output_text', 'function_call'])('rejects content part %s', type => {
    expect(valid({ ...request(), input: [{ ...user(), content: [{ type, text: P5_PROMPT }] }] })).toBe(false);
  });
  it('rejects invalid UTF-8, BOM, non-JSON, trailing data, duplicate keys and escaped duplicate keys', () => {
    const json = JSON.stringify(request());
    for (const buffer of [Buffer.from([0xc3, 0x28]), Buffer.from(`\ufeff${json}`), Buffer.from(`${json}false`),
      Buffer.from(json.replace('"stream":true', '"stream":false,"stream":true')),
      Buffer.from(json.replace('"model":', '"\\u006dodel":"other","model":')), Buffer.from('{broken}'), Buffer.alloc(0)]) {
      expect(validateSyntheticRequest('POST', '/v1/responses', headers(), buffer)).toBe(false);
    }
    expect(validateSyntheticRequest('POST', '/v1/responses', headers(), new Uint8Array(bytes(request())))).toBe(false);
  });
  it('bounds raw bytes, depth, nodes, strings, arrays and control characters', () => {
    const json = JSON.stringify(request());
    expect(validateSyntheticRequest('POST', '/v1/responses', headers(), Buffer.from(json.padEnd(128 * 1024)))).toBe(true);
    expect(validateSyntheticRequest('POST', '/v1/responses', headers(), Buffer.from(json.padEnd(128 * 1024 + 1)))).toBe(false);
    expect(valid({ ...request(), instructions: 'x'.repeat(65537) })).toBe(false);
    expect(valid({ ...request(), instructions: 'bad\u0000text' })).toBe(false);
    const deep = `${'['.repeat(17)}0${']'.repeat(17)}`;
    expect(validateSyntheticRequest('POST', '/v1/responses', headers(), Buffer.from(deep))).toBe(false);
    expect(valid({ ...request(), tools: Array.from({ length: 65 }, () => ({})) })).toBe(false);
    const fn = { type: 'function', name: 'fixed', description: '', strict: false,
      parameters: { type: 'object', enum: Array.from({ length: 8192 }, () => 0) } };
    expect(valid({ ...request(), tools: [fn] })).toBe(false);
  });
  it('rejects credential fields and prototype-sensitive keys at every depth', () => {
    for (const key of ['authorization', 'api_key', 'access_token', 'credentials', '__proto__', 'constructor']) {
      const body = request(); body.client_metadata = JSON.parse(`{"${key}":"synthetic"}`);
      expect(valid(body)).toBe(false);
    }
  });
});
