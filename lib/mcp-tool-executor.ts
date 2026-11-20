import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

import { resilientFetch, friendlyNetworkError } from './gateway-client';

let nextRequestSequence = 0;

export type McpToolPermission = 'read-only' | 'write-to-document' | 'external-action';

const READ_ONLY_TOOLS = new Set([
  'web_search', 'get_headlines', 'wikipedia_lookup', 'get_weather',
  'currency_convert', 'calculator', 'current_time', 'unit_convert',
  'dictionary_lookup', 'arxiv_search', 'public_holidays', 'get_local_context',
  'aec', 'aec_folders', 'aec_balance', 'generate_qr_code',
  'text_statistics', 'citation_lookup', 'github_search', 'ssv',
]);

/** Conservative default: unknown tools are consequential until explicitly
 * classified by the client. This keeps adding a gateway tool from silently
 * granting it permission to mutate data or act externally. */
export function getMcpToolPermission(name: string): McpToolPermission {
  if (READ_ONLY_TOOLS.has(name)) return 'read-only';
  if (/document|note|file|draft|edit|write|save|delete|patch|commit/i.test(name)) return 'write-to-document';
  return 'external-action';
}

export function isMcpToolApprovalRequired(name: string): boolean {
  return getMcpToolPermission(name) !== 'read-only';
}

// The gateway already injects MCP tool schemas server-side into every chat completion
// for the "unlimited" router (see mcpToolsFor() in the worker) — the client never needs
// to fetch or declare tool schemas itself. When the model decides to call one, the SSE
// stream carries `delta.tool_calls` fragments; once accumulated, execute here.
//
// Tool execution goes through the SAME JSON-RPC `/mcp` endpoint used by AECKnowledgeService,
// authenticated with the user's normal chat session token (not a separate AEC mpcLink) —
// mcpToken() on the worker accepts a standard `Authorization: Bearer` header.
export async function executeMcpToolOnGateway(
  name: string,
  args: Record<string, any>,
  token: string,
  signal?: AbortSignal,
  approved = false,
): Promise<any> {
  // Keep the gate here so new Gateway tools cannot bypass consent; only tools
  // explicitly classified as read-only skip user approval.
  if (isMcpToolApprovalRequired(name) && !approved) {
    return { error: true, code: 'approval_required', message: `Approval is required before using ${name}.` };
  }
  try {
    const res = await resilientFetch(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          // Date.now() alone can collide when parallel tool calls start in the
          // same millisecond. JSON-RPC IDs only need request-local uniqueness;
          // a bounded process sequence is sufficient and dependency-free.
          id: `${Date.now()}-${++nextRequestSequence}`,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      },
      { attemptTimeoutMs: 20000, retries: 2, signal },
    );
    const data = await res.json().catch(() => ({}));
    if (data.error) {
      return { error: true, message: data.error.message || `Tool ${name} failed` };
    }
    const result = data.result ?? data;
    // MCP can report a tool failure in a successful JSON-RPC envelope. Convert
    // that shape to the app's normal error result on iOS so the assistant and
    // inline tool status never describe a failed operation as successful.
    if (Platform.OS === 'ios' && result && typeof result === 'object' && result.isError === true) {
      const contentMessage = Array.isArray(result.content)
        ? result.content
            .filter((item: unknown) => item && typeof item === 'object' && 'text' in item && typeof item.text === 'string')
            .map((item: { text: string }) => item.text)
            .join('\n')
        : '';
      const message = typeof result.message === 'string'
        ? result.message
        : contentMessage || `Tool ${name} reported that it could not complete.`;
      return { ...result, error: true, code: 'tool_execution_failed', message };
    }
    return result;
  } catch (err) {
    console.error(`[MCP] Execution failed for ${name}:`, err);
    try {
      Sentry.captureException(err, { tags: { area: 'mcp-tool' }, extra: { tool: name } });
    } catch {
      /* reporting must never throw */
    }
    return { error: true, message: friendlyNetworkError(err) };
  }
}
