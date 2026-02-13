import { NextResponse } from "next/server";
import path from "path";
import { existsSync, statSync } from "fs";
import Database from "better-sqlite3";

export async function GET() {
  const dbPath = path.resolve(process.cwd(), "../../db/observatory.sqlite");
  const exists = existsSync(dbPath);
  let size = 0;
  let dbError: string | null = null;
  let tableCount = 0;
  let sessionCount = 0;

  if (exists) {
    try { size = statSync(dbPath).size; } catch { /* ignore */ }
    try {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const tables = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'").get() as { c: number };
      tableCount = tables.c;
      const sessions = db.prepare("SELECT COUNT(*) AS c FROM sessions").get() as { c: number };
      sessionCount = sessions.c;
      db.close();
    } catch (err) {
      dbError = String(err);
    }
  }

  return NextResponse.json({
    ok: true,
    service: "vendor-observatory",
    db: { path: dbPath, exists, size, tableCount, sessionCount, error: dbError },
  });
}
