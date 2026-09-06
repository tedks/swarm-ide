/** Fixed worker program: data never becomes source code. Keep parsing off the
 * core thread so its owner can enforce the observation deadline even inside
 * the YAML library. This is a source string so Vitest and compiled CommonJS use
 * exactly the same program without a build-order-dependent worker artifact. */
export const METADATA_WORKER_SOURCE = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const yaml = require(workerData.yamlPath);
const invalidUnicode = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
function fail(code) { throw { taskCode: code }; }
function malformed() { fail("TASK_METADATA_MALFORMED"); }
function limited() { fail("TASK_LIMIT_EXCEEDED"); }
function parse(bytes) {
  if (bytes.byteLength > workerData.limits.blobBytes) limited();
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { malformed(); }
  const docs = yaml.parseAllDocuments(source, { version: "1.2", schema: "core",
    uniqueKeys: true, strict: true, merge: false, prettyErrors: false });
  if (docs.length !== 1 || docs[0].errors.length || docs[0].warnings.length) malformed();
  const doc = docs[0];
  let nodes = 0;
  const stack = [{ node: doc.contents, depth: 1 }];
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (++nodes > workerData.limits.nodes || depth > workerData.limits.depth) limited();
    if (node === null) continue;
    if (node.tag || yaml.isAlias(node)) malformed();
    if (yaml.isScalar(node)) {
      const value = node.value;
      if (value !== null && !["string", "number", "boolean"].includes(typeof value)) malformed();
      if (typeof value === "number" && !Number.isFinite(value)) malformed();
      if (typeof value === "string" && invalidUnicode.test(value)) malformed();
    } else if (yaml.isMap(node)) {
      const keys = new Set();
      for (const pair of node.items) {
        if (++nodes > workerData.limits.nodes) limited();
        if (!yaml.isScalar(pair.key) || typeof pair.key.value !== "string") malformed();
        const key = pair.key.value;
        if (["__proto__", "prototype", "constructor", "<<"].includes(key) || keys.has(key)) malformed();
        keys.add(key);
        stack.push({ node: pair.key, depth: depth + 1 }, { node: pair.value, depth: depth + 1 });
      }
    } else if (yaml.isSeq(node)) {
      for (const item of node.items) stack.push({ node: item, depth: depth + 1 });
    } else malformed();
  }
  // Every node has been checked before conversion, including ignored fields.
  function value(node) {
    if (node === null) return null;
    if (yaml.isScalar(node)) return node.value;
    if (yaml.isSeq(node)) return node.items.map(value);
    const out = Object.create(null);
    for (const pair of node.items) out[pair.key.value] = value(pair.value);
    return out;
  }
  return value(doc.contents);
}
try {
  parentPort.postMessage({ ok: true, documents: workerData.documents.map(parse) });
} catch (error) {
  parentPort.postMessage({ ok: false, code: error && error.taskCode ||
    (error instanceof RangeError ? "TASK_LIMIT_EXCEEDED" : "TASK_METADATA_MALFORMED") });
}
parentPort.close();
`;
