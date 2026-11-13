import type { ToolCallInfo } from "../../types";

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"');
}

function extractJsonStringValue(raw: string, key: string): string | undefined {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
  const match = keyPattern.exec(raw);
  if (!match) return undefined;
  let start = match.index + match[0].length;
  let result = "";
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (escaped) {
      result += "\\" + ch;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      return unescapeJsonString(result);
    } else {
      result += ch;
    }
  }
  return unescapeJsonString(result);
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const partial: Record<string, unknown> = {};
    const path = extractJsonStringValue(raw, "path");
    if (path !== undefined) partial.path = path;
    const command = extractJsonStringValue(raw, "command");
    if (command !== undefined) partial.command = command;
    const content = extractJsonStringValue(raw, "content");
    if (content !== undefined) partial.content = content;
    const oldText = extractJsonStringValue(raw, "oldText");
    if (oldText !== undefined) partial.oldText = oldText;
    const newText = extractJsonStringValue(raw, "newText");
    if (newText !== undefined) partial.newText = newText;
    const query = extractJsonStringValue(raw, "query");
    if (query !== undefined) partial.query = query;
    const url = extractJsonStringValue(raw, "url");
    if (url !== undefined) partial.url = url;
    const agent = extractJsonStringValue(raw, "agent");
    if (agent !== undefined) partial.agent = agent;
    const task = extractJsonStringValue(raw, "task");
    if (task !== undefined) partial.task = task;
    return partial;
  }
}

export function isToolActive(tc: ToolCallInfo): boolean {
  return tc.status === "streaming" || tc.status === "pending" || tc.status === "running";
}

export function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

export function truncateOutput(text: string, maxLines = 50): { text: string; truncated: boolean } {
  if (!text) return { text: "", truncated: false };
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

export function toolDisplayName(name: string): string {
  switch (name) {
    case "bash": return "Terminal";
    case "read": return "Read";
    case "write": return "Write";
    case "edit": return "Edit";
    case "search": return "Search";
    case "scrape": return "Scrape";
    case "crawl": return "Crawl";
    case "subagent": return "Agent";
    case "questionnaire": return "Question";
    case "download": return "Download";
    default: return name;
  }
}
