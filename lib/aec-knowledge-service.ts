import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { GATEWAY_BASE_URL } from './gateway-client';

// AEC Knowledge integration with Cloudflare gateway
// Provides access to architecture, engineering & construction Wikipedia via MCP tools:
// - aec: Query building codes, standards, sustainability research
// - aec_balance: Check remaining credits
// - aec_folders: Browse knowledge base structure
// - ssv: Private SSV knowledge base

// Single source of truth — follows GATEWAY_HOSTS[0] in gateway-client.ts so this
// can never drift from the rest of the app when the origin changes. The personal
// MCP `link` the server returns is request-host-relative, so calling these routes
// on api.ssv.asia yields an api.ssv.asia link automatically.
const GATEWAY_URL = GATEWAY_BASE_URL;
const STORAGE_KEY_ENABLED = 'aec_knowledge_enabled';
const STORAGE_KEY_STATE = 'aec_knowledge_state';

// Logging utility
function logAEC(action: string, details: any) {
  console.log(`[AEC] ${action}:`, details);
}

export interface AECKnowledgeState {
  enabled: boolean;
  link?: string;
  freeLeft?: number; // Free queries left today (out of 10)
  credits?: number; // Prepaid queries
  activated: boolean;
  error?: string;
}

async function readFromStore(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeToStore(key: string, value: string) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    // silently fail
  }
}

export class AECKnowledgeService {
  /**
   * Initialize AEC Knowledge - check if user has access
   * Returns current state without requiring network call
   */
  static async init(): Promise<AECKnowledgeState> {
    try {
      const stored = await readFromStore(STORAGE_KEY_STATE);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Fall through to default
    }
    return {
      enabled: false,
      activated: false,
    };
  }

  /**
   * Check user's AEC Knowledge status with backend.
   * Auth is the session bearer token — the gateway derives email + Ghost uuid from its
   * signed payload, so no client-supplied identity claim is trusted here.
   */
  static async checkStatus(token: string): Promise<AECKnowledgeState> {
    try {
      if (!token) {
        throw new Error('No session token — sign in again');
      }
      const response = await fetch(`${GATEWAY_URL}/mcp/me`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`Failed to fetch status (${response.status}${body?.error ? `: ${body.error}` : ''})`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Unknown error');
      }

      // Only report "activated" when the gateway actually verified this session against the
      // Ghost member record and minted a link — a provisioned-but-unverified account (e.g. a
      // pre-migration session token issued before uuid was embedded in it) must not be shown
      // as connected, or AEC routing will silently no-op with no link to call.
      const isActivated = !!(data.provisioned && data.verified && data.link);
      const state: AECKnowledgeState = {
        enabled: isActivated,
        activated: isActivated,
        link: data.link,
        freeLeft: data.freeLeft,
        credits: data.credits,
        error: data.provisioned && !data.verified ? 'Session needs re-verification — sign out and back in.' : undefined,
      };

      // Cache the state
      await writeToStore(STORAGE_KEY_STATE, JSON.stringify(state));
      return state;
    } catch (err) {
      console.warn('[AECKnowledge] Failed to check status:', err);
      // Return cached state on error
      const cached = await this.init();
      return {
        ...cached,
        error: err instanceof Error ? err.message : 'Connection error',
      };
    }
  }

