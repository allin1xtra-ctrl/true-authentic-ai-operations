import { del, put } from "@vercel/blob";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../../db/store";

const contexts = new Set(["conversation", "task", "memory"]);
const api = "https://api.openai.com/v1";
const maxRequestBytes = 16_384;
const maxPromptLength = 2_000;

function decodeBase64(value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function saveGenerated(contextType: string, contextId: string, bytes: Uint8Array, mimeType: string, name: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) throw new Error("MEDIA_UNAVAILABLE");
  const attachmentId = id("media"); const objectKey = `private/generated/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${mimeType === "video/mp4" ? "mp4" : "png"}`;
  const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  await put(objectKey, payload, { access: "private", contentType: mimeType, addRandomSuffix: false });
  const db = getStore();
  try { await db.prepare("INSERT INTO media_attachments (id,context_type,context_id,object_key,file_name,mime_type,size_bytes,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(attachmentId, contextType, contextId, objectKey, name, mimeType, bytes.byteLength, "generated", new Date().toISOString()).run(); }
  catch (error) { await del(objectKey); throw error; }
  return attachmentId;
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ success: false, error: "OpenAI media generation is not configured" }, { status: 503 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return Response.json({ success: false, error: "Media storage is not connected" }, { status: 503 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxRequestBytes) return Response.json({ success: false, error: "This request is too large. Shorten the prompt and try again." }, { status: 413 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ success: false, error: "The media request was not valid JSON" }, { status: 400 });
  const action = String(body.action || "create"); const db = getStore(); await ensureSchema(db);
  if (action === "refresh") {
    const generationId = String(body.id || "");
    const job = await db.prepare("SELECT * FROM media_generations WHERE id=? AND kind='video'").bind(generationId).first() as Record<string, unknown> | null;
    if (!job?.provider_id) return Response.json({ success: false, error: "Video job not found" }, { status: 404 });
    const statusResponse = await fetch(`${api}/videos/${encodeURIComponent(String(job.provider_id))}`, { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    if (!statusResponse.ok) return Response.json({ success: false, error: "Video status is temporarily unavailable" }, { status: 502 });
    const provider = await statusResponse.json() as { status?: string; progress?: number };
    if (provider.status === "completed" && !job.attachment_id) {
      const content = await fetch(`${api}/videos/${encodeURIComponent(String(job.provider_id))}/content`, { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
      if (!content.ok) return Response.json({ success: false, error: "Completed video could not be downloaded" }, { status: 502 });
      const bytes = new Uint8Array(await content.arrayBuffer()); const attachmentId = await saveGenerated(String(job.context_type), String(job.context_id), bytes, "video/mp4", `ai-video-${generationId}.mp4`);
      await db.prepare("UPDATE media_generations SET status='completed',progress=100,attachment_id=?,updated_at=? WHERE id=?").bind(attachmentId, new Date().toISOString(), generationId).run();
      await fetch(`${api}/videos/${encodeURIComponent(String(job.provider_id))}`, { method: "DELETE", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }).catch(() => undefined);
      return Response.json({ success: true, status: "completed", progress: 100, attachmentId });
    }
    const safeStatus = ["queued", "in_progress", "completed", "failed"].includes(String(provider.status)) ? String(provider.status) : "in_progress";
    await db.prepare("UPDATE media_generations SET status=?,progress=?,updated_at=? WHERE id=?").bind(safeStatus, Math.max(0, Math.min(100, Number(provider.progress || 0))), new Date().toISOString(), generationId).run();
    return Response.json({ success: true, status: safeStatus, progress: provider.progress || 0 });
  }

  const contextType = String(body.contextType || ""); const contextId = String(body.contextId || "").trim().slice(0, 180); const kind = String(body.kind || "image"); const prompt = String(body.prompt || "").trim().replace(/\s+/g, " ");
  if (!contexts.has(contextType) || !contextId) return Response.json({ success: false, error: "Invalid attachment destination" }, { status: 400 });
  if (!prompt) return Response.json({ success: false, error: "Describe the media to create" }, { status: 400 });
  if (prompt.length > maxPromptLength) return Response.json({ success: false, error: `Keep the prompt under ${maxPromptLength.toLocaleString()} characters.` }, { status: 413 });
  if (!new Set(["image", "video"]).has(kind)) return Response.json({ success: false, error: "Choose image or video" }, { status: 400 });
  const generationId = id("generation"); const now = new Date().toISOString();
  if (kind === "image") {
    const response = await fetch(`${api}/images/generations`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1024", quality: "medium", output_format: "png" }) });
    if (!response.ok) return Response.json({ success: false, error: "OpenAI could not generate that image" }, { status: 502 });
    const result = await response.json() as { data?: Array<{ b64_json?: string }> }; const encoded = result.data?.[0]?.b64_json;
    if (!encoded) return Response.json({ success: false, error: "OpenAI returned no image" }, { status: 502 });
    const attachmentId = await saveGenerated(contextType, contextId, decodeBase64(encoded), "image/png", `ai-image-${generationId}.png`);
    await db.prepare("INSERT INTO media_generations (id,context_type,context_id,kind,prompt,status,progress,attachment_id,created_at,updated_at) VALUES (?,?,?,?,?,'completed',100,?,?,?)").bind(generationId, contextType, contextId, kind, prompt, attachmentId, now, now).run();
    return Response.json({ success: true, status: "completed", attachmentId }, { status: 201 });
  }
  const form = new FormData(); form.append("model", "sora-2"); form.append("prompt", prompt); form.append("size", "1280x720"); form.append("seconds", "4");
  const response = await fetch(`${api}/videos`, { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!response.ok) return Response.json({ success: false, error: "OpenAI could not start that video" }, { status: 502 });
  const provider = await response.json() as { id?: string; status?: string; progress?: number };
  if (!provider.id) return Response.json({ success: false, error: "OpenAI returned no video job" }, { status: 502 });
  await db.prepare("INSERT INTO media_generations (id,context_type,context_id,kind,prompt,provider_id,status,progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(generationId, contextType, contextId, kind, prompt, provider.id, provider.status || "queued", provider.progress || 0, now, now).run();
  return Response.json({ success: true, id: generationId, status: provider.status || "queued", progress: provider.progress || 0 }, { status: 202 });
}
