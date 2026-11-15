/** Small, deterministic patch engine for archive documents.
 * The model proposes operations; the app validates and applies them locally.
 * It never gets permission to silently replace a document. */
export type DocumentEditOperation =
  | { type: 'replace'; find: string; replace: string }
  | { type: 'delete'; find: string }
  | { type: 'insert_before'; find: string; content: string }
  | { type: 'insert_after'; find: string; content: string }
  | { type: 'append'; content: string };

export interface DocumentEditPlan {
  operations: DocumentEditOperation[];
  summary?: string;
}

export function parseDocumentEditPlan(reply: string): DocumentEditPlan | null {
  const match = reply.match(/```(?:patchjson|document-patch)\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const operations = Array.isArray(parsed) ? parsed : parsed?.operations;
    if (!Array.isArray(operations) || operations.length === 0) return null;
    const validOperations = operations.every((op: unknown): op is DocumentEditOperation => {
      if (!op || typeof op !== 'object' || Array.isArray(op)) return false;
      const candidate = op as Record<string, unknown>;
      switch (candidate.type) {
        case 'replace':
          return typeof candidate.find === 'string' && candidate.find.length > 0 && typeof candidate.replace === 'string';
        case 'delete':
          return typeof candidate.find === 'string' && candidate.find.length > 0;
        case 'insert_before':
        case 'insert_after':
          return typeof candidate.find === 'string' && candidate.find.length > 0 && typeof candidate.content === 'string';
        case 'append':
          return typeof candidate.content === 'string';
        default:
          return false;
      }
    });
    if (!validOperations) return null;
    return { operations, summary: typeof parsed.summary === 'string' ? parsed.summary : undefined };
  } catch {
    return null;
  }
}

export function applyDocumentEditPlan(original: string, plan: DocumentEditPlan): { content: string; applied: number } | null {
  const anchored: { op: DocumentEditOperation; order: number; at: number; end: number }[] = [];
  for (const [order, op] of plan.operations.entries()) {
    if (op.type === 'append') {
      anchored.push({ op, order, at: original.length, end: original.length });
      continue;
    }
    if (!op.find) return null;
    const at = original.indexOf(op.find);
    if (at < 0 || original.indexOf(op.find, at + op.find.length) >= 0) return null;
    anchored.push({ op, order, at, end: at + op.find.length });
  }

  const edits = anchored.map((item) => {
    const { op, order, at, end } = item;
    if (op.type === 'append') return { at, end, content: op.content, order };
    if (op.type === 'replace') return { at, end, content: op.replace, order };
    if (op.type === 'delete') return { at, end, content: '', order };
    return { at: op.type === 'insert_after' ? end : at, end: op.type === 'insert_after' ? end : at, content: op.content, order };
  }).sort((a, b) => b.at - a.at || b.order - a.order);

  for (let leftIndex = 0; leftIndex < edits.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < edits.length; rightIndex += 1) {
      const left = edits[leftIndex];
      const right = edits[rightIndex];
      const rangesOverlap = left.at < right.end && right.at < left.end;
      const sameInsertionPoint = left.at === left.end && right.at === right.end && left.at === right.at;
      if (rangesOverlap || sameInsertionPoint) return null;
    }
  }

  let content = original;
  for (const edit of edits) {
    content = content.slice(0, edit.at) + edit.content + content.slice(edit.end);
  }
  return { content, applied: plan.operations.length };
}

export function patchBlockForReply(reply: string, summary: string): string {
  const match = reply.match(/```(?:patchjson|document-patch)\s*\r?\n[\s\S]*?\r?\n```/i);
  return match ? reply.replace(match[0], `📄 ${summary} — review the targeted changes above, then tap Commit to save them to GitHub.`).trim() : reply;
}
