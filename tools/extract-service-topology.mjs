#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { posix } from "node:path";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 64;
const INTERFACE_ID_PATTERN = /^interface:[a-z0-9][a-z0-9.-]*$/;

function fail(message) {
  throw new Error(`service topology extraction failed: ${message}`);
}

function parseArgs(argv) {
  const result = { sources: [], interfaceSources: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || value === undefined) fail("arguments must be option/value pairs");
    if (option === "--source") result.sources.push(value);
    else if (option === "--interface-source") result.interfaceSources.push(value);
    else if (option === "--manifest") result.manifest = value;
    else if (option === "--owning-target") result.owningTarget = value;
    else if (option === "--out") result.out = value;
    else fail(`unknown option ${option}`);
  }
  if (!result.manifest || !result.owningTarget || !result.out) fail("manifest, owning target, and output are required");
  if (result.sources.length === 0 || result.sources.length > MAX_SOURCES) fail("source count is outside the allowed range");
  if (result.interfaceSources.length === 0 || result.interfaceSources.length > 64) fail("interface source count is outside the allowed range");
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

function serviceIdForName(name) {
  return `service:${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function parseInterface(value, required) {
  const item = object(value, "interface");
  const keys = ["id", "name", "requestType", "responseType", ...(required ? ["serviceId"] : [])];
  exactKeys(item, keys, "interface");
  const parsed = {
    id: text(item.id, "interface id", INTERFACE_ID_PATTERN),
    name: text(item.name, "interface name", required ? /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/ : /^[A-Za-z][A-Za-z0-9]*$/),
    requestType: text(item.requestType, "request type", /^[A-Za-z][A-Za-z0-9_.]*$/),
    responseType: text(item.responseType, "response type", /^[A-Za-z][A-Za-z0-9_.]*$/),
  };
  if (!required) return parsed;
  const serviceId = text(item.serviceId, "required service id", /^service:[a-z0-9][a-z0-9.-]*$/);
  const serviceName = parsed.name.slice(0, parsed.name.indexOf("."));
  if (serviceId !== serviceIdForName(serviceName)) fail("required interface name and serviceId disagree");
  return { ...parsed, serviceId };
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

function parseSource(value, servicePackageOnly = true) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) fail("source must be logical-path=exec-path");
  const logicalPath = value.slice(0, separator);
  const execPath = value.slice(separator + 1);
  if (logicalPath.startsWith("/") || logicalPath.includes("\\") || posix.normalize(logicalPath) !== logicalPath || logicalPath.split("/").includes("..")) {
    fail(`source path escapes or is not canonical: ${logicalPath}`);
  }
  const allowedPrefix = servicePackageOnly ? "examples/checkout-world/services/fraudcheck/" : "examples/checkout-world/services/";
  if (!logicalPath.startsWith(allowedPrefix)) fail(`source is outside the allowed package: ${logicalPath}`);
  return { logicalPath, execPath };
}

function parseInterfaceSource(value) {
  const firstSeparator = value.indexOf("=");
  const secondSeparator = value.indexOf("=", firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1 || secondSeparator === value.length - 1) fail("interface source must be interface-id=logical-path=exec-path");
  const interfaceId = value.slice(0, firstSeparator);
  if (!/^interface:[a-z0-9][a-z0-9.-]*$/.test(interfaceId)) fail(`invalid interface source id: ${interfaceId}`);
  const source = parseSource(value.slice(firstSeparator + 1), false);
  return { interfaceId, ...source };
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalProtoType(type, packageName) {
  const withoutRoot = type.startsWith(".") ? type.slice(1) : type;
  return withoutRoot.includes(".") ? withoutRoot : `${packageName}.${withoutRoot}`;
}

function assertProtoContract(bytes, source, contract, serviceName, methodName) {
  if (!source.logicalPath.endsWith(".proto")) fail(`interface source is not a .proto file: ${source.logicalPath}`);
  let proto;
  try {
    proto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`interface source is not valid UTF-8: ${source.logicalPath}`);
  }
  const syntax = proto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n\r]*/g, "");
  const packageName = syntax.match(/(?:^|[\r\n])\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/)?.[1];
  if (!packageName) fail(`interface source has no protobuf package: ${source.logicalPath}`);
  const serviceBody = syntax.match(new RegExp(`\\bservice\\s+${regexEscape(serviceName)}\\s*\\{([\\s\\S]*?)\\}`))?.[1];
  if (!serviceBody) fail(`protobuf service ${serviceName} is missing from ${source.logicalPath}`);
  const rpc = serviceBody.match(new RegExp(`\\brpc\\s+${regexEscape(methodName)}\\s*\\(\\s*([.]?[A-Za-z_][A-Za-z0-9_.]*)\\s*\\)\\s*returns\\s*\\(\\s*([.]?[A-Za-z_][A-Za-z0-9_.]*)\\s*\\)`));
  if (!rpc) fail(`protobuf RPC ${serviceName}.${methodName} is missing from ${source.logicalPath}`);
  if (canonicalProtoType(rpc[1], packageName) !== contract.requestType || canonicalProtoType(rpc[2], packageName) !== contract.responseType) {
    fail(`protobuf RPC ${serviceName}.${methodName} types disagree with the manifest`);
  }
  for (const type of [contract.requestType, contract.responseType]) {
    const prefix = `${packageName}.`;
    if (!type.startsWith(prefix)) fail(`protobuf message ${type} is not declared in ${source.logicalPath}`);
    const messageName = type.slice(prefix.length);
    if (messageName.includes(".") || !new RegExp(`\\bmessage\\s+${regexEscape(messageName)}\\s*\\{`).test(syntax)) {
      fail(`protobuf message ${type} is missing from ${source.logicalPath}`);
    }
  }
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
const interfaceSources = args.interfaceSources.map(parseInterfaceSource).sort((left, right) => left.interfaceId.localeCompare(right.interfaceId));
const declaredInterfaceIds = [...manifest.providedInterfaces, ...manifest.requiredInterfaces].map((item) => item.id).sort();
if (interfaceSources.length !== declaredInterfaceIds.length || interfaceSources.some((source, index) => source.interfaceId !== declaredInterfaceIds[index])) {
  fail("every declared interface must have exactly one Bazel-declared source");
}
if (new Set(interfaceSources.map((source) => source.interfaceId)).size !== interfaceSources.length) fail("interface source ids must be unique");

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
for (const source of interfaceSources) {
  const bytes = await readFile(source.execPath);
  totalBytes += bytes.byteLength;
  if (bytes.byteLength > MAX_SOURCE_BYTES || totalBytes > MAX_TOTAL_SOURCE_BYTES) fail("interface source inputs are oversized");
  const provided = manifest.providedInterfaces.find((item) => item.id === source.interfaceId);
  const required = manifest.requiredInterfaces.find((item) => item.id === source.interfaceId);
  const contract = provided ?? required;
  if (!contract) fail(`interface source has no manifest declaration: ${source.interfaceId}`);
  const serviceName = provided ? manifest.service.displayName : required.name.slice(0, required.name.indexOf("."));
  const methodName = provided ? provided.name : required.name.slice(required.name.indexOf(".") + 1);
  assertProtoContract(bytes, source, contract, serviceName, methodName);
  digest.update("\0interface\0");
  digest.update(source.interfaceId);
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
  interfaceDeclarationPaths: interfaceSources.map(({ interfaceId, logicalPath }) => ({ interfaceId, path: logicalPath })),
  inputDigest: digest.digest("hex"),
};
await writeFile(args.out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
