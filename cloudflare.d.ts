declare module "cloudflare:workers" {
  export const env: {
    DB?: import("./db/store").D1Like;
    MEDIA?: {
      put(key: string, value: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
      get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
      delete(key: string): Promise<void>;
    };
    AUTOMATION_CRON_SECRET?: string;
  };
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {
  prepare(sql: string): unknown;
}
