"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ClipboardList,
  Eye, FileText, FlaskConical, Play, Radar, ShieldCheck, Sparkles, XCircle
} from "lucide-react";

type AlertCard = { id: string; title: string; kind: string; datePublished: string; url: string; excerpt: string; live: boolean; hasRun: boolean };
type Run = any;
type Stage = { key: string; label: string; status: "idle" | "running" | "done"; detail?: string; ms?: number };

const STAGE_DEFS: { key: string; label: string }[] = [
  { key: "comprehend", label: "Comprehend" },
  { key: "scan", label: "Scan" },
  { key: "adjudicate", label: "Adjudicate" },
  { key: "verify", label: "Verify" }
];

function freshStages(): Stage[] {
  return STAGE_DEFS.map((s) => ({ ...s, status: "idle" }));
}

function fmtMs(ms?: number) {
  if (ms === undefined) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function kindLabel(kind: string) {
  return kind.replace(/_/g, " ");
}

export default function Dashboard() {
  const [alerts, setAlerts] = useState<AlertCard[]>([]);
  const [selected, setSelected] = useState("opioids-pregnancy");
  const [run, setRun] = useState<Run | null>(null);
  const [stages, setStages] = useState<Stage[]>(freshStages());
  const [running, setRunning] = useState(false);
  const [liveCases, setLiveCases] = useState<any[]>([]);
  const [adjudicatingName, setAdjudicatingName] = useState<string | null>(null);
  const [evalSummary, setEvalSummary] = useState<any>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, any>>({});
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    const json = await res.json();
    setAlerts(json.alerts);
    setEvalSummary(json.evalSummary);
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/audit");
    if (!res.ok) return;
    const json = await res.json();
    const map: Record<string, any> = {};
    for (const e of json.entries) map[e.caseId] = e; // latest decision wins
    setDecisions(map);
  }, []);

  useEffect(() => {
    loadAlerts();
    loadAudit();
  }, [loadAlerts, loadAudit]);

  useEffect(() => {
    if (runningRef.current) return;
    setRun(null);
    setStages(freshStages());
    setLiveCases([]);
    setCaseId(null);
    fetch(`/api/runs/${selected}`).then(async (r) => {
      if (r.ok) {
        const existing = await r.json();
        setRun(existing);
        setStages(STAGE_DEFS.map((s) => ({ ...s, status: "done", ms: existing.timings?.[s.key === "verify" ? "adjudicate" : s.key] })));
      }
    });
  }, [selected]);

  const markStage = (key: string, status: Stage["status"], detail?: string, ms?: number) =>
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, status, detail: detail ?? s.detail, ms: ms ?? s.ms } : s)));

  async function consumeStream(res: Response, opts?: { onIngested?: (alertId: string) => void }) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("no stream");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const ev = part.match(/^event: (.*)$/m)?.[1] || "message";
        const raw = part.match(/^data: ([\s\S]*)$/m)?.[1];
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (ev === "ingested") opts?.onIngested?.(data.alertId);
        if (ev === "watch") markStage("comprehend", "running", "reading alert...");
        if (ev === "comprehend") {
          markStage("comprehend", "done", `CSC: ${data.csc?.drugs?.names?.length ?? 0} drug terms`, data.ms);
          markStage("scan", "running", "scanning panel...");
        }
        if (ev === "scan") {
          markStage("scan", "done", `${data.candidates} candidate${data.candidates === 1 ? "" : "s"} of ${data.total}`, data.ms);
          markStage("adjudicate", "running");
          setRun((prev: Run) => ({ ...(prev || {}), funnel: { total: data.total, scanCandidates: data.candidates, actionable: undefined, monitored: undefined }, scan: { counts: data.counts, exclusions: data.exclusions, candidates: [] }, cases: [] }));
        }
        if (ev === "adjudicating") setAdjudicatingName(data.name);
        if (ev === "adjudicate") {
          setLiveCases((prev) => [...prev, data.case]);
          markStage("adjudicate", "running", `${data.case.patient.name}: ${data.case.verdict}`);
        }
        if (ev === "verify") {
          setAdjudicatingName(null);
          markStage("adjudicate", "done", undefined, data.ms);
          markStage("verify", "done", `${data.verified}/${data.claims} claims verified`);
        }
        if (ev === "done") {
          setRun(data);
          setLiveCases([]);
        }
        if (ev === "error") setError(data.message);
      }
    }
  }

  async function startRun() {
    setError(null);
    setRun(null);
    setLiveCases([]);
    setCaseId(null);
    setStages(freshStages());
    setRunning(true);
    runningRef.current = true;
    try {
      const res = await fetch("/api/run", { method: "POST", body: JSON.stringify({ alertId: selected }) });
      await consumeStream(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
      runningRef.current = false;
      loadAlerts();
    }
  }

  async function ingest() {
    if (!ingestText.trim()) return;
    setError(null);
    setIngestOpen(false);
    setRun(null);
    setLiveCases([]);
    setCaseId(null);
    setStages(freshStages());
    setRunning(true);
    runningRef.current = true;
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: JSON.stringify({ rawText: ingestText }) });
      await consumeStream(res, { onIngested: (alertId) => setSelected(alertId) });
      setIngestText("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
      runningRef.current = false;
      loadAlerts();
    }
  }

  async function decide(c: any, decision: "approve" | "dismiss") {
    const res = await fetch(`/api/cases/${c.caseId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, caseSnapshot: c, alertId: c.alertId, patientName: c.patient.name })
    });
    const entry = await res.json();
    setDecisions((prev) => ({ ...prev, [c.caseId]: entry }));
  }

  const cases: any[] = run?.cases?.length ? run.cases : liveCases;
  const actionableCases = cases.filter((c) => c.verdict === "actionable" || c.actionable);
  const monitorCases = cases.filter((c) => c.verdict === "monitor");
  const dismissedCases = cases.filter((c) => c.verdict === "dismiss");
  const selectedCase = useMemo(() => cases.find((c: any) => c.caseId === caseId) || actionableCases[0] || cases[0], [cases, caseId, actionableCases]);
  const selectedAlert = alerts.find((a) => a.id === selected);

  const byPrescriber = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    for (const c of [...actionableCases].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3))) {
      groups[c.routeTo] ||= [];
      groups[c.routeTo].push(c);
    }
    return groups;
  }, [actionableCases]);

  return (
    <main className="min-h-screen px-6 py-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--mint)" }}>
            <ShieldCheck size={18} /> drug-safety surveillance agent · synthetic panel
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">Salient</h1>
          <div className="mt-1 text-sm text-slate-400">The FDA knows the drug is dangerous. It doesn&apos;t know your patients.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {evalSummary && (
            <div className="panel flex items-center gap-2 px-3 py-2 text-sm">
              <FlaskConical size={15} className="text-emerald-300" />
              <span>
                Eval: P={evalSummary.overall.scanPrecision.toFixed(2)} R={evalSummary.overall.scanRecall.toFixed(2)} ·{" "}
                {(evalSummary.overall.citationVerificationPassRate * 100).toFixed(0)}% citations verified · 270-record synthetic set
              </span>
            </div>
          )}
          <div className="panel px-3 py-2 text-sm text-slate-300">25 patients · Abridge synthetic-ambient-fhir-25</div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle size={14} className="mr-2 inline" /> {error}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[370px_1fr]">
        {/* ------- left rail: alert inbox ------- */}
        <div className="space-y-4">
          <div className="panel p-3">
            <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
              <span className="flex items-center gap-2"><Radar size={16} /> Alert inbox</span>
              <button onClick={() => setIngestOpen((v) => !v)} className="flex items-center gap-1 rounded-md border border-emerald-500/50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                <Sparkles size={13} /> Ingest alert
              </button>
            </div>
            {ingestOpen && (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-2">
                <textarea
                  value={ingestText}
                  onChange={(e) => setIngestText(e.target.value)}
                  placeholder="Paste FDA safety communication text here..."
                  className="h-32 w-full resize-none rounded border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-emerald-400"
                />
                <button onClick={ingest} disabled={running || !ingestText.trim()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40">
                  <Play size={14} /> Parse &amp; scan panel
                </button>
              </div>
            )}
            <div className="space-y-2">
              {alerts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => !running && setSelected(a.id)}
                  className={`w-full rounded-md border px-3 py-3 text-left transition ${selected === a.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-400"}`}
                >
                  <div className="text-sm font-semibold leading-snug">{a.title}</div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="chip">{a.live ? "live ingest" : "FDA"} · {kindLabel(a.kind)}</span>
                    <span>{a.datePublished}</span>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={startRun} disabled={running} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40">
              <Play size={16} /> {running ? "Running..." : "Run panel scan"}
            </button>
          </div>

          {selectedAlert && (
            <div className="panel p-3 text-xs leading-relaxed text-slate-400">
              <div className="mb-1 flex items-center gap-2 text-slate-300"><FileText size={14} /> Source</div>
              <p className="line-clamp-6">{selectedAlert.excerpt}</p>
              <div className="mt-2 break-all text-emerald-200/70">{selectedAlert.url}</div>
            </div>
          )}

          {run?.csc && (
            <details className="panel p-3">
              <summary className="cursor-pointer text-sm text-slate-300">
                <span className="inline-flex items-center gap-2"><Eye size={14} /> What the agent understood (CSC)</span>
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-100">{JSON.stringify(run.csc, null, 2)}</pre>
            </details>
          )}
        </div>

        {/* ------- main column ------- */}
        <div className="space-y-4">
          {/* stage ticker */}
          <div className="panel flex flex-wrap items-center gap-2 p-3">
            {stages.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <ArrowRight size={14} className="text-slate-600" />}
                <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  s.status === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : s.status === "running" ? "animate-pulse border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-400"}`}>
                  {s.status === "done" ? <CheckCircle2 size={14} /> : <Activity size={14} />}
                  {s.label}
                  {s.ms !== undefined && s.status === "done" && <span className="text-xs opacity-70">{fmtMs(s.ms)}</span>}
                </div>
              </div>
            ))}
            <div className="ml-auto text-xs text-slate-400">
              {adjudicatingName ? `adjudicating ${adjudicatingName}...` : stages.find((s) => s.status === "running")?.detail || (run?.timings?.total ? `pipeline ${fmtMs(run.timings.total)}` : "")}
            </div>
          </div>

          {/* funnel */}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: "panel", value: run?.funnel?.total ?? 25, sub: "patients under surveillance" },
              { label: "candidates", value: run?.funnel?.scanCandidates, sub: "deterministic scan matches" },
              { label: "actionable", value: run?.funnel?.actionable, sub: run?.funnel?.monitored ? `+ ${run.funnel.monitored} monitored, no alert` : "routed for review" }
            ].map((k, i) => (
              <div key={k.label} className="panel relative overflow-hidden p-4">
                <div className="text-xs uppercase tracking-wider text-slate-400">{k.label}</div>
                <div className="mt-1 text-5xl font-semibold tabular-nums" style={{ color: i === 2 && k.value ? "var(--mint)" : undefined }}>
                  {k.value ?? "–"}
                </div>
                <div className="mt-1 text-xs text-slate-400">{k.sub}</div>
                {i < 2 && <ArrowRight size={18} className="absolute right-3 top-1/2 hidden -translate-y-1/2 text-slate-600 md:block" />}
              </div>
            ))}
          </div>

          {(cases.length > 0 || running) && (
            <div className="grid gap-4 xl:grid-cols-[1fr_480px]">
              {/* queue */}
              <div className="panel p-4">
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-300"><ClipboardList size={16} /> Review queue</div>
                {Object.entries(byPrescriber).map(([prescriber, list]) => (
                  <div key={prescriber} className="mb-3">
                    <div className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">{prescriber}</div>
                    <div className="space-y-2">
                      {list.map((c: any) => (
                        <CaseRow key={c.caseId} c={c} active={selectedCase?.caseId === c.caseId} decision={decisions[c.caseId]} onClick={() => setCaseId(c.caseId)} />
                      ))}
                    </div>
                  </div>
                ))}
                {monitorCases.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-sky-300/80">
                      <Eye size={12} /> Monitoring — correct non-alerts
                    </div>
                    <div className="space-y-2">
                      {monitorCases.map((c: any) => (
                        <CaseRow key={c.caseId} c={c} active={selectedCase?.caseId === c.caseId} decision={decisions[c.caseId]} onClick={() => setCaseId(c.caseId)} />
                      ))}
                    </div>
                  </div>
                )}
                {dismissedCases.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">Dismissed by adjudicator</div>
                    <div className="space-y-2">
                      {dismissedCases.map((c: any) => (
                        <CaseRow key={c.caseId} c={c} active={selectedCase?.caseId === c.caseId} decision={decisions[c.caseId]} onClick={() => setCaseId(c.caseId)} />
                      ))}
                    </div>
                  </div>
                )}
                {!cases.length && running && <div className="text-sm text-slate-400">Waiting for adjudications...</div>}
              </div>

              {selectedCase && <CasePanel c={selectedCase} decision={decisions[selectedCase.caseId]} onDecide={decide} />}
            </div>
          )}

          {run?.scan?.exclusions && (
            <details className="panel p-4">
              <summary className="cursor-pointer text-sm text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <ChevronDown size={14} /> Why the other {run.scan.exclusions.length} patients were excluded — every decision is explainable
                </span>
              </summary>
              <div className="mt-2 max-h-[380px] overflow-auto text-sm">
                {[...(run.scan.candidates || []).map((c: any) => ({ ...c, hit: true })), ...run.scan.exclusions]
                  .sort((a: any, b: any) => a.sourceIndex - b.sourceIndex)
                  .map((p: any) => (
                    <div key={`${p.sourceIndex}-${p.patientId}`} className="grid grid-cols-[40px_190px_1fr] gap-2 border-t border-slate-800 py-1.5">
                      <span className="text-slate-500">#{p.sourceIndex}</span>
                      <span className={p.hit ? "text-emerald-300" : ""}>{p.name}</span>
                      <span className={p.hit ? "text-emerald-300" : "text-slate-400"}>
                        {p.hit ? `${p.matchType === "monitor" ? "MONITOR — " : "CANDIDATE — "}${p.reasons.join("; ")}` : p.nearMiss ? `near miss — ${p.nearMiss}` : p.reasons.join("; ")}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      </section>
    </main>
  );
}

function priorityColor(priority: string) {
  return priority === "high" ? "border-rose-300 bg-rose-50 text-rose-700"
    : priority === "medium" ? "border-amber-300 bg-amber-50 text-amber-700"
    : "border-slate-300 bg-slate-50 text-slate-600";
}

function CaseRow({ c, active, decision, onClick }: { c: any; active: boolean; decision?: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full rounded-md border p-3 text-left transition ${active ? "border-emerald-500 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-slate-400"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{c.patient.name}</span>
        <span className="flex items-center gap-1.5">
          {decision && (
            <span className={`chip text-xs ${decision.decision === "approve" ? "text-emerald-300" : "text-slate-400"}`}>
              {decision.decision === "approve" ? "✓ approved" : "dismissed"}
            </span>
          )}
          <span className={`rounded-full border px-2 py-0.5 text-xs ${priorityColor(c.priority)}`}>{c.priority}</span>
        </span>
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{c.patient.visitTitle}</div>
      <div className="mt-1.5 line-clamp-2 text-sm text-slate-300">{c.rationale}</div>
      <div className="mt-2 flex items-center gap-3 text-xs">
        {c.verdict === "actionable" ? (
          <span className="text-emerald-300"><CheckCircle2 className="mr-1 inline" size={13} />actionable</span>
        ) : c.verdict === "monitor" ? (
          <span className="text-sky-300"><Eye className="mr-1 inline" size={13} />monitor</span>
        ) : (
          <span className="text-slate-400"><XCircle className="mr-1 inline" size={13} />dismissed</span>
        )}
        <span className="text-slate-500">{c.claims.length} verified claim{c.claims.length === 1 ? "" : "s"}</span>
      </div>
    </button>
  );
}

function CasePanel({ c, decision, onDecide }: { c: any; decision?: any; onDecide: (c: any, d: "approve" | "dismiss") => void }) {
  return (
    <div className="panel h-fit p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Evidence chain</div>
          <h2 className="mt-1 text-xl font-semibold">{c.patient.name}</h2>
          <div className="mt-0.5 text-sm text-slate-400">
            {c.patient.ageYears} yrs · {c.patient.sex} · {c.patient.visitTitle}
          </div>
          <div className="text-xs text-slate-500">{c.patient.clinic} · {c.patient.prescriber}</div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${priorityColor(c.priority)}`}>{c.priority}</span>
      </div>

      <div className="mt-3 rounded-md bg-slate-100 p-3 text-sm text-slate-800">{c.rationale}</div>

      {c.transcriptEscalation && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle size={12} /> chart vs. conversation
          </div>
          {c.transcriptEscalation}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {c.claims.map((claim: any, i: number) => (
          <div key={i} className="rounded-md border border-slate-700 bg-black/20 p-3">
            <div className="text-sm leading-snug">{claim.text}</div>
            {claim.citation.type === "transcript" ? (
              <blockquote className="mt-2 border-l-2 border-amber-400 bg-amber-50 py-1.5 pl-3 pr-2 text-sm italic text-amber-900">
                &ldquo;{claim.citation.quote}&rdquo;
              </blockquote>
            ) : (
              <div className="mt-2 inline-block rounded bg-emerald-300/10 px-2 py-1 font-mono text-xs text-emerald-200">
                {claim.citation.resourceType}/{claim.citation.resourceId}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1 text-xs text-emerald-300">
              <ShieldCheck size={12} /> citation mechanically verified against source record
            </div>
          </div>
        ))}
      </div>

      {c.monitorNote && (
        <div className="mt-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700"><Eye size={12} /> monitoring plan</div>
          {c.monitorNote}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 text-xs uppercase tracking-wider text-slate-400">Drafted action — requires human approval</div>
        <div className="rounded-md bg-slate-100 p-3 text-sm leading-relaxed">{c.draftedAction}</div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => onDecide(c, "approve")} disabled={!!decision} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40">
          Approve
        </button>
        <button onClick={() => onDecide(c, "dismiss")} disabled={!!decision} className="rounded-md border border-slate-600 px-4 py-2 text-sm disabled:opacity-40">
          Dismiss
        </button>
      </div>

      {decision && (
        <div className="mt-3 rounded-md border border-slate-700 bg-black/20 p-2.5 font-mono text-xs text-slate-400">
          audit · {decision.decision} · {decision.actor} · {new Date(decision.timestamp).toLocaleTimeString()} · snapshot {decision.caseSnapshotHash?.slice(0, 12)}
        </div>
      )}
    </div>
  );
}
