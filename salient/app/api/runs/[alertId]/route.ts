import { NextRequest, NextResponse } from "next/server";
import { readRun } from "@/lib/pipeline";

export async function GET(_req: NextRequest, context: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await context.params;
  const run = readRun(alertId);
  return run ? NextResponse.json(run) : NextResponse.json({ error: "not found" }, { status: 404 });
}
