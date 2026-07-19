import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export async function POST(req: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const body = await req.json();
  const entry = {
    timestamp: new Date().toISOString(),
    caseId,
    alertId: body.alertId || body.caseSnapshot?.alertId || "",
    patientName: body.patientName || body.caseSnapshot?.patient?.name || "",
    decision: body.decision,
    actor: body.actor || "clinician (demo)",
    note: body.note || "",
    caseSnapshotHash: crypto.createHash("sha256").update(JSON.stringify(body.caseSnapshot || {})).digest("hex")
  };
  const file = path.resolve(process.cwd(), "data/audit-log.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return NextResponse.json(entry);
}
