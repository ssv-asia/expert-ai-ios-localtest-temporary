import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Keyboard,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useMarkdown } from 'react-native-marked';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeStore } from '@/lib/theme-store';
import { NotificationsService } from '@/lib/notifications-service';
import { AECKnowledgeService } from '@/lib/aec-knowledge-service';
import { executeMcpToolOnGateway, getMcpToolPermission, isMcpToolApprovalRequired } from '@/lib/mcp-tool-executor';
import { SimpleChatSettings } from '@/components/simple-chat-settings';
import { GoogleSignInButton, clearGoogleAccount } from '@/components/google-sign-in-button';
import { VoiceInputButton, VoiceRecordingIndicator } from '@/components/voice-input-button';
import { checkForFlexibleUpdate, installDownloadedUpdate } from '@/lib/in-app-update';
import NetInfo from '@react-native-community/netinfo';
import { authenticate, getAppLockMode } from '@/lib/app-lock';
import { classifyMemoryTrigger, fetchMemory, hasMemorySupport, mergeMemoryFact, saveMemory } from '@/lib/memory';
import { buildHistoryForSend, clearCompactionState } from '@/lib/compaction';
import { speakText, stopSpeaking } from '@/lib/tts';
import { cancelChatJob, ChatJobRequestError, createChatJob, createChatJobHandoff, getChatJob, pauseChatJob, resumeChatJob, retryChatJob } from '@/lib/chat-jobs';
import { forgetChatJob, forgetChatJobIntent, readChatJobHistory, reconcilePendingChatJobs, rememberChatJob, rememberChatJobIntent } from '@/lib/chat-job-store';
import type { ChatContentPart } from '@/lib/gateway-client';
import { buildImageContentParts, buildTextOnlyMessage, type PickedImage } from '@/lib/image-upload';
import { ImageAttachButton } from '@/components/image-attach-button';
import { SidePanel } from '@/components/side-panel';
import { WebPlanSelector } from '@/components/web-plan-selector';
import { WebBalanceSummary } from '@/components/web-balance-summary';
import { cancelTierSubscription, fetchPaymentHistory } from '@/lib/web-account-actions';
import { WebOnboarding } from '@/features/onboarding/components/web-onboarding';
import { MobilePlanOverview } from '@/components/mobile-plan-overview';
import { acknowledgePlayPurchase, prefetchPlayProducts, queryPlayPurchases } from '@/lib/play-billing';
import { TIER_PRODUCT_IDS } from '@/lib/plan-catalog';
import { makeDocumentId, saveDocument } from '@/lib/documents-store';
import { consumeGoogleRedirectSession, getActiveTier, getActiveToken, getSession, requestSsvAsiaCode, restoreSession, signOut, startFreeTrial, verifySsvAsiaCode, type EmailCodeChallenge, type Session } from '@/lib/auth';
import {
  fetchAudit,
  fetchKpis,
  fetchStats,
  fetchUsage,
  grantCredits,
  grantPass,
  listKeys,
  listMembers,
  listPayments,
  lookupMember,
  mintMcpLink,
  refundPayment,
  resetMember,
  reviveKey,
  revokePass,
  setBanned,
  setMemberTier,
  testKeys,
  type AdminKpis,
  type AdminMember,
  type AdminStats,
  type AuditEvent,
  type KeyStatus,
  type MemberSummary,
  type PaymentRecord,
  type UsageSummary,
} from '@/lib/admin-client';
import { createLowDataMarkdownRenderer } from '@/lib/markdown-renderer';
import { clearCrashLog, getCrashLog, type CrashRecord } from '@/lib/crash-log';
import { fetchPendingAnnouncement, markAnnouncementSeen, type Announcement } from '@/lib/announcements';
import {
  classifyGatewayError,
  deleteAccount,
  DEFAULT_MODEL_ID,
  fetchAccountInfo,
  fetchBalance,
  verifyGooglePlaySubscription,
  formatTokenCount,
  GatewayError,
  isAbortError,
  isModelUnlocked,
  MODELS,
  reportMessage,
  flushResponseFeedback,
  sendResponseFeedback,
  signOutEverywhere,
  streamChatCompletion,
  type AccountInfo,
  type BalanceInfo,
  type ChatMessage,
} from '@/lib/gateway-client';

import {
  clearAllConversations,
  deleteConversation,
  togglePinConversation,
  assignConversationToProject,
  createEmptyConversation,
  getDraft,
  getLastActiveConversationId,
  listConversations,
  makeConversationId,
  saveConversation,
  setDraft,
  setLastActiveConversationId,
  type Conversation,
} from '@/lib/chat-history';
import { listProjects, type Project } from '@/lib/projects-store';
import { useDocumentChatStore } from '@/lib/document-chat-store';
import { applyDocumentEditPlan, parseDocumentEditPlan, patchBlockForReply } from '@/lib/document-agent';
import { getFile, putFile, GithubApiError } from '@/lib/github-client';
import { saveAutomationRecipe } from '@/lib/automation-recipes';
import type { Archive } from '@/lib/archives-store';
import * as Haptics from 'expo-haptics';
import * as Sentry from '@sentry/react-native';
import { useShareIntent } from 'expo-share-intent';
import { ScheduleTaskSheet } from '@/features/scheduled-tasks/components/schedule-task-sheet';
import { useScheduledTasksStore, type ScheduledTask } from '@/features/scheduled-tasks/store';
import { PlannerSheet, type PlannerTab } from '@/features/planner/planner-sheet';
import { NoteWriter, type NoteWriterAction } from '@/features/daily-notes/note-writer';
import { DocumentEditorInput } from '@/features/archives/document-editor-input';
import { ExtractedTasksSheet } from '@/features/daily-notes/extracted-tasks-sheet';
import {
  appendToDailyNote,
  computeStreak,
  deleteDailyNote,
  extractOpenTasks,
  getDailyNote,
  getOrCreateNoteForDate,
  getOrCreateTodayNote,
  listDailyNotes,
  localDayKey,
  recentNotesBlock,
  saveDailyNoteBody,
  executeDailyNoteTool,
  type DailyNote,
} from '@/lib/daily-notes';
import { useAppSettingsStore } from '@/features/settings/store';
import { AIDisclaimerModal } from '@/components/AIDisclaimerModal';

// Keep the last server-confirmed effective tier in memory per signed-in token.
// Simple Chat can unmount while the user visits paired Agent Chat; reusing only
// the same account's cached result avoids the misleading Account -> Pro flash.
const confirmedBalanceByToken = new Map<string, BalanceInfo>();

/** Gives the model live awareness of "now" — without this it has no idea what day
 *  or time it actually is, which matters both for ordinary relative-time questions
 *  and for scheduled tasks (a task that fires at 9am should know it's 9am, not
 *  guess from training data). Regenerated fresh on every send rather than cached,
 *  so it's always the real current time, not whenever the chat was opened. */
function buildSystemContextMessage(opts?: {
  concise?: boolean;
  cite?: boolean;
  english?: boolean;
  researchBrief?: boolean;
  verificationMode?: boolean;
  critiqueMode?: boolean;
  agentTask?: boolean;
  outputFormat?: 'checklist' | 'memo' | 'table' | 'study' | 'meeting' | 'executive';
  document?: { path: string; content: string };
}): ChatMessage {
  const now = new Date();
  let content = `Current date and time: ${now.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (user's local device time).`;
  if (opts?.concise) {
    content +=
      '\n\nAnswer concisely and directly. No preamble, no restating the question, no filler or sign-off. Lead with the answer; add only the detail that is actually needed.';
  }
  if (opts?.cite) {
    content +=
      '\n\nWhen you state facts, cite your sources inline with links where possible. If you used a search or knowledge tool, briefly name what you used.';
  }
  if (opts?.researchBrief) {
    content += '\n\nResearch Brief mode is enabled. Treat this as a source-backed investigation: use live research tools when relevant, compare multiple independent sources, distinguish verified facts from inference, call out uncertainty and source freshness, and finish with a concise conclusion and Sources section. Do not present an unsupported guess as a fact.';
  }
  if (opts?.verificationMode) {
    content += '\n\nVerification mode is enabled. Check time-sensitive or uncertain claims with live sources when available. Label each important source with its publication date or freshness, separate verified facts from inference, state assumptions and a calibrated confidence level, and finish with a short "Verify again" note describing what should be rechecked later. Never invent a citation or imply a source was checked when it was not.';
  }
  if (opts?.critiqueMode) {
    content += '\n\nCritique mode is enabled. Do not merely agree: identify the strongest weaknesses, hidden assumptions, missing evidence, counterarguments, and failure modes. Distinguish objective problems from subjective tradeoffs, then propose prioritized, actionable improvements. Be candid but constructive.';
  }
  if (opts?.document) {
    // Document context is already described in the document contract below.
    content += '\n\nThe user explicitly allowed the relevant open document to be used for this turn.';
  }
  if (opts?.agentTask) {
    content += '\n\nAgent Task mode is enabled. Treat the request as a task to complete, not just a question: briefly state the plan, execute useful available tools in deliberate steps, keep the user informed through the agent activity surface, verify the result, and finish with completed steps, remaining caveats, and the next action. Do not claim an action was completed unless the tool result confirms it.';
  }
  if (opts?.outputFormat) {
    const formatInstructions = {
      checklist: 'Return a practical checklist with clear action items and completion criteria.',
      memo: 'Return a concise decision memo with Context, Options, Recommendation, Risks, and Next steps.',
      table: 'Return the comparison as a compact Markdown table, followed by a short interpretation.',
      study: 'Return a study guide with key concepts, examples, misconceptions, and a short self-test.',
      meeting: 'Return a meeting brief with objective, decisions, open questions, owners, and next actions.',
      executive: 'Return an executive summary with recommendation, business impact, risks, metrics, and next step.',
    };
    content += `\n\nStructured output mode: ${formatInstructions[opts.outputFormat]}`;
  }
  if (opts?.english) {
    content += '\n\nAlways reply in English, regardless of the language the question is written in.';
  }
  if (opts?.document) {
    // The chat itself is the document editor for this turn — see
    // lib/document-chat-store.ts. The ```document contract below is parsed
    // back out by maybeApplyDocumentEdit() after the reply finishes.
    //
    // Cap what actually goes into the model's context — a large note file
    // dumped whole into EVERY turn (even "hi") would eat the context budget
    // fast and can outright fail on a long enough file. The full document
    // still lives in the editor and still gets committed as-is; this only
    // limits what's sent to the model for a single turn's context.
    const DOC_CONTEXT_CAP = 12000;
    const truncated = opts.document.content.length > DOC_CONTEXT_CAP;
    const docForModel = truncated ? `${opts.document.content.slice(0, DOC_CONTEXT_CAP)}\n\n[...document truncated for length — ${opts.document.content.length} characters total...]` : opts.document.content;
    content += `\n\nThe user has this document open in the editor above the chat: "${opts.document.path}". Its ${truncated ? 'content (truncated below — see note)' : 'current content'} is:\n\n---\n${docForModel}\n---\n\nIf the user is just asking a question about it, answer normally in plain prose — do not repeat the document back. If the user asks you to change, save, write, store, or commit content to it, act like a careful document agent: make the smallest possible targeted edit and preserve all unrelated text. If the user says to save, write, or store a previous response verbatim, use that previous assistant response as the source and apply it to this file; do not merely print a ready-to-copy version. If the file already contains that exact content, report that no change is needed. Reply with a short summary followed by a fenced \`\`\`patchjson block containing JSON with an \"operations\" array. Each operation must be one of: {\"type\":\"replace\",\"find\":\"exact unique old text\",\"replace\":\"new text\"}, {\"type\":\"delete\",\"find\":\"exact unique text\"}, {\"type\":\"insert_before\" or \"insert_after\",\"find\":\"exact unique anchor\",\"content\":\"text\"}, or {\"type\":\"append\",\"content\":\"text\"}. Use exact text copied from the document, never broad guesses, and keep each operation local. Use a full-document replacement only when the user explicitly asks to replace the entire file and the complete file is present in context. If the requested change cannot be safely anchored, explain that instead of rewriting the whole document. Do not return a full replacement document for a normal edit.`;
  }
  return { role: 'system', content };
}

// Whether this specific message plausibly needs the open document in context
// — matched against the message text so the document is only sent "when
// prompted" (edit/reference intent), not stuffed into every unrelated turn
// ("hi", "what's 2+2") just because a file happens to be open. Deliberately
// broad/generous (false positives are harmless — the doc just rides along
// unused; false negatives would break a follow-up edit request).
const DOCUMENT_INTENT_RE = /\b(document|file|note|page|vault|repo|this text|it|that)\b.{0,60}\b(edit|rewrite|revise|fix|shorten|lengthen|expand|summar|change|update|add|remove|delete|correct|proofread|translate|format|clean ?up|tighten|polish|improve|rephrase|reword|save|write|store|put|commit)\b|\b(edit|rewrite|revise|fix|shorten|summar|proofread|reword|polish|save|write|store|put|commit)\b.{0,60}\b(document|file|note|this|it|that)\b|\b(save|write|store|put)\b.{0,30}\b(response|answer|reply|verbatim)\b|\b(what does (it|this|the document) say|read (it|this) back|show me the (document|file|note))\b/i;

function shouldIncludeDocumentContext(messageText: string): boolean {
  return DOCUMENT_INTENT_RE.test(messageText);
}

function isLightThemeBackground(background: string): boolean {
  const value = background.replace('#', '');
  if (value.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150;
}

// Keep ordinary opening chat turns in the foreground. Durable/background
// recovery is for substantial or already-deep work, not for greetings and
// short first questions.
function shouldEscalateToDurable(history: ChatMessage[]): boolean {
  const userTurns = history.filter((message) => message.role === 'user');
  const latest = String(userTurns[userTurns.length - 1]?.content || '').trim();
  // Local note mutations run in the APK because the gateway must never see a
  // device path or private note body. Keep these turns foreground-only so a
  // server-side durable job cannot attempt to execute a client-local tool.
  if (/daily note|journal|schedule.*(meeting|appointment|call)|calendar.*(meeting|appointment)/i.test(latest)) return false;
  if (userTurns.length < 4) {
    if (latest.length <= 240 && !latest.startsWith('/task') && !latest.startsWith('/research')) return false;
  }
  return true;
}

// Current "Answer style" toggles, read outside React (zustand) so the big send
// callbacks don't need them as deps. `messageText` gates whether the open
// document (if any) actually gets sent this turn — see shouldIncludeDocumentContext.
function currentStyleOpts(messageText: string = '') {
  const s = useAppSettingsStore.getState();
  const doc = useDocumentChatStore.getState().activeDocument;
  const normalized = messageText.trim();
  const forceDocument = /^\/doc\b/i.test(normalized);
  const excludeDocument = /^\/nodoc\b/i.test(normalized);
  const includeDoc = !!doc && !excludeDocument && (forceDocument || shouldIncludeDocumentContext(messageText));
  return {
    concise: s.conciseAnswers,
    cite: s.citeSources,
    english: s.replyInEnglish,
    researchBrief: /^\/research\b/i.test(messageText.trim()),
    verificationMode: /^\/verify\b/i.test(messageText.trim()),
    agentTask: /^\/task\b/i.test(messageText.trim()),
    outputFormat: (messageText.trim().match(/^\/(checklist|memo|table|study|meeting|executive)\b/i)?.[1].toLowerCase() as 'checklist' | 'memo' | 'table' | 'study' | 'meeting' | 'executive' | undefined),
    critiqueMode: /^\/critique\b/i.test(messageText.trim()),
    document: includeDoc ? { path: doc.path, content: doc.content } : undefined,
  };
}

/** Scans a finished assistant reply for the ```document fenced block the
 *  system prompt above asks for. If present + a document is still open,
 *  applies it as the document's new (uncommitted) content and returns the
 *  reply text with that block replaced by a short confirmation line — the
 *  full document (which can be very long) has no business being dumped into
 *  the chat bubble a second time when it's already shown, editable, in the
 *  document card above. Returns null when there's nothing to do, so the
 *  caller can leave the message text untouched (the common case). */
function maybeApplyDocumentEdit(replyText: string, targetDoc: { archiveId: string; path: string } | null): string | null {
  if (!targetDoc) return null;
  const doc = useDocumentChatStore.getState().activeDocument;
  // Guard against the document being closed or swapped for a different file
  // while this reply was still streaming (a multi-second round trip) — apply
  // the edit only if it's still the same file the user was looking at when
  // they sent the message, never whatever happens to be open now.
  if (!doc || doc.archiveId !== targetDoc.archiveId || doc.path !== targetDoc.path) return null;
  const plan = parseDocumentEditPlan(replyText);
  if (plan) {
    const applied = applyDocumentEditPlan(doc.content, plan);
    if (!applied) return replyText.replace(/```(?:patchjson|document-patch)\s*\r?\n[\s\S]*?\r?\n```/i, '⚠️ I could not apply that targeted edit safely because its text anchor was missing or ambiguous. The document was not changed.').trim();
    useDocumentChatStore.getState().updateContent(applied.content);
    return patchBlockForReply(replyText, plan.summary || `Applied ${applied.applied} targeted edit${applied.applied === 1 ? '' : 's'}`);
  }
  // Backward-compatible fallback for older sessions/models that still return
  // the previous full-document contract. New turns are explicitly patch-only.
  const match = replyText.match(/```document\r?\n([\s\S]*?)\r?\n```\s*$/m);
  if (!match) return null;
  useDocumentChatStore.getState().updateContent(match[1]);
  return replyText.replace(match[0], '📄 Document updated above — review it, then tap Commit to save it to GitHub.').trim();
}

// Fire a haptic only if the user hasn't turned them off.
function buzz(run: () => Promise<unknown>) {
  try {
    if (useAppSettingsStore.getState().haptics) run().catch(() => {});
  } catch {
    /* settings not loaded yet — skip */
  }
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  /** Set on an assistant bubble whose request failed with a network error and has
   *  exhausted auto-retries — renders an inline "Retry" instead of vanishing. */
  failed?: boolean;
  /** Set while a send is held pending a connection — the app is auto-retrying in
   *  the background (on reconnect / foreground / backoff timer). Never a dead end. */
  queued?: boolean;
  /** Tool/knowledge sources the model actually used for this reply, so the user
   *  can see the answer is grounded (web search, AEC vault, …), not guessed. */
  usedTools?: string[];
  servedModel?: string;
}

// Raw MCP tool names → short human labels for the "grounded by" line under a reply.
function friendlyToolLabels(names: string[]): string {
  const map: Record<string, string> = {
    web_search: 'web search',
    get_headlines: 'news headlines',
    wikipedia_lookup: 'Wikipedia',
    get_weather: 'live weather',
    currency_convert: 'currency rates',
    calculator: 'calculator',
    current_time: 'current time',
    unit_convert: 'unit conversion',
    dictionary_lookup: 'dictionary',
    arxiv_search: 'arXiv',
    public_holidays: 'holiday calendar',
    generate_qr_code: 'QR generator',
    get_local_context: 'local context',
    aec: 'AEC vault',
    aec_folders: 'AEC vault',
    aec_balance: 'AEC vault',
  };
  const labels = Array.from(new Set(names.map((n) => map[n] || n.replace(/_/g, ' '))));
  return labels.join(', ');
}

function routingReason(servedModel?: string, tools?: string[]): string {
  if (tools?.length) return 'live data';
  const model = (servedModel || '').toLowerCase();
  if (/opus|reason|deep|thinking/.test(model)) return 'depth';
  if (/flash|fast|mini|haiku/.test(model)) return 'speed';
  if (/local|private/.test(model)) return 'privacy';
  return 'balanced routing';
}

function displayModelName(model?: string): string {
  const id = (model || '').toLowerCase();
  if (!id) return '';
  if (id.includes('claude-haiku') || id.includes('claude_default')) return 'Claude Haiku 4.5';
  if (id.includes('claude-sonnet') || id.includes('claude_review')) return 'Claude Sonnet 5';
  if (id.includes('gpt-5.6-luna') || id.includes('openrouter/chatgpt')) return 'Luna';
  if (id.includes('gpt-oss-120b:nitro')) return 'OSS 120B Nitro';
  if (id.includes('gpt-oss-120b:free')) return 'OSS 120B (free)';
  if (id.includes('gpt-oss-120b')) return 'OSS 120B';
  if (id.includes('owl-alpha')) return 'Owl Alpha';
  if (id.includes('ling-2.6-flash')) return 'Ling 2.6 Flash';
  return model!;
}

// A tool is an optional enrichment step, never a reason to deadlock the
// assistant turn. The gateway client has its own request retry budget; this
// outer deadline also covers a response body that stops resolving entirely.
async function executeMcpToolWithDeadline(
  name: string,
  args: Record<string, any>,
  token: string,
  deadlineMs = 45_000,
  approved = false,
): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      executeMcpToolOnGateway(name, args, token, controller.signal, approved),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ error: true, message: `Tool ${name} timed out; continue without its result.` });
        }, deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function askMcpToolApproval(name: string): Promise<boolean> {
  const scope = getMcpToolPermission(name);
  return new Promise((resolve) => {
    Alert.alert(
      'Approval required',
      `${name} requests ${scope} access. Expert AI will only run it once for this request.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow once', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

let nextId = 0;
function makeId() {
  nextId += 1;
  return `m${nextId}`;
}

/** Formats a duration in seconds as the largest sensible unit(s) — days+hours, hours+minutes, or
 *  just minutes — instead of always showing raw minutes, which reads as a huge, alarming number
 *  on a 30-day monthly plan (e.g. "43200 min left" vs "30 days left"). */
function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

// Rupees from a paise integer, with thousands separators. Worker `/admin/kpis` returns every
// revenue field in paise (₹1 = 100). Hermes has no full-ICU `toLocaleString`, so group by hand.
function formatINR(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(Number(paise))) return '—';
  const rupees = Math.round(Number(paise) / 100);
  const sign = rupees < 0 ? '-' : '';
  return `${sign}₹${Math.abs(rupees).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
}

// Only used to decide whether to SHOW the Console button — a UX nicety, not a security boundary.
// The worker independently re-verifies the signed-in session's email server-side on every admin
// call; a client-side check here can't grant access it doesn't already have.
const FOUNDER_EMAILS = ['ghost@ssv.asia', 'samarvirdi@gmail.com'];

// Shown on the empty screen so a first-time user sees, in one glance, the kind of
// thing this is good at — and can start with one tap instead of a blank box.
const PROMPT_STARTERS: { label: string; prompt: string }[] = [
  { label: 'Explain a concept', prompt: 'Explain how this works, step by step, assuming I know the basics: ' },
  { label: 'Summarise & fact-check', prompt: 'Summarise the key points of the following and flag anything that looks inaccurate:\n\n' },
  { label: 'Draft a reply', prompt: 'Help me write a clear, professional reply to this message:\n\n' },
  { label: 'Plan it out', prompt: 'Break this goal into a realistic step-by-step plan: ' },
  { label: 'Building code / standard', prompt: 'What does the applicable building code say about ' },
  { label: 'Compare options', prompt: 'Compare these options and tell me which fits my situation best: ' },
];

// One-tap ways to push the last answer further — the pattern the major assistants use.
const FOLLOW_UPS: { label: string; prompt: string }[] = [
  { label: 'Go deeper', prompt: 'Go deeper on that — more detail and reasoning.' },
  { label: 'Examples', prompt: 'Give me concrete examples of that.' },
  { label: 'Simpler', prompt: 'Explain that again in simpler terms.' },
  { label: 'Shorter', prompt: 'Give me a much shorter version — just the key points.' },
];

const TIER_LABELS: Record<string, string> = {
  community: 'Free',
  researcher: 'Researcher',
  engineer: 'Engineer',
  professional: 'Professional',
  aec: 'AEC Professional',
  foundation: 'Foundation',
};

// Only assistant replies get markdown rendering — user input is rendered as
// plain text even if it happens to contain markdown-looking characters, same
// as ChatGPT/Claude. useMarkdown (not the <Markdown> component) is used
// deliberately: the component renders its own internal FlatList, which would
// nest a FlatList inside each row of the chat's own FlatList — a real perf/
// scroll-conflict bug, not just a lint warning.
function AssistantMarkdown({ text, textColor, isDark }: { text: string; textColor: string; isDark: boolean }) {
  const renderer = useMemo(() => createLowDataMarkdownRenderer(textColor), [textColor]);
  const elements = useMarkdown(text, {
    renderer,
    theme: {
      colors: {
        text: textColor,
        code: isDark ? '#2A2A2A' : '#EFEFEF',
        link: '#5B8DEF',
        border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
      },
    },
    styles: {
      text: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21 },
      paragraph: { marginTop: 0, marginBottom: 0 },
    },
  });
  // Wrap each top-level block (paragraph / table / code fence / list) in its own
  // full-width View. RN then lays the reply out block-by-block instead of as one
  // monolithic node — a wide table stays contained, and a very long reply doesn't
  // become a single giant measure pass.
  return (
    <>
      {elements.map((el, i) => (
        <View key={i} style={{ width: '100%' }}>
          {el}
        </View>
      ))}
    </>
  );
}

// Catches any render-time throw from AssistantMarkdown (a bad table, an edge case in
// the parser, a future regression like the hook-count bug this replaces the risk of)
// and falls back to plain text for that one message instead of taking down the whole
// transcript. Previously a markdown render crash propagated all the way to the app's
// top-level error boundary, which is what made a single bad reply look like the whole
// chat/app had crashed and needed a reload.
class MarkdownErrorBoundary extends Component<
  { fallbackText: string; textColor: string; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[Markdown] render failed, falling back to plain text for this message:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Text style={{ fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21, color: this.props.textColor }}>
          {this.props.fallbackText}
        </Text>
      );
    }
    return this.props.children;
  }
}

// Rendered (not raw) preview for an open Archive document — same reasoning as
// AssistantMarkdown above: useMarkdown, not the <Markdown> component, since
// the latter renders its own internal FlatList and this sits inside a
// ScrollView already. A separate component (rather than inlining the hook in
// the doc card) so the hook is called unconditionally whenever this mounts,
// never skipped based on view-mode state in the parent.
function DocumentMarkdownPreview({ text, textColor, isDark }: { text: string; textColor: string; isDark: boolean }) {
  const renderer = useMemo(() => createLowDataMarkdownRenderer(textColor), [textColor]);
  const elements = useMarkdown(text || '_Empty file_', {
    renderer,
    theme: {
      colors: {
        text: textColor,
        code: isDark ? '#2A2A2A' : '#EFEFEF',
        link: '#5B8DEF',
        border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
      },
    },
    styles: {
      text: { fontFamily: Fonts.sans, fontSize: 13.5, lineHeight: 20 },
      paragraph: { marginTop: 0, marginBottom: 0 },
    },
  });
  return (
    <>
      {elements.map((el, i) => (
        <View key={i} style={{ width: '100%' }}>
          {el}
        </View>
      ))}
    </>
  );
}

// A single pathologically long reply (a giant pasted code dump, a runaway generation)
// can otherwise turn into thousands of Views once parsed, which risks a slow/OOM-style
// Fabric crash on lower-memory phones. Past this length, render a prefix and let the
// user opt into the full thing rather than forcing every message to pay for the worst
// case. 20k characters comfortably covers any normal reply, including long code blocks.
const MARKDOWN_SOFT_CAP = 20000;

function SafeAssistantMarkdown({ text, textColor, isDark }: { text: string; textColor: string; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isHuge = text.length > MARKDOWN_SOFT_CAP;
  const shown = isHuge && !expanded ? text.slice(0, MARKDOWN_SOFT_CAP) : text;
  return (
    <MarkdownErrorBoundary fallbackText={text} textColor={textColor}>
      <AssistantMarkdown text={shown} textColor={textColor} isDark={isDark} />
      {isHuge && !expanded ? (
        <Pressable onPress={() => setExpanded(true)} hitSlop={8}>
          <Text
            style={{
              fontFamily: Fonts.sansSemiBold,
              fontSize: 13,
              color: textColor,
              opacity: 0.7,
              marginTop: 6,
            }}
          >
            Show full message ({text.length.toLocaleString()} characters)
          </Text>
        </Pressable>
      ) : null}
    </MarkdownErrorBoundary>
  );
}

// Shown while a reply is streaming but no token has arrived yet. The gateway's
// upstream free-tier model has real, measured 10-30s gaps before the first
// token on some requests (queueing on their end, not something this app
// controls) — a bare "…" for 30 seconds reads as frozen. This doesn't make
// the reply arrive faster, but it stops the app from looking dead while it
// genuinely is still waiting.
// Three dots pulsing in sequence — the classic "typing" tell. Runs continuously from
// the moment the message is sent, independent of the elapsed-time text below it, so
// there's visible motion instantly instead of only a static "…" for the first few
// seconds.
function TypingDots({ color }: { color: string }) {
  const anims = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const loops = anims.map((val, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(val, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {anims.map((val, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
            opacity: val,
            transform: [{ scale: val.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1.15] }) }],
          }}
        />
      ))}
    </View>
  );
}