  /**
   * Activate AEC Knowledge for user.
   * Auth is the session bearer token — see checkStatus().
   */
  static async activate(token: string): Promise<AECKnowledgeState> {
    try {
      if (!token) {
        throw new Error('No session token — sign in again');
      }
      const response = await fetch(`${GATEWAY_URL}/mcp/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`Failed to activate (${response.status}${body?.error ? `: ${body.error}` : ''})`);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Could not activate');
      }
      if (!data.verified || !data.link) {
        // The gateway accepted the request but couldn't prove this session belongs to the
        // Ghost member (or member lookup found nothing to verify against) — don't cache a
        // false "activated" state with no link, or AEC routing will silently no-op later.
        throw new Error(
          data.member === false
            ? 'No Expert AI membership found for this account.'
            : 'Could not verify your session — try signing out and back in.',
        );
      }

      const state: AECKnowledgeState = {
        enabled: true,
        activated: true,
        link: data.link,
        freeLeft: data.freeLeft,
        credits: data.credits,
      };

      await writeToStore(STORAGE_KEY_STATE, JSON.stringify(state));
      await writeToStore(STORAGE_KEY_ENABLED, 'true');
      return state;
    } catch (err) {
      console.warn('[AECKnowledge] Failed to activate:', err);
      throw err;
    }
  }

  /**
   * Disable AEC Knowledge (local setting)
   */
  static async disable(): Promise<void> {
    await writeToStore(STORAGE_KEY_ENABLED, 'false');
  }

  /**
   * Enable AEC Knowledge (local setting)
   */
  static async enable(): Promise<void> {
    await writeToStore(STORAGE_KEY_ENABLED, 'true');
  }

  /**
   * Check if user has enabled AEC Knowledge
   */
  static async isEnabled(): Promise<boolean> {
    const value = await readFromStore(STORAGE_KEY_ENABLED);
    return value === 'true';
  }

  /**
   * Get payment order for top-up
   */
  static async createTopUpOrder(
    email: string,
    rupees: number,
  ): Promise<{
    ok: boolean;
    order_id: string;
    key_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
  }> {
    try {
      const response = await fetch(`${GATEWAY_URL}/pay/order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          kind: 'mcp_credits',
          rupees,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Payment error');
      }

      return data;
    } catch (err) {
      console.warn('[AECKnowledge] Failed to create order:', err);
      throw err;
    }
  }

  /**
   * Check if payment was processed and credits granted
   */
  static async checkProvision(orderId: string): Promise<AECKnowledgeState> {
    try {
      const response = await fetch(
        `${GATEWAY_URL}/mcp/provision?order_id=${encodeURIComponent(orderId)}`,
      );

      if (!response.ok) {
        throw new Error('Failed to check provision');
      }

      const data = await response.json();

      if (data.ok && data.paid) {
        const state: AECKnowledgeState = {
          enabled: true,
          activated: true,
          link: data.link,
          freeLeft: data.freeLeft,
          credits: data.credits,
        };

        await writeToStore(STORAGE_KEY_STATE, JSON.stringify(state));
        return state;
      }

      return {
        enabled: false,
        activated: false,
      };
    } catch (err) {
      console.warn('[AECKnowledge] Failed to check provision:', err);
      throw err;
    }
  }

