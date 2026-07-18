import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const file = path.resolve(process.cwd(), "data/audit-log.jsonl");
  if (!fs.existsSync(file)) return NextResponse.json({ entries: [] });
  const entries = fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return NextResponse.json({ entries: entries.slice(-200) });
}
