#!/usr/bin/env node

import { createHash } from "node:crypto";
import { open, writeFile } from "node:fs/promises";
import { posix } from "node:path";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 64;
const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const INTERFACE_ID_PATTERN = /^interface:[a-z0-9][a-z0-9.-]*$/;

function fail(message) {
  throw new Error(`service topology extraction failed: ${message}`);
}

function parseArgs(argv) {
  const result = { sources: [], interfaceDescriptors: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || value === undefined) fail("arguments must be option/value pairs");
    if (option === "--source") result.sources.push(value);
    else if (option === "--interface-descriptor") result.interfaceDescriptors.push(value);
    else if (option === "--manifest") result.manifest = value;
    else if (option === "--owning-target") result.owningTarget = value;
    else if (option === "--out") result.out = value;
    else fail(`unknown option ${option}`);
  }
  if (!result.manifest || !result.owningTarget || !result.out) fail("manifest, owning target, and output are required");
  if (result.sources.length === 0 || result.sources.length > MAX_SOURCES) fail("source count is outside the allowed range");
  if (result.interfaceDescriptors.length === 0 || result.interfaceDescriptors.length > 64) fail("interface descriptor count is outside the allowed range");
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

function parseInterfaceDescriptor(value) {
  const firstSeparator = value.indexOf("=");
  const secondSeparator = value.indexOf("=", firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1 || secondSeparator === value.length - 1) fail("interface descriptor must be interface-id=logical-path=exec-path");
  const interfaceId = value.slice(0, firstSeparator);
  if (!/^interface:[a-z0-9][a-z0-9.-]*$/.test(interfaceId)) fail(`invalid interface descriptor id: ${interfaceId}`);
  const source = parseSource(value.slice(firstSeparator + 1), false);
  return { interfaceId, ...source };
}

async function readBounded(path, maximumBytes, label) {
  // Bazel intentionally materializes declared sandbox inputs as symlinks. The
  // action can see only those declared inputs, so descriptor reads are bounded
  // here while workspace containment remains the privileged core's concern.
  const handle = await open(path, "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes)) fail(`${label} is oversized or not a regular file`);
    const chunks = [];
    let offset = 0;
    while (offset <= maximumBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, offset);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (offset > maximumBytes) fail(`${label} is oversized`);
    const after = await handle.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) fail(`${label} changed while it was read`);
    return Buffer.concat(chunks, offset);
  } finally {
    await handle.close();
  }
}

function readVarint(bytes, cursor) {
  let value = 0n;
  let shift = 0n;
  for (let count = 0; count < 10; count += 1) {
    if (cursor >= bytes.length) fail("protobuf descriptor contains a truncated varint");
    const byte = bytes[cursor];
    cursor += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("protobuf descriptor varint is too large");
      return { value: Number(value), cursor };
    }
    shift += 7n;
  }
  fail("protobuf descriptor contains an invalid varint");
}

function protobufFields(bytes) {
  const fields = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const tag = readVarint(bytes, cursor);
    cursor = tag.cursor;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value & 7;
    if (field === 0) fail("protobuf descriptor contains field zero");
    if (wire === 0) cursor = readVarint(bytes, cursor).cursor;
    else if (wire === 1) cursor += 8;
    else if (wire === 2) {
      const length = readVarint(bytes, cursor);
      cursor = length.cursor;
      const end = cursor + length.value;
      if (end > bytes.length) fail("protobuf descriptor contains a truncated field");
      fields.push({ field, bytes: bytes.subarray(cursor, end) });
      cursor = end;
    } else if (wire === 5) cursor += 4;
    else fail(`protobuf descriptor uses unsupported wire type ${wire}`);
    if (cursor > bytes.length) fail("protobuf descriptor contains a truncated fixed field");
  }
  return fields;
}

