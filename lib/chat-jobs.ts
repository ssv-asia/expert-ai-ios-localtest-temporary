import { resilientFetch } from './gateway-client';
import type { ChatMessage } from './gateway-client';

export type ChatJobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'dead_letter';

export type ChatJobEvent = {
  type: string;
  label: string;
  at: number;
};

export interface ChatJob {
  jobId: string;
  version: number;
  status: ChatJobStatus;
  conversationId?: string;
  pushToken?: string;
  scheduledFor?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  cursor: number;
  text: string;
  /** Exact upstream model reported by the gateway, including fallback selection. */
  servedModel?: string | null;
  error: string | null;
  retryable?: boolean;
  nextRetryAt?: number | null;
  deadLetterAt?: number;
  phase?: 'queued' | 'thinking' | 'using_tool' | 'synthesizing' | 'paused' | 'completed' | 'failed' | 'cancelled' | string;
  events?: ChatJobEvent[];
}

export interface CreateChatJobInput {
  token: string;
  idempotencyKey: string;
  model: string;
  messages: ChatMessage[];
  conversationId?: string;
  pushToken?: string;
  scheduledFor?: number;
  options?: Record<string, unknown>;
}

export interface ChatJobHandoff {
  token?: string;
  expiresAt: number;
  jobId: string;
  conversationId?: string;
  target?: string;
}

export class ChatJobRequestError extends Error {
  readonly status: number;
  readonly type?: string;

  constructor(message: string, status: number, type?: string) {
    super(message);
    this.name = 'ChatJobRequestError';
    this.status = status;
    this.type = type;
  }
}

async function readJson(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatJobRequestError(
      body?.error?.message || body?.error || `Chat job request failed (${response.status})`,
      response.status,
      body?.error?.type,
    );
  }
  return body;
}

/** Create or retrieve a durable server-side generation job. */
export async function createChatJob(input: CreateChatJobInput): Promise<ChatJob> {
  const response = await resilientFetch('/v1/chat/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.token}` },
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      model: input.model,
      messages: input.messages,
      conversationId: input.conversationId,
      pushToken: input.pushToken,
      scheduledFor: input.scheduledFor,
      options: input.options,
    }),
  });
  return readJson(response);
}

/** Reconcile a job after a reconnect, foreground event, or app restart. */
export async function getChatJob(token: string, jobId: string): Promise<ChatJob> {
  const response = await resilientFetch(`/v1/chat/jobs?jobId=${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(response);
}

export async function cancelChatJob(token: string, jobId: string): Promise<ChatJob> {
  const response = await resilientFetch(`/v1/chat/jobs/cancel?jobId=${encodeURIComponent(jobId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(response);
}

export async function pauseChatJob(token: string, jobId: string): Promise<ChatJob> {
  const response = await resilientFetch(`/v1/chat/jobs/pause?jobId=${encodeURIComponent(jobId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(response);
}

export async function resumeChatJob(token: string, jobId: string): Promise<ChatJob> {
  const response = await resilientFetch(`/v1/chat/jobs/resume?jobId=${encodeURIComponent(jobId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(response);
}

/** Retry a failed durable job using its server-retained encrypted request. */
export async function retryChatJob(token: string, jobId: string): Promise<ChatJob> {
  const response = await resilientFetch(`/v1/chat/jobs/retry?jobId=${encodeURIComponent(jobId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(response);
}

/** Create a short-lived, single-use invitation for a paired desktop client. */
export async function createChatJobHandoff(token: string, jobId: string, target = 'desktop'): Promise<ChatJobHandoff> {
  const response = await resilientFetch('/v1/chat/jobs/handoff/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobId, target }),
  });
  return readJson(response);
}

/** Consume a handoff invitation without transferring transcript contents. */
export async function consumeChatJobHandoff(token: string, jobId: string, invitationToken: string): Promise<ChatJobHandoff> {
  const response = await resilientFetch('/v1/chat/jobs/handoff/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jobId, token: invitationToken }),
  });
  return readJson(response);
}
