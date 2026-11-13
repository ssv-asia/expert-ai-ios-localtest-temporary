// Shared shape for an infinite-canvas board (Obsidian-canvas-style mind map),
// persisted as a StoredDocument of kind 'canvas' (content = JSON.stringify(CanvasBoard)).
export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

export interface CanvasBoard {
  nodes: CanvasNode[];
}

export const CANVAS_COLORS = ['#ffd60a', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#30d158'];

export function emptyCanvasBoard(): CanvasBoard {
  return { nodes: [] };
}

export function makeCanvasNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function parseCanvasBoard(content: string): CanvasBoard {
  try {
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.nodes)) return parsed as CanvasBoard;
  } catch {
    /* fall through to empty */
  }
  return emptyCanvasBoard();
}
