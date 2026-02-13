import { NextResponse } from "next/server";
import path from "path";
import { existsSync } from "fs";

export async function GET() {
  const candidates = [
    path.resolve(process.cwd(), "../../db/observatory.sqlite"),
    path.resolve(process.cwd(), "db/observatory.sqlite"),
    path.resolve(process.cwd(), "../db/observatory.sqlite"),
    path.resolve(__dirname, "../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../db/observatory.sqlite"),
    path.resolve(__dirname, "../../../../db/observatory.sqlite"),
  ];

  const found = candidates.map(p => ({ path: p, exists: existsSync(p) }));

  return NextResponse.json({
    ok: true,
    service: "vendor-observatory",
    cwd: process.cwd(),
    dirname: __dirname,
    dbCandidates: found,
  });
}
