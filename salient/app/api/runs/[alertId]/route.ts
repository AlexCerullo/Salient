import { NextRequest, NextResponse } from "next/server";
import { readRun } from "@/lib/pipeline";
import { config } from "@/lib/config";
import fs from "node:fs";
import path from "node:path";

export async function GET(_req: NextRequest, context: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await context.params;
  const run = readRun(alertId);
  return run ? NextResponse.json(run) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await context.params;
  const file = path.join(config.runsDir, `${path.basename(alertId)}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return NextResponse.json({ ok: true });
}
