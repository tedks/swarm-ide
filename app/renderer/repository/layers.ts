import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { TopologyNodeData } from "../graph-adapter";

export interface BuildLinkSnapshot {
  repositoryId: string;
  revision: string;
  capturedAt: string;
  command: string;
  /** Bazel label plus path: rule targets map to their package, sources to their file. */
  links: Array<{ from: string; to: string; fromPath: string; toPath: string }>;
}

/** Map endpoints only to observed nodes. Prefix boundaries must match exactly. */
function visibleOwner(path: string, nodes: Array<Node<TopologyNodeData>>) {
  return nodes.filter((node) => !node.data.unavailable && (node.data.kind === "directory"
    ? (node.data.focus.path ?? "") === "" || path === node.data.focus.path || path.startsWith(`${node.data.focus.path}/`)
    : path === node.data.focus.path))
    .sort((a, b) => (b.data.focus.path?.length ?? 0) - (a.data.focus.path?.length ?? 0))[0];
}

export function directoryBuildLinks(nodes: Array<Node<TopologyNodeData>>, snapshot: BuildLinkSnapshot): Array<Edge<{ labels: string[]; revision: string }>> {
  const grouped = new Map<string, { source: string; target: string; labels: string[] }>();
  for (const link of snapshot.links) {
    const from = visibleOwner(link.fromPath, nodes), to = visibleOwner(link.toPath, nodes);
    if (!from || !to || from.id === to.id) continue;
    const key = JSON.stringify([from.id, to.id]);
    const group = grouped.get(key) ?? { source: from.id, target: to.id, labels: [] };
    group.labels.push(`${link.from} → ${link.to}`); grouped.set(key, group);
  }
  return [...grouped.entries()].map(([key, group]) => ({
    id: `build-snapshot:${key}`, source: group.source, target: group.target,
    type: "smoothstep", sourceHandle: "build-out", targetHandle: "build-in",
    label: `${group.labels.length} build ${group.labels.length === 1 ? "link" : "links"}`,
    data: { labels: group.labels, revision: snapshot.revision },
    ariaLabel: `Bazel snapshot dependency: ${group.labels.join("; ")}`,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#bea273" },
    style: { stroke: "#bea273", strokeWidth: 1.5, strokeDasharray: "6 4" },
    labelStyle: { fill: "#e3caa2", fontSize: 9 }, labelBgStyle: { fill: "#172019", fillOpacity: .95 },
    interactionWidth: 20, zIndex: 1, focusable: true, selectable: true,
  }));
}

export function withMockDirectoryAgents(nodes: Array<Node<TopologyNodeData>>) {
  return nodes.map((node) => {
    if (!["directory", "service", "component", "interface"].includes(node.data.kind) || node.data.unavailable) return node;
    const hash = [...(node.data.focus.path ?? "root")].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
    return { ...node, data: { ...node.data, mockAgents: 1 + hash % 3 } };
  });
}