function WaitingHint({ textColor }: { textColor: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const label = elapsed < 4 ? null : elapsed < 12 ? 'Thinking…' : 'Still working — this can take a bit longer sometimes…';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
      <TypingDots color={textColor} />
      {label ? (
        <Text style={{ fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21, color: textColor }}>{label}</Text>
      ) : null}
    </View>
  );
}

function MessageBubble({
  item,
  isDark,
  textColor,
  isLast,
  isLastUser,
  isSpeaking,
  onCopy,
  onRegenerate,
  onRegenerateMenu,
  onVerifyAgain,
  onRetryQueued,
  onReport,
  onFeedback,
  onShare,
  onSaveToNote,
  onScheduleFollowup,
  onSaveRecipe,
  onEdit,
  onToggleReadAloud,
  onSaveDocument,
  colors,
}: {
  item: DisplayMessage;
  isDark: boolean;
  textColor: string;
  isLast: boolean;
  isLastUser: boolean;
  isSpeaking: boolean;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onRegenerateMenu: () => void;
  onVerifyAgain: () => void;
  onRetryQueued: () => void;
  onReport: (text: string) => void;
  onFeedback: (text: string, rating: 'positive' | 'negative') => void;
  onShare: (text: string) => void;
  onSaveToNote: (text: string) => void;
  onScheduleFollowup: (text: string) => void;
  onSaveRecipe: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onToggleReadAloud: (id: string, text: string) => void;
  onSaveDocument: (text: string) => void;
  colors: any;
}) {
  const isUser = item.role === 'user';
  // Copy is available on any settled message, user or assistant. Regenerate only
  // ever applies to an assistant reply — mid-stream there's nothing finished to
  // copy, and regenerating a partial answer isn't meaningful.
  const showActions = !item.streaming && item.text.length > 0;
  // Assistant replies can have up to 6 secondary actions (Regenerate, Adjust,
  // Save to note, Read aloud, Save to workspace, Report) — a single horizontal
  // row of all of them plus Copy/Share overflowed off narrow screens. They now
  // fold behind an "Options" toggle that expands as a left-aligned, wrapping
  // block below, so nothing is ever cut off regardless of screen width.
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      {/* User messages keep a right-aligned bubble; assistant replies render
          bubble-less and full-width (like ChatGPT/Claude) so a very long answer
          isn't one enormous nested bubble — fewer layout layers, more room, and
          tables/code get the full content width. */}
      <View style={{ maxWidth: isUser ? '82%' : '100%', width: isUser ? undefined : '100%' }}>
        <View
          style={
            isUser
              ? [
                  styles.bubble,
                  {
                    maxWidth: undefined,
                    alignSelf: 'flex-end',
                    backgroundColor: colors.surface,
                    borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                  },
                ]
              : { width: '100%', paddingVertical: 2 }
          }
        >
          {/* AI-Generated Badge for assistant responses */}
          {!isUser && (
            <View
              style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottomWidth: 0.5,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: isDark ? '#999999' : '#888888' }}>
                This response is being generated by a large language model.
              </Text>
            </View>
          )}
          {isUser ? (
            <Text selectable style={{ fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21, color: colors.text }}>
              {item.text}
            </Text>
          ) : item.streaming ? (
            // Plain text while streaming: useMarkdown re-lexes the full string on
            // every update, and re-parsing the whole (growing) response on every
            // batched token flush is real overhead we don't want to add on top of
            // the app's existing perceived-speed problem. Switch to full markdown
            // only once the message is done.
            item.text ? (
              <Text selectable style={{ fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21, color: textColor }}>
                {item.text}
              </Text>
            ) : (
              <WaitingHint textColor={textColor} />
            )
          ) : item.queued ? (
            <View>
              {item.text ? <SafeAssistantMarkdown text={item.text} textColor={textColor} isDark={isDark} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: item.text ? 8 : 0 }}>
                <ActivityIndicator size="small" color={textColor} />
                <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: textColor }}>
                  Response continuing in the background…
                </Text>
                <Pressable onPress={onRetryQueued} hitSlop={8}>
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                    Retry now
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : item.failed ? (
            <View>
              {item.text ? <SafeAssistantMarkdown text={item.text} textColor={textColor} isDark={isDark} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: item.text ? 8 : 0 }}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: isDark ? '#FF8A80' : '#C62828' }}>
                  Couldn&apos;t get a response.
                </Text>
                {isLast ? (
                  <Pressable onPress={onRetryQueued} hitSlop={8}>
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                      Retry
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : item.text ? (
            <SafeAssistantMarkdown text={item.text} textColor={textColor} isDark={isDark} />
          ) : null}
          {!isUser && !item.streaming && !item.failed && (item.servedModel || (item.usedTools && item.usedTools.length > 0)) ? (
            <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary, marginTop: 8 }}>
              {item.servedModel ? `Used: ${displayModelName(item.servedModel)} · ${routingReason(item.servedModel, item.usedTools)}` : ''}{item.servedModel && item.usedTools?.length ? ' · ' : ''}{item.usedTools?.length ? `🔍 ${friendlyToolLabels(item.usedTools)}` : ''}
            </Text>
          ) : null}
        </View>
        {showActions ? (
          <View style={{ marginTop: 4, paddingHorizontal: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                justifyContent: isUser ? 'flex-end' : 'flex-start',
              }}
            >
              <Pressable onPress={() => onCopy(item.text)} hitSlop={8}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>Copy</Text>
              </Pressable>
              <Pressable onPress={() => onShare(item.text)} hitSlop={8}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>Share</Text>
              </Pressable>
              {!isUser ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    onPress={() => { setFeedback('positive'); onFeedback(item.text, 'positive'); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Helpful response"
                  >
                    <Ionicons name="thumbs-up-outline" size={15} color={feedback === 'positive' ? colors.text : colors.textTertiary} />
                  </Pressable>
                  <Pressable
                    onPress={() => { setFeedback('negative'); onFeedback(item.text, 'negative'); }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Unhelpful response"
                  >
                    <Ionicons name="thumbs-down-outline" size={15} color={feedback === 'negative' ? colors.text : colors.textTertiary} />
                  </Pressable>
                </View>
              ) : null}
              {isUser && isLastUser ? (
                <Pressable onPress={() => onEdit(item.id, item.text)} hitSlop={8}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>Edit</Text>
                </Pressable>
              ) : null}
              {!isUser ? (
                <Pressable
                  onPress={() => setOptionsExpanded((v) => !v)}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                >
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>Options</Text>
                  <Ionicons
                    name={optionsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color={colors.textTertiary}
                  />
                </Pressable>
              ) : null}
            </View>

            {!isUser && optionsExpanded ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginTop: 10,
                  justifyContent: 'flex-start',
                }}
              >
                {isLast ? (
                  <Pressable
                    onPress={onRegenerate}
                    onLongPress={onRegenerateMenu}
                    hitSlop={6}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                  >
                    <Ionicons name="refresh-outline" size={14} color={colors.textSecondary} />
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Regenerate</Text>
                  </Pressable>
                ) : null}
                {isLast ? (
                  <Pressable
                    onPress={onRegenerateMenu}
                    hitSlop={6}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                  >
                    <Ionicons name="options-outline" size={14} color={colors.textSecondary} />
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Adjust…</Text>
                  </Pressable>
                ) : null}
                {isLast ? (
                  <Pressable
                    onPress={onVerifyAgain}
                    hitSlop={6}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} />
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Verify again</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => onSaveToNote(item.text)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                >
                  <Ionicons name="bookmark-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Save to note</Text>
                </Pressable>
                <Pressable
                  onPress={() => onToggleReadAloud(item.id, item.text)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                >
                  <Ionicons name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'} size={14} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>
                    {isSpeaking ? 'Stop' : 'Read aloud'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onSaveDocument(item.text)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                >
                  <Ionicons name="albums-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Save to workspace</Text>
                </Pressable>
                <Pressable
                  onPress={() => onScheduleFollowup(item.text)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                >
                  <Ionicons name="alarm-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Schedule follow-up</Text>
                </Pressable>
                <Pressable
                  onPress={() => onSaveRecipe(item.text)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                >
                  <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Save as recipe</Text>
                </Pressable>
                <Pressable
                  onPress={() => onReport(item.text)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface }}
                >
                  <Ionicons name="flag-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>Report</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
const MemoBubble = memo(
  MessageBubble,
  (prev, next) =>
    prev.item === next.item &&
    prev.isDark === next.isDark &&
    prev.textColor === next.textColor &&
    prev.isLast === next.isLast &&
    prev.isLastUser === next.isLastUser &&
    prev.isSpeaking === next.isSpeaking &&
    prev.onCopy === next.onCopy &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onRegenerateMenu === next.onRegenerateMenu &&
    prev.onRetryQueued === next.onRetryQueued &&
    prev.onReport === next.onReport &&
    prev.onFeedback === next.onFeedback &&
    prev.onShare === next.onShare &&
    prev.onSaveToNote === next.onSaveToNote &&
    prev.onEdit === next.onEdit &&
    prev.onToggleReadAloud === next.onToggleReadAloud &&
    prev.onSaveDocument === next.onSaveDocument,
);

export default function SimpleChatScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  // Subscribe directly to `settings` (not just the getColors function reference,
  // which never changes) so the screen actually re-renders when the theme preset
  // changes in Settings — this was the bug: only the settings sheet updated
  // because it read `settings` directly, while this screen never did.
  const settings = useThemeStore((s) => s.settings);
  const getColors = useThemeStore((s) => s.getColors);
  const themeColors = getColors();

  // Use theme colors if available, fallback to system Colors
  const colors: any = themeColors && Object.keys(themeColors).length > 0
    ? { ...Colors[colorScheme], ...themeColors }  // Merge theme over system colors
    : Colors[colorScheme];
  // Follow the selected app theme rather than the phone's system setting.
  const isDark = !isLightThemeBackground(colors.background);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Android share-sheet target: text or a link shared from any other app
  // (browser, mail, PDF, notes…) lands here. We prefill the composer with it and
  // focus — never auto-send, so the user can add their own question first.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: true });

  // Agent mode opens Expert AI Agent's computer pairing sheet and dedicated
  // Agent Chat routes while keeping this Simple Chat screen unchanged.
  const goToAgentMode = useCallback(() => {
    router.push('/(app)/servers');
  }, [router]);

  // Keep Android's measured lift and follow iOS keyboard frame changes. Using
  // the full docked iOS overlap keeps the composer above QuickType; a floating
  // iPad keyboard does not lift the entire chat layout.
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const keyboardPadding = useRef(new Animated.Value(0)).current;
  const [iosKeyboardPadding, setIosKeyboardPadding] = useState(0);
  useEffect(() => {
    const updateKeyboardFrame = (event: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        const { height, screenY } = event.endCoordinates;
        const screenHeight = Dimensions.get('screen').height;
        setIsKeyboardVisible(height > 0);
        const reachesBottom = screenY + height >= screenHeight - 1;
        Keyboard.scheduleLayoutAnimation(event);
        setIosKeyboardPadding(reachesBottom ? Math.max(0, screenHeight - screenY) : 0);
        return;
      }
      const height = event.endCoordinates.height + insets.bottom;
      setIsKeyboardVisible(height > 0);
      keyboardPadding.stopAnimation();
      Animated.timing(keyboardPadding, {
        toValue: Math.max(0, height),
        duration: 180,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: false,
      }).start();
    };
    const showSub = Platform.OS === 'ios' ? null : Keyboard.addListener('keyboardDidShow', updateKeyboardFrame);
    const frameSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillChangeFrame', updateKeyboardFrame) : null;
    const hideSub = Platform.OS !== 'ios' ? Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      keyboardPadding.stopAnimation();
      Animated.timing(keyboardPadding, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: false,
      }).start();
    }) : null;
    return () => { showSub?.remove(); frameSub?.remove(); hideSub?.remove(); };
  }, [keyboardPadding, insets.bottom]);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const messagesRef = useRef<DisplayMessage[]>(messages);
  messagesRef.current = messages;
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{
    message: string;
    upgrade?: string;
    /** True when this rejection happened before any generation/billing — safe
     *  to reassure the user their usage/quota wasn't touched. */
    notCharged?: boolean;
    /** Seconds to wait before retrying (rate_limit only). */
    wait?: number;
  } | null>(null);
  // Plain ScrollView, not FlatList: simple-chat conversations are bounded and
  // already fully in memory, and FlatList's virtualization estimates the height
  // of un-measured rows — on a very long assistant reply that estimate is wildly
  // off, so scrollToEnd lands above the real bottom and the next messages render
  // off-screen ("stuck, can't scroll down, replies vanish"). A ScrollView has no
  // estimation, so scrollToEnd is exact.
  const listRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  // Snapshot of whatever was already typed when voice input starts, so a
  // transcript appends to it instead of replacing it.
  const voiceBaseTextRef = useRef('');
  const [voiceListening, setVoiceListening] = useState(false);
  type StreamRuntime = {
    controller: AbortController;
    conversationId: string;
    assistantId: string;
    pendingText: string;
    raf: number | null;
    lastPersistAt: number;
    persistInFlight: boolean;
    completed: boolean;
  };
  const streamRuntimeRef = useRef<Map<string, StreamRuntime>>(new Map());
  const persistStreamFinal = useCallback(async (runtime: StreamRuntime, text: string) => {
    try {
      const conversations = await listConversations();
      const conversation = conversations.find((item) => item.id === runtime.conversationId);
      if (!conversation || !conversation.messages.some((message) => message.id === runtime.assistantId)) return;
      await saveConversation(
        conversation.id,
        conversation.messages.map((message) => message.id === runtime.assistantId ? { ...message, text } : message),
        conversation.modelId,
      );
    } catch {
      // Stream persistence is best-effort; the durable path remains authoritative.
    }
  }, []);

  // --- Send queue: a send that fails on a flaky/absent connection is held (not
  // lost, not a dead end) and auto-retried on reconnect / app-foreground / a
  // backoff timer. The user sees an honest "waiting to reconnect" state with a
  // manual "Retry now" — same model as iMessage/WhatsApp's clock → tick.
  type QueuedSend = { history: ChatMessage[]; assistantId: string; attempts: number; durable?: boolean; jobId?: string };
  // Key recovery state by assistant message so concurrent conversations cannot
  // overwrite one another's retry history or timers.
  const queuedSendsRef = useRef<Map<string, QueuedSend>>(new Map());
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const durableJobIdsRef = useRef<Map<string, { jobId: string; conversationId: string }>>(new Map());
  const flushQueuedSendRef = useRef<(assistantId?: string) => void>(() => {});
  const sendingRef = useRef(false);
  const sendingConversationRef = useRef<string | null>(null);

  const [conversationId, setConversationId] = useState(() => makeConversationId());
  // Prevent React's asynchronous state updates from persisting the previous
  // chat under a newly selected conversation id during a chat switch.
  const loadedConversationIdRef = useRef(conversationId);
  const currentConversationBusy = sending && sendingConversationRef.current === conversationId;
  const currentConversationStreaming = Array.from(streamRuntimeRef.current.values()).some(
    (runtime) => runtime.conversationId === conversationId,
  );
  const currentConversationDurableJobActive = Array.from(durableJobIdsRef.current.values()).some(
    (job) => job.conversationId === conversationId,
  );
  // Incognito: this conversation is never written to disk (lib/chat-history.ts)
  // and never appears in the Chats list — nothing to restore on relaunch, nothing
  // to search, nothing left behind if the app is closed. Messages still stream
  // through the same gateway call as any other chat (the gateway never stores
  // chat content either way — see CLAUDE.md), this only changes what happens to
  // the text on-device afterward.
  const [isIncognito, setIsIncognito] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  // Manual "move to project" picker on a Chat History row — which row (if
  // any) currently has its project-picker expanded, and the project list to
  // populate it with.
  const [projectPickerId, setProjectPickerId] = useState<string | null>(null);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  // In-chat search — finds a message within the CURRENTLY OPEN conversation and
  // jumps to it. Distinct from historyQuery above, which searches titles/bodies
  // ACROSS all saved conversations from the Chats list — that already existed;
  // this fills the actual gap, which was "I remember something was said further
  // up in THIS chat" with no way to find it besides scrolling.
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  // The message list is a plain ScrollView (see its own comment further down —
  // deliberately not a FlatList), so there's no built-in scrollToIndex. Each
  // message row records its own y-offset here on layout, and "jump to match"
  // just scrolls the ScrollView to that recorded offset.
  const messageLayoutsRef = useRef<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [scheduleNewOpen, setScheduleNewOpen] = useState(false);
  const [scheduleInitialPrompt, setScheduleInitialPrompt] = useState('');

  // Planner: a single sheet hosting both Daily notes and Scheduled tasks as tabs.
  const [plannerOpen, setPlannerOpen] = useState(false);
  const pendingNoteWriterOpenRef = useRef(false);
  const pendingScheduleSheetOpenRef = useRef(false);
  const pendingPlannerAfterScheduleDismissRef = useRef(false);
  const scheduleOpenedFromPlannerRef = useRef(false);
  const [plannerTab, setPlannerTab] = useState<PlannerTab>('scheduled');
  // The full-screen writing surface (opened from the planner's Daily notes tab).
  const [noteWriterOpen, setNoteWriterOpen] = useState(false);

  // Daily Notes: a per-day local scratchpad + archive, wired into the chat model.
  const [dailyNote, setDailyNote] = useState<DailyNote | null>(null); // note in the editor (today or archived)
  const [dailyNotesList, setDailyNotesList] = useState<DailyNote[]>([]);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [viewingTodayNote, setViewingTodayNote] = useState(true);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractCandidates, setExtractCandidates] = useState<string[]>([]);

  const [session, setSession] = useState<Session | null>(null);
  const [durableJobsActive, setDurableJobsActive] = useState(0);
  type AgentPhase = 'idle' | 'connecting' | 'thinking' | 'using_tool' | 'synthesizing' | 'paused' | 'reconnecting';
  const [agentActivity, setAgentActivity] = useState<Record<string, { phase: AgentPhase; tools: string[] }>>({});
  const [agentToolRuns, setAgentToolRuns] = useState<Record<string, Array<{ name: string; status: 'running' | 'complete' | 'failed'; startedAt: number; durationMs?: number }>>>({});
  const [agentRoutes, setAgentRoutes] = useState<Record<string, string>>({});
  const currentAgentActivity = agentActivity[conversationId] || { phase: 'idle' as AgentPhase, tools: [] };
  const agentPhase = currentAgentActivity.phase;
  const agentTools = currentAgentActivity.tools;
  const currentAgentToolRuns = agentToolRuns[conversationId] || [];
  const currentAgentRoute = agentRoutes[conversationId];
  const formatPrefix = input.trim().match(/^\/(checklist|memo|table|study|meeting|executive)\b/i)?.[1];
  const composerMode = /^\/task\b/i.test(input.trim()) ? 'Agent Task' : /^\/research\b/i.test(input.trim()) ? 'Research Brief' : /^\/verify\b/i.test(input.trim()) ? 'Verification' : /^\/critique\b/i.test(input.trim()) ? 'Critique' : /^\/doc\b/i.test(input.trim()) ? 'Document context' : /^\/nodoc\b/i.test(input.trim()) ? 'No document context' : /^\/fresh\b/i.test(input.trim()) ? 'Fresh context' : /^\/recent\s+\d+\b/i.test(input.trim()) ? 'Recent context' : formatPrefix ? `${formatPrefix[0].toUpperCase()}${formatPrefix.slice(1)} format` : null;
  const [durableJobStates, setDurableJobStates] = useState<Array<{ jobId: string; assistantMessageId: string; status: string; updatedAt: number; error: string | null; retryable?: boolean; phase?: string; nextRetryAt?: number | null; servedModel?: string | null }>>([]);
  const [durableJobsPaused, setDurableJobsPaused] = useState(false);
  const [hydratedLastConversation, setHydratedLastConversation] = useState(false);
  const markScheduledTaskRun = useScheduledTasksStore((s) => s.markRun);
  const markScheduledTaskPending = useScheduledTasksStore((s) => s.markPending);

  // Reattach durable fallback jobs after a foreground transition or cold start.
  // This is intentionally additive: jobs created by newer builds can be
  // reconciled by this screen, while ordinary legacy streams remain unchanged.
  const reconcileDurableJobs = useCallback(async () => {
    if (!session || !hydratedLastConversation) return;
    const activeToken = getActiveToken(session);
    if (!activeToken) return;
    const pending = await reconcilePendingChatJobs(activeToken);
    let savedConversations: Conversation[] | null = null;
    let hasPausedJob = false;
    const observedJobs: Array<{ jobId: string; assistantMessageId: string; status: string; updatedAt: number; error: string | null; retryable?: boolean; phase?: string; nextRetryAt?: number | null; servedModel?: string | null }> = [];
    for (const item of pending) {
        observedJobs.push({ jobId: item.jobId, assistantMessageId: item.assistantMessageId, status: item.state.status, updatedAt: item.state.updatedAt, error: item.state.error, retryable: item.state.retryable, phase: item.state.phase, nextRetryAt: item.state.nextRetryAt, servedModel: item.state.servedModel });
        if (item.state.status === 'paused') hasPausedJob = true;
        if (item.state.status === 'completed') {
          durableJobIdsRef.current.delete(item.assistantMessageId);
          setMessages((prev) => prev.map((message) => message.id === item.assistantMessageId
            ? { ...message, text: item.state.text, servedModel: item.state.servedModel ?? message.servedModel, streaming: false, queued: false, failed: false }
            : message));
          const scheduled = useScheduledTasksStore.getState().tasks.find((task) => task.jobId === item.jobId);
          if (scheduled) {
            await markScheduledTaskRun(scheduled.id, 'completed', item.state.text.slice(0, 160));
          }
          // Scheduled jobs can complete while a different chat is open. Update
          // the persisted conversation as well as the visible message list so
          // the answer is present when the push notification opens the chat.
          if (item.conversationId && item.conversationId !== conversationId) {
            savedConversations ??= await listConversations();
            const saved = savedConversations.find((conversation) => conversation.id === item.conversationId);
            if (saved) {
              await saveConversation(
                saved.id,
                saved.messages.map((message) => message.id === item.assistantMessageId
                  ? { ...message, text: item.state.text, servedModel: item.state.servedModel ?? message.servedModel }
                  : message),
                saved.modelId,
              );
            }
          }
          void NotificationsService.sendSystemNotification({
          type: 'response_ready',
          title: 'Expert AI response ready',
          body: 'Your answer finished while Expert AI was closed.',
          data: { type: 'response_ready', conversationId: item.conversationId || conversationId },
        });
        await forgetChatJob(item.jobId);
      } else if (item.state.status === 'failed' || item.state.status === 'cancelled' || item.state.status === 'dead_letter') {
        durableJobIdsRef.current.delete(item.assistantMessageId);
        const scheduled = useScheduledTasksStore.getState().tasks.find((task) => task.jobId === item.jobId);
        if (scheduled && (item.state.status === 'failed' || item.state.status === 'dead_letter')) {
          await markScheduledTaskRun(scheduled.id, item.state.status === 'dead_letter' ? 'exhausted' : 'failed', item.state.error || (item.state.status === 'dead_letter' ? 'Retry budget exhausted; create a fresh scheduled task.' : 'The scheduled job failed.'));
        }
        if (item.state.status === 'failed' && item.conversationId) {
          savedConversations ??= await listConversations();
          const saved = savedConversations.find((conversation) => conversation.id === item.conversationId);
          if (saved) {
            const failedIndex = saved.messages.findIndex((message) => message.id === item.assistantMessageId);
            const retryMessages = failedIndex >= 0 ? saved.messages.slice(0, failedIndex) : saved.messages;
            const lastUserText = [...retryMessages].reverse().find((message) => message.role === 'user')?.text || '';
            const retryHistory = await buildHistoryForSend(
              saved.id,
              buildSystemContextMessage(currentStyleOpts(lastUserText)),
              retryMessages,
              session,
              saved.modelId,
            );
            queuedSendsRef.current.set(item.assistantMessageId, {
              history: retryHistory,
              assistantId: item.assistantMessageId,
              attempts: 1,
              durable: true,
              jobId: item.jobId,
            });
          }
        }
        setMessages((prev) => prev.map((message) => message.id === item.assistantMessageId
          ? { ...message, streaming: false, queued: false, failed: true, text: item.state.text }
          : message));
        if (item.state.status === 'cancelled') await forgetChatJob(item.jobId);
      } else {
        durableJobIdsRef.current.set(item.assistantMessageId, {
          jobId: item.jobId,
          conversationId: item.conversationId || conversationId,
        });
        if (item.state.text) {
          setMessages((prev) => prev.map((message) => message.id === item.assistantMessageId
                  ? { ...message, text: item.state.text, servedModel: item.state.servedModel ?? message.servedModel, streaming: false, queued: true, failed: false }
            : message));
        }
      }
    }
    setDurableJobsActive(durableJobIdsRef.current.size);
    setDurableJobsPaused(hasPausedJob);
    setDurableJobStates(observedJobs);
  }, [session, hydratedLastConversation, conversationId, markScheduledTaskRun]);

  useEffect(() => {
    if (session?.token) flushResponseFeedback(session.token).catch(() => {});
    reconcileDurableJobs().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (session?.token) flushResponseFeedback(session.token).catch(() => {});
        reconcileDurableJobs().catch(() => {});
      }
    });
    const notificationSub = NotificationsService.addResponseListener((data) => {
      if (data.type === 'response_ready' || data.type === 'task_completed' || data.type === 'task_failed') {
        reconcileDurableJobs().catch(() => {});
      }
    });
    NotificationsService.getLastResponseData().then((data) => {
      if (data?.type === 'response_ready' || data?.type === 'task_completed' || data?.type === 'task_failed') {
        reconcileDurableJobs().catch(() => {});
      }
    }).catch(() => {});
    return () => {
      sub.remove();
      notificationSub?.remove();
    };
  }, [reconcileDurableJobs, session?.token]);
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [accountOpen, setAccountOpen] = useState(false);
  const [webAccountTab, setWebAccountTab] = useState<'balance' | 'plan' | 'history'>('balance');
  const [webPaymentHistory, setWebPaymentHistory] = useState<any[]>([]);
  const [webHistoryLoading, setWebHistoryLoading] = useState(false);
  const [webSettingsOpen, setWebSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  // Bumped whenever a document is saved from a message action, so the panel's
  // Documents tab picks up the new entry even if it's already open.
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [balanceToken, setBalanceToken] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [accountInfoToken, setAccountInfoToken] = useState<string | null>(null);
  const [refreshingAccount, setRefreshingAccount] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [restoringPurchases, setRestoringPurchases] = useState(false);

  // Founder-only admin console (see lib/admin-client.ts) — every action re-authenticates
  // server-side off session.token, nothing privileged lives in this state.
  const [adminOpen, setAdminOpen] = useState(false);
  // Latches true the first time the founder opens the console and never resets —
  // see the admin Modal's render guard below for why.
  const [hasOpenedAdmin, setHasOpenedAdmin] = useState(false);
  useEffect(() => {
    if (adminOpen) setHasOpenedAdmin(true);
  }, [adminOpen]);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminMember, setAdminMember] = useState<AdminMember | null>(null);
  const [adminUsage, setAdminUsage] = useState<UsageSummary | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminGrantTier, setAdminGrantTier] = useState('researcher');
  const [adminCreditsInput, setAdminCreditsInput] = useState('10');

  // Console: expandable sections beyond the core member panel — each loads lazily on tap.
  const [adminSection, setAdminSection] = useState<
    'members' | 'keys' | 'payments' | 'audit' | 'kpis' | 'crashes' | null
  >(null);
  const [adminSectionBusy, setAdminSectionBusy] = useState(false);
  const [adminMembersList, setAdminMembersList] = useState<{ total: number; counts: Record<string, number>; members: MemberSummary[] } | null>(null);
  const [adminKeys, setAdminKeys] = useState<{ count: number; keys: KeyStatus[] } | null>(null);
  const [adminPayments, setAdminPayments] = useState<PaymentRecord[] | null>(null);
  const [adminAudit, setAdminAudit] = useState<AuditEvent[] | null>(null);
  const [adminKpis, setAdminKpis] = useState<AdminKpis | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminCrashes, setAdminCrashes] = useState<CrashRecord[] | null>(null);

  const [signInOpen, setSignInOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<'create' | 'signin'>('create');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInCode, setSignInCode] = useState('');
  const [emailChallenge, setEmailChallenge] = useState<EmailCodeChallenge | null>(null);
  const [signInStatus, setSignInStatus] = useState<'idle' | 'opening' | 'waiting' | 'verifying' | 'error'>('idle');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // Do not render the signed-out onboarding until the cached session check has
  // finished. Without this gate, a returning signed-in user sees one frame of
  // onboarding while restoreSession() is still resolving.
  const [sessionResolved, setSessionResolved] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [onboardingTargets, setOnboardingTargets] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const onboardingContainersRef = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const registerOnboardingTarget = useCallback((name: string, layout: { x: number; y: number; width: number; height: number }) => {
    setOnboardingTargets((current) => {
      const previous = current[name];
      if (previous && previous.x === layout.x && previous.y === layout.y && previous.width === layout.width && previous.height === layout.height) return current;
      return { ...current, [name]: layout };
    });
  }, []);
  const registerOnboardingContainer = useCallback((name: string, layout: { x: number; y: number; width: number; height: number }) => {
    onboardingContainersRef.current[name] = layout;
  }, []);
  const registerOnboardingChild = useCallback((name: string, parent: string, layout: { x: number; y: number; width: number; height: number }) => {
    const container = onboardingContainersRef.current[parent];
    if (!container) return;
    registerOnboardingTarget(name, { x: container.x + layout.x, y: container.y + layout.y, width: layout.width, height: layout.height });
  }, [registerOnboardingTarget]);
  // Age/terms handshake shown before the no-signup trial actually starts — the trial
  // identity is real and traceable server-side (see startFreeTrial), but the UI must
  // never go straight from a tap to a live chat box with zero acknowledgment step.
  const [trialGateOpen, setTrialGateOpen] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);

  useEffect(() => {
    if (!signInOpen) {
      setEmailChallenge(null);
      setSignInCode('');
      setSignInError(null);
      setSignInStatus('idle');
    }
  }, [signInOpen]);

  // AI Disclaimer modal (shown once per device on first launch)
  const [aiDisclaimerSeen, setAiDisclaimerSeen] = useState(false);
  const [showAiDisclaimer, setShowAiDisclaimer] = useState(false);


  const tier = getActiveTier(session);
  const token = getActiveToken(session);
  // `tier` above is the session's static ENTITLEMENT (what Ghost says this member is allowed to
  // buy — e.g. "researcher" the moment their Ghost account carries that label), not what's
  // actually gating requests right now. A member can be entitled to "researcher" and still be
  // running on the plain community allowance if they haven't started/renewed an active pass —
  // that's exactly what the 10-message counter reflects. `/balance`'s own `tier` field is the
  // server's EFFECTIVE tier (same `_effective()` used for gating), so it's the one that should
  // ever be displayed. Render a neutral label until it loads.
  // Always run the result through our own TIER_LABELS (never the server's tierLabel string
  // directly) so "community" reliably reads as "Free" everywhere, not the server's "Community".
  const confirmedBalance = session?.token
    ? (balanceToken === session.token ? balance : confirmedBalanceByToken.get(session.token) ?? null)
    : null;
  const effectiveTier = confirmedBalance?.tier as string | undefined;
  // The stored session tier is a legacy entitlement, not the effective plan.
  // Show a neutral label until /balance confirms the plan for this sign-in.
  const effectiveTierLabel = effectiveTier
    ? (TIER_LABELS[effectiveTier] ?? effectiveTier)
    : balanceToken === session?.token ? 'Plan unavailable' : 'Loading plan…';
  const visibleAccountInfo = accountInfoToken === session?.token ? accountInfo : null;

  useEffect(() => {
    // Warm Play Billing while the user is in chat, so opening the account sheet
    // can render cached offers immediately instead of starting a cold connection.
    if (Platform.OS === 'android') prefetchPlayProducts(Object.values(TIER_PRODUCT_IDS));
  }, []);

  useEffect(() => {
    consumeGoogleRedirectSession()
      .then((redirectSession) => redirectSession ?? restoreSession())
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setSessionResolved(true));
    // Load persisted theme (this updates the store's `settings`, which this
    // component is subscribed to above, so the screen re-renders automatically).
    useThemeStore.getState().load().catch((err) => {
      console.warn('[Theme] Failed to load, using defaults:', err);
    });
    NotificationsService.init().catch(() => {});

    // Show AI disclaimer on first launch (check if user has seen it before)
    const checkDisclaimerSeen = async () => {
      try {
        const seen = await useThemeStore.getState().getAiDisclaimerSeen?.();
        if (!seen) {
          setShowAiDisclaimer(true);
        }
        setAiDisclaimerSeen(!!seen);
      } catch (err) {
        // If check fails, show disclaimer to be safe
        setShowAiDisclaimer(true);
      }
    };
    checkDisclaimerSeen();
  }, []);

  // Android's default-assistant service opens the app with the assistant URI.
  // This only opens a foreground panel; it never reads the current screen or
  // starts microphone capture in the background.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openFromUrl = (url?: string | null) => {
      if (url?.includes('/assistant') || url?.includes('expert_ai_assistant')) {
        setAssistantOpen(true);
      }
    };
    Linking.getInitialURL().then(openFromUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => openFromUrl(url));
    return () => subscription.remove();
  }, []);

  // The welcome experience is shown for every signed-out visitor. It is
  // intentionally session-based rather than first-visit-only: signed-out
  // visitors should always understand the product before creating an account.
  useEffect(() => {
    if (!sessionResolved) return;
    if (session) {
      setOnboardingOpen(false);
      return;
    }
    setOnboardingOpen(true);
  }, [session, sessionResolved]);

  useEffect(() => {
    if (!onboardingOpen) return;
    setSidePanelOpen(false);
    setHistoryOpen(false);
    setAccountOpen(false);
    setInChatSearchOpen(false);
  }, [onboardingOpen]);

  useEffect(() => {
    // Selected model might no longer be unlocked (e.g. after sign-out) — fall back to free.
    if (!isModelUnlocked(modelId, tier)) setModelId(DEFAULT_MODEL_ID);
  }, [tier, modelId]);

  const refreshBalance = useCallback(async () => {
    if (!session) {
      setBalance(null);
      setBalanceToken(null);
      return;
    }
    try {
      const b = await fetchBalance(session.token);
      confirmedBalanceByToken.set(session.token, b);
      setBalance(b);
      setBalanceToken(session.token);
    } catch {
      const cached = confirmedBalanceByToken.get(session.token);
      setBalance(cached ?? null);
      setBalanceToken(session.token);
    }
  }, [session]);

  const refreshAccountData = useCallback(async () => {
    if (!session?.token) {
      setBalance(null);
      setBalanceToken(null);
      setAccountInfo(null);
      setAccountInfoToken(null);
      return;
    }
    setRefreshingAccount(true);
    try {
      const [nextBalance, nextAccount] = await Promise.all([
        fetchBalance(session.token),
        fetchAccountInfo(session.token),
      ]);
      confirmedBalanceByToken.set(session.token, nextBalance);
      setBalance(nextBalance);
      setBalanceToken(session.token);
      setAccountInfo(nextAccount);
      setAccountInfoToken(session.token);
    } catch {
      // Keep the last confirmed data for this same account; the sheet provides a retry.
    } finally {
      setRefreshingAccount(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session?.token) {
      setBalance(null);
      setBalanceToken(null);
      return;
    }
    let cancelled = false;
    const cachedBalance = confirmedBalanceByToken.get(session.token);
    setBalance(cachedBalance ?? null);
    setBalanceToken(cachedBalance ? session.token : null);
    fetchBalance(session.token)
      .then((next) => { confirmedBalanceByToken.set(session.token, next); if (!cancelled) { setBalance(next); setBalanceToken(session.token); } })
      .catch(() => {
        // Resolve the loading state without showing a stale entitlement label.
        // Preserve a previously confirmed balance for this account if present.
        if (!cancelled && !cachedBalance) setBalanceToken(session.token);
      });
    return () => { cancelled = true; };
  }, [session?.token]);

  useEffect(() => {
    if (accountOpen) void refreshAccountData();
  }, [accountOpen, refreshAccountData]);

  useEffect(() => {
    if (!accountOpen || !session || Platform.OS === 'ios' || (Platform.OS === 'web' && webAccountTab !== 'history')) return;
    let cancelled = false;
    setWebHistoryLoading(true);
    fetchPaymentHistory(session.token)
      .then((items) => { if (!cancelled) setWebPaymentHistory(items); })
      .catch(() => { if (!cancelled) setWebPaymentHistory([]); })
      .finally(() => { if (!cancelled) setWebHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [accountOpen, session, webAccountTab]);

  // Android restores from Google Play, verifies each purchased token on the
  // gateway, then refreshes the authoritative entitlement and quota. Web uses
  // the existing read-only gateway refresh path.
  const handleRestorePurchases = useCallback(async () => {
    if (!session || restoringPurchases) return;
    setRestoringPurchases(true);
    try {
      if (Platform.OS === 'android') {
        const purchases = await queryPlayPurchases();
        for (const purchase of purchases) {
          if (purchase.purchaseState !== 1) continue;
          for (const productId of purchase.productIds) {
            await verifyGooglePlaySubscription(session.token, { productId, purchaseToken: purchase.purchaseToken, orderId: purchase.orderId });
          }
          if (!purchase.acknowledged) await acknowledgePlayPurchase(purchase.purchaseToken);
        }
      }
      const [nextBalance, nextAccount] = await Promise.all([
        fetchBalance(session.token),
        fetchAccountInfo(session.token),
      ]);
      confirmedBalanceByToken.set(session.token, nextBalance);
      setBalance(nextBalance);
      setBalanceToken(session.token);
      setAccountInfo(nextAccount);
      setAccountInfoToken(session.token);
      Alert.alert('Purchases restored', 'Your current plan and quota are up to date.');
    } catch (error) {
      Alert.alert('Could not restore purchases', error instanceof Error ? error.message : 'Please try again in a moment.');
    } finally {
      setRestoringPurchases(false);
    }
  }, [session, restoringPurchases]);

  const handleCancelSubscription = useCallback(() => {
    if (!session) return;
    Alert.alert(
      'Cancel subscription?',
      'Your current access remains available until the paid period ends. Future automatic renewals will stop.',
      [
        { text: 'Keep subscription', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelTierSubscription(session.token);
              await handleRestorePurchases();
              Alert.alert('Subscription cancelled', 'Automatic renewal has been cancelled.');
            } catch (error) {
              Alert.alert('Could not cancel subscription', error instanceof Error ? error.message : 'Please contact support.');
            }
          },
        },
      ],
    );
  }, [handleRestorePurchases, session]);

  const handleSignOutEverywhere = useCallback(() => {
    if (!session) return;
    Alert.alert(
      'Sign out of all devices?',
      "This ends every signed-in session, including this one — you'll need to sign in again right after.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out everywhere',
          style: 'destructive',
          onPress: async () => {
            setSigningOutEverywhere(true);
            try {
              await signOutEverywhere(session.token);
            } catch {
              // Even if the request failed, the safest local behavior is still
              // to sign out this device — we don't want a failed network call
              // to leave the user thinking "sign out everywhere" silently did
              // nothing when they explicitly asked to end every session.
            } finally {
              setSigningOutEverywhere(false);
              await clearGoogleAccount();
              await signOut();
              setSession(null);
              setBalance(null);
              setAccountInfo(null);
              setAccountOpen(false);
            }
          },
        },
      ],
    );
  }, [session]);

  // Refresh balance in background on sign-in/app-launch WITHOUT waiting for it
  // This keeps the account badge responsive by showing the cached/static tier
  // while the actual balance loads in the background
  useEffect(() => {
    refreshBalance().catch(() => {
      // Silent failure - we already have a UI fallback with the static tier
    });
  }, [session, refreshBalance]);

  // Persist the active conversation after each exchange settles (not per
  // streamed token — only once sending finishes, so it's a single write).
  useEffect(() => {
    if (sending || messages.length === 0 || isIncognito || loadedConversationIdRef.current !== conversationId) return;
    saveConversation(
      conversationId,
      messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
      modelId,
    );
  }, [messages, sending, conversationId, modelId, isIncognito]);

  // While a response is still streaming, the effect above intentionally skips
  // saving (avoids a disk write per token). But that leaves a real gap: if the
  // OS kills the app mid-stream — e.g. a Samsung Fold's inner/outer display
  // switch can do this — the in-progress exchange is lost entirely, even
  // though the "resume last conversation" restore (above) expects something
  // to resume. Checkpoint periodically during streaming instead, so at worst
  // a kill loses a couple of seconds of partial text, not the whole exchange.
  const latestStreamStateRef = useRef({ conversationId, messages, modelId, isIncognito });
  latestStreamStateRef.current = { conversationId, messages, modelId, isIncognito };
  useEffect(() => {
    if (!sending || isIncognito) return;
    const checkpoint = () => {
      const { conversationId: id, messages: msgs, modelId: model, isIncognito: incog } = latestStreamStateRef.current;
      if (msgs.length === 0 || incog || loadedConversationIdRef.current !== id) return;
      saveConversation(id, msgs.map((m) => ({ id: m.id, role: m.role, text: m.text })), model);
    };
    checkpoint(); // save immediately when a turn starts, not up to 2s later —
                  // a Fold display-switch that recreates the Activity in the first
                  // second would otherwise lose the whole exchange.
    const interval = setInterval(checkpoint, 1500);
    return () => clearInterval(interval);
  }, [sending, isIncognito]);

  // Restore whichever conversation was on screen last time, so a cold relaunch
  // (the app can be killed by the OS in the background — e.g. a Samsung Fold's
  // inner/outer display switch is known to trigger this) resumes where the
  // user left off instead of opening a blank "new chat".
  useEffect(() => {
    (async () => {
      const lastId = await getLastActiveConversationId();
      if (lastId) {
        const all = await listConversations();
        const found = all.find((c) => c.id === lastId);
        if (found) {
          loadedConversationIdRef.current = found.id;
          setConversationId(found.id);
          setMessages(found.messages.map((m) => ({ ...m })));
          if (isModelUnlocked(found.modelId, tier)) setModelId(found.modelId);
          const draft = await getDraft(found.id);
          if (draft) setInput(draft);
        }
      }
      setHydratedLastConversation(true);
    })();
    // Runs once on mount only — later tier changes are handled by the existing
    // "selected model still unlocked" effect above, not by re-running this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedLastConversation || isIncognito) return;
    setLastActiveConversationId(conversationId);
  }, [conversationId, hydratedLastConversation, isIncognito]);

  // Persist the unsent composer text against the current conversation (debounced),
  // so switching chats or backgrounding the app never drops a half-typed message.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydratedLastConversation || isIncognito) return;
    const id = conversationId;
    const text = input;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      setDraft(id, text).catch(() => {});
    }, 500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [input, conversationId, hydratedLastConversation, isIncognito]);

  const refreshHistory = useCallback(async () => {
    setConversations(await listConversations());
  }, []);

  // Client-side search across titles and message bodies of the already-loaded,
  // device-local history — no network, matches every whitespace-separated term.
  const filteredConversations = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return conversations;
    const terms = q.split(/\s+/);
    return conversations.filter((c) => {
      const hay = (c.title + ' ' + c.messages.map((m) => m.text).join(' ')).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [conversations, historyQuery]);

  useEffect(() => {
    if (historyOpen) {
      refreshHistory();
      listProjects().then(setAvailableProjects).catch(() => setAvailableProjects([]));
    } else {
      setProjectPickerId(null);
    }
  }, [historyOpen, refreshHistory]);

  const handleAssignProject = useCallback(async (conversationIdToAssign: string, projectId: string | null) => {
    await assignConversationToProject(conversationIdToAssign, projectId);
    setProjectPickerId(null);
    refreshHistory();
  }, [refreshHistory]);

  // The workspace panel's Projects tab lists each project's linked chats —
  // keep that list fresh whenever the panel opens, not only Chat History.
  useEffect(() => {
    if (sidePanelOpen) refreshHistory();
  }, [sidePanelOpen, refreshHistory]);

  // An open document (see lib/document-chat-store.ts) is scoped to the chat
  // it was opened in — switching to a different (or brand-new) chat while
  // it's open would otherwise leave a stale document pinned above an
  // unrelated conversation. Closes it first (confirming if there are
  // uncommitted edits, since GitHub sync is manual via the Commit button)
  // and only runs `proceed` once that's settled. Static store access (not
  // the `useDocumentChatStore` hook) so this has no ordering dependency on
  // where the document-chat state is declared elsewhere in this component.
  const runAfterClosingDocument = useCallback((proceed: () => void) => {
    const doc = useDocumentChatStore.getState().activeDocument;
    if (!doc) { proceed(); return; }
    if (doc.content === doc.original) { useDocumentChatStore.getState().close(); proceed(); return; }
    Alert.alert('Discard unsaved document edits?', 'Switching chats closes the open document. It has changes that were never committed to GitHub.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard & switch', style: 'destructive', onPress: () => { useDocumentChatStore.getState().close(); proceed(); } },
    ]);
  }, []);

  const handleNewChat = useCallback(() => {
    runAfterClosingDocument(() => {
      const id = makeConversationId();
      loadedConversationIdRef.current = id;
      setConversationId(id);
      setMessages([]);
      setInput('');
      setError(null);
      setIsIncognito(false);
      setEditingMessageId(null);
      setHistoryOpen(false);
    });
  }, [runAfterClosingDocument]);

  // Same as handleNewChat, but the resulting conversation is never written to
  // disk or shown in Chats — see the isIncognito state comment above.
  const handleNewIncognitoChat = useCallback(() => {
    runAfterClosingDocument(() => {
      const id = makeConversationId();
      loadedConversationIdRef.current = id;
      setConversationId(id);
      setMessages([]);
      setInput('');
      setError(null);
      setIsIncognito(true);
      setEditingMessageId(null);
      setHistoryOpen(false);
    });
  }, [runAfterClosingDocument]);

  const handleOpenConversation = useCallback((conversation: Conversation) => {
    runAfterClosingDocument(() => {
      loadedConversationIdRef.current = conversation.id;
      setConversationId(conversation.id);
      setMessages(conversation.messages.map((m) => ({ ...m })));
      if (isModelUnlocked(conversation.modelId, tier)) setModelId(conversation.modelId);
      setError(null);
      setIsIncognito(false);
      setEditingMessageId(null);
      setHistoryOpen(false);
      setHistoryQuery('');
      getDraft(conversation.id).then((d) => setInput(d)).catch(() => {});
    });
  }, [tier, runAfterClosingDocument]);

  const handleBranchConversation = useCallback(async (conversation: Conversation) => {
    if (!conversation.messages.length) return;
    const id = makeConversationId();
    const branch: Conversation = {
      ...conversation,
      id,
      title: `Branch · ${conversation.title}`,
      messages: conversation.messages.map((message) => ({ ...message, id: makeId() })),
      updatedAt: Date.now(),
      pinned: undefined,
      projectId: conversation.projectId,
    };
    await saveConversation(branch.id, branch.messages, branch.modelId);
    await refreshHistory();
    handleOpenConversation(branch);
  }, [handleOpenConversation, refreshHistory]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    clearCompactionState(id);
    refreshHistory();
    if (id === conversationId) handleNewChat();
  }, [conversationId, handleNewChat, refreshHistory]);

  // Workspace's Projects tab hands back a bare conversation id (it only knows
  // ids, not full Conversation objects) — look it up against the already
  // in-memory history list and reuse the same open path as Chat History.
  const handleOpenConversationId = useCallback((id: string) => {
    const found = conversations.find((c) => c.id === id);
    if (found) handleOpenConversation(found);
    setSidePanelOpen(false);
  }, [conversations, handleOpenConversation]);

  const { openConversationId, openJobId } = useLocalSearchParams<{ openConversationId?: string; openJobId?: string }>();
  const { recipePrompt } = useLocalSearchParams<{ recipePrompt?: string }>();
  useEffect(() => {
    if (!recipePrompt || typeof recipePrompt !== 'string') return;
    setInput(recipePrompt);
    setTimeout(() => inputRef.current?.focus(), 120);
    router.setParams({ recipePrompt: undefined });
  }, [recipePrompt, router]);
  const handledOpenConversationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openConversationId || handledOpenConversationRef.current === openConversationId || !hydratedLastConversation) return;
    const found = conversations.find((conversation) => conversation.id === openConversationId);
    if (!found) return;
    handledOpenConversationRef.current = openConversationId;
    handleOpenConversation(found);
    // Keep the job identifier through the notification-driven open path. The
    // normal foreground reconciliation remains authoritative, but this makes
    // the exact durable run available for targeted diagnostics and future
    // handoff without changing legacy conversation links.
    if (openJobId) {
      void reconcileDurableJobs();
    }
    router.setParams({ openConversationId: undefined });
    if (openJobId) router.setParams({ openJobId: undefined });
  }, [openConversationId, openJobId, conversations, hydratedLastConversation, handleOpenConversation, reconcileDurableJobs, router]);

  // "New chat in this project" — same as handleNewChat, but the chat is
  // written to disk immediately (see createEmptyConversation) so it shows up
  // under the project right away instead of only after the first message.
  // Opening a file from an Archive doesn't go to a separate editor — it loads
  // straight into the chat screen (see the document card rendered above the
  // message list below), where it's both hand-editable and AI-editable via
  // the normal composer.
  const documentChatOpen = useDocumentChatStore((s) => s.open);
  const activeDocument = useDocumentChatStore((s) => s.activeDocument);
  const documentChatClose = useDocumentChatStore((s) => s.close);
  const documentChatUpdateContent = useDocumentChatStore((s) => s.updateContent);
  // Rendered markdown by default (fast to scroll, matches how the file
  // actually looks) — tapping the pencil switches to the raw editable text.
  // Resets to preview whenever a different file is opened.
  const [docViewMode, setDocViewMode] = useState<'preview' | 'edit'>('preview');
  // Full-screen reading mode — the inline card is deliberately compact (it
  // has to coexist with the chat above it), but a user who just wants to
  // read a note shouldn't be stuck scrolling a small box. Same content,
  // same edit/commit actions, just given the whole screen.
  const [docFullView, setDocFullView] = useState(false);
  const docPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeDocument?.path !== docPathRef.current) {
      docPathRef.current = activeDocument?.path ?? null;
      setDocViewMode('preview');
      setDocFullView(false);
    }
  }, [activeDocument?.path]);
  const documentChatMarkCommitted = useDocumentChatStore((s) => s.markCommitted);
  // Recover an in-progress document edit that survived an app kill (see
  // document-chat-store.ts) — runs once, before the user can lose it again.
  useEffect(() => { useDocumentChatStore.getState().hydrate(); }, []);
  const [docCardCollapsed, setDocCardCollapsed] = useState(false);
  const [docCommitting, setDocCommitting] = useState(false);
  const docDirty = !!activeDocument && activeDocument.content !== activeDocument.original;

  const handleCommitDocument = useCallback(async () => {
    if (!activeDocument) return;
    setDocCommitting(true);
    try {
      const { sha } = await putFile(
        activeDocument.repoFullName,
        activeDocument.path,
        activeDocument.content,
        `Update ${activeDocument.path} via Expert AI`,
        activeDocument.sha,
      );
      documentChatMarkCommitted(sha, activeDocument.content);
      buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    } catch (err) {
      if (err instanceof GithubApiError && err.status === 409) {
        Alert.alert('This file changed on GitHub', 'It was edited elsewhere since you opened it. Close and reopen it to get the latest version before committing.');
      } else {
        Alert.alert('Could not commit', err instanceof Error ? err.message : 'Please try again.');
      }
    } finally {
      setDocCommitting(false);
    }
  }, [activeDocument, documentChatMarkCommitted]);

  const handleCloseDocument = useCallback(() => {
    if (docDirty) {
      Alert.alert('Discard unsaved edits?', 'This document has changes that were never committed to GitHub.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: documentChatClose },
      ]);
    } else {
      documentChatClose();
    }
  }, [docDirty, documentChatClose]);

  const handleOpenArchiveFile = useCallback(async (archive: Archive, path: string) => {
    try {
      const file = await getFile(archive.repoFullName, path);
      runAfterClosingDocument(() => {
        documentChatOpen({
          archiveId: archive.id,
          archiveName: archive.name,
          repoFullName: archive.repoFullName,
          path: file.path,
          sha: file.sha,
          content: file.content,
          original: file.content,
        });
        setSidePanelOpen(false);
      });
    } catch (err) {
      Alert.alert('Could not open file', err instanceof Error ? err.message : 'Please try again.');
    }
  }, [documentChatOpen, runAfterClosingDocument]);

  const handleNewChatInProject = useCallback((projectId: string) => {
    runAfterClosingDocument(() => {
      const id = makeConversationId();
      setConversationId(id);
      setMessages([]);
      setInput('');
      setError(null);
      setIsIncognito(false);
      setEditingMessageId(null);
      setSidePanelOpen(false);
      createEmptyConversation(id, projectId, modelId).then(refreshHistory).catch(() => {});
    });
  }, [refreshHistory, modelId, runAfterClosingDocument]);

  const handleTogglePin = useCallback(async (id: string) => {
    await togglePinConversation(id);
    refreshHistory();
  }, [refreshHistory]);

  // One-tap export via Android's native share sheet — plain text, no
  // permissions needed, no SAF folder setup. Distinct from the Auto Backup
  // work: this hands one specific chat straight to WhatsApp/email/Files/
  // wherever, immediately, for a user who never touches backup settings.
  const handleShareConversation = useCallback(async (conversation: Conversation) => {
    const body = conversation.messages
      .map((m) => `${m.role === 'user' ? 'You' : 'Expert AI'}: ${m.text}`)
      .join('\n\n');
    try {
      await Share.share({ title: conversation.title, message: `${conversation.title}\n\n${body}` });
    } catch {
      // User cancelled the share sheet, or it failed — never worth surfacing.
    }
  }, []);

  // --- Streaming perf: batch token deltas into one state update per animation
  // frame instead of one per SSE chunk (chunks can arrive in fast bursts).
  const flushPending = useCallback((assistantId: string) => {
    const runtime = streamRuntimeRef.current.get(assistantId);
    if (!runtime) return;
    runtime.raf = null;
    const chunk = runtime.pendingText;
    runtime.pendingText = '';
    if (!chunk) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m)),
    );
    const now = Date.now();
    if (!runtime.persistInFlight && now - runtime.lastPersistAt >= 1200) {
      runtime.lastPersistAt = now;
      runtime.persistInFlight = true;
      void listConversations()
        .then((conversations) => {
          const conversation = conversations.find((item) => item.id === runtime.conversationId);
          if (!conversation) return;
          const existing = conversation.messages.find((message) => message.id === runtime.assistantId);
          if (!existing) return;
          return saveConversation(
            conversation.id,
            conversation.messages.map((message) => message.id === runtime.assistantId
              ? { ...message, text: message.text + chunk }
              : message),
            conversation.modelId,
          );
        })
        .catch(() => {})
        .finally(() => { runtime.persistInFlight = false; });
    }
  }, []);

  /** Shared by handleSend, handleRegenerate, and scheduled-task execution — runs
   *  the completion against `history`, streaming into the message already named
   *  `assistantId`. Returns the full accumulated text and whether it actually
   *  completed, so callers that need the result (scheduled tasks, for their
   *  history preview) don't have to re-derive it from React state, which is
   *  stale inside this same async closure right after streaming ends. */
  const runCompletion = useCallback(
    async (history: ChatMessage[], assistantId: string): Promise<{ success: boolean; text: string }> => {
      const controller = new AbortController();
      const runtime: StreamRuntime = {
        controller,
        conversationId,
        assistantId,
        pendingText: '',
        raf: null,
        lastPersistAt: 0,
        persistInFlight: false,
        completed: false,
      };
      streamRuntimeRef.current.set(assistantId, runtime);
      let fullText = '';
      let success = false;
      // Snapshot which document (if any) was open when this turn started, so
      // a later ```document block only ever applies to that same file even
      // if the user closes it or opens a different one while this streams.
      const docAtSendTime = useDocumentChatStore.getState().activeDocument;
      const targetDocForEdit = docAtSendTime ? { archiveId: docAtSendTime.archiveId, path: docAtSendTime.path } : null;

      // Check if query should route to AEC Knowledge. A multimodal (image) message has no
      // plain-text content to keyword-match against — AEC routing only ever applies to text.
      const lastUserMessage = history.filter((m) => m.role === 'user').pop();
      const lastUserText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
      const shouldUseAEC = lastUserMessage && AECKnowledgeService.shouldUseAECKnowledge(lastUserText);

      if (shouldUseAEC) {
        console.log('[Chat] AEC keyword detected');
        const aecIsEnabled = await AECKnowledgeService.isEnabled();
        const aecState = await AECKnowledgeService.init();

        // If the keyword matched but there's no usable MCP link (never activated, or the
        // cached session predates the account being verified — see AECKnowledgeService),
        // say so visibly instead of silently answering from general knowledge with no
        // indication AEC was skipped. Falls through to the normal Claude turn below.
        if (aecIsEnabled && !aecState?.link) {
          const notice = '⚠️ AEC Knowledge isn\'t connected — reconnect it in Settings. Answering from general knowledge instead.\n\n';
          fullText += notice;
          runtime.pendingText += notice;
          if (runtime.raf == null) {
            runtime.raf = requestAnimationFrame(() => flushPending(assistantId));
          }
        }

        if (aecIsEnabled && aecState?.link) {
          console.log('[Chat] AEC ENABLED - querying MCP with user feedback');
          // Show status update to user
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, text: '🔍 Querying AEC Knowledge...' }
                : m
            ),
          );
          try {
            const mpcLink = aecState.link;
            const query = lastUserText;
            await new Promise<void>((resolve, reject) => {
              AECKnowledgeService.queryMCP(
                mpcLink,
                query,
                (chunk) => {
                  fullText += chunk;
                  runtime.pendingText += chunk;
                  if (runtime.raf == null) {
                    runtime.raf = requestAnimationFrame(() => flushPending(assistantId));
                  }
                },
                () => {
                  console.log('[Chat] AEC query success');
                  if (runtime.raf != null) {
                    cancelAnimationFrame(runtime.raf);
                    flushPending(assistantId);
                  }
                  success = true;
                  void persistStreamFinal(runtime, fullText);
                  streamRuntimeRef.current.delete(assistantId);
                  queuedSendsRef.current.delete(assistantId);
                  const successTimer = retryTimersRef.current.get(assistantId);
                  if (successTimer) { clearTimeout(successTimer); retryTimersRef.current.delete(assistantId); }
                  setSending(false);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, streaming: false, queued: false, failed: false, usedTools: ['aec'] }
                        : m,
                    ),
                  );
                  resolve();
                },
                (err) => {
                  console.error('[Chat] AEC query failed:', err.message);
                  if (runtime.raf != null) {
                    cancelAnimationFrame(runtime.raf);
                    runtime.raf = null;
                    runtime.pendingText = '';
                  }
                  reject(err);
                },
              );
            }).catch((err) => {
              console.warn('[Chat] AEC error, showing to user');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, streaming: false, text: `❌ Error querying AEC: ${err.message}` }
                    : m
                ),
              );
              void persistStreamFinal(runtime, fullText);
              setSending(false);
            });

            if (success) {
              console.log('[Chat] AEC returned response, skipping Claude');
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
              return { success, text: fullText };
            }
          } catch (err) {
            console.warn('[Chat] AEC routing exception:', err);
          }
        }
      }

      // Fall back to Claude for response. The gateway already injects MCP tool schemas
      // server-side for the unlimited router — if the model requests a tool call mid-stream,
      // onToolCalls fires instead of onDone; we execute the tool(s) and recurse with the
      // extended history so the model gets a normal follow-up turn to produce final text.
      console.log('[Chat] Using Claude');

      const runStream = async (turnHistory: ChatMessage[]): Promise<void> => {
        setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'thinking', tools: previous[conversationId]?.tools || [] } }));
        await streamChatCompletion(
          turnHistory,
          { token, model: modelId, signal: controller.signal },
          {
            onPhase: (phase) => {
              if (phase === 'complete' || phase === 'error') {
                setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'idle', tools: phase === 'complete' ? [] : (previous[conversationId]?.tools || []) } }));
              } else {
                setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase, tools: previous[conversationId]?.tools || [] } }));
              }
            },
            onModel: (servedModel) => {
              setAgentRoutes((previous) => ({ ...previous, [conversationId]: servedModel }));
              setMessages((previous) => previous.map((message) => message.id === assistantId ? { ...message, servedModel } : message));
            },
            onDelta: (chunk) => {
              fullText += chunk;
              runtime.pendingText += chunk;
              if (runtime.raf == null) {
                runtime.raf = requestAnimationFrame(() => flushPending(assistantId));
              }
            },
            onDone: () => {
              // Some fetch/SSE implementations can deliver a late error after
              // the terminal event (especially when the app is backgrounded).
              // Mark completion before any async-adjacent cleanup so that such
              // a callback can never replace a valid answer with a retry error.
              if (runtime.completed) return;
              runtime.completed = true;
              if (runtime.raf != null) {
                cancelAnimationFrame(runtime.raf);
                runtime.raf = null;
                flushPending(assistantId);
              }
              streamRuntimeRef.current.delete(assistantId);
              success = true;
              queuedSendsRef.current.delete(assistantId);
              const completedTimer = retryTimersRef.current.get(assistantId);
              if (completedTimer) { clearTimeout(completedTimer); retryTimersRef.current.delete(assistantId); }
              const documentDisplayText = maybeApplyDocumentEdit(fullText, targetDocForEdit);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, ...(documentDisplayText != null ? { text: documentDisplayText } : {}), streaming: false, queued: false, failed: false }
                    : m,
                ),
              );
              setSending(false);
              buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
            },
            onToolCalls: async (toolCalls) => {
              const toolNames = toolCalls.map((t) => t.function.name);
              buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
              setAgentToolRuns((previous) => ({
                ...previous,
                [conversationId]: toolNames.map((name) => ({ name, status: 'running', startedAt: Date.now() })),
              }));
              setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'using_tool', tools: Array.from(new Set([...(previous[conversationId]?.tools || []), ...toolNames])) } }));
              console.log('[MCP] Tool call(s) requested:', toolNames);
              // Visible status while the tool runs — otherwise the bubble just sits blank
              // with no indication the model is looking anything up (unlike the AEC-keyword
              // path below, which already shows "🔍 Querying AEC Knowledge...").
              if (runtime.raf != null) {
                cancelAnimationFrame(runtime.raf);
                runtime.raf = null;
              }
              runtime.pendingText = '';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        text: `🔍 Looking that up (${toolNames.join(', ')})...`,
                        usedTools: Array.from(new Set([...(m.usedTools ?? []), ...toolNames])),
                      }
                    : m,
                ),
              );
              try {
                const assistantToolMsg = {
                  role: 'assistant' as const,
                  content: '',
                  tool_calls: toolCalls,
                } as unknown as ChatMessage;

                const toolResultMsgs: ChatMessage[] = [];
                // Run sequentially because iOS alerts and modal presentations
                // must not overlap. Daily notes are private local data: the
                // user's chat instruction authorizes the requested local edit.
                for (const tc of toolCalls) {
                  let args: Record<string, any> = {};
                  let argsParseError: string | null = null;
                  try {
                    const parsed = JSON.parse(tc.function.arguments || '{}');
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                      if (Platform.OS === 'ios') argsParseError = 'Tool arguments must be a JSON object.';
                    } else {
                      args = parsed;
                    }
                  } catch (error) {
                    if (Platform.OS === 'ios') {
                      argsParseError = error instanceof Error ? `Tool arguments are invalid JSON: ${error.message}` : 'Tool arguments are invalid JSON.';
                    }
                  }
                  const needsApproval = !argsParseError && (tc.function.name === 'daily_note'
                    ? Platform.OS !== 'ios'
                    : isMcpToolApprovalRequired(tc.function.name));
                  const approved = needsApproval ? await askMcpToolApproval(tc.function.name) : false;
                  let result: any;
                  if (argsParseError) {
                    result = { error: true, code: 'invalid_arguments', message: argsParseError };
                  } else if (!approved && needsApproval) {
                    result = { error: true, code: 'approval_required', message: `Approval is required before using ${tc.function.name}.` };
                  } else if (tc.function.name === 'daily_note') {
                    try {
                      result = await executeDailyNoteTool(args);
                      if (Platform.OS === 'ios' && !result?.error && result?.ok) {
                        const refreshedNotes = await listDailyNotes();
                        setDailyNotesList(refreshedNotes);
                        setDailyStreak(computeStreak(refreshedNotes));
                        const refreshedNote = typeof result.date === 'string'
                          ? refreshedNotes.find((note) => note.id === result.date)
                          : undefined;
                        if (refreshedNote) {
                          setDailyNote((current) => current?.id === refreshedNote.id ? refreshedNote : current);
                        }
                      }
                    } catch (error) {
                      result = { error: true, message: error instanceof Error ? error.message : 'Daily note could not be updated.' };
                    }
                  } else {
                    result = await executeMcpToolWithDeadline(tc.function.name, args, token, 45_000, approved);
                  }
                  toolResultMsgs.push({
                    role: 'tool' as const,
                    tool_call_id: tc.id,
                    content: JSON.stringify(result),
                  } as unknown as ChatMessage);
                }
                setAgentToolRuns((previous) => ({
                  ...previous,
                  [conversationId]: toolNames.map((name, index) => {
                    const startedAt = previous[conversationId]?.find((run) => run.name === name)?.startedAt || Date.now();
                    let failed = false;
                    try {
                      const content = toolResultMsgs[index]?.content;
                      failed = Boolean(JSON.parse(typeof content === 'string' ? content : '{}').error);
                    } catch { failed = true; }
                    return { name, status: failed ? 'failed' : 'complete', startedAt, durationMs: Date.now() - startedAt };
                  }),
                }));

                // Clear the "Looking that up..." placeholder before the follow-up turn streams
                // in — flushPending appends to whatever `m.text` currently holds, so leaving the
                // placeholder in place would produce "🔍 Looking that up...<real answer>" glued
                // together instead of a clean final reply.
                fullText = '';
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, text: '' } : m)),
                );

                const nextHistory = [...turnHistory, assistantToolMsg, ...toolResultMsgs];
                await runStream(nextHistory);
              } catch (err) {
                console.error('[MCP] Tool execution failed:', err);
                setAgentToolRuns((previous) => ({
                  ...previous,
                  [conversationId]: toolNames.map((name) => ({ name, status: 'failed', startedAt: previous[conversationId]?.find((run) => run.name === name)?.startedAt || Date.now(), durationMs: Date.now() - (previous[conversationId]?.find((run) => run.name === name)?.startedAt || Date.now()) })),
                }));
                streamRuntimeRef.current.delete(assistantId);
                if (runtime.raf != null) cancelAnimationFrame(runtime.raf);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, streaming: false, text: fullText || 'Sorry, the knowledge base lookup failed. Please try again.' }
                      : m,
                  ),
                );
                success = true;
                setSending(false);
              }
            },
            onError: (err) => {
              // A provider can close successfully and still surface a delayed
              // reader error when the app changes audio/foreground state. Once
              // any answer text is present, preserve it instead of converting
              // the completed/partial reply into a generic failure bubble.
              if (runtime.completed || streamRuntimeRef.current.get(assistantId) !== runtime) return;
              if (fullText.trim()) {
                runtime.completed = true;
                streamRuntimeRef.current.delete(assistantId);
                if (runtime.raf != null) cancelAnimationFrame(runtime.raf);
                setMessages((prev) => prev.map((m) => m.id === assistantId
                  ? { ...m, streaming: false, queued: false, failed: false }
                  : m));
                setSending(false);
                return;
              }
              streamRuntimeRef.current.delete(assistantId);
              if (runtime.raf != null) cancelAnimationFrame(runtime.raf);
              runtime.pendingText = '';
              if (isAbortError(err)) {
                // User pressed Stop — keep whatever text streamed in so far,
                // just mark the bubble settled rather than discarding it.
                success = true;
                setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'idle', tools: previous[conversationId]?.tools || [] } }));
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
                );
              } else if (err instanceof GatewayError) {
                // A real, structured API rejection — switch on `type`, never on
                // message text (the message can change; the type is the stable
                // contract). Tagged to Sentry by type so a spike in any one
                // rejection class is easy to spot and grep later, independent of
                // whatever the human-readable message happens to say.
                const info = classifyGatewayError(err.type);
                try {
                  Sentry.captureMessage(`Gateway rejection: ${err.type ?? 'unknown'}`, {
                    level: 'info',
                    tags: { area: 'chat-stream', gateway_error_type: err.type ?? 'unknown' },
                    extra: { model: modelId, message: err.message, wait: err.wait },
                  });
                } catch {
                  /* reporting must never throw */
                }
                // Never delete the assistant placeholder on a structured
                // rejection. The settled conversation effect would otherwise
                // persist a shorter history and permanently erase the turn.
                setMessages((prev) => prev.map((m) => m.id === assistantId
                  ? { ...m, streaming: false, queued: false, failed: true }
                  : m));
                setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'idle', tools: previous[conversationId]?.tools || [] } }));
                if (err.type === 'auth') {
                  // The session itself is invalid/expired — a banner alone leaves
                  // the user stuck retrying the same broken session. Sign out and
                  // prompt sign-in directly instead.
                  signOut();
                  setSession(null);
                  setSignInError('Your session expired. Please sign in again.');
                  setSignInOpen(true);
                } else {
                  setError({ message: err.message, upgrade: err.upgrade, notCharged: info.notCharged, wait: err.wait });
                }
              } else {
                // Network error after resilientFetch already retried — hold the
                // send in the queue and auto-retry (foreground / backoff), instead
                // of dead-ending. After a few attempts, fall back to a manual Retry.
                const prevAttempts =
                  queuedSendsRef.current.get(assistantId)?.attempts ?? 0;
                const attempts = prevAttempts + 1;
                const stillTrying = attempts < 4;
                // Report the "LLM didn't respond / stream failed" class to Sentry
                // (only the first attempt, so a flaky network doesn't spam it) —
                // this is the signal for "why is it failing for real users".
                if (attempts === 1) {
                  try {
                    Sentry.captureException(err, {
                      tags: { area: 'chat-stream' },
                      extra: { model: modelId, message: err instanceof Error ? err.message : String(err) },
                    });
                  } catch {
                    /* reporting must never throw */
                  }
                }
                queuedSendsRef.current.set(assistantId, { history, assistantId, attempts });
                setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: stillTrying ? 'reconnecting' : 'idle', tools: previous[conversationId]?.tools || [] } }));
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, streaming: false, failed: !stillTrying, queued: stillTrying, text: '' }
                      : m,
                  ),
                );
                if (stillTrying) {
                  const previousTimer = retryTimersRef.current.get(assistantId);
                  if (previousTimer) clearTimeout(previousTimer);
                  retryTimersRef.current.set(assistantId, setTimeout(
                    () => flushQueuedSendRef.current?.(assistantId),
                    Math.min(30000, 5000 * attempts),
                  ));
                } else {
                  if (!shouldEscalateToDurable(history)) {
                    queuedSendsRef.current.delete(assistantId);
                    setMessages((prev) => prev.map((m) => m.id === assistantId
                      ? { ...m, streaming: false, queued: false, failed: true, text: 'The connection failed before a response arrived. Tap Retry.' }
                      : m));
                    setSending(false);
                    return;
                  }
                  // The legacy live stream has exhausted its bounded retries. Hand
                  // the exact same turn to the durable gateway job path so the
                  // answer can finish after the app is backgrounded or killed.
                  void (async () => {
                    try {
                      const fallbackKey = `fallback-${assistantId}`;
                      const pushToken = await NotificationsService.getPushToken();
                      await rememberChatJobIntent({
                        idempotencyKey: fallbackKey,
                        model: modelId,
                        messages: history,
                        assistantMessageId: assistantId,
                        conversationId,
                        pushToken,
                        createdAt: Date.now(),
                      }).catch(() => {});
                      const durable = await createChatJob({
                        token,
                        idempotencyKey: fallbackKey,
                        model: modelId,
                        messages: history,
                        conversationId,
                        pushToken,
                      });
                      await rememberChatJob({
                        jobId: durable.jobId,
                        assistantMessageId: assistantId,
                        conversationId,
                        createdAt: Date.now(),
                      });
                      setMessages((prev) => prev.map((m) => m.id === assistantId
                        ? { ...m, failed: false, queued: true, streaming: false, text: durable.text || '' }
                        : m));
                    } catch {
                      // Keep the existing manual Retry UI if the durable handoff
                      // itself cannot be reached.
                    }
                  })();
                }
              }
              setSending(false);
            },
          },
        );
      };

      await runStream(history);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      return { success, text: fullText };
    },
    [token, modelId, conversationId, flushPending, persistStreamFinal],
  );

  // Core send path, takes an explicit string so it can be driven by the composer,
  // a prompt starter, or a follow-up chip. handleSend just forwards the composer.
  // Auto-memory: when a message reads like "remember this"/"my name is X"/etc,
  // silently ask the model to distill ONE compact fact and fold it into the
  // user's ssv.asia/memo memory — no settings-screen visit required. Entirely
  // best-effort and invisible on failure: this must never interrupt or delay
  // the actual visible chat turn, which is why it's fired without awaiting
  // and uses its own throwaway completion call, not the main runCompletion
  // flow (no shared state, no shared abort controller, no message-list writes
  // beyond the final toast).
  const maybeUpdateMemoryFromMessage = useCallback((userText: string, priorMessages: DisplayMessage[]) => {
    if (!session || !hasMemorySupport(session)) return;
    const trigger = classifyMemoryTrigger(userText);
    if (!trigger) return;
    const isFullContext = trigger === 'full-context';

    // "Save this to memory"/"save this conversation" is an explicit ask to
    // capture the CONVERSATION's key points, not just distill the one latest
    // message — build a transcript of what's been said so far for that case.
    const extractionMessages: ChatMessage[] = isFullContext
      ? [
          {
            role: 'system',
            content:
              "The user explicitly asked to save this conversation to memory. Summarize the conversation's important, durable points — decisions, facts about the user, ongoing context, preferences, anything worth the assistant knowing in future chats. Use short bullet-style lines, as many as genuinely warranted (don't artificially limit yourself to one line) — but don't pad it with filler either. Reply with ONLY the summary, no preamble.",
          },
          ...priorMessages.map((m) => ({ role: m.role, content: m.text }) as ChatMessage),
          { role: 'user', content: userText },
        ]
      : [
          {
            role: 'system',
            content:
              'Extract ONE short, compact fact worth remembering long-term from the user message below — a name, role, preference, ongoing project, or explicit instruction. Reply with ONLY that fact as a single short sentence (no preamble, no quotes). If there is genuinely nothing memorable, reply with exactly: NONE',
          },
          { role: 'user', content: userText },
        ];

    (async () => {
      try {
        let factText = '';
        await new Promise<void>((resolve) => {
          streamChatCompletion(
            extractionMessages,
            { token: session.token, model: DEFAULT_MODEL_ID },
            {
              onDelta: (chunk: string) => { factText += chunk; },
              onDone: () => resolve(),
              onError: () => resolve(),
            },
          );
        });
        const fact = factText.trim();
        if (!fact || /^none\.?$/i.test(fact)) return;
        const current = await fetchMemory(session);
        const merged = mergeMemoryFact(current.text, fact);
        if (merged === current.text) return;
        await saveMemory(session, merged);
        if (Platform.OS === 'android') {
          ToastAndroid.show(isFullContext ? 'Conversation saved to memory' : 'Added to memory', ToastAndroid.SHORT);
        }
      } catch {
        // Best-effort only — never surface a failure for a feature the user
        // didn't explicitly ask to trigger this turn.
      }
    })();
  }, [session]);

  // Editing a previous user message: rather than storing branches, this drops
  // that message and everything after it, then sends the edited text as a
  // fresh turn from that point — the same linear-history model the rest of
  // this file already uses, just re-pointed to an earlier spot in it.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  // An image the user picked and confirmed "Send image too" on — its content
  // parts replace the plain-text content of the next outgoing user message.
  // Cleared the moment that send happens (or is cancelled), so it can never
  // silently reattach to a later, unrelated message.
  const [pendingImage, setPendingImage] = useState<{ contentParts: ChatContentPart[] } | null>(null);

  const handleEditMessage = useCallback((id: string, text: string) => {
    setEditingMessageId(id);
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setInput('');
  }, []);

  const runDurableCompletion = useCallback(async (
    history: ChatMessage[],
    assistantId: string,
    attempt = 0,
    existingJobId?: string,
  ): Promise<{ success: boolean; text: string }> => {
    if (!session) return { success: false, text: '' };
    const token = getActiveToken(session);
    if (!token) return { success: false, text: '' };

    // The assistant id is stable across retries and app restarts, making this
    // request idempotent at the gateway and preventing duplicate generations.
    const idempotencyKey = `turn-${assistantId}-${attempt}`;
    const pushToken = existingJobId ? undefined : await NotificationsService.getPushToken();
    if (!existingJobId) {
      await rememberChatJobIntent({
        idempotencyKey,
        model: modelId,
        messages: history,
        assistantMessageId: assistantId,
        conversationId,
        pushToken,
        createdAt: Date.now(),
      }).catch(() => {});
    }
    const durable = existingJobId
      ? await retryChatJob(token, existingJobId)
      : await createChatJob({ token, idempotencyKey, model: modelId, messages: history, conversationId, pushToken });
    await rememberChatJob({
      jobId: durable.jobId,
      assistantMessageId: assistantId,
      conversationId,
      createdAt: Date.now(),
    });
    durableJobIdsRef.current.set(assistantId, { jobId: durable.jobId, conversationId });
    setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: durable.status === 'paused' ? 'paused' : 'connecting', tools: previous[conversationId]?.tools || [] } }));
    setDurableJobsActive((count) => count + 1);
    setMessages((prev) => prev.map((message) => message.id === assistantId
      ? { ...message, servedModel: durable.servedModel ?? message.servedModel, streaming: false, queued: true, failed: false, text: durable.text || '' }
      : message));
    // The job is now owned by the gateway. Release the composer immediately
    // so another conversation can be started while this one runs.
    setSending(false);

    let latest = durable;
    let lastRenderedText = durable.text || '';
    // Polling is deliberately bounded per foreground attempt. The durable job
    // remains on the server and is reconciled again on foreground/relaunch.
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (latest.status === 'completed' || latest.status === 'failed' || latest.status === 'cancelled' || latest.status === 'dead_letter') break;
      const pollDelay = attempt < 8 ? 500 : attempt < 30 ? 1000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, pollDelay));
      try {
        latest = await getChatJob(token, durable.jobId);
      } catch {
        setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'reconnecting', tools: previous[conversationId]?.tools || [] } }));
        continue;
      }
      const durablePhase = latest.phase === 'using_tool'
        ? 'using_tool'
        : latest.phase === 'synthesizing'
          ? 'synthesizing'
          : latest.phase === 'thinking'
            ? 'thinking'
            : latest.status === 'paused'
        ? 'paused'
        : latest.status === 'queued'
          ? 'thinking'
          : latest.status === 'running'
            ? 'synthesizing'
            : 'idle';
      setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: durablePhase, tools: previous[conversationId]?.tools || [] } }));
      if (latest.text && latest.text !== lastRenderedText) {
        lastRenderedText = latest.text;
        setMessages((prev) => prev.map((message) => message.id === assistantId
          ? { ...message, text: latest.text, servedModel: latest.servedModel ?? message.servedModel, streaming: false, queued: latest.status !== 'completed', failed: false }
          : message));
      }
    }

    if (latest.status === 'completed') {
      await forgetChatJob(durable.jobId);
      durableJobIdsRef.current.delete(assistantId);
      setDurableJobsActive((count) => Math.max(0, count - 1));
      setMessages((prev) => prev.map((message) => message.id === assistantId
        ? { ...message, text: latest.text, servedModel: latest.servedModel ?? message.servedModel, streaming: false, queued: false, failed: false }
        : message));
      setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'idle', tools: [] } }));
      return { success: true, text: latest.text };
    }
    if (latest.status === 'failed' || latest.status === 'cancelled' || latest.status === 'dead_letter') {
      if (latest.status === 'failed') {
        try {
          Sentry.captureException(new Error(latest.error || 'Durable chat job failed'), {
            tags: { area: 'chat-durable-job', status: latest.status },
            extra: { jobId: durable.jobId, model: modelId, cursor: latest.cursor },
          });
        } catch {
          /* observability must never affect recovery */
        }
      }
      durableJobIdsRef.current.delete(assistantId);
      setDurableJobsActive((count) => Math.max(0, count - 1));
      if (latest.status === 'failed' && latest.retryable !== false) {
        queuedSendsRef.current.set(assistantId, { history, assistantId, attempts: attempt + 1, durable: true, jobId: durable.jobId });
      }
      setMessages((prev) => prev.map((message) => message.id === assistantId
        ? { ...message, text: latest.text || latest.error || (latest.status === 'dead_letter' ? 'This request needs a fresh retry.' : ''), streaming: false, queued: false, failed: true }
        : message));
      setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: 'idle', tools: [] } }));
    }
    return { success: false, text: latest.text || '' };
  }, [session, modelId, conversationId]);

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim();
    const imageToSend = pendingImage;
    const currentConversationBusy = sending && sendingConversationRef.current === conversationId;
    if ((!text && !imageToSend) || currentConversationBusy) return;

    // Sign-in is mandatory — no anonymous/community chat. Surface the sign-in sheet instead of
    // sending, and leave the user's draft text in place so nothing is lost.
    if (!session) {
      setSignInOpen(true);
      return;
    }

    const currentMessages = messagesRef.current;
    const baseMessages = editingMessageId
      ? currentMessages.slice(0, Math.max(0, currentMessages.findIndex((m) => m.id === editingMessageId)))
      : currentMessages;
    setEditingMessageId(null);
    setPendingImage(null);

    setError(null);
    setInput('');
    setDraft(conversationId, '').catch(() => {});
    sendingConversationRef.current = conversationId;
    setSending(true);
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

    const userMsg: DisplayMessage = {
      id: makeId(),
      role: 'user',
      text: text || '📷 Image attached',
    };
    const assistantId = makeId();
    const contextMatch = text.match(/^\/recent\s+(\d+)\b/i);
    const requestedRecent = contextMatch ? Math.max(1, Math.min(20, Number(contextMatch[1]) || 6)) : null;
    const scopedMessages = /^\/fresh\b/i.test(text)
      ? [userMsg]
      : requestedRecent
        ? [...baseMessages.slice(-(requestedRecent * 2)), userMsg]
        : [...baseMessages, userMsg];
    const history = await buildHistoryForSend(
      conversationId,
      buildSystemContextMessage(currentStyleOpts(text)),
      scopedMessages,
      session,
      modelId,
    );

    // buildHistoryForSend always maps the last input message to the last
    // output ChatMessage 1:1 (verified in lib/compaction.ts) — safe to swap
    // its content for the multimodal parts here, after compaction/summary
    // logic has already run on the plain-text version.
    if (imageToSend) {
      const last = history[history.length - 1];
      if (last && last.role === 'user') last.content = imageToSend.contentParts;
    }

    setMessages((currentMessages) => {
      const currentBaseMessages = editingMessageId
        ? currentMessages.slice(0, Math.max(0, currentMessages.findIndex((m) => m.id === editingMessageId)))
        : currentMessages;
      return [
        ...currentBaseMessages,
        userMsg,
        { id: assistantId, role: 'assistant', text: '', streaming: true },
      ];
    });

    maybeUpdateMemoryFromMessage(text, baseMessages);
    // Ordinary chat stays on the foreground stream. Durable jobs are an
    // explicit agentic/scheduled-work primitive, not the default transport for
    // greetings, questions, or ordinary image turns.
    const useDurable = /^(?:\/task|\/research)\b/i.test(text.trim());
    if (useDurable) {
      try {
        await runDurableCompletion(history, assistantId);
        return;
      } catch (error) {
        // Job creation may fail while offline or during a gateway rollout. In
        // that case retain the existing resilient stream/retry behavior.
        if (error instanceof ChatJobRequestError && error.status === 413) {
          setSending(false);
          setError({ message: error.message, notCharged: true });
          setMessages((prev) => prev.map((message) => message.id === assistantId
            ? { ...message, streaming: false, queued: false, failed: true }
            : message));
          return;
        }
      }
    }
    await runCompletion(history, assistantId);
  }, [sending, messages, runCompletion, runDurableCompletion, session, conversationId, modelId, maybeUpdateMemoryFromMessage, editingMessageId, pendingImage]);

  const handleSend = useCallback(() => {
    sendText(input);
  }, [sendText, input]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  // Re-run a held send from its exact stored history. Called by the backoff timer,
  // the "Retry now" button, and on app-foreground.
  const flushQueuedSend = useCallback(async (assistantId?: string) => {
    const q = assistantId
      ? queuedSendsRef.current.get(assistantId)
      : queuedSendsRef.current.values().next().value as QueuedSend | undefined;
    if (!q) {
      void reconcileDurableJobs();
      return;
    }
    if (sendingRef.current) return;
    const timer = retryTimersRef.current.get(q.assistantId);
    if (timer) { clearTimeout(timer); retryTimersRef.current.delete(q.assistantId); }
    setError(null);
    setSending(true);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === q.assistantId ? { ...m, streaming: true, queued: false, failed: false, text: '' } : m,
      ),
    );
    if (q.durable) {
      try {
        const result = await runDurableCompletion(q.history, q.assistantId, q.attempts, q.jobId);
        if (result.success) queuedSendsRef.current.delete(q.assistantId);
        return;
      } catch (retryError) {
        // An expired job is the one safe case for creating a replacement: the
        // gateway has explicitly confirmed that the old authoritative record
        // no longer exists. Timeouts and auth errors must keep the old job as
        // the source of truth to avoid duplicate generations.
        if (retryError instanceof ChatJobRequestError && retryError.status === 404) {
          try {
            const replacement = await runDurableCompletion(q.history, q.assistantId, q.attempts + 1);
            if (replacement.success) queuedSendsRef.current.delete(q.assistantId);
            return;
          } catch {
            // Fall through to the durable retry backoff below.
          }
        }
        // Do not fall back to a second live generation here: the durable job
        // may still be running if this request timed out after reaching the
        // gateway. Keep one authoritative job and retry its status operation.
        setSending(false);
        setMessages((prev) => prev.map((message) => message.id === q.assistantId
          ? { ...message, streaming: false, queued: true, failed: false }
          : message));
        const previousTimer = retryTimersRef.current.get(q.assistantId);
        if (previousTimer) clearTimeout(previousTimer);
        retryTimersRef.current.set(q.assistantId, setTimeout(
          () => flushQueuedSendRef.current?.(q.assistantId),
          Math.min(30000, 5000 * Math.max(1, q.attempts + 1)),
        ));
        return;
      }
    }
    await runCompletion(q.history, q.assistantId);
  }, [runCompletion, runDurableCompletion, reconcileDurableJobs]);

  useEffect(() => {
    flushQueuedSendRef.current = flushQueuedSend;
  }, [flushQueuedSend]);

  useEffect(() => {
    if (!hasShareIntent) return;
    const incoming = (shareIntent.text || shareIntent.webUrl || '').trim();
    if (incoming) {
      setInput((prev) => (prev.trim() ? `${prev}\n\n${incoming}` : incoming));
      setTimeout(() => inputRef.current?.focus(), 250);
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && queuedSendsRef.current.size > 0 && !sendingRef.current) {
        flushQueuedSendRef.current?.();
      }
    });
    return () => sub.remove();
  }, []);

  // Founder broadcast: check for a new announcement on launch and whenever the
  // app is reopened. Fully silent on failure (missing endpoint / offline).
  useEffect(() => {
    const check = () => fetchPendingAnnouncement().then(setAnnouncement).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  // Offline detection: shown the instant connectivity actually drops, rather
  // than only being discoverable reactively (a message failing, then the
  // existing queued-retry logic kicking in). `isInternetReachable` can be
  // `null` briefly while NetInfo is still figuring it out — only treat an
  // explicit `false` as offline, never the "still checking" state, so a
  // fresh app launch doesn't flash a false "You're offline".
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  // Biometric app lock — see lib/app-lock.ts. Off by default; a ref mirrors
  // isIncognito so the AppState listener's closure always reads the CURRENT
  // conversation's incognito state, not whatever it was when the listener
  // was first attached.
  const isIncognitoRef = useRef(isIncognito);
  isIncognitoRef.current = isIncognito;
  const [isLocked, setIsLocked] = useState(false);
  useEffect(() => {
    const checkLock = async () => {
      const mode = await getAppLockMode();
      const needsLock = mode === 'all' || (mode === 'incognito' && isIncognitoRef.current);
      setIsLocked(needsLock);
    };
    checkLock();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkLock();
    });
    return () => sub.remove();
  }, []);

  const attemptUnlock = useCallback(async () => {
    const success = await authenticate();
    if (success) setIsLocked(false);
  }, []);

  useEffect(() => {
    if (isLocked) attemptUnlock();
  }, [isLocked, attemptUnlock]);

  // Play Store In-App Update: check on launch and every foreground return,
  // same cadence as the announcement/gift checks below. Flexible mode means
  // this never interrupts an active session — it just downloads quietly in
  // the background and offers a restart once ready.
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const check = () => checkForFlexibleUpdate(() => setUpdateReady(true));
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  // Gift reveal: /me's `gift` field is a one-time, server-cleared value — the
  // FIRST call after a founder grants one sees it, every call after sees
  // nothing (consumePendingGift clears it server-side as part of that same
  // response — confirmed against the real gateway code). So this has to run
  // on its own, on the same "launch + foreground" cadence as the announcement
  // check above, independent of the account sheet (which only fetches /me
  // when the user happens to open it) — otherwise a gift could be silently
  // consumed and lost before the user ever sees it.
  //
  // Real shape: { haiku, sonnet, luna, message, ts } — haiku/sonnet/luna are
  // per-model token grants. Deliberately summed into one plain number below
  // rather than broken out by model name, same reasoning as the account
  // screen: this app never exposes model choice to the user and has no
  // in-app purchase flow, so naming paid-model tiers anywhere in the UI risks
  // reading as advertising access nobody can buy through this app.
  const [giftReveal, setGiftReveal] = useState<{ haiku: number; sonnet: number; luna: number; message: string; ts: number } | null>(null);
  useEffect(() => {
    if (!session) return;
    const check = () => {
      fetchAccountInfo(session.token)
        .then((info) => { if (info.gift) setGiftReveal(info.gift); })
        .catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [session]);

  useEffect(() => {
    return () => {
      for (const timer of retryTimersRef.current.values()) clearTimeout(timer);
      retryTimersRef.current.clear();
    };
  }, []);

  const handleStop = useCallback(() => {
    for (const runtime of streamRuntimeRef.current.values()) {
      if (runtime.conversationId === conversationId) runtime.controller.abort();
    }
    const token = session ? getActiveToken(session) : null;
    if (!token) return;
    for (const [assistantId, job] of durableJobIdsRef.current) {
      if (job.conversationId !== conversationId) continue;
      void cancelChatJob(token, job.jobId).then(() => {
        durableJobIdsRef.current.delete(assistantId);
        setDurableJobsActive((count) => Math.max(0, count - 1));
        setMessages((prev) => prev.map((message) => message.id === assistantId
          ? { ...message, streaming: false, queued: false, failed: false }
          : message));
      }).catch(() => {
        // Cancellation is best-effort while offline; reconciliation will still
        // recover the job and the user can retry it when back online.
      });
    }
  }, [session, conversationId]);

  const handlePauseResume = useCallback(async () => {
    const token = session ? getActiveToken(session) : null;
    if (!token) return;
    const jobs = [...durableJobIdsRef.current.entries()].filter(([, job]) => job.conversationId === conversationId);
    if (!jobs.length) return;
    const nextPaused = !durableJobsPaused;
    await Promise.all(jobs.map(async ([, job]) => {
      try {
        if (nextPaused) await pauseChatJob(token, job.jobId);
        else await resumeChatJob(token, job.jobId);
      } catch {
        // Reconciliation will restore the authoritative state on the next foreground.
      }
    }));
    setDurableJobsPaused(nextPaused);
    setAgentActivity((previous) => ({ ...previous, [conversationId]: { phase: nextPaused ? 'paused' : 'thinking', tools: previous[conversationId]?.tools || [] } }));
    void reconcileDurableJobs();
  }, [session, conversationId, durableJobsPaused, reconcileDurableJobs]);

  const handlePrepareDesktopHandoff = useCallback(async () => {
    const token = session ? getActiveToken(session) : null;
    if (!token) return;
    const job = [...durableJobIdsRef.current.values()].find((item) => item.conversationId === conversationId);
    if (!job) {
      Alert.alert('No active job', 'There is no durable response to hand off from this chat.');
      return;
    }
    try {
      const invitation = await createChatJobHandoff(token, job.jobId);
      if (!invitation.token) throw new Error('The gateway did not return a handoff invitation.');
      await Clipboard.setStringAsync(invitation.token);
      Alert.alert('Desktop handoff ready', `Job ID: ${job.jobId}\n\nThe five-minute invitation was copied to your clipboard. Paste it into the paired desktop Expert AI session and enter the Job ID above. No transcript content was copied.`);
    } catch (error) {
      Alert.alert('Handoff unavailable', error instanceof Error ? error.message : 'Could not prepare the desktop handoff.');
    }
  }, [session, conversationId]);

  const scheduledTasksLoaded = useScheduledTasksStore((s) => s.loaded);
  const loadScheduledTasks = useScheduledTasksStore((s) => s.load);
  const scheduledTasks = useScheduledTasksStore((s) => s.tasks);
  // Re-evaluated on a timer (not just on store changes) so the due-task dot
  // turns on the moment a task's time arrives, even if nothing else in this
  // screen triggers a re-render while it sits idle.
  const [dueCheckNow, setDueCheckNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setDueCheckNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  const hasDueScheduledTask = useMemo(
    () => scheduledTasks.some((t) => t.status === 'pending' && t.scheduledFor <= dueCheckNow),
    [scheduledTasks, dueCheckNow],
  );
  useEffect(() => {
    if (!scheduledTasksLoaded) loadScheduledTasks();
  }, [scheduledTasksLoaded, loadScheduledTasks]);

  // Surface the daily-notes streak badge on load without opening the sheet.
  useEffect(() => {
    listDailyNotes()
      .then((list) => {
        setDailyNotesList(list);
        setDailyStreak(computeStreak(list));
      })
      .catch(() => {});
  }, []);

  /** Runs a legacy/local scheduled task as a brand new chat. Durable scheduled
   *  jobs already have server-side execution and return early below, so this
   *  path remains the offline fallback for tasks the gateway cannot accept. */
  const runScheduledTask = useCallback(
    async (task: ScheduledTask) => {
      if (sending) return;
      // Remotely scheduled jobs are already running (or waiting) on the
      // gateway. A local reminder must never create a duplicate generation.
      if (task.jobId) {
        if (task.status === 'failed' && session) {
          const token = getActiveToken(session);
          if (token) {
            const retried = await retryChatJob(token, task.jobId).catch(() => null);
            if (retried?.status === 'queued' || retried?.status === 'running') {
              await markScheduledTaskPending(task.id);
            }
          }
        }
        if (task.conversationId) {
          const saved = (await listConversations()).find((conversation) => conversation.id === task.conversationId);
          if (saved) {
            setConversationId(saved.id);
            setMessages(saved.messages.map((message) => ({ ...message })));
            setPlannerOpen(false);
          }
        }
        return;
      }
      if (!session) {
        setSignInOpen(true);
        return;
      }
      setPlannerOpen(false);
      // Silent close (no discard confirmation) — this can fire from tapping a
      // notification, where interrupting with an Alert would be jarring; any
      // open document belonged to whatever chat was on screen before, not to
      // this brand-new scheduled-task conversation.
      useDocumentChatStore.getState().close();
      setConversationId(makeConversationId());
      setMessages([]);
      setInput('');
      setError(null);
      setIsIncognito(false);
      setSending(true);

      const userMsg: DisplayMessage = { id: makeId(), role: 'user', text: task.prompt };
      const assistantId = makeId();
      const history: ChatMessage[] = [
        buildSystemContextMessage(currentStyleOpts(task.prompt)),
        { role: 'user', content: task.prompt },
      ];
      setMessages([userMsg, { id: assistantId, role: 'assistant', text: '', streaming: true }]);

      const result = await runCompletion(history, assistantId);
      await markScheduledTaskRun(
        task.id,
        result.success ? 'completed' : 'failed',
        result.text ? result.text.slice(0, 160) : undefined,
      );
    },
    [sending, session, runCompletion, markScheduledTaskRun, markScheduledTaskPending],
  );

  // Deep-link from a "task is due" notification tap: ?runTaskId=… → run it once.
  const { runTaskId } = useLocalSearchParams<{ runTaskId?: string }>();
  const handledRunTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runTaskId || handledRunTaskRef.current === runTaskId) return;
    if (!scheduledTasksLoaded || !session || sending) return;
    const task = useScheduledTasksStore.getState().tasks.find((t) => t.id === runTaskId);
    handledRunTaskRef.current = runTaskId;
    router.setParams({ runTaskId: undefined });
    if (task && task.status === 'pending') {
      runScheduledTask(task);
    }
  }, [runTaskId, scheduledTasksLoaded, session, sending, runScheduledTask, router]);

  // --- Daily Notes ---------------------------------------------------------

  const refreshDailyNotes = useCallback(async () => {
    const list = await listDailyNotes();
    setDailyNotesList(list);
    setDailyStreak(computeStreak(list));
  }, []);

  const ensureTodayNote = useCallback(async () => {
    try {
      const today = await getOrCreateTodayNote();
      setDailyNote(today);
      setViewingTodayNote(true);
      await refreshDailyNotes();
    } catch {
      // Storage failed — still open the sheet with whatever we have rather than
      // dead-ending; the editor just won't persist this session.
    }
  }, [refreshDailyNotes]);

  const openPlanner = useCallback(
    async (t: PlannerTab) => {
      if (t === 'notes') await ensureTodayNote();
      setPlannerTab(t);
      setPlannerOpen(true);
    },
    [ensureTodayNote],
  );

  const openNoteWriterAfterPlanner = useCallback(() => {
    if (Platform.OS !== 'ios') {
      setNoteWriterOpen(true);
      return;
    }
    pendingNoteWriterOpenRef.current = true;
    setPlannerOpen(false);
    setTimeout(() => {
      if (!pendingNoteWriterOpenRef.current) return;
      pendingNoteWriterOpenRef.current = false;
      setNoteWriterOpen(true);
    }, 900);
  }, []);

  const handlePlannerDismiss = useCallback(() => {
    if (pendingNoteWriterOpenRef.current) {
      pendingNoteWriterOpenRef.current = false;
      setNoteWriterOpen(true);
      return;
    }
    if (pendingScheduleSheetOpenRef.current) {
      pendingScheduleSheetOpenRef.current = false;
      setScheduleNewOpen(true);
    }
  }, []);

  const openScheduleFromPlanner = useCallback(() => {
    setScheduleInitialPrompt('');
    scheduleOpenedFromPlannerRef.current = true;
    if (Platform.OS !== 'ios') {
      setPlannerOpen(false);
      setScheduleNewOpen(true);
      return;
    }
    pendingScheduleSheetOpenRef.current = true;
    setPlannerOpen(false);
    setTimeout(() => {
      if (!pendingScheduleSheetOpenRef.current) return;
      pendingScheduleSheetOpenRef.current = false;
      setScheduleNewOpen(true);
    }, 900);
  }, []);

  const handleScheduleSheetDismiss = useCallback(() => {
    if (!pendingPlannerAfterScheduleDismissRef.current) return;
    pendingPlannerAfterScheduleDismissRef.current = false;
    scheduleOpenedFromPlannerRef.current = false;
    setPlannerOpen(true);
  }, []);

  const closeScheduleAndShowPlanner = useCallback(() => {
    setPlannerTab('scheduled');
    if (Platform.OS !== 'ios') {
      setScheduleNewOpen(false);
      setPlannerOpen(true);
      return;
    }
    pendingPlannerAfterScheduleDismissRef.current = true;
    setScheduleNewOpen(false);
    setTimeout(handleScheduleSheetDismiss, 900);
  }, [handleScheduleSheetDismiss]);

  const handleScheduleSheetClose = useCallback(() => {
    if (scheduleOpenedFromPlannerRef.current && Platform.OS === 'ios') {
      closeScheduleAndShowPlanner();
      return;
    }
    scheduleOpenedFromPlannerRef.current = false;
    setScheduleNewOpen(false);
  }, [closeScheduleAndShowPlanner]);

  const handleChangePlannerTab = useCallback(
    async (t: PlannerTab) => {
      if (t === 'notes' && !dailyNote) await ensureTodayNote();
      setPlannerTab(t);
    },
    [dailyNote, ensureTodayNote],
  );

  const handleSaveNoteBody = useCallback(
    async (id: string, body: string) => {
      try {
        await saveDailyNoteBody(id, body);
      } catch {
        /* best effort */
      }
      setDailyNote((prev) => (prev && prev.id === id ? { ...prev, body, touched: true } : prev));
      refreshDailyNotes();
    },
    [refreshDailyNotes],
  );

  const handleOpenArchivedNote = useCallback(async (id: string) => {
    const n = await getDailyNote(id);
    if (n) {
      setDailyNote(n);
      setViewingTodayNote(id === localDayKey());
      openNoteWriterAfterPlanner();
    }
  }, [openNoteWriterAfterPlanner]);

  const handleOpenNoteDate = useCallback(async (id: string) => {
    const existing = await getDailyNote(id);
    if (existing) {
      setDailyNote(existing);
      setViewingTodayNote(id === localDayKey());
      openNoteWriterAfterPlanner();
      return;
    }
    Alert.alert(
      'Create a daily note?',
      `There is no note for ${id}. Create one for this day?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create note',
          onPress: () => {
            void getOrCreateNoteForDate(id).then((n) => {
              setDailyNote(n);
              setViewingTodayNote(id === localDayKey());
              openNoteWriterAfterPlanner();
              void refreshDailyNotes();
            });
          },
        },
      ],
    );
  }, [refreshDailyNotes, openNoteWriterAfterPlanner]);

  const handleBackToToday = useCallback(async () => {
    const today = await getOrCreateTodayNote();
    setDailyNote(today);
    setViewingTodayNote(true);
  }, []);

  const handleDeleteArchivedNote = useCallback(
    (id: string) => {
      Alert.alert('Delete note', 'Delete this daily note permanently?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDailyNote(id);
            if (dailyNote?.id === id) {
              const today = await getOrCreateTodayNote();
              setDailyNote(today);
              setViewingTodayNote(true);
            }
            refreshDailyNotes();
          },
        },
      ]);
    },
    [dailyNote?.id, refreshDailyNotes],
  );

  /** Seed a brand-new chat with an invisible system directive + a first user
   *  turn, then stream the answer — the same pipeline as a normal send. Used by
   *  every Daily-Notes AI action (insights / digest / end-of-day). */
  const seedNoteChat = useCallback(
    async (systemExtra: string, firstUserText: string) => {
      if (!session) {
        setSignInOpen(true);
        return;
      }
      if (sending) return;
      setPlannerOpen(false);
      setExtractOpen(false);
      // Silent close — same reasoning as runScheduledTask above: this starts
      // a brand-new, unrelated conversation, so any open document doesn't
      // belong in it, and this flow has no natural place for a confirmation.
      useDocumentChatStore.getState().close();
      setConversationId(makeConversationId());
      setMessages([]);
      setInput('');
      setError(null);
      setIsIncognito(false);
      setSending(true);

      const sys = buildSystemContextMessage(currentStyleOpts());
      const history: ChatMessage[] = [
        { role: 'system', content: `${sys.content}\n\n${systemExtra}` },
        { role: 'user', content: firstUserText },
      ];
      const userMsg: DisplayMessage = { id: makeId(), role: 'user', text: firstUserText };
      const assistantId = makeId();
      setMessages([userMsg, { id: assistantId, role: 'assistant', text: '', streaming: true }]);
      await runCompletion(history, assistantId);
    },
    [session, sending, runCompletion],
  );

  const NOTE_COACH_DIRECTIVE =
    "The user has shared a personal daily note / scratchpad. Be a calm, encouraging planning partner (many users have ADHD). First, briefly reflect back the key points you see so nothing is lost. Then turn the day into a short, ordered list of small concrete micro-steps — each a single action of a few minutes, in the order to do them. Keep it tight and non-judgmental. End by asking which step they want to start with.";

  const handleNoteAiInsights = useCallback(() => {
    if (!dailyNote) return;
    seedNoteChat(
      NOTE_COACH_DIRECTIVE,
      `Here is my daily note for ${dailyNote.title}. Help me work through it.\n\n"""\n${dailyNote.body}\n"""`,
    );
  }, [dailyNote, seedNoteChat]);

  const handleNoteWeeklyDigest = useCallback(async () => {
    const block = await recentNotesBlock(7);
    if (!block.trim()) {
      Alert.alert('Not enough notes yet', 'Write daily notes for a few days and the weekly digest will summarize them.');
      return;
    }
    seedNoteChat(
      'The user has shared their daily notes from the past week. Produce a concise weekly digest: (1) wins and things that got done, (2) recurring blockers or themes, (3) anything left unfinished, (4) three suggested focuses for next week. Use short headed sections.',
      `My daily notes from the past week:\n\n${block}`,
    );
  }, [seedNoteChat]);

  const handleNoteEndOfDayReview = useCallback(() => {
    if (!dailyNote) return;
    const ranToday = useScheduledTasksStore
      .getState()
      .tasks.filter((t) => t.lastRunAt && localDayKey(new Date(t.lastRunAt)) === localDayKey())
      .map((t) => `• ${t.prompt}`)
      .join('\n');
    seedNoteChat(
      "Act as a supportive end-of-day check-in. Read the user's note for today and any tasks that ran. Give a short 3-line reflection (what moved, what stalled, one kind observation), then a suggested Top 3 for tomorrow as a checklist. Keep it brief. Remind them they can tap 'Save reply to note' to keep this.",
      `My note for ${dailyNote.title}:\n\n"""\n${dailyNote.body}\n"""${
        ranToday ? `\n\nScheduled tasks that ran today:\n${ranToday}` : ''
      }`,
    );
  }, [dailyNote, seedNoteChat]);

  const handleNoteExtractTasks = useCallback(() => {
    if (!dailyNote) return;
    const candidates = extractOpenTasks(dailyNote.body);
    setExtractCandidates(candidates);
    setExtractOpen(true);
  }, [dailyNote]);

  const handleConfirmScheduleTasks = useCallback(
    async (tasks: string[], whenMs: number) => {
      const store = useScheduledTasksStore.getState();
      // Stagger by a minute each so reminders don't all fire in the same second.
      for (let i = 0; i < tasks.length; i++) {
        await store.addTask(tasks[i], whenMs + i * 60 * 1000);
      }
      setExtractOpen(false);
      buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      Alert.alert('Scheduled', `${tasks.length} task${tasks.length === 1 ? '' : 's'} scheduled. You'll be reminded, and they run when you open the app.`);
    },
    [],
  );

  const handleShareNote = useCallback(() => {
    if (!dailyNote) return;
    Share.share({
      message: `${dailyNote.body}\n\n— From Expert AI daily notes · https://ssv.asia`,
    }).catch(() => {});
  }, [dailyNote]);

  /** "Attach today's note" from the empty state — prefixes the composer so the
   *  next thing the user types is answered with their note in context. */
  const handleAttachTodayNote = useCallback(async () => {
    try {
      const today = await getOrCreateTodayNote();
      setInput((prev) => {
        const ctx = `Referring to my daily note for ${today.title}:\n\n"""\n${today.body}\n"""\n\n`;
        return prev.trim() ? `${ctx}${prev}` : ctx;
      });
      setTimeout(() => inputRef.current?.focus(), 150);
    } catch {
      /* ignore */
    }
  }, []);

  /** "Save reply to note" from a message's action row — appends the assistant
   *  text under a "From chat" heading in today's note. */
  const handleSaveReplyToNote = useCallback(
    async (text: string) => {
      try {
        await appendToDailyNote(localDayKey(), text);
        const saved = await getDailyNote(localDayKey());
        if (!saved?.body.includes(text.trim())) throw new Error('Daily note write did not verify');
        await refreshDailyNotes();
        buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        Alert.alert('Saved to today’s note');
      } catch {
        Alert.alert('Could not save', 'Saving to your daily note failed. Please try again.');
      }
    },
    [refreshDailyNotes],
  );

  /** Re-runs the last exchange: drops the last assistant reply, resends the
   *  same conversation up to (and including) the last user message. Only
   *  meaningful on the very last message, which is what the UI restricts it to. */
  const regenerateWith = useCallback(async (steer?: string) => {
    if (sending || messages.length === 0) return;
    if (!session) { setSignInOpen(true); return; }
    const lastIdx = messages.length - 1;
    if (messages[lastIdx].role !== 'assistant') return;

    setError(null);
    setSending(true);
    buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    const priorMessages = messages.slice(0, lastIdx);
    // A "steer" is an invisible one-off instruction appended to the history only —
    // it is not added to the visible transcript, so the conversation still reads
    // as (user question) → (new answer), just shaped differently.
    const history: ChatMessage[] = [
      buildSystemContextMessage(currentStyleOpts(steer ?? '')),
      ...priorMessages.map((m) => ({ role: m.role, content: m.text })),
      ...(steer ? [{ role: 'user' as const, content: steer }] : []),
    ];
    const assistantId = makeId();

    setMessages([...priorMessages, { id: assistantId, role: 'assistant', text: '', streaming: true }]);

    const lastUserText = [...priorMessages].reverse().find((message) => message.role === 'user')?.text || '';
    if (/^(?:\/task|\/research)\b/i.test(lastUserText.trim())) {
      try {
        await runDurableCompletion(history, assistantId);
        return;
      } catch {
        // Preserve the existing stream path if the durable endpoint is
        // unavailable during a rollout or while the device is offline.
      }
    }
    await runCompletion(history, assistantId);
  }, [sending, messages, runCompletion, runDurableCompletion, session]);

  const handleRegenerate = useCallback(() => regenerateWith(), [regenerateWith]);

  const handleRegenerateMenu = useCallback(() => {
    Alert.alert('Regenerate answer', 'How should it change?', [
      { text: 'Just try again', onPress: () => regenerateWith() },
      { text: 'More detail', onPress: () => regenerateWith('Regenerate your previous answer with more depth, detail and examples.') },
      { text: 'Simpler', onPress: () => regenerateWith('Regenerate your previous answer in plain, simpler language.') },
      { text: 'Shorter', onPress: () => regenerateWith('Regenerate your previous answer, much more concise — key points only.') },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [regenerateWith]);

  const handleCopyMessage = useCallback((text: string) => {
    Clipboard.setStringAsync(text);
  }, []);

  const handleShareMessage = useCallback((text: string) => {
    // One quiet attribution line so a shared answer also tells people where it
    // came from — kept deliberately minimal (no "download now!", no tracking
    // params). Copy stays clean; only an explicit Share carries it.
    const withCredit = `${text}\n\n— Shared from Expert AI · https://ssv.asia`;
    Share.share({ message: withCredit }).catch(() => {
      /* user dismissed the share sheet — not an error */
    });
  }, []);

  const handleReportMessage = useCallback(async (text: string) => {
    const reasons = [
      'Offensive or harmful content',
      'Factually incorrect',
      'Inappropriate for my request',
      'Other',
    ];
    Alert.alert(
      'Report this response',
      'Help us understand what went wrong.',
      [
        ...reasons.map((reason) => ({
          text: reason,
          onPress: async () => {
            await reportMessage(token, text, reason);
            Alert.alert('Thank you', 'Your report has been submitted for review.');
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [token]);

  const handleResponseFeedback = useCallback((text: string, rating: 'positive' | 'negative') => {
    if (!token) return;
    void sendResponseFeedback(token, text, rating);
  }, [token]);

  const handleAiModelDataPolicy = useCallback(() => {
    Alert.alert(
      'AI Model & Data Policy',
      'Powered by OpenRouter.\n\nYour messages are sent to OpenRouter’s AI infrastructure to generate a response and are not used to train models. See our full Privacy Policy for details on data handling and retention.',
      [
        { text: 'View Privacy Policy', onPress: () => Linking.openURL('https://ssv.asia/privacy-policy/') },
        { text: 'Close', style: 'cancel' },
      ],
    );
  }, []);

  const handleClearLocalData = useCallback(() => {
    Alert.alert(
      'Clear Local Data',
      'This clears your saved conversations, theme, and notification preferences on this device. Your account and messages on the server are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllConversations();
              await useThemeStore.getState().setPreset('dark');
              await NotificationsService.scheduleByTheWayNotifications(false);
              Alert.alert('Done', 'Local data has been cleared.');
            } catch {
              Alert.alert('Error', 'Could not clear local data. Please try again.');
            }
          },
        },
      ],
    );
  }, []);

  const handleDeleteAccountFromHelp = useCallback(() => {
    if (!session) {
      Alert.alert('Not signed in', 'Sign in to delete your account.');
      return;
    }
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(token);
              await clearGoogleAccount();
              await signOut();
              setSession(null);
              setBalance(null);
              setHelpCenterOpen(false);
              setAccountOpen(false);
              Alert.alert('Account Deleted', 'Your account has been successfully deleted.');
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account. Please try again.');
            }
          },
        },
      ],
    );
  }, [session, token]);

  const inChatMatchIds = useMemo(() => {
    const q = inChatQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => m.text.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, inChatQuery]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [inChatQuery]);

  // Jump to the first match as soon as one exists for THIS query, instead of
  // only scrolling once the user manually presses next/prev. Gated on the
  // query text itself (not the `inChatMatchIds` array reference) — that
  // array is rebuilt from `messages` on every streamed token, so keying off
  // it directly would yank the scroll position back to match #1 mid-stream
  // even while the user has already navigated to a later match with next/prev.
  const autoScrolledQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (inChatMatchIds.length > 0 && autoScrolledQueryRef.current !== inChatQuery) {
      autoScrolledQueryRef.current = inChatQuery;
      scrollToMatch(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inChatMatchIds.length, inChatQuery]);

  const scrollToMatch = useCallback((index: number, attempt = 0) => {
    const id = inChatMatchIds[index];
    if (!id) return;
    const y = messageLayoutsRef.current[id];
    if (y != null) {
      listRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
      return;
    }
    // The matched message is mounted (this ScrollView renders every message,
    // not a virtualized list) but its onLayout may not have fired yet — e.g.
    // right after the search bar opens and pushes a fresh layout pass. Retry
    // a few frames before giving up, instead of silently no-oping.
    if (attempt < 5) {
      requestAnimationFrame(() => scrollToMatch(index, attempt + 1));
    }
  }, [inChatMatchIds]);

  const goToNextMatch = useCallback(() => {
    if (inChatMatchIds.length === 0) return;
    const next = (activeMatchIndex + 1) % inChatMatchIds.length;
    setActiveMatchIndex(next);
    scrollToMatch(next);
  }, [inChatMatchIds, activeMatchIndex, scrollToMatch]);

  const goToPrevMatch = useCallback(() => {
    if (inChatMatchIds.length === 0) return;
    const prev = (activeMatchIndex - 1 + inChatMatchIds.length) % inChatMatchIds.length;
    setActiveMatchIndex(prev);
    scrollToMatch(prev);
  }, [inChatMatchIds, activeMatchIndex, scrollToMatch]);

  // Read-aloud: only one message speaks at a time — starting a new one always
  // stops whatever was playing first, same as switching tracks.
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const handleToggleReadAloud = useCallback((id: string, text: string) => {
    stopSpeaking();
    if (speakingMessageId === id) {
      setSpeakingMessageId(null);
      return;
    }
    setSpeakingMessageId(id);
    speakText(
      text,
      () => setSpeakingMessageId((cur) => (cur === id ? null : cur)),
      () => setSpeakingMessageId((cur) => (cur === id ? null : cur)),
    );
  }, [speakingMessageId]);

  // Stop any in-progress speech on unmount so it never keeps talking after
  // the screen goes away.
  useEffect(() => () => stopSpeaking(), []);

  // "Save to workspace" on an assistant reply — drops it into the side
  // panel's Documents tab (as Markdown, since that's what the reply already
  // is) so it can be exported to PDF/Markdown/text later, referenced while
  // the chat keeps going. Purely local — no gateway call.
  const handleSaveDocument = useCallback((text: string) => {
    const title = text.trim().split('\n')[0].slice(0, 60) || 'Untitled';
    saveDocument({
      id: makeDocumentId(),
      title,
      kind: 'markdown',
      content: text,
      conversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
      .then(() => {
        setDocumentsRefreshKey((k) => k + 1);
        setSidePanelOpen(true);
        buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      })
      .catch(() => setError({ message: 'Could not save this to your workspace. Please try again.' }));
  }, [conversationId]);

  const handleScheduleFollowup = useCallback((text: string) => {
    setScheduleInitialPrompt(`Follow up on this answer and help me take the next action:\n\n${text.slice(0, 6000)}`);
    setScheduleNewOpen(true);
  }, []);

  const handleSaveRecipe = useCallback((text: string) => {
    const save = async (name: string) => {
      await saveAutomationRecipe(name, text);
      Alert.alert('Workflow saved', 'This workflow is now available in Settings.', [
        { text: 'Done', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.push('/(app)/settings') },
      ]);
    };
    if (Platform.OS === 'ios') Alert.prompt('Save automation recipe', 'Give this reusable workflow a name.', (name) => { if (name?.trim()) void save(name); }, 'plain-text', 'Research summary');
    else void save('Saved workflow');
  }, [router]);

  const lastUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  }, [messages]);

  const renderBubble = useCallback(
    (item: DisplayMessage, index: number) => (
      <View
        key={item.id}
        onLayout={(e) => { messageLayoutsRef.current[item.id] = e.nativeEvent.layout.y; }}
        style={
          item.id === inChatMatchIds[activeMatchIndex]
            ? { backgroundColor: isDark ? 'rgba(255,214,10,0.16)' : 'rgba(255,204,0,0.22)', borderRadius: 14 }
            : undefined
        }
      >
      <MemoBubble
        item={item}
        isDark={isDark}
        textColor={colors.text}
        isLast={index === messages.length - 1}
        isLastUser={index === lastUserIndex}
        isSpeaking={item.id === speakingMessageId}
        onCopy={handleCopyMessage}
        onRegenerate={handleRegenerate}
        onRegenerateMenu={handleRegenerateMenu}
        onVerifyAgain={() => regenerateWith('Verify your previous answer again using current live sources where relevant. Label freshness, separate verified facts from inference, and call out any changed or uncertain claims.')}
        onRetryQueued={flushQueuedSend}
        onReport={handleReportMessage}
        onFeedback={handleResponseFeedback}
        onShare={handleShareMessage}
        onSaveToNote={handleSaveReplyToNote}
        onScheduleFollowup={handleScheduleFollowup}
        onSaveRecipe={handleSaveRecipe}
        onEdit={handleEditMessage}
        onToggleReadAloud={handleToggleReadAloud}
        onSaveDocument={handleSaveDocument}
        colors={colors}
      />
      </View>
    ),
    [colors, isDark, messages.length, lastUserIndex, speakingMessageId, handleCopyMessage, handleRegenerate, handleRegenerateMenu, regenerateWith, flushQueuedSend, handleReportMessage, handleResponseFeedback, handleShareMessage, handleSaveReplyToNote, handleScheduleFollowup, handleSaveRecipe, handleEditMessage, handleToggleReadAloud, handleSaveDocument, inChatMatchIds, activeMatchIndex],
  );

  /** Single-line usage summary for the one "Unlimited" model. Community/no-pass reads the daily
   *  message cap (a real, user-facing limit — worth showing). A paid pass reads the `pro` bucket
   *  the gateway's "unlimited" router bills into, but deliberately shows USAGE ONLY, never the
   *  ceiling — "Unlimited" means pay-for-hours-and-keep-going, so surfacing a token denominator
   *  would read as a hidden cap and undercut the whole point of the plan, even though a real
   *  budget exists server-side. Never hardcoded, always live off /balance. */
  const freeModelDescription = useMemo(() => {
    // Same entitlement-vs-effective distinction as effectiveTier above: whether someone is on
    // the free allowance is about whether a pass is ACTIVE right now, not what they're entitled
    // to buy. balance.passActive is the direct, authoritative signal for that.
    if (!balance?.passActive) {
      const c = balance?.community;
      return c ? `Free tier, ${c.used}/${c.limit} messages today` : 'Free tier, limited messages/day';
    }
    const used = (balance?.used?.pro || 0) + (balance?.used?.foundation || 0) + (balance?.used?.free || 0) + (balance?.used?.opus || 0);
    if (typeof used === 'number' && used > 0) {
      return `Included in your plan, ${formatTokenCount(used)} tokens used`;
    }
    return 'Included in your plan';
  }, [balance]);

  const handleStartSignIn = useCallback(async () => {
    const email = signInEmail.trim().toLowerCase();
    if (!email) return;
    setSignInError(null);
    setSignInStatus('opening');
    try {
      const challenge = await requestSsvAsiaCode(email);
      setEmailChallenge(challenge);
      setSignInCode('');
      setSignInStatus('waiting');
    } catch (err) {
      setSignInStatus('error');
      setSignInError(err instanceof Error ? err.message : String(err));
    }
  }, [signInEmail]);

  const handleVerifySignIn = useCallback(async () => {
    if (!emailChallenge || signInCode.replace(/\s/g, '').length !== 6) return;
    setSignInError(null);
    setSignInStatus('verifying');
    try {
      const newSession = await verifySsvAsiaCode(emailChallenge.nonce, signInCode);
      setSession(newSession);
      setSignInOpen(false);
      setSignInStatus('idle');
      setSignInEmail('');
      setSignInCode('');
      setEmailChallenge(null);
    } catch (err) {
      setSignInStatus('waiting');
      setSignInError(err instanceof Error ? err.message : String(err));
    }
  }, [emailChallenge, signInCode]);

  const handleResendSignIn = useCallback(async () => {
    if (!signInEmail.trim()) return;
    setSignInError(null);
    setSignInStatus('opening');
    try {
      const challenge = await requestSsvAsiaCode(signInEmail);
      setEmailChallenge(challenge);
      setSignInCode('');
      setSignInStatus('waiting');
    } catch (err) {
      setSignInStatus('error');
      setSignInError(err instanceof Error ? err.message : String(err));
    }
  }, [signInEmail]);

  const handleGoogleSignInSuccess = useCallback((newSession: Session) => {
    setSession(newSession);
    setSignInOpen(false);
    setSignInStatus('idle');
    setSignInEmail('');
    setSignInError(null);
  }, []);

  const handleGoogleSignInError = useCallback((message: string) => {
    setSignInStatus('error');
    setSignInError(message);
  }, []);

  // Tapping "Unlock 30 questions per day" opens the age/terms handshake first —
  // it never goes straight into the trial (see trialGateOpen above).
  const handleStartTrial = useCallback(() => {
    setSignInError(null);
    setTrialGateOpen(true);
  }, []);

  const handleConfirmTrial = useCallback(async () => {
    setTrialGateOpen(false);
    setSignInError(null);
    setSignInStatus('opening');
    try {
      const newSession = await startFreeTrial((status) => setSignInStatus(status));
      setSession(newSession);
      setSignInOpen(false);
      setSignInStatus('idle');
      setSignInEmail('');
    } catch (err) {
      setSignInStatus('error');
      setSignInError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await clearGoogleAccount();
    await signOut();
    setSession(null);
    setBalance(null);
    setAccountOpen(false);
  }, []);



  const handleAdminLookup = useCallback(async () => {
    if (!session) return;
    const email = adminEmail.trim().toLowerCase();
    if (!email) return;
    setAdminBusy(true);
    setAdminError(null);
    try {
      const [member, usage] = await Promise.all([
        lookupMember(session.token, email),
        fetchUsage(session.token, 7),
      ]);
      setAdminMember(member);
      setAdminUsage(usage);
    } catch (err) {
      setAdminMember(null);
      setAdminError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdminBusy(false);
    }
  }, [session, adminEmail]);

  /** Re-runs the lookup after a mutating action so the panel reflects the new state. */
  const handleAdminAction = useCallback(
    async (action: () => Promise<unknown>) => {
      if (!session) return;
      setAdminBusy(true);
      setAdminError(null);
      try {
        await action();
        await handleAdminLookup();
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err));
      } finally {
        setAdminBusy(false);
      }
    },
    [session, handleAdminLookup],
  );

  /** Not-that-mutating actions (credits, MCP link, tier relabel) that don't need the full
   *  lookup-refresh dance — they still show/clear their own busy + error state uniformly. */
  const handleAdminQuickAction = useCallback(
    async (action: () => Promise<unknown>, onDone?: (result: unknown) => void) => {
      if (!session) return;
      setAdminBusy(true);
      setAdminError(null);
      try {
        const result = await action();
        onDone?.(result);
        if (adminEmail.trim()) await handleAdminLookup();
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err));
      } finally {
        setAdminBusy(false);
      }
    },
    [session, adminEmail, handleAdminLookup],
  );

  const toggleAdminSection = useCallback(
    async (section: typeof adminSection) => {
      if (!session) return;
      if (adminSection === section) { setAdminSection(null); return; }
      setAdminSection(section);
      setAdminSectionBusy(true);
      setAdminError(null);
      try {
        if (section === 'members' && !adminMembersList) setAdminMembersList(await listMembers(session.token, { nonCommunity: true }));
        else if (section === 'keys' && !adminKeys) setAdminKeys(await listKeys(session.token));
        else if (section === 'payments' && !adminPayments) setAdminPayments((await listPayments(session.token, undefined, 50)).payments);
        else if (section === 'audit' && !adminAudit) setAdminAudit((await fetchAudit(session.token, 50)).events);
        else if (section === 'kpis' && !adminKpis) {
          const [k, s] = await Promise.all([fetchKpis(session.token), fetchStats(session.token)]);
          setAdminKpis(k);
          setAdminStats(s);
        }
        else if (section === 'crashes') setAdminCrashes(await getCrashLog());
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err));
      } finally {
        setAdminSectionBusy(false);
      }
    },
    [session, adminSection, adminMembersList, adminKeys, adminPayments, adminAudit, adminKpis],
  );

  const refreshKpis = useCallback(async () => {
    if (!session) return;
    setAdminSectionBusy(true);
    setAdminError(null);
    try {
      const [k, s] = await Promise.all([fetchKpis(session.token), fetchStats(session.token)]);
      setAdminKpis(k);
      setAdminStats(s);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdminSectionBusy(false);
    }
  }, [session]);

  const handleTestKeys = useCallback(async () => {
    if (!session) return;
    setAdminSectionBusy(true);
    setAdminError(null);
    try {
      await testKeys(session.token);
      setAdminKeys(await listKeys(session.token));
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdminSectionBusy(false);
    }
  }, [session]);

  const handleReviveKey = useCallback(
    async (fp: string) => {
      if (!session) return;
      setAdminSectionBusy(true);
      setAdminError(null);
      try {
        await reviveKey(session.token, fp);
        setAdminKeys(await listKeys(session.token));
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err));
      } finally {
        setAdminSectionBusy(false);
      }
    },
    [session],
  );

  const handleRefundPayment = useCallback(
    async (paymentId: string) => {
      if (!session) return;
      setAdminSectionBusy(true);
      setAdminError(null);
      try {
        await refundPayment(session.token, paymentId);
        setAdminPayments((await listPayments(session.token, undefined, 50)).payments);
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err));
      } finally {
        setAdminSectionBusy(false);
      }
    },
    [session],
  );

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingBottom: Platform.OS === 'ios' ? iosKeyboardPadding : keyboardPadding,
        },
      ]}
    >
      <View onLayout={(event) => registerOnboardingContainer('topBar', event.nativeEvent.layout)} style={[styles.topBar, { justifyContent: 'flex-end', paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable
          onLayout={(event) => registerOnboardingChild('account', 'topBar', event.nativeEvent.layout)}
          accessibilityLabel="Account access"
          onPress={() => {
            if (session) {
              if (Platform.OS === 'web') setWebAccountTab('balance');
              setAccountOpen(true);
            } else setSignInOpen(true);
          }}
          style={({ pressed }) => [
            styles.accountPill,
            { backgroundColor: colors.buttonBackground, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {session ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' }} />
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                {effectiveTierLabel}
              </Text>
            </View>
          ) : sessionResolved ? (
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>Sign in</Text>
          ) : (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {inChatSearchOpen ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }}
        >
          <TextInput
            value={inChatQuery}
            onChangeText={setInChatQuery}
            placeholder="Search this chat"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            style={{
              flex: 1,
              fontFamily: Fonts.sans,
              fontSize: 14,
              color: colors.text,
              backgroundColor: colors.buttonBackground,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          />
          {inChatQuery.trim() ? (
            <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>
              {inChatMatchIds.length === 0 ? '0 results' : `${activeMatchIndex + 1}/${inChatMatchIds.length}`}
            </Text>
          ) : null}
          <Pressable
            onPress={goToPrevMatch}
            disabled={inChatMatchIds.length === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Previous match"
          >
            <Ionicons name="chevron-up" size={20} color={inChatMatchIds.length === 0 ? colors.textTertiary : colors.text} />
          </Pressable>
          <Pressable
            onPress={goToNextMatch}
            disabled={inChatMatchIds.length === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next match"
          >
            <Ionicons name="chevron-down" size={20} color={inChatMatchIds.length === 0 ? colors.textTertiary : colors.text} />
          </Pressable>
          <Pressable
            onPress={() => { setInChatSearchOpen(false); setInChatQuery(''); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Ionicons name="close" size={20} color={colors.textTertiary} />
          </Pressable>
        </View>
      ) : null}

      {isOffline ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 8,
            backgroundColor: isDark ? 'rgba(255,159,10,0.15)' : 'rgba(255,149,0,0.12)',
          }}
        >
          <Ionicons name="cloud-offline-outline" size={15} color={colors.text} />
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>
            You&apos;re offline — messages will send once you&apos;re back online
          </Text>
        </View>
      ) : null}

      {updateReady ? (
        <Pressable
          onPress={installDownloadedUpdate}
          accessibilityRole="button"
          accessibilityLabel="Update downloaded, tap to restart and apply"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 8,
            backgroundColor: isDark ? 'rgba(52,199,89,0.15)' : 'rgba(52,199,89,0.12)',
          }}
        >
          <Ionicons name="arrow-up-circle-outline" size={15} color={colors.text} />
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>
            Update downloaded — tap to restart and apply
          </Text>
        </Pressable>
      ) : null}

      {isIncognito ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 6,
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          }}
        >
          <Ionicons name="eye-off-outline" size={13} color={colors.textSecondary} />
          <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }}>
            Incognito — this chat isn&apos;t saved on this device or the server
          </Text>
        </View>
      ) : null}

      {activeDocument ? (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Ionicons name="document-text-outline" size={16} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }} numberOfLines={1}>
                {activeDocument.path.split('/').pop()}
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 10, color: colors.textTertiary }} numberOfLines={1}>
                {activeDocument.archiveName} · {docDirty ? 'Uncommitted edits' : 'Synced'}
              </Text>
            </View>
            {docDirty ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FF9500' }} /> : null}
            {!docCardCollapsed ? (
              <>
                <Pressable onPress={() => setDocViewMode((m) => (m === 'preview' ? 'edit' : 'preview'))} hitSlop={8}>
                  <Ionicons name={docViewMode === 'preview' ? 'pencil-outline' : 'eye-outline'} size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => setDocFullView(true)} hitSlop={8} accessibilityLabel="Open full view">
                  <Ionicons name="expand-outline" size={16} color={colors.textSecondary} />
                </Pressable>
              </>
            ) : null}
            <Pressable onPress={() => setDocCardCollapsed((v) => !v)} hitSlop={8}>
              <Ionicons name={docCardCollapsed ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={handleCloseDocument} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {!docCardCollapsed ? (
            <>
              {docViewMode === 'edit' ? (
                <DocumentEditorInput
                  value={activeDocument.content}
                  onChangeText={documentChatUpdateContent}
                  textAlignVertical="top"
                  placeholder="Empty file"
                  placeholderTextColor={colors.textTertiary}
                  style={{
                    maxHeight: 300,
                    padding: 12,
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: colors.text,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                />
              ) : (
                <ScrollView
                  style={{ maxHeight: 300, borderTopWidth: 1, borderTopColor: colors.border }}
                  contentContainerStyle={{ padding: 12 }}
                  nestedScrollEnabled
                >
                  <DocumentMarkdownPreview text={activeDocument.content} textColor={colors.text} isDark={isDark} />
                </ScrollView>
              )}
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 }}>
                <Text style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 10, color: colors.textTertiary }}>
                  Ask below to have the AI edit this — e.g. &ldquo;tighten the intro&rdquo;.
                </Text>
                <Pressable
                  onPress={handleCommitDocument}
                  disabled={!docDirty || docCommitting}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: colors.accent,
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    opacity: docDirty && !docCommitting ? 1 : 0.5,
                  }}
                >
                  {docCommitting ? (
                    <ActivityIndicator size="small" color={colors.onTint ?? '#fff'} />
                  ) : (
                    <Ionicons name="cloud-upload-outline" size={13} color={colors.onTint ?? '#fff'} />
                  )}
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.onTint ?? '#fff' }}>
                    {docCommitting ? 'Committing…' : 'Commit to GitHub'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {activeDocument ? (
        <Modal
          visible={docFullView}
          animationType="slide"
          onRequestClose={() => setDocFullView(false)}
        >
          <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: colors.text }} numberOfLines={1}>
                  {activeDocument.path.split('/').pop()}
                </Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary }} numberOfLines={1}>
                  {activeDocument.archiveName} · {docDirty ? 'Uncommitted edits' : 'Synced'}
                </Text>
              </View>
              <Pressable onPress={() => setDocViewMode((m) => (m === 'preview' ? 'edit' : 'preview'))} hitSlop={8}>
                <Ionicons name={docViewMode === 'preview' ? 'pencil-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => setDocFullView(false)} hitSlop={8} accessibilityLabel="Close full view">
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            {docViewMode === 'edit' ? (
              <DocumentEditorInput
                value={activeDocument.content}
                onChangeText={documentChatUpdateContent}
                textAlignVertical="top"
                placeholder="Empty file"
                placeholderTextColor={colors.textTertiary}
                style={{
                  flex: 1,
                  padding: 16,
                  fontFamily: 'monospace',
                  fontSize: 13.5,
                  lineHeight: 20,
                  color: colors.text,
                }}
              />
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <DocumentMarkdownPreview text={activeDocument.content} textColor={colors.text} isDark={isDark} />
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, paddingBottom: Math.max(10, insets.bottom), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable
                onPress={handleCommitDocument}
                disabled={!docDirty || docCommitting}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: colors.accent,
                  borderRadius: 10,
                  paddingVertical: 12,
                  opacity: docDirty && !docCommitting ? 1 : 0.5,
                }}
              >
                {docCommitting ? (
                  <ActivityIndicator size="small" color={colors.onTint ?? '#fff'} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={15} color={colors.onTint ?? '#fff'} />
                )}
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.onTint ?? '#fff' }}>
                  {docCommitting ? 'Committing…' : 'Commit to GitHub'}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      {announcement ? (
        <Pressable
          onPress={() => {
            if (announcement.url) Linking.openURL(announcement.url).catch(() => {});
          }}
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            backgroundColor: isDark ? 'rgba(61,26,102,0.35)' : 'rgba(61,26,102,0.08)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(61,26,102,0.18)',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
              {announcement.title}
            </Text>
            {announcement.body ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {announcement.body}
              </Text>
            ) : null}
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => {
              markAnnouncementSeen(announcement.id).catch(() => {});
              setAnnouncement(null);
            }}
          >
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Pressable>
        </Pressable>
      ) : null}

      <ScrollView
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 24,
          gap: 10,
          flexGrow: 1,
          // Same reasoning as styles.sheet above: uncapped, a reply on a wide
          // unfolded foldable becomes one very long, hard-to-read line. Capped
          // and centered here; a no-op on any phone-width screen.
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 20, color: colors.text }}>
              Expert AI
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontFamily: Fonts.sans,
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              Ask anything to get started.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18, paddingHorizontal: 8 }}>
              <Pressable
                onPress={handleAttachTodayNote}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                    backgroundColor: pressed ? colors.surface : 'transparent',
                  },
                ]}
              >
                <Ionicons name="document-text-outline" size={13} color={colors.text} />
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text }}>Today&apos;s note</Text>
              </Pressable>
              {PROMPT_STARTERS.map((s) => (
                <Pressable
                  key={s.label}
                  onPress={() => {
                    setInput(s.prompt);
                    inputRef.current?.focus();
                  }}
                  style={({ pressed }) => [
                    {
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                      backgroundColor: pressed ? colors.surface : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <>
            {messages.map((item, index) => renderBubble(item, index))}
            {!sending &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'assistant' &&
            !messages[messages.length - 1].streaming &&
            !messages[messages.length - 1].failed &&
            messages[messages.length - 1].text.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4, marginTop: 2 }}>
                {FOLLOW_UPS.map((f) => (
                  <Pressable
                    key={f.label}
                    onPress={() => sendText(f.prompt)}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                        backgroundColor: pressed ? colors.surface : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>{f.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {error ? (
        <View style={[styles.errorBanner, { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.errorColor }}>
              {error.message}
              {error.wait ? ` Try again in ${error.wait}s.` : ''}
            </Text>
            {error.notCharged ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                This didn&apos;t use any of your usage.
              </Text>
            ) : null}
          </View>
          {error.upgrade ? (
            <Pressable
              onPress={() => {
                setError(null);
                setAccountOpen(true);
              }}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>Upgrade</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {messages.length > 0 && (agentPhase !== 'idle' || currentConversationDurableJobActive) ? (
        <View
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Agent status: ${agentPhase === 'using_tool' ? `using ${friendlyToolLabels(agentTools)}` : agentPhase === 'connecting' ? 'connecting to the gateway' : agentPhase === 'reconnecting' ? 'reconnecting and preserving your request' : agentPhase === 'paused' ? 'paused, ready to resume' : currentConversationDurableJobActive ? 'working in the background' : agentPhase}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}
        >
          {agentPhase !== 'paused' ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="pause-circle-outline" size={16} color={colors.accent} />}
          <Text style={{ flex: 1, fontFamily: Fonts.sansMedium, fontSize: 12, color: colors.textSecondary }}>
            {agentPhase === 'connecting' ? 'Connecting to your agent…' : null}
            {agentPhase === 'thinking' ? 'Planning the next step…' : null}
            {agentPhase === 'using_tool' ? `Working with ${friendlyToolLabels(agentTools) || 'a tool'}…` : null}
            {agentPhase === 'synthesizing' ? 'Writing the answer…' : null}
            {agentPhase === 'reconnecting' ? 'Reconnecting — your request is preserved and will continue…' : null}
            {agentPhase === 'paused' ? 'Paused — resume whenever you’re ready.' : null}
            {agentPhase === 'idle' && currentConversationDurableJobActive ? 'Working in the background — you can leave the app.' : null}
          </Text>
        </View>
      ) : null}
      {currentAgentRoute && agentPhase !== 'idle' ? (
        <Text style={{ marginLeft: 40, marginTop: 1, marginBottom: 5, fontFamily: Fonts.sans, fontSize: 10, color: colors.textTertiary }}>
          Using: {displayModelName(currentAgentRoute)}
        </Text>
      ) : null}

      {currentAgentToolRuns.length > 0 && agentPhase !== 'idle' ? (
        <View style={{ marginHorizontal: 16, marginTop: 4, paddingLeft: 24, gap: 3 }} accessibilityRole="text">
          {currentAgentToolRuns.map((run) => (
            <Text key={run.name} style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary }}>
              {run.status === 'running' ? '◌' : run.status === 'complete' ? '✓' : '!' } {friendlyToolLabels([run.name])}{run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {messages.length > 0 && durableJobStates.some((job) => job.status === 'running' || job.status === 'queued' || job.status === 'paused') ? (
        <Pressable
          onPress={async () => {
            const detail = durableJobStates.map((job) => {
              const retryIn = job.nextRetryAt && job.nextRetryAt > Date.now()
                ? ` · retrying in ${Math.ceil((job.nextRetryAt - Date.now()) / 1000)}s`
                : '';
              return `${(job.phase || job.status).replace(/_/g, ' ').toUpperCase()} · ${job.jobId.slice(0, 8)}${retryIn}${job.error ? ` · ${job.error}` : ''}`;
            }).join('\n');
            const failed = durableJobStates.find((job) => job.status === 'failed' && job.retryable !== false && queuedSendsRef.current.has(job.assistantMessageId));
            const deadLettered = durableJobStates.find((job) => job.status === 'dead_letter');
            const history = await readChatJobHistory().catch(() => []);
            const historyDetail = history.slice(-5).reverse().map((job) => `${job.status.toUpperCase()} · ${job.jobId.slice(0, 8)}${job.error ? ` · ${job.error}` : ''}`).join('\n');
            Alert.alert(
              'Background work',
              `${durableJobStates.length} request${durableJobStates.length === 1 ? '' : 's'} are tracked.\n\n${detail || 'No active requests.'}${historyDetail ? `\n\nRecent history:\n${historyDetail}` : ''}${deadLettered ? '\n\nOne request exhausted its safe retry budget. Start a fresh request rather than retrying indefinitely.' : ''}`,
              failed ? [
                { text: 'Close', style: 'cancel' },
                { text: 'Retry failed job', onPress: () => flushQueuedSendRef.current?.(failed.assistantMessageId) },
              ] : [{ text: 'Close', style: 'cancel' }],
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="View background work status"
          style={{ marginHorizontal: 16, marginTop: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.buttonBackground, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons name="pulse-outline" size={16} color={colors.accent} />
          <Text style={{ flex: 1, fontFamily: Fonts.sansMedium, fontSize: 12, color: colors.text }}>
            {durableJobStates.filter((job) => job.status === 'running' || job.status === 'queued' || job.status === 'paused').length} background request{durableJobStates.filter((job) => job.status === 'running' || job.status === 'queued' || job.status === 'paused').length === 1 ? '' : 's'} · tap for status
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
        </Pressable>
      ) : null}
      {messages.length > 0 && durableJobStates.some((job) => job.status === 'running' || job.status === 'queued' || job.status === 'paused') ? (
        <Pressable
          onPress={() => void handlePrepareDesktopHandoff()}
          accessibilityRole="button"
          accessibilityLabel="Prepare desktop handoff for background response"
          style={{ marginHorizontal: 16, marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons name="desktop-outline" size={16} color={colors.textSecondary} />
          <Text style={{ flex: 1, fontFamily: Fonts.sansMedium, fontSize: 12, color: colors.textSecondary }}>Prepare desktop handoff</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      {editingMessageId ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
        >
          <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>
            Editing message — sending will replace it and everything after
          </Text>
          <Pressable onPress={handleCancelEdit} hitSlop={8}>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {pendingImage ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
        >
          <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>
            📷 Image attached — will send with your next message
          </Text>
          <Pressable onPress={() => setPendingImage(null)} hitSlop={8}>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>Remove</Text>
          </Pressable>
        </View>
      ) : null}

      {composerMode ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 7 }} accessibilityRole="text">
          <Ionicons name={composerMode === 'Agent Task' ? 'git-branch-outline' : 'search-outline'} size={15} color={colors.accent} />
          <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 12, color: colors.accent }}>{composerMode} mode active</Text>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary }}>· tools and durable recovery enabled</Text>
        </View>
      ) : null}
      {/* Keyboard accessory toolbar — everything that used to crowd the top bar
          now lives here, just above the composer, so it's reachable with the
          same thumb that's about to type. Fixed order: new chat, history,
          schedule/notes, search, workspace, agent-mode QR. */}
      <View onLayout={(event) => registerOnboardingContainer('toolbar', event.nativeEvent.layout)} style={[styles.bottomToolbar, { borderTopColor: colors.border }]}>
        <Pressable
          onLayout={(event) => registerOnboardingChild('newChat', 'toolbar', event.nativeEvent.layout)}
          onPress={handleNewChat}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="New chat"
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="create-outline" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          onLayout={(event) => registerOnboardingChild('history', 'toolbar', event.nativeEvent.layout)}
          onPress={() => setHistoryOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Chat history"
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="time-outline" size={22} color={colors.text} />
        </Pressable>
        {/* Single "planner" entry hosting both Daily notes and Scheduled tasks
            as tabs — a due-task dot and the notes streak both surface here. */}
        <Pressable
          onLayout={(event) => registerOnboardingChild('planner', 'toolbar', event.nativeEvent.layout)}
          onPress={() => openPlanner('scheduled')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={hasDueScheduledTask ? 'Daily notes and scheduled tasks, task due' : 'Daily notes and scheduled tasks'}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="alarm-outline" size={22} color={colors.text} />
          {hasDueScheduledTask && <View style={styles.dueDot} />}
        </Pressable>
        <Pressable
          onLayout={(event) => registerOnboardingChild('search', 'toolbar', event.nativeEvent.layout)}
          onPress={() => setInChatSearchOpen((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Search this chat"
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="search-outline" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          onLayout={(event) => registerOnboardingChild('workspace', 'toolbar', event.nativeEvent.layout)}
          onPress={() => setSidePanelOpen((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={sidePanelOpen ? 'Close workspace panel' : 'Open workspace panel (documents & canvas)'}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name={sidePanelOpen ? 'archive' : 'archive-outline'} size={22} color={colors.text} />
        </Pressable>
        <Pressable
          onLayout={(event) => registerOnboardingChild('agent', 'toolbar', event.nativeEvent.layout)}
          onPress={goToAgentMode}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Switch to Agent mode (scan desktop QR)"
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="qr-code-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      {voiceListening ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, alignItems: 'flex-start' }}>
          <VoiceRecordingIndicator color={colors.textTertiary} />
        </View>
      ) : null}

      <View
        style={[
          styles.inputRow,
          {
            paddingBottom: isKeyboardVisible ? 10 : insets.bottom + 10,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
        onLayout={(event) => { registerOnboardingContainer('composer', event.nativeEvent.layout); registerOnboardingTarget('composer', event.nativeEvent.layout); }}
      >
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          placeholder="Message"
          placeholderTextColor={colors.textTertiary}
          style={[styles.textInput, { color: colors.text, backgroundColor: colors.buttonBackground }]}
          multiline
          onSubmitEditing={handleSend}
        />
        {durableJobsActive > 0 ? (
          <Pressable
            onPress={handlePauseResume}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={durableJobsPaused ? 'Resume background response' : 'Pause background response'}
            style={({ pressed }) => [styles.composerAction, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Ionicons name={durableJobsPaused ? 'play' : 'pause'} size={17} color={colors.textTertiary} />
          </Pressable>
        ) : null}
        <ImageAttachButton
          onLayout={(event) => registerOnboardingChild('attach', 'composer', event.nativeEvent.layout)}
            color={colors.textTertiary}
            disabled={currentConversationStreaming || currentConversationBusy}
            canSendRawImage={tier !== 'community'}
            onConfirm={async (picked: PickedImage, sendRawImage: boolean) => {
            if (sendRawImage) {
              try {
                const contentParts = await buildImageContentParts(picked, input.trim());
                setPendingImage({ contentParts });
              } catch {
                setError({ message: 'Could not prepare the image. Please try again.' });
              }
            } else {
              setInput(buildTextOnlyMessage(picked, input.trim()));
            }
            }}
          />
        <VoiceInputButton
          onLayout={(event) => registerOnboardingChild('voice', 'composer', event.nativeEvent.layout)}
            color={colors.textTertiary}
            disabled={currentConversationStreaming || currentConversationBusy}
            onStart={() => { voiceBaseTextRef.current = input.trim(); }}
            onTranscript={(t) => setInput(voiceBaseTextRef.current ? `${voiceBaseTextRef.current} ${t}` : t)}
            onError={(message) => Alert.alert('Voice input unavailable', message)}
            onListeningChange={setVoiceListening}
          />
        <Pressable
          onPress={sending || durableJobsActive > 0 ? handleStop : handleSend}
          disabled={!currentConversationBusy && !currentConversationStreaming && !currentConversationDurableJobActive && !input.trim() && !pendingImage}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: colors.accent,
              opacity: !sending && durableJobsActive === 0 && !input.trim() && !pendingImage ? 0.4 : pressed ? 0.75 : 1,
            },
          ]}
        >
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.onTint }}>
            {sending || durableJobsActive > 0 ? 'Stop' : 'Send'}
          </Text>
        </Pressable>
      </View>

      {/* Chat history */}
      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setHistoryOpen(false)}>
          {/* Edge-to-edge + windowSoftInputMode="adjustNothing" means a Modal is NEVER
              resized/panned for the keyboard by the OS — same issue already fixed for
              the Admin console below. Without marginBottom here, the keyboard opening
              for the search TextInput just overlapped/covered the bottom of this sheet
              (search input included) instead of the sheet lifting to stay above it. */}
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.sheetBackground, maxHeight: '75%' },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.sheetHandle }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text }}>
                Chats
              </Text>
              {/* "New chat" lives in the bottom toolbar now (see the composer's
                  accessory row) — no need to duplicate it here, and it was
                  sitting right next to Incognito before, which made the two
                  easy to mis-tap. Incognito stays; Settings moved to the far
                  right so it reads as a separate, deliberate action. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Pressable
                  onPress={handleNewIncognitoChat}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="New incognito chat, not saved"
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="eye-off-outline" size={20} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHistoryOpen(false);
                    setSettingsOpen(true);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="settings-outline" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>
            {conversations.length > 0 ? (
              <TextInput
                value={historyQuery}
                onChangeText={setHistoryQuery}
                placeholder="Search chats"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                style={{
                  fontFamily: Fonts.sans,
                  fontSize: 14,
                  color: colors.text,
                  backgroundColor: colors.buttonBackground,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  marginBottom: 10,
                }}
              />
            ) : null}
            {conversations.length === 0 ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, paddingVertical: 20, textAlign: 'center' }}>
                No conversations yet.
              </Text>
            ) : filteredConversations.length === 0 ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, paddingVertical: 20, textAlign: 'center' }}>
                No chats match “{historyQuery.trim()}”.
              </Text>
            ) : (
              <FlatList
                data={filteredConversations}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <View>
                    <Pressable
                      onPress={() => handleOpenConversation(item)}
                      style={({ pressed }) => [
                        styles.historyRow,
                        {
                          backgroundColor:
                            item.id === conversationId ? (colors.buttonBackground) : 'transparent',
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {item.pinned ? <Ionicons name="pin" size={11} color={colors.textTertiary} /> : null}
                          <Text
                            numberOfLines={1}
                            style={{ fontFamily: Fonts.sans, fontSize: 14, color: colors.text, flexShrink: 1 }}
                          >
                            {item.title}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                          {new Date(item.updatedAt).toLocaleString()}
                          {item.projectId ? ` · ${availableProjects.find((p) => p.id === item.projectId)?.name ?? 'Project'}` : ''}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setProjectPickerId((cur) => (cur === item.id ? null : item.id))}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Move chat to project: ${item.title}`}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name={item.projectId ? 'folder' : 'folder-outline'} size={18} color={item.projectId ? colors.text : colors.textTertiary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleTogglePin(item.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={item.pinned ? `Unpin chat: ${item.title}` : `Pin chat: ${item.title}`}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={18} color={item.pinned ? colors.text : colors.textTertiary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleShareConversation(item)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Share chat: ${item.title}`}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="share-outline" size={18} color={colors.textTertiary} />
                      </Pressable>
                      <Pressable
                        onPress={() => void handleBranchConversation(item)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Branch chat: ${item.title}`}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="git-branch-outline" size={18} color={colors.textTertiary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteConversation(item.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete chat: ${item.title}`}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                      </Pressable>
                    </Pressable>
                    {projectPickerId === item.id ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 10 }}>
                        <Pressable
                          onPress={() => handleAssignProject(item.id, null)}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: !item.projectId ? colors.text : 'transparent', borderWidth: item.projectId ? 1 : 0, borderColor: colors.border }}
                        >
                          <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: !item.projectId ? colors.background : colors.textSecondary }}>No project</Text>
                        </Pressable>
                        {availableProjects.map((p) => (
                          <Pressable
                            key={p.id}
                            onPress={() => handleAssignProject(item.id, p.id)}
                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: item.projectId === p.id ? colors.text : 'transparent', borderWidth: item.projectId === p.id ? 0 : 1, borderColor: colors.border }}
                          >
                            <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: item.projectId === p.id ? colors.background : colors.textSecondary }} numberOfLines={1}>
                              {p.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Planner — Daily notes + Scheduled tasks as tabs in one sheet */}
      <PlannerSheet
        visible={plannerOpen}
        tab={plannerTab}
        onChangeTab={handleChangePlannerTab}
        isDark={isDark}
        colors={colors}
        onClose={() => setPlannerOpen(false)}
        onDismiss={handlePlannerDismiss}
        note={dailyNote}
        isViewingToday={viewingTodayNote}
        streak={dailyStreak}
        archive={dailyNotesList}
        onChangeBody={handleSaveNoteBody}
        onOpenArchived={handleOpenArchivedNote}
        onOpenDate={handleOpenNoteDate}
        onOpenWriter={openNoteWriterAfterPlanner}
        onBackToToday={handleBackToToday}
        onDeleteArchived={handleDeleteArchivedNote}
        onAiInsights={handleNoteAiInsights}
        onExtractTasks={handleNoteExtractTasks}
        onWeeklyDigest={handleNoteWeeklyDigest}
        onEndOfDayReview={handleNoteEndOfDayReview}
        onShareNote={handleShareNote}
        onOpenScheduleNew={openScheduleFromPlanner}
        onRunTask={runScheduledTask}
        onRescheduleRemote={async (task, scheduledFor) => {
          const token = session ? getActiveToken(session) : null;
          if (!token || !task.conversationId || !task.jobId) return;
          const saved = (await listConversations()).find((conversation) => conversation.id === task.conversationId);
          const assistant = saved ? [...saved.messages].reverse().find((message) => message.role === 'assistant') : null;
          if (!saved || !assistant) return;
          const history: ChatMessage[] = [
            buildSystemContextMessage(currentStyleOpts(task.prompt)),
            { role: 'user', content: task.prompt },
          ];
          const pushToken = await NotificationsService.getPushToken();
          const durable = await createChatJob({
            token,
            idempotencyKey: `scheduled-${assistant.id}-${Date.now()}`,
            model: saved.modelId,
            messages: history,
            conversationId: saved.id,
            pushToken,
            scheduledFor,
          });
          await rememberChatJob({
            jobId: durable.jobId,
            assistantMessageId: assistant.id,
            conversationId: saved.id,
            createdAt: Date.now(),
          });
          await useScheduledTasksStore.getState().replaceRemoteTask(task.id, scheduledFor, {
            jobId: durable.jobId,
            conversationId: saved.id,
          });
          await cancelChatJob(token, task.jobId).catch(() => {});
        }}
      />

      {/* Full-screen writing surface */}
      <NoteWriter
        visible={noteWriterOpen}
        colors={colors}
        isDark={isDark}
        title={dailyNote?.title ?? 'Daily note'}
        streak={dailyStreak}
        isViewingToday={viewingTodayNote}
        noteId={dailyNote?.id ?? null}
        body={dailyNote?.body ?? ''}
        onChangeBody={(next) => dailyNote ? handleSaveNoteBody(dailyNote.id, next) : undefined}
        onClose={() => setNoteWriterOpen(false)}
        onBackToToday={handleBackToToday}
        actions={
          [
            { icon: 'sparkles-outline', label: 'AI insights', onPress: () => { setNoteWriterOpen(false); handleNoteAiInsights(); } },
            { icon: 'checkbox-outline', label: 'Extract tasks', onPress: () => { setNoteWriterOpen(false); handleNoteExtractTasks(); } },
            { icon: 'moon-outline', label: 'End of day review', onPress: () => { setNoteWriterOpen(false); handleNoteEndOfDayReview(); } },
            { icon: 'calendar-outline', label: 'Weekly digest', onPress: () => { setNoteWriterOpen(false); handleNoteWeeklyDigest(); } },
            { icon: 'share-outline', label: 'Share note', onPress: handleShareNote },
          ] as NoteWriterAction[]
        }
      />

      <ExtractedTasksSheet
        visible={extractOpen}
        isDark={isDark}
        colors={colors}
        candidates={extractCandidates}
        onClose={() => setExtractOpen(false)}
        onSchedule={handleConfirmScheduleTasks}
      />
      <ScheduleTaskSheet
        visible={scheduleNewOpen}
        isDark={isDark}
        colors={colors}
        initialPrompt={scheduleInitialPrompt}
        onClose={handleScheduleSheetClose}
        onDismiss={handleScheduleSheetDismiss}
        onSchedule={async (prompt, scheduledFor) => {
          const token = session ? getActiveToken(session) : null;
          if (!token) {
            setSignInOpen(true);
            return;
          }
          const taskConversationId = makeConversationId();
          const assistantId = makeId();
          const history: ChatMessage[] = [
            buildSystemContextMessage(currentStyleOpts(prompt)),
            { role: 'user', content: prompt },
          ];
          const userMessage = { id: makeId(), role: 'user' as const, text: prompt };
          const scheduledAssistant = { id: assistantId, role: 'assistant' as const, text: '' };
          try {
            await saveConversation(taskConversationId, [userMessage, scheduledAssistant], modelId);
            const pushToken = await NotificationsService.getPushToken();
            await rememberChatJobIntent({
              idempotencyKey: `scheduled-${assistantId}`,
              model: modelId,
              messages: history,
              assistantMessageId: assistantId,
              conversationId: taskConversationId,
              pushToken,
              scheduledFor,
              createdAt: Date.now(),
            });
            let durable;
            try {
              durable = await createChatJob({
                token,
                idempotencyKey: `scheduled-${assistantId}`,
                model: modelId,
                messages: history,
                conversationId: taskConversationId,
                pushToken,
                scheduledFor,
              });
            } catch (error) {
              // A definite client rejection cannot have created a job, so the
              // intent is safe to discard. Network/timeout errors remain
              // recoverable intents because the server may have accepted the
              // request before the response was lost.
              if (error instanceof ChatJobRequestError && error.status >= 400 && error.status < 500) {
                await forgetChatJobIntent(assistantId);
              }
              throw error;
            }
            await rememberChatJob({
              jobId: durable.jobId,
              assistantMessageId: assistantId,
              conversationId: taskConversationId,
              createdAt: Date.now(),
            });
            await useScheduledTasksStore.getState().addTask(prompt, scheduledFor, {
              jobId: durable.jobId,
              conversationId: taskConversationId,
            });
          } catch (error) {
            const definiteRejection = error instanceof ChatJobRequestError && error.status >= 400 && error.status < 500;
            if (!definiteRejection) {
              // Keep an uncertain network submission in the outbox; it may
              // have been accepted server-side before the response was lost.
              closeScheduleAndShowPlanner();
              return;
            }
            // Explicit client rejection cannot have created a job, so retain
            // the existing local-reminder fallback.
            await useScheduledTasksStore.getState().addTask(prompt, scheduledFor);
          }
          closeScheduleAndShowPlanner();
        }}
      />

      {/* Gift reveal — a founder-granted one-time gift, surfaced the moment /me
          returns it (see the giftReveal effect above). Real shape confirmed
          against the gateway: {haiku, sonnet, luna, message, ts} — summed into
          one generic token total, never broken out by model name (see the
          comment on the giftReveal state above for why). */}
      <Modal visible={!!giftReveal} transparent animationType="fade" onRequestClose={() => setGiftReveal(null)}>
        <Pressable style={[styles.overlay, { justifyContent: 'center', paddingHorizontal: 20 }]} onPress={() => setGiftReveal(null)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.sheetBackground, borderRadius: 20, alignItems: 'center', paddingVertical: 28 }]}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 40 }}>🎁</Text>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 18, color: colors.text, marginTop: 10 }}>
              You&apos;ve been sent a gift!
            </Text>
            {giftReveal ? (
              <>
                {giftReveal.haiku + giftReveal.sonnet + giftReveal.luna > 0 ? (
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: colors.text, marginTop: 6 }}>
                    {formatTokenCount(giftReveal.haiku + giftReveal.sonnet + giftReveal.luna)} bonus tokens
                  </Text>
                ) : null}
                {giftReveal.message ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 12 }}>
                    “{giftReveal.message}”
                  </Text>
                ) : null}
              </>
            ) : null}
            <Pressable
              onPress={() => setGiftReveal(null)}
              style={({ pressed }) => [
                styles.sendButton,
                { marginTop: 18, paddingHorizontal: 32, backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.onTint }}>
                Thanks!
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Account sheet */}
      <Modal visible={accountOpen} transparent animationType="slide" onRequestClose={() => setAccountOpen(false)}>
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close account" style={StyleSheet.absoluteFillObject} onPress={() => setAccountOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.sheetBackground, maxHeight: '92%' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.sheetHandle }]} />
            <ScrollView
              style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: 28 }}
            >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.textTertiary }}>
                  EXPERT AI ACCOUNT
                </Text>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: colors.text, marginTop: 5 }}>
                  {session?.email ?? ''}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Reload account and plans" disabled={refreshingAccount} onPress={() => void refreshAccountData()} style={{ minWidth: 76, minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: refreshingAccount ? 0.6 : 1 }}>
                {refreshingAccount ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.accent }}>↻ Reload</Text>}
              </Pressable>
            </View>
            {Platform.OS === 'web' ? (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
                {([
                  ['balance', 'Balance & Usage'],
                  ['plan', 'Choose a Plan'],
                  ['history', 'Purchase History'],
                ] as const).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => setWebAccountTab(key)}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      paddingHorizontal: 6,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: webAccountTab === key ? colors.accent : colors.border,
                      backgroundColor: webAccountTab === key ? colors.buttonBackground : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 11, color: colors.text, textAlign: 'center' }}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {Platform.OS === 'web' && webAccountTab === 'balance' ? (
              <WebBalanceSummary balance={balance} accountInfo={visibleAccountInfo} colors={colors} />
            ) : null}
            {Platform.OS !== 'web' ? <>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 18, color: colors.text, marginTop: 18 }}>
              Your balance
            </Text>
            <View style={{ marginTop: 8, padding: 16, borderRadius: 14, backgroundColor: colors.buttonBackground }}>
              <Text style={{ fontFamily: Fonts.sansBold, fontSize: 20, color: colors.text }}>
              {visibleAccountInfo?.planLabel || effectiveTierLabel}
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 5 }}>
              {visibleAccountInfo?.expires ? `Renews/expires ${new Date(visibleAccountInfo.expires).toLocaleDateString()}` : balance?.passActive ? `${formatDuration(balance.secondsLeft ?? 0)} left on ${balance.monthly ? 'monthly plan' : 'pass'}` : 'No paid plan yet'}
              </Text>
              {visibleAccountInfo?.expert_ai?.total ? (
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 10 }}>
                  {formatTokenCount(visibleAccountInfo.expert_ai.used)} / {formatTokenCount(visibleAccountInfo.expert_ai.total)} tokens used
                </Text>
              ) : balance?.community ? (
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginTop: 10 }}>
                  {balance.community.used} / {balance.community.limit} free messages used today
                </Text>
              ) : null}
            </View>
            {Platform.OS === 'android' ? <>
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 18, color: colors.text, marginTop: 18 }}>
              Choose a plan
            </Text>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 4 }}>
              Monthly includes 3× the weekly allowance. Google Play manages payment, renewal, cancellation, and refunds.
            </Text>

            <MobilePlanOverview colors={colors} session={session} onRefresh={refreshAccountData} onRestore={handleRestorePurchases} />

            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginTop: 20 }}>
              Download access
            </Text>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 4 }}>
              {(visibleAccountInfo?.apps?.length ? visibleAccountInfo.apps : ['Android']).join(' · ')}
            </Text>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 12, lineHeight: 17, color: colors.textTertiary, marginTop: 4 }}>
              Your plan unlocks the applications associated with this tier. Open the dashboard to download the desktop agent and manage connected applications.
            </Text>
            <Pressable
              onPress={() => Linking.openURL('https://ssv.asia/dashboard')}
              accessibilityRole="link"
              style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.accent }}>
                Open download dashboard →
              </Text>
            </Pressable>

            <View style={{ marginTop: 18 }}>
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginBottom: 8 }}>
                Purchase history
              </Text>
              {webHistoryLoading ? <ActivityIndicator color={colors.accent} /> : webPaymentHistory.length === 0 ? (
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textTertiary }}>
                  No purchases found for this account.
                </Text>
              ) : webPaymentHistory.map((payment, index) => (
                <View key={payment.id ?? index} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                    {payment.tierLabel ?? payment.tier ?? 'Expert AI plan'} · {payment.kind ?? 'purchase'}
                  </Text>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 3 }}>
                    ₹{typeof payment.amountPaise === 'number' ? (payment.amountPaise / 100).toFixed(0) : payment.amount ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
            </> : (
              <View style={{ marginTop: 18, padding: 14, borderRadius: 14, backgroundColor: colors.buttonBackground }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text }}>
                  App Store billing
                </Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 5 }}>
                  In-app purchases, subscription management, and restore are not enabled in this iOS test build.
                </Text>
              </View>
            )}

            {visibleAccountInfo?.welcomeBack ? (
              <View style={{ marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: colors.buttonBackground }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                  Welcome back 👋
                </Text>
              </View>
            ) : null}

            {visibleAccountInfo ? (
              <View style={{ marginTop: 16 }}>
                {visibleAccountInfo.expires ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginBottom: 8 }}>
                    Plan renews/expires {new Date(visibleAccountInfo.expires).toLocaleDateString()}
                  </Text>
                ) : null}
                {/* Deliberately generic — never surfaces backend model names (Haiku/
                    Sonnet/Luna/etc.). The app only ever exposes one "Unlimited" model
                    to the user (see MODELS in lib/gateway-client.ts) and has no
                    in-app purchase flow, so naming specific paid-model tiers here
                    would look like advertising access nobody can actually buy through
                    this app — a real Play-review red flag, not just a UX nitpick.
                    It's also structurally meaningless: community/trial accounts are
                    hard-denied haiku/sonnet/luna server-side, so those fields are
                    always 0/0 for them regardless of what's shown — their real daily
                    counter is the balance.community block above, not this section.
                    expert_ai is the tier-ladder account's own combined headline
                    number (>0 only for a real paid tier-ladder account); legacyGrant
                    covers the older pre-tier-ladder paid accounts, combined into one
                    generic total rather than naming its free/pro/foundation keys. */}
                {visibleAccountInfo.unlimited ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, paddingVertical: 4 }}>
                    Unlimited usage on this plan
                  </Text>
                ) : visibleAccountInfo.expert_ai && visibleAccountInfo.expert_ai.total > 0 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>Usage this cycle</Text>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text }}>
                      {formatTokenCount(visibleAccountInfo.expert_ai.used)} / {formatTokenCount(visibleAccountInfo.expert_ai.total)}
                    </Text>
                  </View>
                ) : visibleAccountInfo.legacyGrant && (
                    (visibleAccountInfo.legacyGrant.free ?? 0) +
                    (visibleAccountInfo.legacyGrant.pro ?? 0) +
                    (visibleAccountInfo.legacyGrant.foundation ?? 0)
                  ) > 0 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>Usage this cycle</Text>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text }}>
                      {formatTokenCount(
                        (visibleAccountInfo.legacyGrant.freeUsed ?? 0) +
                          (visibleAccountInfo.legacyGrant.proUsed ?? 0) +
                          (visibleAccountInfo.legacyGrant.foundationUsed ?? 0),
                      )} / {formatTokenCount(
                        (visibleAccountInfo.legacyGrant.free ?? 0) +
                          (visibleAccountInfo.legacyGrant.pro ?? 0) +
                          (visibleAccountInfo.legacyGrant.foundation ?? 0),
                      )}
                    </Text>
                  </View>
                ) : null}
                {visibleAccountInfo.subscription ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 8 }}>
                    Subscription: {visibleAccountInfo.subscription.status}
                    {visibleAccountInfo.subscription.stuck ? ' (needs attention — contact support)' : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
            </> : null}

            {Platform.OS === 'web' && webAccountTab === 'plan' ? (
              <WebPlanSelector
                session={session}
                colors={colors}
                onRefresh={async () => {
                  if (!session) return;
                  const [nextBalance, nextAccount] = await Promise.all([fetchBalance(session.token), fetchAccountInfo(session.token)]);
                  confirmedBalanceByToken.set(session.token, nextBalance);
                  setBalance(nextBalance);
                  setAccountInfo(nextAccount);
                  setAccountInfoToken(session.token);
                }}
              />
            ) : null}

            {Platform.OS === 'web' && webAccountTab === 'history' ? (
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginBottom: 8 }}>
                  Purchase history
                </Text>
                {webHistoryLoading ? <ActivityIndicator color={colors.accent} /> : webPaymentHistory.length === 0 ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textTertiary }}>
                    No purchases found for this account.
                  </Text>
                ) : webPaymentHistory.map((payment, index) => (
                  <View key={payment.id ?? index} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                      {payment.tierLabel ?? payment.tier ?? 'Expert AI plan'} · {payment.kind ?? 'purchase'}
                    </Text>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 3 }}>
                      ₹{typeof payment.amountPaise === 'number' ? (payment.amountPaise / 100).toFixed(0) : payment.amount ?? '—'} · {(payment.createdAt ?? payment.ts) ? new Date((Number(payment.createdAt ?? payment.ts) < 1_000_000_000_000 ? Number(payment.createdAt ?? payment.ts) * 1000 : Number(payment.createdAt ?? payment.ts))).toLocaleDateString() : 'Date unavailable'}
                    </Text>
                    {payment.refunded ? <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.errorColor, marginTop: 3 }}>Refunded</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {Platform.OS === 'web' ? (
              <Pressable
                onPress={() => setWebSettingsOpen((open) => !open)}
                style={[styles.modelRow, { justifyContent: 'space-between', marginTop: 18, backgroundColor: colors.buttonBackground }]}
              >
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>Account settings</Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>{webSettingsOpen ? 'Hide' : 'Show'}</Text>
              </Pressable>
            ) : null}
            {Platform.OS !== 'web' || webSettingsOpen ? <>
            {Platform.OS === 'web' && visibleAccountInfo?.subscription?.status === 'active' ? (
              <Pressable onPress={handleCancelSubscription} style={[styles.modelRow, { justifyContent: 'center', marginTop: 8 }]}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.errorColor }}>Cancel subscription</Text>
              </Pressable>
            ) : null}
            {Platform.OS === 'web' ? (
              <Pressable onPress={handleRestorePurchases} disabled={restoringPurchases} style={[styles.modelRow, { justifyContent: 'center', marginTop: 8, opacity: restoringPurchases ? 0.55 : 1 }]}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.text }}>Check subscription status</Text>
              </Pressable>
            ) : null}
            {Platform.OS === 'android' ? <Pressable
              onPress={handleRestorePurchases}
              disabled={restoringPurchases}
              style={[styles.modelRow, { justifyContent: 'center', marginTop: 16, opacity: restoringPurchases ? 0.55 : 1 }]}
            >
              {restoringPurchases ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                  Restore purchases
                </Text>
              )}
            </Pressable> : null}
            <Pressable
              onPress={() =>
                Linking.openURL(
                  `https://wa.me/919914499477?text=${encodeURIComponent(
                    `Hi, I need help with Expert AI Chat (${session?.email ?? 'not signed in'}).`,
                  )}`,
                )
              }
              style={[styles.modelRow, { justifyContent: 'center', marginTop: 16 }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                Contact support
              </Text>
            </Pressable>
            <Text
              style={{
                fontFamily: Fonts.sans,
                fontSize: 11,
                color: colors.textTertiary,
                textAlign: 'center',
                marginTop: 4,
                paddingHorizontal: 8,
              }}
            >
              Refunds are given for billing errors or a purchase that didn&apos;t work. Message
              support and we&apos;ll be happy to sort it out for you.
            </Text>
            <Pressable
              onPress={() => setHelpCenterOpen(true)}
              style={[styles.modelRow, { justifyContent: 'center', marginTop: 8 }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                Help Center
              </Text>
            </Pressable>
            {session?.email && FOUNDER_EMAILS.includes(session.email.toLowerCase()) ? (
              <Pressable
                onPress={() => {
                  setAccountOpen(false);
                  setAdminError(null);
                  setAdminOpen(true);
                }}
                style={[styles.modelRow, { justifyContent: 'center', marginTop: 8 }]}
              >
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                  Console
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleSignOut}
              style={[styles.modelRow, { justifyContent: 'center', marginTop: 8 }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.errorColor }}>Sign out</Text>
            </Pressable>
            <Pressable
              onPress={handleSignOutEverywhere}
              disabled={signingOutEverywhere}
              style={[styles.modelRow, { justifyContent: 'center', marginTop: 4, opacity: signingOutEverywhere ? 0.5 : 1 }]}
            >
              {signingOutEverywhere ? (
                <ActivityIndicator size="small" color={colors.errorColor} />
              ) : (
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.errorColor }}>
                  Sign out of all devices
                </Text>
              )}
            </Pressable>
            {Platform.OS === 'web' ? (
              <>
                <Pressable onPress={handleClearLocalData} style={[styles.modelRow, { justifyContent: 'center', marginTop: 8 }]}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>Clear local data</Text>
                </Pressable>
                <Pressable onPress={handleDeleteAccountFromHelp} style={[styles.modelRow, { justifyContent: 'center', marginTop: 4 }]}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.errorColor }}>Delete account</Text>
                </Pressable>
              </>
            ) : null}
            </> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Admin console — founder-only, gated server-side (see lib/admin-client.ts). Member
          lookup + grant/ban/revoke/reset + a 7-day usage summary. This whole subtree
          (a genuinely large chunk of JSX + state) is only ever mounted once the founder
          actually opens it — every other user's render tree never includes it at all,
          not even hidden. `hasOpenedAdmin` latches true and stays true so toggling the
          modal closed/open again doesn't tear down and reinitialize its state each time. */}
      {hasOpenedAdmin ? (
      <Modal visible={adminOpen} transparent animationType="fade" onRequestClose={() => setAdminOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setAdminOpen(false)}>
          {/* Edge-to-edge: the Modal window is NOT resized for the keyboard, so this
              bottom-anchored sheet must be lifted by the keyboard's real height in JS,
              and shortened so its top doesn't run off-screen. The old "black bar"
              double-lift was an adjustPan artifact that no longer applies. */}
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.sheetBackground,
                maxHeight: '88%',
              },
            ]}
            onPress={() => {}}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.sheetHandle }]} />
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginBottom: 12 }}>
              Console
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}
            >
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={adminEmail}
                onChangeText={setAdminEmail}
                placeholder="member email"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                keyboardType="email-address"
                onSubmitEditing={handleAdminLookup}
                style={{
                  flex: 1,
                  fontFamily: Fonts.sans,
                  fontSize: 14,
                  color: colors.text,
                  backgroundColor: colors.buttonBackground,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
              <Pressable
                onPress={handleAdminLookup}
                disabled={adminBusy}
                style={[styles.sendButton, { paddingHorizontal: 16, opacity: adminBusy ? 0.5 : 1 }]}
              >
                {adminBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ color: colors.text, fontFamily: Fonts.sansSemiBold }}>Look up</Text>}
              </Pressable>
            </View>

            {adminError ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.errorColor, marginTop: 10 }}>
                {adminError}
              </Text>
            ) : null}

            {adminMember ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                  {adminMember.email}
                </Text>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  entitlement: {adminMember.entitlement ?? 'none'} · active pass: {adminMember.tier}
                  {adminMember.banned ? ' · BANNED' : ''}
                </Text>
                {adminMember.passActive ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                    {Math.round((adminMember.secondsLeft ?? 0) / 60)} min left
                    {adminMember.monthly ? ' (monthly)' : ' (pass)'} ·{' '}
                    {(['free', 'pro', 'foundation'] as const)
                      .filter((k) => (adminMember.budgets?.[k] ?? 0) > 0)
                      .map((k) => `${k}: ${formatTokenCount(adminMember.used?.[k] ?? 0)}/${formatTokenCount(adminMember.budgets?.[k] ?? 0)}`)
                      .join(' · ')}
                  </Text>
                ) : null}
                <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                  MCP: {adminMember.mcp?.credits ?? 0} credits · {adminMember.mcp?.queries ?? 0} queries
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {(['researcher', 'engineer', 'professional', 'aec', 'foundation'] as const).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setAdminGrantTier(t)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: adminGrantTier === t ? colors.accent : colors.buttonBackground,
                      }}
                    >
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: adminGrantTier === t ? colors.onTint : colors.text }}>
                        {t}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  disabled={adminBusy}
                  onPress={() => handleAdminAction(() => grantPass(session!.token, adminMember.email, adminGrantTier))}
                  style={[styles.modelRow, { justifyContent: 'center', marginTop: 8, opacity: adminBusy ? 0.5 : 1 }]}
                >
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                    Grant 6h {adminGrantTier} pass
                  </Text>
                </Pressable>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable
                    disabled={adminBusy}
                    onPress={() =>
                      handleAdminAction(() => setBanned(session!.token, adminMember.email, !adminMember.banned))
                    }
                    style={[styles.modelRow, { flex: 1, justifyContent: 'center', opacity: adminBusy ? 0.5 : 1 }]}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.errorColor }}>
                      {adminMember.banned ? 'Unban' : 'Ban'}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={adminBusy}
                    onPress={() => handleAdminAction(() => revokePass(session!.token, adminMember.email))}
                    style={[styles.modelRow, { flex: 1, justifyContent: 'center', opacity: adminBusy ? 0.5 : 1 }]}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                      Revoke pass
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={adminBusy}
                    onPress={() => handleAdminAction(() => resetMember(session!.token, adminMember.email))}
                    style={[styles.modelRow, { flex: 1, justifyContent: 'center', opacity: adminBusy ? 0.5 : 1 }]}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                      Reset
                    </Text>
                  </Pressable>
                </View>

                {/* Tier relabel — fixes a mistagged Ghost entitlement and (optionally) activates
                    the matching 30-day standing pass in the same call. */}
                <Pressable
                  disabled={adminBusy}
                  onPress={() => handleAdminAction(() => setMemberTier(session!.token, adminMember.email, adminGrantTier, true))}
                  style={[styles.modelRow, { justifyContent: 'center', marginTop: 8, opacity: adminBusy ? 0.5 : 1 }]}
                >
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                    Relabel entitlement → {adminGrantTier} + grant 30-day pass
                  </Text>
                </Pressable>

                {/* MCP prepaid credits — a separate ₹1=1-search economy from the token passes above. */}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  <TextInput
                    value={adminCreditsInput}
                    onChangeText={setAdminCreditsInput}
                    keyboardType="number-pad"
                    style={{
                      width: 70,
                      fontFamily: Fonts.sans,
                      fontSize: 13,
                      color: colors.text,
                      backgroundColor: colors.buttonBackground,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    }}
                  />
                  <Pressable
                    disabled={adminBusy}
                    onPress={() =>
                      handleAdminQuickAction(() =>
                        grantCredits(session!.token, adminMember.email, Math.max(1, parseInt(adminCreditsInput, 10) || 0)),
                      )
                    }
                    style={[styles.modelRow, { flex: 1, justifyContent: 'center', opacity: adminBusy ? 0.5 : 1 }]}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                      Grant MCP credits
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  disabled={adminBusy}
                  onPress={() =>
                    handleAdminQuickAction(
                      () => mintMcpLink(session!.token, adminMember.email, 90),
                      (result) => {
                        const link = (result as { link?: string })?.link;
                        if (link) Clipboard.setStringAsync(link);
                      },
                    )
                  }
                  style={[styles.modelRow, { justifyContent: 'center', marginTop: 8, opacity: adminBusy ? 0.5 : 1 }]}
                >
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                    Mint MCP link (90d) — copies to clipboard
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {adminUsage ? (
              <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surface }}>
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                  All-time: {adminUsage.all.reqs} reqs · {formatTokenCount(adminUsage.all.tokens)} tokens · $
                  {adminUsage.all.cost.toFixed(2)}
                </Text>
                {adminUsage.days[0] ? (
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
                    Today: {adminUsage.days[0].reqs} reqs · {formatTokenCount(adminUsage.days[0].tokens)} tokens
                    (cap {adminUsage.capToday}/day)
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Expandable sections — each fetches lazily on first tap, then caches for the rest
                of this Console session (re-open the sheet or use the section's own refresh
                action to force a reload). */}
            <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surface }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {([
                  ['members', 'Members'],
                  ['keys', 'Model keys'],
                  ['payments', 'Payments'],
                  ['audit', 'Audit log'],
                  ['kpis', 'KPIs'],
                  ['crashes', 'Diagnostics'],
                ] as const).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => toggleAdminSection(key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: adminSection === key ? colors.accent : colors.buttonBackground,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: Fonts.sansSemiBold,
                        fontSize: 12,
                        color: adminSection === key ? colors.onTint : colors.text,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {adminSectionBusy ? (
                <ActivityIndicator size="small" color={colors.text} style={{ marginTop: 12 }} />
              ) : null}

              {adminSection === 'members' && !adminSectionBusy ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>
                    {adminMembersList?.total ?? 0} total ·{' '}
                    {Object.entries(adminMembersList?.counts ?? {})
                      .map(([t, n]) => `${t}: ${n}`)
                      .join(' · ')}
                  </Text>
                  {(adminMembersList?.members ?? []).slice(0, 50).map((m) => (
                    <Pressable
                      key={m.email}
                      onPress={() => {
                        setAdminEmail(m.email);
                        setAdminSection(null);
                        setTimeout(handleAdminLookup, 0);
                      }}
                      style={{ paddingVertical: 6 }}
                    >
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.text }}>
                        {m.email} — {m.tier} ({m.status})
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {adminSection === 'keys' && !adminSectionBusy ? (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>
                      {adminKeys?.count ?? 0} keys in the pool
                    </Text>
                    <Pressable onPress={handleTestKeys}>
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>
                        Test all
                      </Text>
                    </Pressable>
                  </View>
                  {(adminKeys?.keys ?? []).map((k) => (
                    <View key={k.fp} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: k.dead ? colors.errorColor : k.cooling ? '#E8A33D' : colors.text }}>
                        {k.fp} — {k.dead ? 'dead' : k.cooling ? 'cooling' : 'live'} · {k.uses} uses · {k.fails} fails
                      </Text>
                      {k.dead || k.cooling ? (
                        <Pressable onPress={() => handleReviveKey(k.fp)}>
                          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>Revive</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {adminSection === 'payments' && !adminSectionBusy ? (
                <View style={{ marginTop: 12 }}>
                  {(adminPayments ?? []).map((p, i) => (
                    <View key={p.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.text, flex: 1 }}>
                        {p.email} — {p.tier}/{p.kind} — ₹{((p.amount ?? 0) / 100).toFixed(0)}
                        {p.refunded ? ' (refunded)' : ''}
                      </Text>
                      {!p.refunded && p.id ? (
                        <Pressable onPress={() => handleRefundPayment(p.id!)}>
                          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.errorColor }}>Refund</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {adminSection === 'audit' && !adminSectionBusy ? (
                <View style={{ marginTop: 12 }}>
                  {(adminAudit ?? []).map((e, i) => (
                    <Text key={i} style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary, paddingVertical: 4 }}>
                      {JSON.stringify(e)}
                    </Text>
                  ))}
                </View>
              ) : null}

              {adminSection === 'kpis' && !adminSectionBusy ? (
                <View style={{ marginTop: 12, gap: 14 }}>
                  <Pressable
                    onPress={refreshKpis}
                    style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.buttonBackground }}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>↻ Refresh</Text>
                  </Pressable>
                  {/* Headline — the numbers that actually reflect the business, biggest first.
                      Every revenue field from /admin/kpis is real gateway revenue in paise;
                      formatINR converts to ₹. Comped / granted access is shown separately so
                      it never inflates a revenue figure. */}
                  {(() => {
                    const k = adminKpis ?? {};
                    const rev = k.revenue ?? {};
                    const mem = k.members ?? {};
                    const subs = k.subscriptions ?? {};
                    const act = k.active ?? {};
                    const keys = k.keys ?? adminStats?.keys ?? {};
                    const mrr = rev?.byProduct?.monthly;
                    const totalMembers = mem.total ?? adminStats?.members?.total;
                    const Row = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary, flexShrink: 1 }}>
                          {label}
                        </Text>
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>
                          {value}
                          {hint ? <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary }}>{`  ${hint}`}</Text> : null}
                        </Text>
                      </View>
                    );
                    return (
                      <>
                        <View style={{ gap: 6 }}>
                          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Revenue (gateway, real)
                          </Text>
                          <Row label="All-time" value={formatINR(rev.all)} />
                          <Row label="Last 30 days" value={formatINR(rev.d30)} />
                          <Row label="Last 7 days" value={formatINR(rev.d7)} />
                          <Row label="Today" value={formatINR(rev.today)} />
                          {mrr != null ? <Row label="Recurring (monthly subs)" value={`${formatINR(mrr)}/mo`} /> : null}
                          {rev.refunded ? <Row label="Refunded (lifetime)" value={formatINR(rev.refunded)} /> : null}
                        </View>

                        <View style={{ gap: 6 }}>
                          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Members &amp; growth
                          </Text>
                          <Row label="Total members" value={String(totalMembers ?? '—')} />
                          <Row label="New this month" value={mem.new30 != null ? `+${mem.new30}` : '—'} hint={mem.new7 != null ? `+${mem.new7} this week` : undefined} />
                          <Row label="New today" value={mem.new1 != null ? `+${mem.new1}` : '—'} />
                          {mem.payers?.all != null ? <Row label="Paying members (all-time)" value={String(mem.payers.all)} /> : null}
                          {mem.comped != null ? <Row label="Comped / granted access" value={String(mem.comped)} hint="not revenue" /> : null}
                          {mem.conversion != null ? <Row label="Member → paying" value={formatPct(mem.conversion)} /> : null}
                        </View>

                        <View style={{ gap: 6 }}>
                          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Engagement
                          </Text>
                          {act.mau != null ? <Row label="Active this month" value={String(act.mau)} /> : null}
                          {act.wau != null ? <Row label="Active this week" value={String(act.wau)} /> : null}
                          {act.dau != null ? <Row label="Active today" value={String(act.dau)} /> : null}
                          {subs.active != null ? <Row label="Active subscriptions" value={String(subs.active)} /> : null}
                        </View>

                        <View style={{ gap: 6 }}>
                          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            System health
                          </Text>
                          <Row
                            label="Model keys healthy"
                            value={`${keys.live ?? '?'}/${keys.total ?? '?'}`}
                            hint={keys.down ? `${keys.down} down` : 'all live'}
                          />
                          <Row
                            label="Daily capacity used"
                            value={`${k.cap?.used ?? adminStats?.today?.used ?? '?'}/${k.cap?.total ?? adminStats?.today?.cap ?? '?'}`}
                          />
                        </View>

                        {k.funnel ? (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Funnel (30-day snapshot)
                            </Text>
                            <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary }}>
                              {k.funnel.visitors ?? '?'} visitors → {k.funnel.signedUp ?? '?'} signed up →{' '}
                              {k.funnel.activated ?? '?'} activated → {k.funnel.paying ?? '?'} paying
                            </Text>
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                </View>
              ) : null}

              {adminSection === 'crashes' && !adminSectionBusy ? (
                <View style={{ marginTop: 12, gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={async () => setAdminCrashes(await getCrashLog())}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.buttonBackground }}
                    >
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>↻ Refresh</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => { await clearCrashLog(); setAdminCrashes([]); }}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.buttonBackground }}
                    >
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.errorColor }}>Clear</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary }}>
                    Unhandled JS / render errors captured on this device only. {adminCrashes?.length ?? 0} recorded.
                  </Text>
                  {(adminCrashes ?? []).length === 0 ? (
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>
                      No crashes recorded. 🎉
                    </Text>
                  ) : (
                    (adminCrashes ?? []).map((c, i) => (
                      <View key={i} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.surface }}>
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>
                          [{c.kind}] {c.message}
                        </Text>
                        <Text style={{ fontFamily: Fonts.sans, fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
                          {new Date(c.at).toLocaleString()} · v{c.appVersion} · {c.platform}
                        </Text>
                        {c.stack ? (
                          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
                            {c.stack.split('\n').slice(0, 6).join('\n')}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      ) : null}

      {/* Sign-in sheet */}
      <Modal visible={signInOpen} transparent animationType="fade" onRequestClose={() => setSignInOpen(false)}>
        <Pressable
          style={[styles.overlay, { justifyContent: 'center', paddingHorizontal: 20 }]}
          onPress={() => (signInStatus !== 'waiting' && signInStatus !== 'opening' && signInStatus !== 'verifying' ? setSignInOpen(false) : null)}
        >
          <Pressable
            style={{ alignSelf: 'stretch', maxHeight: '80%' }}
            onPress={() => {}}
          >
            <ScrollView
              style={[styles.sheet, { backgroundColor: colors.sheetBackground, borderRadius: 20, padding: 16, paddingBottom: 8, marginBottom: 0 }]}
              contentContainerStyle={{ paddingBottom: 0 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginBottom: 4 }}>
              <Text onPress={() => Linking.openURL('https://ssv.asia')} style={{ textDecorationLine: 'underline' }}>ssv.asia</Text>
              {accountMode === 'create' ? ' · Create account' : ' · Sign in'}
            </Text>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              {accountMode === 'create'
                ? 'Start with your email. We’ll create your account and send a verification code.'
                : 'Enter your account email and we’ll send a verification code.'}
            </Text>
            {emailChallenge ? (
              <>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
                  Enter the 6-digit code sent to {signInEmail}.
                </Text>
                <TextInput
                  value={signInCode}
                  onChangeText={(value) => setSignInCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  editable={signInStatus === 'waiting' || signInStatus === 'error'}
                  style={[styles.textInput, { flex: undefined, alignSelf: 'stretch', minHeight: 52, color: colors.text, backgroundColor: colors.buttonBackground, letterSpacing: 7, textAlign: 'center' }]}
                />
              </>
            ) : (
              <>
                <TextInput
                  value={signInEmail}
                  onChangeText={setSignInEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={signInStatus === 'idle' || signInStatus === 'error'}
                  style={[styles.textInput, { flex: undefined, alignSelf: 'stretch', minHeight: 46, color: colors.text, backgroundColor: colors.buttonBackground }]}
                />
                <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textTertiary, marginTop: 6 }}>
                  Your account is created automatically after verification.
                </Text>
              </>
            )}
            {signInError ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.errorColor, marginTop: 8 }}>
                {signInError}
              </Text>
            ) : null}
            {signInStatus === 'waiting' && emailChallenge ? (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>
                Check your inbox. The code expires shortly.
              </Text>
            ) : null}
            <Pressable
              onPress={emailChallenge ? handleVerifySignIn : handleStartSignIn}
              disabled={emailChallenge ? signInCode.length !== 6 || signInStatus === 'verifying' : !signInEmail.trim() || signInStatus === 'opening'}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  marginTop: 14,
                  backgroundColor: colors.accent,
                  opacity: emailChallenge ? (signInCode.length !== 6 || signInStatus === 'verifying' ? 0.4 : pressed ? 0.75 : 1) : (!signInEmail.trim() || signInStatus === 'opening' ? 0.4 : pressed ? 0.75 : 1),
                },
              ]}
            >
              {signInStatus === 'opening' || signInStatus === 'verifying' ? (
                <ActivityIndicator size="small" color={colors.onTint} />
              ) : (
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.onTint }}>
                  {emailChallenge ? 'Verify code' : 'Continue'}
                </Text>
              )}
            </Pressable>
            {emailChallenge ? (
              <Pressable onPress={handleResendSignIn} disabled={signInStatus === 'opening' || signInStatus === 'verifying'} style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, textDecorationLine: 'underline' }}>Resend code</Text>
              </Pressable>
            ) : null}
            {Platform.OS === 'android' || Platform.OS === 'web' ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
                  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary }}>or</Text>
                  <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
                </View>
                <GoogleSignInButton
                  isDark={isDark}
                  disabled={signInStatus === 'opening' || signInStatus === 'waiting' || signInStatus === 'verifying'}
                  onSuccess={handleGoogleSignInSuccess}
                  onError={handleGoogleSignInError}
                />
              </>
            ) : null}
            <Pressable
              onPress={handleStartTrial}
              disabled={signInStatus === 'opening' || signInStatus === 'waiting' || signInStatus === 'verifying'}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  marginTop: 10,
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: colors.accent,
                  opacity: signInStatus === 'opening' || signInStatus === 'waiting' ? 0.4 : pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                Unlock 30 questions per day
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setEmailChallenge(null); setSignInCode(''); setSignInError(null); setSignInStatus('idle'); }}
              disabled={!emailChallenge}
              style={({ pressed }) => ({ marginTop: 14, alignItems: 'center', opacity: !emailChallenge ? 0 : pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>
                Use a different email
              </Text>
            </Pressable>
            {!emailChallenge ? (
              <Pressable
                onPress={() => { setAccountMode((mode) => mode === 'create' ? 'signin' : 'create'); setSignInError(null); }}
                style={({ pressed }) => ({ marginTop: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.accent, textDecorationLine: 'underline' }}>
                  {accountMode === 'create' ? 'Already have an account? Sign in' : 'New to ssv.asia? Create an account'}
                </Text>
              </Pressable>
            ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Help Center sheet — folds the web help link, AI model/data policy, and the two
          data-control actions (clear local data, delete account) into one place, opened
          from the account sheet's "Help Center" button. */}
      <Modal visible={helpCenterOpen} transparent animationType="fade" onRequestClose={() => setHelpCenterOpen(false)}>
        <Pressable
          style={[styles.overlay, { justifyContent: 'center', paddingHorizontal: 20 }]}
          onPress={() => setHelpCenterOpen(false)}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.sheetBackground, borderRadius: 20, paddingBottom: 20 }]}
            onPress={() => {}}
          >
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginBottom: 12 }}>
              Help Center
            </Text>
            <Pressable
              onPress={() => Linking.openURL('https://ssv.asia/android-help-center/')}
              style={[styles.modelRow, { marginTop: 4, flexDirection: 'column', alignItems: 'flex-start' }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                Visit Help Center
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                Privacy Policy, Terms & Conditions, and support
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAiModelDataPolicy}
              style={[styles.modelRow, { marginTop: 8, flexDirection: 'column', alignItems: 'flex-start' }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                AI Model & Data Policy
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                Powered by OpenRouter — how your data is used
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClearLocalData}
              style={[styles.modelRow, { marginTop: 8, flexDirection: 'column', alignItems: 'flex-start' }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.text }}>
                Clear Local Data
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                Remove saved conversations and preferences on this device
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteAccountFromHelp}
              style={[styles.modelRow, { marginTop: 8, flexDirection: 'column', alignItems: 'flex-start' }]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.errorColor }}>
                Delete Account
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                Permanently delete your account and all data
              </Text>
            </Pressable>
            <Pressable onPress={() => setHelpCenterOpen(false)} style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Trial age/terms handshake — shown before startFreeTrial actually runs, so a
          tap never goes straight from button to a live chat box with zero acknowledgment. */}
      <Modal visible={trialGateOpen} transparent animationType="fade" onRequestClose={() => setTrialGateOpen(false)}>
        <Pressable
          style={[styles.overlay, { justifyContent: 'center', paddingHorizontal: 20 }]}
          onPress={() => setTrialGateOpen(false)}
        >
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.sheetBackground, borderRadius: 20, paddingBottom: 20 }]}
            onPress={() => {}}
          >
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text, marginBottom: 8 }}>
              Before you start
            </Text>
            <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
              This trial gives you 30 AI questions today, no account needed. By continuing, you confirm you&apos;re 13 or older and agree to our{' '}
              <Text
                style={{ textDecorationLine: 'underline', color: colors.text }}
                onPress={() => Linking.openURL('https://ssv.asia/terms-and-conditions/')}
              >
                Terms
              </Text>{' '}
              and{' '}
              <Text
                style={{ textDecorationLine: 'underline', color: colors.text }}
                onPress={() => Linking.openURL('https://ssv.asia/privacy-policy/')}
              >
                Privacy Policy
              </Text>
              .
            </Text>
            <Pressable
              onPress={handleConfirmTrial}
              style={({ pressed }) => [
                styles.sendButton,
                { marginTop: 16, backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.onTint }}>
                Continue
              </Text>
            </Pressable>
            <Pressable onPress={() => setTrialGateOpen(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings Sheet */}
      <SimpleChatSettings
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onReplayOnboarding={() => {
          setSettingsOpen(false);
          setOnboardingOpen(true);
        }}
      />

      {/* Workspace side panel — documents & canvas. It is not mounted during
          onboarding so its sheet cannot leak through on mobile or wide screens. */}
      {!onboardingOpen ? <SidePanel
        visible={sidePanelOpen && !onboardingOpen}
        onClose={() => setSidePanelOpen(false)}
        conversationId={conversationId}
        colors={{
          background: colors.background,
          surface: colors.sheetBackground,
          text: colors.text,
          textSecondary: colors.textSecondary,
          border: colors.border,
          // Tint here is `colors.text` in dark themes (e.g. expertAI's light-lavender
          // text color) — white text on that light tint is what was unreadable.
          // Contrast against the tint's actual color, not assumed-dark accent.
          tint: colors.accent,
          onTint: colors.onTint,
        }}
        refreshKey={documentsRefreshKey}
        conversations={conversations}
        onOpenConversation={handleOpenConversationId}
        onNewChatInProject={handleNewChatInProject}
        onOpenArchiveFile={handleOpenArchiveFile}
      /> : null}

      {/* AI Disclaimer Modal (shown on first launch) */}
      <AIDisclaimerModal
        visible={showAiDisclaimer}
        onDismiss={() => {
          setShowAiDisclaimer(false);
          // Mark as seen so it doesn't show again
          try {
            useThemeStore.getState().setAiDisclaimerSeen?.(true);
          } catch (err) {
            console.warn('[AIDisclaimer] Failed to mark as seen:', err);
          }
        }}
        isDark={isDark}
      />

      {/* Biometric app lock overlay — opt-in, see lib/app-lock.ts. Covers the
          whole screen (never a partial/dismissable scrim) so nothing behind
          it is visible until authentication succeeds. */}
      {isLocked ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: colors.background,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              paddingHorizontal: 32,
            },
          ]}
        >
          <Ionicons name="lock-closed-outline" size={40} color={colors.text} />
          <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 17, color: colors.text }}>
            Expert AI is locked
          </Text>
          <Pressable
            onPress={attemptUnlock}
            style={({ pressed }) => [
              styles.sendButton,
              { paddingHorizontal: 28, backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.onTint }}>
              Unlock
            </Text>
          </Pressable>
        </View>
      ) : null}

      {Platform.OS !== 'web' ? (
        <Modal visible={assistantOpen} transparent animationType="fade" onRequestClose={() => setAssistantOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.sheetBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18, paddingBottom: insets.bottom + 16, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="sparkles" size={18} color={colors.onTint} />
                  </View>
                  <View>
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 16, color: colors.text }}>Ask Expert AI</Text>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: colors.textSecondary }}>Foreground only · no screen access</Text>
                  </View>
                </View>
                <Pressable onPress={() => setAssistantOpen(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
              </View>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={session ? 'Ask a one-shot question…' : 'Sign in to ask Expert AI…'}
                placeholderTextColor={colors.textTertiary}
                multiline
                autoFocus
                style={{ minHeight: 58, maxHeight: 130, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.buttonBackground, color: colors.text, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Fonts.sans, fontSize: 15 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <VoiceInputButton color={colors.textSecondary} disabled={!session || sending} onTranscript={setInput} onError={(message) => setError({ message })} />
                <Pressable
                  disabled={!session || !input.trim() || sending}
                  onPress={() => { handleSend(); setAssistantOpen(false); }}
                  style={{ minHeight: 42, borderRadius: 13, paddingHorizontal: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: !session || !input.trim() || sending ? 0.45 : 1 }}
                >
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: colors.onTint }}>Ask</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {onboardingOpen ? (
        <WebOnboarding
          targetRects={onboardingTargets}
          onSkip={() => setOnboardingOpen(false)}
          onCreateAccount={() => {
            setOnboardingOpen(false);
            if (session) {
              setAccountOpen(true);
            } else {
              setAccountMode('create');
              setSignInOpen(true);
            }
          }}
        />
      ) : null}
      </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bottomToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  dueDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9500',
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  accountPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  composerAction: {
    width: 34,
    height: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 18,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    // Caps and centers every bottom sheet on large/unfolded screens — on a
    // phone `width:'100%'` is already narrower than 480 so this is a no-op,
    // but on a foldable's ~673dp+ unfolded display an uncapped sheet used to
    // stretch edge-to-edge into an unnaturally wide dialog with over-long
    // text lines and controls spaced far apart.
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    flexShrink: 1,
    alignSelf: 'center',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
});
