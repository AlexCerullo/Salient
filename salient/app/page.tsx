"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, FileText, Play, ShieldCheck, XCircle } from "lucide-react";

type Alert = { id: string; title: string; kind: string; datePublished: string; hasRun: boolean };
type Run = any;

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selected, setSelected] = useState("opioids-pregnancy");
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [evalSummary, setEvalSummary] = useState<any>(null);
  const [caseId, setCaseId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/alerts");
    const json = await res.json();
    setAlerts(json.alerts);
    setEvalSummary(json.evalSummary);
    const existing = await fetch(`/api/runs/${selected}`);
    if (existing.ok) setRun(await existing.json());
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetch(`/api/runs/${selected}`).then(async (r) => { if (r.ok) setRun(await r.json()); else setRun(null); });
  }, [selected]);

  async function startRun() {
    setEvents([]);
    setRun(null);
    const res = await fetch("/api/run", { method: "POST", body: JSON.stringify({ alertId: selected }) });
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      for (const part of buffer.split("\n\n").slice(0, -1)) {
        const ev = part.match(/event: (.*)/)?.[1] || "message";
        const data = JSON.parse(part.match(/data: ([\s\S]*)/)?.[1] || "{}");
        setEvents((prev) => [`${ev}: ${ev === "done" ? "persisted run" : JSON.stringify(data).slice(0, 180)}`, ...prev].slice(0, 8));
        if (ev === "done") setRun(data);
      }
      buffer = buffer.includes("\n\n") ? buffer.split("\n\n").at(-1) || "" : buffer;
    }
  }

  const selectedCase = useMemo(() => run?.cases?.find((c: any) => c.caseId === caseId) || run?.cases?.[0], [run, caseId]);

  return (
    <main className="min-h-screen px-6 py-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-emerald-200"><ShieldCheck size={18}/> synthetic clinical safety agent</div>
          <h1 className="text-4xl font-semibold">Salient</h1>
        </div>
        <div className="panel px-3 py-2 text-sm text-slate-200">
          Eval on 270 synthetic encounters: {evalSummary ? `${evalSummary.overall.scanPrecision.toFixed(2)} precision / ${evalSummary.overall.scanRecall.toFixed(2)} recall` : "not run yet"}
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="panel p-3">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><Activity size={16}/> Watch</div>
            <div className="space-y-2">
              {alerts.map((a) => (
                <button key={a.id} onClick={() => setSelected(a.id)} className={`w-full rounded-md border px-3 py-3 text-left ${selected === a.id ? "border-emerald-300 bg-emerald-300/10" : "border-slate-700 bg-white/5"}`}>
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="mt-1 flex gap-2 text-xs text-slate-400"><span>{a.kind}</span><span>{a.datePublished}</span>{a.hasRun && <span>cached run</span>}</div>
                </button>
              ))}
            </div>
            <button onClick={startRun} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-3 py-2 font-semibold text-slate-950"><Play size={16}/> Run pipeline</button>
          </div>
          <div className="panel p-3">
            <div className="mb-2 text-sm text-slate-300">Live progress</div>
            <div className="space-y-2 text-xs text-slate-300">{events.map((e, i) => <div key={i} className="rounded border border-slate-700 bg-black/20 p-2">{e}</div>)}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {["total", "scanCandidates", "actionable"].map((k) => (
              <div key={k} className="panel p-4">
                <div className="text-xs uppercase text-slate-400">{k === "total" ? "25-patient panel" : k}</div>
                <div className="mt-2 text-3xl font-semibold">{run?.funnel?.[k] ?? "-"}</div>
              </div>
            ))}
          </div>

          {run && <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><FileText size={16}/> Case Queue</div>
              <div className="space-y-3">
                {run.cases.map((c: any) => (
                  <button key={c.caseId} onClick={() => setCaseId(c.caseId)} className="w-full rounded-md border border-slate-700 bg-white/5 p-3 text-left">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{c.patient.name}</span><span className="chip text-xs">{c.priority}</span></div>
                    <div className="mt-1 text-sm text-slate-300">{c.rationale}</div>
                    <div className="mt-2 flex gap-2 text-xs">{c.actionable ? <span className="text-emerald-300"><CheckCircle2 className="inline" size={14}/> actionable</span> : <span className="text-rose-300"><XCircle className="inline" size={14}/> not actionable</span>}<span>route: {c.routeTo}</span></div>
                  </button>
                ))}
                {!run.cases.length && <div className="text-sm text-slate-400">No adjudicated cases.</div>}
              </div>
            </div>

            {selectedCase && <CasePanel c={selectedCase}/>}
          </div>}

          {run && <div className="panel p-4">
            <div className="mb-3 text-sm text-slate-300">Funnel and Exclusions</div>
            <div className="max-h-[420px] overflow-auto text-sm">
              {[...run.scan.candidates.map((c: any) => ({ ...c, hit: true })), ...run.scan.exclusions].sort((a: any, b: any) => a.sourceIndex - b.sourceIndex).map((p: any) => (
                <div key={`${p.sourceIndex}-${p.patientId}`} className="grid grid-cols-[44px_170px_1fr] gap-2 border-t border-slate-800 py-2">
                  <span className="text-slate-500">#{p.sourceIndex}</span><span>{p.name}</span><span className={p.hit ? "text-emerald-300" : "text-slate-400"}>{p.hit ? p.reasons.join("; ") : (p.nearMiss || p.reasons.join("; "))}</span>
                </div>
              ))}
            </div>
          </div>}

          {run && <div className="panel p-4">
            <div className="mb-2 text-sm text-slate-300">CSC JSON</div>
            <pre className="max-h-80 overflow-auto rounded bg-black/30 p-3 text-xs text-emerald-50">{JSON.stringify(run.csc, null, 2)}</pre>
          </div>}
        </div>
      </section>
    </main>
  );
}

function CasePanel({ c }: { c: any }) {
  async function decide(decision: string) {
    await fetch(`/api/cases/${c.caseId}/decision`, { method: "POST", body: JSON.stringify({ decision, caseSnapshot: c }) });
    alert(`Audit entry recorded: ${decision}`);
  }
  return <div className="panel p-4">
    <div className="text-xs uppercase text-slate-400">Case View</div>
    <h2 className="mt-1 text-xl font-semibold">{c.patient.name}</h2>
    <div className="mt-1 text-sm text-slate-300">{c.patient.ageYears} years, {c.patient.sex}. {c.patient.visitTitle}</div>
    <div className="mt-4 space-y-2">
      {c.claims.map((claim: any, i: number) => <div key={i} className="rounded-md border border-slate-700 bg-black/20 p-3">
        <div className="text-sm">{claim.text}</div>
        <div className="mt-2 text-xs text-emerald-300">citation verified: {claim.citation.type === "fhir" ? `${claim.citation.resourceType}/${claim.citation.resourceId}` : `"${claim.citation.quote}"`}</div>
      </div>)}
    </div>
    {c.transcriptEscalation && <div className="mt-3 rounded-md border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">Transcript escalation: "{c.transcriptEscalation}"</div>}
    <div className="mt-4 rounded-md bg-black/30 p-3 text-sm">{c.draftedAction}</div>
    <div className="mt-4 flex gap-2">
      <button onClick={() => decide("approve")} className="rounded-md bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950">Approve</button>
      <button onClick={() => decide("dismiss")} className="rounded-md border border-slate-600 px-3 py-2 text-sm">Dismiss</button>
    </div>
  </div>;
}
