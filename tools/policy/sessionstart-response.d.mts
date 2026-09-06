export const P5_PROMPT: 'Synthetic policy SessionStart probe.';
export const P5_TEXT: 'POLICY_P5_TEXT_ONLY';
export const P5_PORT: 43129;
export const P5_PROVIDER: 'policy_p5_text_once';
export const P5_MODEL: 'gpt-5.2';
export const P5_SSE: string;
export class P5RequestError extends Error { readonly code: 'P5_SYNTHETIC_REQUEST_INVALID'; }
export function validateSyntheticRequest(method: unknown, path: unknown, headers: unknown, bodyBuffer: unknown): true;
