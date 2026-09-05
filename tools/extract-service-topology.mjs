#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { posix } from "node:path";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 64;
const ID_PATTERN = /^(service|interface):[a-z0-9][a-z0-9.-]*$/;

function fail(message) {
  throw new Error(`service topology extraction failed: ${message}`);
}

function parseArgs(argv) {
  const result = { sources: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || value === undefined) fail("arguments must be option/value pairs");
    if (option === "--source") result.sources.push(value);
    else if (option === "--manifest") result.manifest = value;
    else if (option === "--owning-target") result.owningTarget = value;
    else if (option === "--out") result.out = value;
    else fail(`unknown option ${option}`);
  }
  if (!result.manifest || !result.owningTarget || !result.out) fail("manifest, owning target, and output are required");
  if (result.sources.length === 0 || result.sources.length > MAX_SOURCES) fail("source count is outside the allowed range");
  return result;
}

function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} keys must be exactly ${expected.join(", ")}`);
  }
}

function text(value, label, pattern) {
  if (typeof value !== "string" || value.length === 0 || value.length > 160 || (pattern && !pattern.test(value))) {
    fail(`${label} is invalid`);
  }
  return value;
}

function parseInterface(value, required) {
  const item = object(value, "interface");
  const keys = ["id", "name", "requestType", "responseType", ...(required ? ["serviceId"] : [])];
  exactKeys(item, keys, "interface");
  const parsed = {
    id: text(item.id, "interface id", ID_PATTERN),
    name: text(item.name, "interface name"),
    requestType: text(item.requestType, "request type", /^[A-Za-z][A-Za-z0-9_.]*$/),
    responseType: text(item.responseType, "response type", /^[A-Za-z][A-Za-z0-9_.]*$/),
  };
  return required ? { ...parsed, serviceId: text(item.serviceId, "required service id", /^service:[a-z0-9][a-z0-9.-]*$/) } : parsed;
}

function parseManifest(input) {
  const root = object(input, "manifest");
  exactKeys(root, ["schemaVersion", "service", "providedInterfaces", "requiredInterfaces"], "manifest");
  if (root.schemaVersion !== 1) fail("schemaVersion must be 1");
  const service = object(root.service, "service");
  exactKeys(service, ["id", "displayName"], "service");
  if (!Array.isArray(root.providedInterfaces) || root.providedInterfaces.length === 0 || root.providedInterfaces.length > 32) {
    fail("providedInterfaces must contain 1 through 32 entries");
  }
  if (!Array.isArray(root.requiredInterfaces) || root.requiredInterfaces.length > 32) fail("requiredInterfaces must contain at most 32 entries");
  const parsed = {
    schemaVersion: 1,
    service: {
      id: text(service.id, "service id", /^service:[a-z0-9][a-z0-9.-]*$/),
      displayName: text(service.displayName, "service display name"),
    },
    providedInterfaces: root.providedInterfaces.map((item) => parseInterface(item, false)),
    requiredInterfaces: root.requiredInterfaces.map((item) => parseInterface(item, true)),
  };
  const ids = [parsed.service.id, ...parsed.providedInterfaces.map((item) => item.id), ...parsed.requiredInterfaces.map((item) => item.id)];
  if (new Set(ids).size !== ids.length) fail("service and interface ids must be unique");
  return parsed;
}

function parseSource(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) fail("source must be logical-path=exec-path");
  const logicalPath = value.slice(0, separator);
  const execPath = value.slice(separator + 1);
  if (logicalPath.startsWith("/") || logicalPath.includes("\\") || posix.normalize(logicalPath) !== logicalPath || logicalPath.split("/").includes("..")) {
    fail(`source path escapes or is not canonical: ${logicalPath}`);
  }
  if (!logicalPath.startsWith("examples/checkout-world/services/fraudcheck/")) fail(`source is outside the service package: ${logicalPath}`);
  return { logicalPath, execPath };
}

const args = parseArgs(process.argv.slice(2));
const manifestBytes = await readFile(args.manifest);
if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) fail("manifest is oversized");
let manifestInput;
try {
  manifestInput = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
} catch {
  fail("manifest must be valid UTF-8 JSON");
}
const manifest = parseManifest(manifestInput);
const sources = args.sources.map(parseSource).sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
if (new Set(sources.map((source) => source.logicalPath)).size !== sources.length) fail("source paths must be unique");

const digest = createHash("sha256");
digest.update(JSON.stringify(manifest));
let totalBytes = 0;
for (const source of sources) {
  const bytes = await readFile(source.execPath);
  totalBytes += bytes.byteLength;
  if (bytes.byteLength > MAX_SOURCE_BYTES || totalBytes > MAX_TOTAL_SOURCE_BYTES) fail("source inputs are oversized");
  digest.update("\0");
  digest.update(source.logicalPath);
  digest.update("\0");
  digest.update(bytes);
}

const artifact = {
  schemaVersion: 1,
  service: manifest.service,
  providedInterfaces: [...manifest.providedInterfaces].sort((left, right) => left.id.localeCompare(right.id)),
  requiredInterfaces: [...manifest.requiredInterfaces].sort((left, right) => left.id.localeCompare(right.id)),
  owningTarget: args.owningTarget,
  implementationPaths: sources.map((source) => source.logicalPath),
  inputDigest: digest.digest("hex"),
};
await writeFile(args.out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
