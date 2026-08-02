/* eslint-disable @typescript-eslint/no-explicit-any */
export const AI_MODEL = "gpt-5.4";
const REQUEST_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

function extractResponseText(data: any): string {
  const direct = typeof data?.output_text === "string" ? data.output_text.trim() : "";
  if (direct) return direct;
  return (Array.isArray(data?.output) ? data.output : []).flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((part: any) => typeof part?.text === "string" ? part.text.trim() : "").filter(Boolean).join("\n").trim();
}

export async function generateAI(system: string, prompt: string) {
  const gatewayCredential = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (gatewayCredential) {
    const result = await fetchWithTimeout("https://ai-gateway.vercel.sh/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${gatewayCredential}` }, body: JSON.stringify({ model: `openai/${AI_MODEL}`, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }) });
    if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
    const data = await result.json() as any;
    const text = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return text;
  }
  if (process.env.OPENAI_API_KEY) {
    const result = await fetchWithTimeout("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: AI_MODEL, instructions: system, input: prompt, store: false }) });
    if (!result.ok) throw new Error("AI_PROVIDER_REJECTED");
    const text = extractResponseText(await result.json());
    if (!text) throw new Error("AI_EMPTY_RESPONSE");
    return text;
  }
  throw new Error("AI_CONNECTION_REQUIRED");
}
