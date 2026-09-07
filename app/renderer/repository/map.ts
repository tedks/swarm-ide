import type { Node, Viewport } from "@xyflow/react";
import type { TopologyNodeData } from "../graph-adapter";
import { parentDirectory } from "./navigation";

export const DIRECTORY_TILE = { width: 156, height: 58, gap: 16, padding: 20, heading: 42 };

/** Containment is spatial, never a line that could be mistaken for a dependency. */
export function directoryMap(nodes: Array<Node<TopologyNodeData>>, directory: string): Array<Node<TopologyNodeData>> {
  const parent = nodes.find((node) => node.data.focus.key === `dir:${directory}`);
  const children = nodes.filter((node) => node !== parent);
  const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(children.length))));
  const rows = Math.max(1, Math.ceil(children.length / columns));
  const { width, height, gap, padding, heading } = DIRECTORY_TILE;
  const frame = parent ? [{ ...parent, position: { x: 0, y: 0 },
    style: { width: columns * (width + gap) - gap + padding * 2, height: rows * (height + gap) - gap + padding * 2 + heading },
    data: { ...parent.data, directoryContainer: true }, zIndex: -1,
  }] : [];
  return [...frame, ...children.map((node, index) => ({ ...node,
    ...(parent ? { parentId: parent.id, extent: "parent" as const } : {}),
    position: { x: padding + (index % columns) * (width + gap), y: padding + heading + Math.floor(index / columns) * (height + gap) },
    style: { width, height },
  }))];
}

/** A wheel/pinch gesture can change one level. Pans and programmatic fits cannot. */
export function directoryZoomDestination({ directory, nodes, startZoom, viewport, baselineZoom, point }: {
  directory: string; nodes: Array<Node<TopologyNodeData>>; startZoom: number; viewport: Viewport;
  baselineZoom: number; point: { x: number; y: number };
}): string | null {
  if (viewport.zoom < startZoom && directory && viewport.zoom < baselineZoom * .65) return parentDirectory(directory);
  if (viewport.zoom <= startZoom || DIRECTORY_TILE.width * viewport.zoom < 210) return null;
  const tile = nodes.find((node) => !node.data.directoryContainer && node.data.kind === "directory" && !node.data.unavailable &&
    point.x >= node.position.x && point.x <= node.position.x + DIRECTORY_TILE.width &&
    point.y >= node.position.y && point.y <= node.position.y + DIRECTORY_TILE.height);
  return tile?.data.focus.path ?? null;
}