  /**
   * Call any MCP tool with custom parameters
   * Supports: aec, aec_balance, aec_folders, ssv
   */
  static async callMCPTool(
    mpcLink: string,
    toolName: string,
    toolArguments: Record<string, any>,
  ): Promise<any> {
    try {
      logAEC('ToolCall', { tool: toolName, argsKeys: Object.keys(toolArguments) });

      const response = await fetch(mpcLink, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: toolArguments,
          },
        }),
      });

      if (!response.ok) {
        logAEC('ToolError', { tool: toolName, status: response.status });
        throw new Error(`MCP tool call failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        logAEC('ToolError', { tool: toolName, error: data.error.message });
        throw new Error(data.error.message || `Tool ${toolName} failed`);
      }

      logAEC('ToolSuccess', { tool: toolName, resultType: typeof data.result });
      return data.result;
    } catch (err) {
      logAEC('ToolFailure', { tool: toolName, message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /**
   * Check if a query should use AEC Knowledge
   * Returns true if query contains 'aec' keyword or user explicitly asks for building codes
   */
  static shouldUseAECKnowledge(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    const keywords = [
      'aec ',
      ' aec',
      'building code',
      'building standard',
      'construction standard',
      'engineering standard',
      'architecture standard',
      'building regulation',
      'construction regulation',
    ];

    return keywords.some((kw) => lowerQuery.includes(kw));
  }

  /**
   * Format query to route through AEC Knowledge
   * Adds context that this should use the AEC Wikipedia
   */
  static formatAECQuery(userQuery: string): string {
    return `[AEC Knowledge] ${userQuery}`;
  }

  /**
   * Query the AEC tool on MCP endpoint using JSON-RPC 2.0 protocol
   * Returns building codes, standards, and architecture research results
   */
  static async queryMCP(
    mpcLink: string,
    query: string,
    onDelta: (chunk: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    try {
      logAEC('Query', { query, mpcLink: mpcLink.substring(0, 50) + '...' });

      // Use JSON-RPC 2.0 format with tools/call method
      // Calls the "aec" tool to query building codes and standards
      const response = await fetch(mpcLink, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'aec',
            arguments: {
              query: query,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logAEC('Error', { status: response.status, message: errorText });
        throw new Error(`MCP request failed: ${response.statusText}`);
      }

      const data = await response.json();
      logAEC('Response', { hasError: !!data.error, hasResult: !!data.result });

      // Handle JSON-RPC response format
      if (data.error) {
        logAEC('Error', { jsonrpcError: data.error });
        throw new Error(data.error.message || 'MCP returned error');
      }

      // CRITICAL: Must have a result to succeed
      if (!data.result) {
        logAEC('Error', { reason: 'Empty result' });
        throw new Error('MCP returned empty result');
      }

      // Result could be text, object (JSON-RPC format with content[].text), or string
      let resultText = '';
      if (typeof data.result === 'string') {
        resultText = data.result;
      } else if (data.result.content && Array.isArray(data.result.content) && data.result.content[0]) {
        resultText = data.result.content[0].text || '';
      } else if (data.result.text && typeof data.result.text === 'string') {
        resultText = data.result.text;
      }

      if (!resultText || resultText.trim().length === 0) {
        logAEC('Error', { reason: 'Empty text' });
        throw new Error('MCP returned empty text');
      }

      logAEC('Success', { resultLength: resultText.length });
      onDelta(resultText);
      onDone();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('MCP query failed');
      logAEC('Failure', { message: error.message });
      onError(error);
    }
  }

  /**
   * Query MCP balance using aec_balance tool
   * Returns free and prepaid credit counts
   */
  static async queryMCPBalance(
    mpcLink: string,
  ): Promise<{ freeLeft?: number; credits?: number }> {
    try {
      logAEC('QueryBalance', {});

      const response = await fetch(mpcLink, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'aec_balance',
            arguments: {},
          },
        }),
      });

      if (!response.ok) {
        logAEC('BalanceError', { status: response.status });
        throw new Error(`MCP balance request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        logAEC('BalanceError', { jsonrpcError: data.error });
        throw new Error(data.error.message || 'MCP balance query failed');
      }

      // Parse the balance response (JSON-RPC format: result.content[0].text)
      if (data.result) {
        let resultText = '';
        if (typeof data.result === 'string') {
          resultText = data.result;
        } else if (data.result.content && Array.isArray(data.result.content) && data.result.content[0]) {
          resultText = data.result.content[0].text || '';
        }

        // Extract balance numbers from response text
        // Format: "Free searches left today: N/10. Prepaid credits: M."
        const freeMatch = resultText.match(/(\d+)\/10/);
        const creditsMatch = resultText.match(/Prepaid credits:\s*(\d+)/);

        const balance = {
          freeLeft: freeMatch ? parseInt(freeMatch[1], 10) : undefined,
          credits: creditsMatch ? parseInt(creditsMatch[1], 10) : undefined,
        };

        logAEC('BalanceSuccess', balance);
        return balance;
      }

      logAEC('BalanceWarning', { reason: 'No result' });
      return {};
    } catch (err) {
      logAEC('BalanceFailure', { message: err instanceof Error ? err.message : String(err) });
      return {};
    }
  }
}
