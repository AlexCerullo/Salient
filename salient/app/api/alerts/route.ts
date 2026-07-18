import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { listAlerts } from "@/lib/alerts";
import { config } from "@/lib/config";

export async function GET() {
  const alerts = listAlerts().map((a) => ({
    id: a.id,
    title: a.title,
    kind: a.kind,
    datePublished: a.datePublished,
    url: a.url,
    hasRun: fs.existsSync(path.join(config.runsDir, `${a.id}.json`))
  }));
  let evalSummary = null;
  const evalFile = path.join(config.evalDir, "latest.json");
  if (fs.existsSync(evalFile)) evalSummary = JSON.parse(fs.readFileSync(evalFile, "utf8"));
  return NextResponse.json({ alerts, evalSummary });
}
