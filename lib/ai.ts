/* eslint-disable @typescript-eslint/no-explicit-any */

export type AIProvider = "claude" | "openai";
export type AITransport = "vercel_ai_gateway" | "anthropic_api" | "openai_api" | "none";

const OPENAI_MODEL = "gpt-5.6";
const OPENAI_GATEWAY_MODEL = "openai/gpt-5.6-sol";
const CLAUDE_MODEL = "claude-sonnet-5";
const CLAUDE_GATEWAY_MODEL = "anthropic/claude-sonnet-5";
const REQUEST_TIMEOUT_MS = 45_000;

function selectedProvider(): AIProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "openai" ? "openai" : "claude";
}

export function getAIProviderConfig() {
  const provider = selectedProvider();
  const gatewayCredential = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (provider === "claude") {
    const directCredential = process.env.ANTHROPIC_API_KEY;
    const transport: AITransport = directCredential ? "anthropic_api" : gatewayCredential ? "vercel_ai_gateway" : "none";
    return {
      provider,
      model: directCredential ? (process.env.CLAUDE_MODEL?.trim() || CLAUDE_MODEL) : (process.env.CLAUDE_GATEWAY_MODEL?.trim() || CLAUDE_GATEWAY_MODEL),
      transport,
      credential: directCredential || gatewayCredential || null,
      configured: Boolean(directCredential || gatewayCredential),
    };
  }

  const directCredential = process.env.OPENAI_API_KEY;
  const transport: AITransport = gatewayCredential ? "vercel_ai_gateway" : directCredential ? "openai_api" : "none";
  return {
    provider,
    model: gatewayCredential ? (process.env.OPENAI_GATEWAY_MODEL?.trim() || OPENAI_GATEWAY_MODEL) : (process.env.OPENAI_MODEL?.trim() || OPENAI_MODEL),
    transport,
    credential: gatewayCredential || directCredential || null,
    configured: Boolean(gatewayCredential || directCredential),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

function extractOpenAIText(data: any): string {
  const direct = typeof data?.output_text === "string" ? data.output_text.trim() : "";
  if (direct) return direct;
  return (Array.isArray(data?.output) ? data.output : []).flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((part: any) => typeof part?.text === "string" ? part.text.trim() : "").filter(Boolean).join("\n").trim();
}

function extractClaudeText(data: any): string {
  return (Array.isArray(data?.content) ? data.content : [])
    .filter((part: any) => part?.type === "text" && typeof part?.text === "string")
    .map((part: any) => part.text.trim()).filter(Boolean).join("\n").trim();
}

export async function verifyAIProvider() {
  const config = getAIProviderConfig();
  const checkedAt = new Date().toISOString();
  if (!config.configured || !config.credential) return { status: "connection_required" as const, provider: config.provider, model: config.model, transport: config.transport, checkedAt };

  try {
    const anthropicDirect = config.transport === "anthropic_api";
    const endpoint = anthropicDirect ? "https://api.anthropic.com/v1/models" : config.transport === "openai_api" ? "https://api.openai.com/v1/models" : "https://ai-gateway.vercel.sh/v1/models";
    const headers: Record<string, string> = anthropicDirect
      ? { "x-api-key": config.credential, "anthropic-version": "2023-06-01" }
      : { authorization: `Bearer ${config.credential}` };
    const response = await fetchWithTimeout(endpoint, { headers, cache: "no-store" }, 7_000);
    return { status: response.ok ? "ready" as const : "error" as const, provider: config.provider, model: config.model, transport: config.transport, checkedAt };
  } catch {
    return { status: "error" as const, provider: config.provider, model: config.model, transport: config.transport, checkedAt };
  }
}

export async function generateAI(system: string, prompt: string) {
  const config = getAIProviderConfig();
  if (!config.configured || !config.credential) throw new Error("AI_CONNECTION_REQUIRED");

  if (config.transport === "vercel_ai_gateway") {
    const result = await fetchWithTimeout("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.credential}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
    const data = await result.json() as any;
    const text = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return text;
  }

  if (config.transport === "anthropic_api") {
    const result = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.credential, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, max_tokens: 2_048, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
    const text = extractClaudeText(await result.json());
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return text;
  }

  const result = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.credential}` },
    body: JSON.stringify({ model: config.model, instructions: system, input: prompt, store: false }),
  });
  if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
  const text = extractOpenAIText(await result.json());
  if (!text) throw new Error("AI_EMPTY_RESPONSE");
  return text;
}