function descriptorText(fields, field, label) {
  const values = fields.filter((item) => item.field === field);
  if (values.length !== 1) fail(`protobuf descriptor must contain exactly one ${label}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(values[0].bytes);
  } catch {
    fail(`protobuf descriptor ${label} is not UTF-8`);
  }
}

function parseDescriptorSet(bytes, logicalPath) {
  const files = protobufFields(bytes).filter((item) => item.field === 1);
  if (files.length !== 1) fail(`descriptor for ${logicalPath} must contain exactly one source file`);
  const file = protobufFields(files[0].bytes);
  const name = descriptorText(file, 1, "file name");
  const packageName = descriptorText(file, 2, "package");
  if (name !== logicalPath) fail(`descriptor file ${name} does not match ${logicalPath}`);
  const messages = new Set(file.filter((item) => item.field === 4).map((item) => `${packageName}.${descriptorText(protobufFields(item.bytes), 1, "message name")}`));
  const services = new Map();
  for (const serviceField of file.filter((item) => item.field === 6)) {
    const service = protobufFields(serviceField.bytes);
    const serviceName = descriptorText(service, 1, "service name");
    if (services.has(serviceName)) fail(`descriptor contains duplicate service ${serviceName}`);
    const methods = new Map();
    for (const methodField of service.filter((item) => item.field === 2)) {
      const method = protobufFields(methodField.bytes);
      const methodName = descriptorText(method, 1, "method name");
      if (methods.has(methodName)) fail(`descriptor contains duplicate method ${serviceName}.${methodName}`);
      methods.set(methodName, {
        requestType: descriptorText(method, 2, "method input type").replace(/^\./, ""),
        responseType: descriptorText(method, 3, "method output type").replace(/^\./, ""),
      });
    }
    services.set(serviceName, methods);
  }
  return { messages, services };
}

function assertDescriptorContract(descriptor, source, contract, serviceName, methodName) {
  const method = descriptor.services.get(serviceName)?.get(methodName);
  if (!method) fail(`compiled protobuf RPC ${serviceName}.${methodName} is missing from ${source.logicalPath}`);
  if (method.requestType !== contract.requestType || method.responseType !== contract.responseType) fail(`compiled protobuf RPC ${serviceName}.${methodName} types disagree with the manifest`);
  if (!descriptor.messages.has(contract.requestType) || !descriptor.messages.has(contract.responseType)) fail(`compiled protobuf messages for ${serviceName}.${methodName} are missing`);
}

function framed(hash, value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

const args = parseArgs(process.argv.slice(2));
const manifestBytes = await readBounded(args.manifest, MAX_MANIFEST_BYTES, "manifest");
let manifestInput;
try {
  manifestInput = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
} catch {
  fail("manifest must be valid UTF-8 JSON");
}
const manifest = parseManifest(manifestInput);
const sources = args.sources.map(parseSource).sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
if (new Set(sources.map((source) => source.logicalPath)).size !== sources.length) fail("source paths must be unique");
const interfaceSources = args.interfaceDescriptors.map(parseInterfaceDescriptor).sort((left, right) => left.interfaceId.localeCompare(right.interfaceId));
const declaredInterfaceIds = [...manifest.providedInterfaces, ...manifest.requiredInterfaces].map((item) => item.id).sort();
if (interfaceSources.length !== declaredInterfaceIds.length || interfaceSources.some((source, index) => source.interfaceId !== declaredInterfaceIds[index])) {
  fail("every declared interface must have exactly one Bazel-declared source");
}
if (new Set(interfaceSources.map((source) => source.interfaceId)).size !== interfaceSources.length) fail("interface source ids must be unique");

const digest = createHash("sha256");
digest.update("swarm-service-topology-input-v2\0");
framed(digest, JSON.stringify(manifest));
let totalBytes = 0;
for (const source of sources) {
  const bytes = await readBounded(source.execPath, MAX_SOURCE_BYTES, `source ${source.logicalPath}`);
  totalBytes += bytes.byteLength;
  if (bytes.byteLength > MAX_SOURCE_BYTES || totalBytes > MAX_TOTAL_SOURCE_BYTES) fail("source inputs are oversized");
  framed(digest, source.logicalPath);
  framed(digest, bytes);
}
for (const source of interfaceSources) {
  const bytes = await readBounded(source.execPath, MAX_DESCRIPTOR_BYTES, `descriptor ${source.logicalPath}`);
  totalBytes += bytes.byteLength;
  if (bytes.byteLength > MAX_SOURCE_BYTES || totalBytes > MAX_TOTAL_SOURCE_BYTES) fail("interface source inputs are oversized");
  const provided = manifest.providedInterfaces.find((item) => item.id === source.interfaceId);
  const required = manifest.requiredInterfaces.find((item) => item.id === source.interfaceId);
  const contract = provided ?? required;
  if (!contract) fail(`interface source has no manifest declaration: ${source.interfaceId}`);
  const serviceName = provided ? manifest.service.displayName : required.name.slice(0, required.name.indexOf("."));
  const methodName = provided ? provided.name : required.name.slice(required.name.indexOf(".") + 1);
  assertDescriptorContract(parseDescriptorSet(bytes, source.logicalPath), source, contract, serviceName, methodName);
  framed(digest, "interface");
  framed(digest, source.interfaceId);
  framed(digest, source.logicalPath);
  framed(digest, bytes);
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
