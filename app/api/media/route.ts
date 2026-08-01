import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureSchema, getStore, id } from "../../../db/store";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);
const allowedContexts = new Set(["conversation", "task", "memory"]);
const maxBytes = 50 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "media";
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!env.MEDIA) return Response.json({ success: false, error: "Media storage is not connected" }, { status: 503 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const contextType = String(form.get("contextType") || "");
    const contextId = String(form.get("contextId") || "").trim().slice(0, 180);
    const source = form.get("source") === "generated" ? "generated" : "uploaded";
    if (!(file instanceof File)) return Response.json({ success: false, error: "Choose an image or video" }, { status: 400 });
    if (!allowedContexts.has(contextType) || !contextId) return Response.json({ success: false, error: "Invalid attachment destination" }, { status: 400 });
    if (!allowedTypes.has(file.type)) return Response.json({ success: false, error: "Use JPG, PNG, WebP, GIF, MP4, WebM, or MOV" }, { status: 415 });
    if (!file.size || file.size > maxBytes) return Response.json({ success: false, error: "Files must be smaller than 50 MB" }, { status: 413 });
    const attachmentId = id("media");
    const extension = safeName(file.name).split(".").pop()?.toLowerCase().slice(0, 8) || "bin";
    const objectKey = `private/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    const db = getStore(); await ensureSchema(db);
    try {
      await db.prepare("INSERT INTO media_attachments (id,context_type,context_id,object_key,file_name,mime_type,size_bytes,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(attachmentId, contextType, contextId, objectKey, safeName(file.name), file.type, file.size, source, new Date().toISOString()).run();
    } catch (error) {
      await env.MEDIA.delete(objectKey);
      throw error;
    }
    return Response.json({ success: true, attachment: { id: attachmentId, context_type: contextType, context_id: contextId, file_name: safeName(file.name), mime_type: file.type, size_bytes: file.size, source, created_at: new Date().toISOString() } }, { status: 201 });
  } catch {
    return Response.json({ success: false, error: "The media could not be stored" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!env.MEDIA) return Response.json({ success: false, error: "Media storage is not connected" }, { status: 503 });
  const mediaId = new URL(request.url).searchParams.get("id");
  if (!mediaId) return Response.json({ success: false, error: "Media ID is required" }, { status: 400 });
  const db = getStore(); await ensureSchema(db);
  const row = await db.prepare("SELECT object_key, file_name, mime_type FROM media_attachments WHERE id=?").bind(mediaId).first() as { object_key: string; file_name: string; mime_type: string } | null;
  if (!row) return Response.json({ success: false, error: "Media not found" }, { status: 404 });
  const object = await env.MEDIA.get(row.object_key);
  if (!object) return Response.json({ success: false, error: "Media file is unavailable" }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": row.mime_type, "content-disposition": `inline; filename="${safeName(row.file_name)}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
