export function agentErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/failed to fetch|network request failed|link\.(?:ssv|csv)\.asia/i.test(message)) {
    return 'Could not reach your computer. Check that Expert AI Agent is running, then try again.';
  }
  return message;
}
