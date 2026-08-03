import { neon } from "@neondatabase/serverless";
export function postgres() { const url=String(process.env.DATABASE_URL||"").trim(); if(!url) throw new Error("STANDALONE_DATABASE_NOT_CONFIGURED"); return neon(url); }
