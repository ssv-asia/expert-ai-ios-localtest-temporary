/** Small, deterministic patch engine for archive documents.
 * The model proposes operations; the app validates and applies them locally.
 * It never gets permission to silently replace a document. */
export type DocumentEditOperation =
  | { type: 'replace' | 'delete'; find: string; replace?: string }
  | { type: 'insert_before' | 'insert_after'; find: string; content: string }
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
    if (!operations.every((op: any) => op && typeof op.type === 'string' && ['replace', 'delete', 'insert_before', 'insert_after', 'append'].includes(op.type))) return null;
    return { operations, summary: typeof parsed.summary === 'string' ? parsed.summary : undefined };
  } catch {
    return null;
  }
}

export function applyDocumentEditPlan(original: string, plan: DocumentEditPlan): { content: string; applied: number } | null {
  let content = original;
  for (const op of plan.operations) {
    if (op.type === 'append') {
      content += op.content;
      continue;
    }
    if (!op.find || typeof op.find !== 'string') return null;
    const first = content.indexOf(op.find);
    if (first < 0 || content.indexOf(op.find, first + op.find.length) >= 0) return null;
    const replacement = op.type === 'delete' ? '' : op.type === 'replace' ? (op.replace ?? '') : (op as { content: string }).content;
    const at = op.type === 'insert_after' ? first + op.find.length : first;
    content = content.slice(0, at) + (op.type === 'insert_before' || op.type === 'insert_after' ? replacement : replacement) + content.slice(op.type === 'replace' || op.type === 'delete' ? first + op.find.length : at);
  }
  return { content, applied: plan.operations.length };
}

export function patchBlockForReply(reply: string, summary: string): string {
  const match = reply.match(/```(?:patchjson|document-patch)\s*\r?\n[\s\S]*?\r?\n```/i);
  return match ? reply.replace(match[0], `📄 ${summary} — review the targeted changes above, then tap Commit to save them to GitHub.`).trim() : reply;
}
