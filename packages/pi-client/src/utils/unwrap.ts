type ApiEnvelope<T> = {
  success?: boolean;
  data?: T | null;
  error?: string | null;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return typeof value === "object" && value !== null && "data" in value;
}

export function unwrapApiData<T>(
  value: T | ApiEnvelope<T> | null | undefined,
): T | undefined {
  if (isApiEnvelope<T>(value)) {
    return value.data ?? undefined;
  }
  return value ?? undefined;
}

export function extractApiErrorMessage(
  value: unknown,
  fallback: string,
): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    isApiEnvelope<unknown>(value) &&
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error.trim();
  }

  if (isObjectRecord(value)) {
    if (typeof value.error === "string" && value.error.trim()) {
      return value.error.trim();
    }
    if (typeof value.message === "string" && value.message.trim()) {
      return value.message.trim();
    }
  }

  return fallback;
}
