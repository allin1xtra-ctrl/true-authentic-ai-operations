type RedisStatus = "ready" | "connection_required" | "error";

type RedisProbe = {
  status: RedisStatus;
  checkedAt: string;
  configured: boolean;
};

async function command(url: string, token: string, args: string[], signal: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
    signal,
  });
  const body = await response.json().catch(() => null) as { result?: unknown; error?: string } | null;
  if (!response.ok || !body || body.error) throw new Error("REDIS_COMMAND_FAILED");
  return body.result;
}

export async function verifyRedis(): Promise<RedisProbe> {
  const checkedAt = new Date().toISOString();
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return { status: "connection_required", checkedAt, configured: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  const key = `health:ai-operations:${crypto.randomUUID()}`;
  const value = crypto.randomUUID();
  try {
    await command(url, token, ["SET", key, value, "EX", "60"], controller.signal);
    const stored = await command(url, token, ["GET", key], controller.signal);
    if (stored !== value) throw new Error("REDIS_PROBE_MISMATCH");
    await command(url, token, ["DEL", key], controller.signal);
    const deleted = await command(url, token, ["GET", key], controller.signal);
    if (deleted !== null) throw new Error("REDIS_PROBE_DELETE_FAILED");
    return { status: "ready", checkedAt, configured: true };
  } catch {
    return { status: "error", checkedAt, configured: true };
  } finally {
    clearTimeout(timeout);
    const cleanupController = new AbortController();
    const cleanupTimeout = setTimeout(() => cleanupController.abort(), 2_000);
    await command(url, token, ["DEL", key], cleanupController.signal).catch(() => undefined);
    clearTimeout(cleanupTimeout);
  }
}
