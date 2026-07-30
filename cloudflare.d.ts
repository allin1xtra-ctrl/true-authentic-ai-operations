declare module "cloudflare:workers" {
  export const env: {
    DB?: import("./db/store").D1Like;
  };
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {
  prepare(sql: string): unknown;
}
