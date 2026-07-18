import { NextRequest, NextResponse } from "next/server";
import { getAlert } from "@/lib/alerts";
import { comprehendAlert } from "@/lib/alerts";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const alert = body.alertId ? getAlert(body.alertId) : {
    id: `live-${Date.now()}`,
    title: body.title || "Pasted alert",
    url: "pasted://local",
    datePublished: new Date().toISOString().slice(0, 10),
    kind: "safety_communication" as const,
    excerpt: body.rawText || "",
    csc: getAlert("hctz-skin-cancer").csc
  };
  const result = await comprehendAlert(alert);
  return NextResponse.json(result);
}
