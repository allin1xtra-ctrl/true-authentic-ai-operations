/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Agent = { id: string; name: string; role: string; initials: string; image: string; accent: string; capabilities: string[]; tools: string[] };
type Data = { tasks: any[]; memories: any[]; approvals: any[]; integrations: any[]; activity: any[]; conversations: any[]; attachments: any[]; generations: any[]; schedules: any[]; runs: any[]; inbox: any[] };
type EmployeeStatus = "ready" | "working" | "awaiting_approval" | "connection_required" | "error";
type Health = {
  success: boolean;
  checkedAt?: string;
  ai: { status: EmployeeStatus; provider: string; checkedAt: string };
  database: { status: EmployeeStatus; checkedAt: string };
  integrations: Record<string, { status: EmployeeStatus; checkedAt: string | null; configured?: boolean; message?: string }>;
  employees: Record<string, { status: EmployeeStatus; requiredIntegration: string | null; pendingApprovals: number }>;
};

const agents: Agent[] = [
  { id: "monroe", name: "Monroe", role: "Business Manager", initials: "MO", image: "/agents/monroe.webp", accent: "#9f3548", capabilities: ["Daily priorities", "Business reporting", "Supplier comparison"], tools: ["Business memory", "Tasks"] },
  { id: "sage", name: "Sage", role: "Social Media Manager", initials: "SA", image: "/agents/sage.webp", accent: "#74604c", capabilities: ["Content calendar", "Campaign planning", "Social analytics"], tools: ["Direct social channels", "Approvals"] },
  { id: "cleo", name: "Cleo", role: "Customer Experience", initials: "CL", image: "/agents/cleo.webp", accent: "#8a5369", capabilities: ["Inbox review", "Support drafts", "Order communication"], tools: ["Gmail (connection required)", "Approvals"] },
  { id: "lennox", name: "Lennox", role: "Commerce Manager", initials: "LE", image: "/agents/lennox.webp", accent: "#6f2434", capabilities: ["Shopify orders", "Product monitoring", "Conversion analysis"], tools: ["Shopify (connection required)", "Approvals"] },
  { id: "avery", name: "Avery", role: "Product & Drop Manager", initials: "AV", image: "/agents/avery.webp", accent: "#4b5963", capabilities: ["Drop planning", "Tech packs", "Production milestones"], tools: ["Product memory", "Tasks"] },
];

const empty: Data = { tasks: [], memories: [], approvals: [], integrations: [], activity: [], conversations: [], attachments: [], generations: [], schedules: [], runs: [], inbox: [] };
const emptyHealth: Health = { success: false, ai: { status: "connection_required", provider: "none", checkedAt: "" }, database: { status: "error", checkedAt: "" }, integrations: {}, employees: {} };
const generationPromptLimit = 2000;

async function readApiResponse(response: Response, fallback: string) {
  const text = await response.text();
  let body: { error?: string; [key: string]: unknown } = {};
  if (text) {
    try { body = JSON.parse(text) as typeof body; }
    catch { body.error = response.status === 413 ? "This request is too large. Shorten the prompt and try again." : fallback; }
  }
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

export default function OperationsPlatform() {
  const [view, setView] = useState("dashboard");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [health, setHealth] = useState<Health>(emptyHealth);

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true); setError("");
    try {
      const [stateRes, healthRes] = await Promise.all([fetch("/api/state"), fetch("/api/health")]);
      const state = await stateRes.json(); const nextHealth = await healthRes.json();
      if (!stateRes.ok || !state.success) throw new Error(state.error || "Persistent data unavailable");
      if (!healthRes.ok || !nextHealth.success) throw new Error(nextHealth.error || "Health validation unavailable");
      setData(state); setHealth(nextHealth);
    } catch (e) { setError(e instanceof Error ? e.message : "Backend unavailable"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.hash === "#settings" || params.has("shopify")) setView("settings");
    refresh(true);
  }, []);

  const pending = data.approvals.filter((a) => a.status === "pending");
  const results = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return [];
    return [
      ...agents.filter((a) => `${a.name} ${a.role}`.toLowerCase().includes(q)).map((a) => ({ type: "Employee", title: a.name, detail: a.role, action: () => { setSelected(a); setView("employee"); } })),
      ...data.tasks.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q)).map((t) => ({ type: "Task", title: t.title, detail: t.status, action: () => setView("tasks") })),
      ...data.memories.filter((m) => m.content.toLowerCase().includes(q)).map((m) => ({ type: "Memory", title: m.content, detail: m.category, action: () => setView("memory") })),
    ].slice(0, 8);
  }, [search, data]);

  const nav = [
    ["dashboard", "Command center"], ["team", "AI employees"], ["automations", "Automations"], ["inbox", "Operations inbox"], ["tasks", "Tasks"], ["approvals", "Approvals"], ["memory", "Brand memory"], ["settings", "Settings"]
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span>TA</span><div><strong>TRUE AUTHENTIC</strong><small>AI OPERATIONS</small></div></div>
      <nav aria-label="Primary navigation">{nav.map(([id, label]) => { const badge = id === "approvals" ? pending.length : id === "inbox" ? data.inbox.filter((item: any) => item.status === "unread").length : 0; return <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSelected(null); }}>{label}{badge > 0 && <b>{badge}</b>}</button>; })}</nav>
      <div className="policy-card"><span>APPROVAL MODE</span><strong>Always on</strong><p>No customer, supplier, commerce, or social action runs without Brandon.</p></div>
    </aside>
    <main>
      <header className="topbar">
        <div><p className="eyebrow">TRUE AUTHENTIC APPAREL</p><h1>{selected ? selected.name : nav.find(([id]) => id === view)?.[1] || "Command center"}</h1></div>
        <div className="top-actions"><label className="search"><span>⌕</span><input aria-label="Search tasks, employees, and memories" placeholder="Search operations" value={search} onChange={(e) => setSearch(e.target.value)} /></label><button aria-label="Toggle notifications" className={notifications ? "icon-btn on" : "icon-btn"} onClick={() => setNotifications(!notifications)}>●</button></div>
        {search && <div className="search-results">{results.length ? results.map((r, i) => <button key={i} onClick={r.action}><small>{r.type}</small><strong>{r.title}</strong><span>{r.detail}</span></button>) : <p>No relevant records found.</p>}</div>}
      </header>
      {error && <div className="error-banner"><strong>Connection issue</strong><span>{error}</span><button onClick={() => refresh(true)}>Retry</button></div>}
      {loading ? <div className="loading-state"><span></span><p>Loading verified operations…</p></div> : <section className="content">
        {view === "dashboard" && <Dashboard data={data} health={health} agents={agents} pending={pending} openAgent={(a: Agent) => { setSelected(a); setView("employee"); }} go={setView} />}
        {view === "team" && <Team agents={agents} health={health} pending={pending} open={(a: Agent) => { setSelected(a); setView("employee"); }} />}
        {view === "employee" && selected && <Employee agent={selected} health={health} data={data} onNewApproval={refresh} />}
        {view === "automations" && <Automations data={data} onChange={refresh} />}
        {view === "inbox" && <OperationsInbox items={data.inbox} onChange={refresh} />}
        {view === "tasks" && <Tasks data={data} onChange={refresh} />}
        {view === "approvals" && <Approvals approvals={data.approvals} onChange={refresh} />}
        {view === "memory" && <Memory memories={data.memories} attachments={data.attachments} generations={data.generations} onChange={refresh} />}
        {view === "settings" && <Settings integrations={data.integrations} health={health} notifications={notifications} setNotifications={setNotifications} />}
      </section>}
    </main>
  </div>;
}

function Status({ kind, text }: { kind: string; text: string }) { return <span className={`status ${kind}`}>{text}</span>; }

function statusLabel(status: EmployeeStatus) { return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function agentStatus(agent: Agent, health: Health, pending: any[] = []) {
  const verified = health.employees?.[agent.id]?.status || "connection_required";
  const hasRealApproval = pending.some((approval) => approval.agent_id === agent.id && approval.status === "pending");
  const status: EmployeeStatus = hasRealApproval ? "awaiting_approval" : verified;
  return { kind: status, text: statusLabel(status) };
}

function Dashboard({ data, health, agents, pending, openAgent, go }: any) {
  return <>
    <div className="hero"><div><p className="eyebrow">DAILY COMMAND BRIEF</p><h2>Operate with proof.<br />Move with approval.</h2><p>One verified view of commerce, customer experience, content, and first-drop work.</p><div className="hero-actions"><button onClick={() => go("team")}>View your team</button><button className="secondary" onClick={() => go("approvals")}>Review approvals</button></div></div><div className="truth-seal"><span>THE TRUTH IS</span><strong>ALWAYS</strong><span>AUTHENTIC</span></div></div>
    <div className="stats"><article><small>OPEN TASKS</small><strong>{data.tasks.filter((t: any) => t.status !== "done").length}</strong><span>Stored records</span></article><article><small>AWAITING APPROVAL</small><strong>{pending.length}</strong><span>Nothing executes automatically</span></article><article><small>CONNECTED SYSTEMS</small><strong>{Object.values(health.integrations || {}).filter((i: any) => i.status === "ready").length}</strong><span>Live checks only</span></article><article><small>AI ENGINE</small><strong>{health.ai.status === "ready" ? "READY" : "—"}</strong><span>{statusLabel(health.ai.status)}</span></article></div>
    <div className="section-heading"><div><p className="eyebrow">YOUR TEAM</p><h2>AI employees</h2></div><button className="text-btn" onClick={() => go("team")}>View all →</button></div>
    <div className="agent-grid compact">{agents.map((a: Agent) => <AgentCard key={a.id} agent={a} health={health} pending={pending} open={() => openAgent(a)} />)}</div>
    <div className="two-col"><article className="panel"><div className="panel-head"><h3>Priority queue</h3><button onClick={() => go("tasks")}>Open tasks</button></div>{data.tasks.length ? data.tasks.slice(0, 4).map((t: any) => <div className="row" key={t.id}><span className={`priority ${t.priority}`}></span><div><strong>{t.title}</strong><small>{t.agent_id} · {t.status}</small></div></div>) : <Empty title="No tasks yet" text="Create the first operational task to populate this queue." />}</article><article className="panel"><div className="panel-head"><h3>Integration truth</h3><button onClick={() => go("settings")}>Settings</button></div>{data.integrations.slice(0, 5).map((i: any) => <div className="integration-row" key={i.id}><div><strong>{i.name}</strong><small>{i.explanation}</small></div><Status kind={i.status} text={i.status.replaceAll("_", " ")} /></div>)}</article></div>
  </>;
}

function AgentCard({ agent, health, pending, open }: { agent: Agent; health: Health; pending: any[]; open: () => void }) { const status = agentStatus(agent, health, pending); return <article className="agent-card" style={{ "--agent": agent.accent } as any}><button className="agent-portrait" onClick={open} aria-label={`Open employee ${agent.name}`}><img src={agent.image} alt={`${agent.name}, ${agent.role}`} /></button><div className="agent-copy"><div><h3>{agent.name}</h3><p>{agent.role}</p></div><Status kind={status.kind} text={status.text} /></div><button className="agent-open" onClick={open} aria-label={`Open employee ${agent.name}`}>Enter workspace <span aria-hidden="true">→</span></button></article>; }

function Team({ agents, health, pending, open }: any) { return <><div className="page-intro"><p className="eyebrow">FIVE SPECIALISTS · ONE OPERATING SYSTEM</p><h2>Your AI team</h2><p>Status is based on verified backend and integration state—never decorative labels.</p></div><div className="agent-grid">{agents.map((a: Agent) => <AgentCard key={a.id} agent={a} health={health} pending={pending} open={() => open(a)} />)}</div></>; }

function Employee({ agent, health, data, onNewApproval }: any) {
  const history = useMemo(() => data.conversations.filter((item: any) => item.agent_id === agent.id).map((item: any) => ({ role: item.role, text: item.message, status: item.status })), [agent.id, data.conversations]);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"analysis" | "propose_action">("analysis");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<any[]>(history);
  const [error, setError] = useState("");
  useEffect(() => { setMessages(history); }, [history]);
  const pending = data.approvals.filter((approval: any) => approval.agent_id === agent.id && approval.status === "pending");
  const verified = agentStatus(agent, health, pending);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;
    const prompt = message.trim();
    setMessage("");
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: agent.id, message: prompt, mode, conversationId: `${agent.id}-workspace` }) });
      const body = await response.json();
      if (!body.message?.trim()) throw new Error("The employee returned no visible response.");
      setMessages((current) => [...current, { role: "assistant", text: body.message, status: body.status }]);
      if (!response.ok) setError(body.message);
      if (body.approvalRequired) await onNewApproval();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Backend unavailable");
    } finally {
      setSending(false);
    }
  }

  return <div className="workspace"><aside className="employee-info"><div className="employee-portrait" style={{ "--agent": agent.accent } as any}><img src={agent.image} alt={`${agent.name}, ${agent.role}`} /></div><h2>{agent.name}</h2><p>{agent.role}</p><Status kind={sending ? "working" : verified.kind} text={sending ? "Working" : verified.text} /><h4>Capabilities</h4><ul>{agent.capabilities.map((capability: string) => <li key={capability}>{capability}</li>)}</ul><h4>Connected tools</h4><ul>{agent.tools.map((tool: string) => <li key={tool}>{tool}</li>)}</ul><h4>Assigned tasks</h4><p className="muted">{data.tasks.filter((task: any) => task.agent_id === agent.id).length} stored tasks</p><h4>Approval controls</h4><p className="muted">{pending.length ? `${pending.length} real review item${pending.length === 1 ? "" : "s"} waiting` : "No approvals waiting"}</p></aside><div className="conversation"><div className="conversation-head"><div><p className="eyebrow">EMPLOYEE WORKSPACE</p><h2>Talk to {agent.name}</h2></div><span>Approval-first</span></div><div className="messages">{messages.length === 0 && <Empty title={`Start with ${agent.name}`} text="Ask for a read-only analysis or prepare an action for approval." />}{messages.map((item, index) => <div key={index} className={`message ${item.role}`}><small>{item.role === "user" ? "BRANDON" : agent.name.toUpperCase()}</small><p>{item.text}</p>{item.status === "awaiting_approval" && <Status kind="awaiting_approval" text="Awaiting approval" />}</div>)}{sending && <div className="typing"><span></span><span></span><span></span></div>}</div><MediaPanel contextType="conversation" contextId={`${agent.id}-workspace`} attachments={data.attachments} generations={data.generations} onChange={onNewApproval} />{error && <p className="form-error">{error}</p>}<form className="composer" onSubmit={send}><label className="mode-field">Request mode<select aria-label="Request mode" value={mode} onChange={(event) => setMode(event.target.value as "analysis" | "propose_action")}><option value="analysis">Analysis or read-only check</option><option value="propose_action">Prepare external action for approval · does not execute</option></select></label><textarea aria-label={`Message ${agent.name}`} placeholder={mode === "propose_action" ? "Describe the exact action Brandon should review…" : verified.kind === "ready" ? `Ask ${agent.name} about operations…` : "AI connection required. You can still prepare an approval proposal."} value={message} onChange={(event) => setMessage(event.target.value)} /><button disabled={!message.trim() || sending}>{sending ? "Working…" : mode === "propose_action" ? "Prepare" : "Send"}</button></form></div></div>;
}

function Tasks({ data, onChange }: any) { const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [form, setForm] = useState({ title: "", description: "", agentId: "monroe", priority: "medium" }); async function save(e: FormEvent) { e.preventDefault(); if (saving) return; setSaving(true); setError(""); const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "task", ...form }) }); if (!response.ok) { setError("Could not save the task."); setSaving(false); return; } setOpen(false); setForm({ title: "", description: "", agentId: "monroe", priority: "medium" }); onChange(); setSaving(false); } async function update(id: string, status: string) { setError(""); const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "task_update", id, status }) }); try { await readApiResponse(response, "Could not update the task."); await onChange(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the task."); } } return <><div className="page-intro action"><div><p className="eyebrow">PERSISTENT OPERATIONS</p><h2>Tasks</h2><p>Totals are calculated from stored task records.</p></div><button onClick={() => setOpen(!open)}>New task</button></div>{open && <form className="task-form" onSubmit={save}><input required placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option></select><button disabled={saving}>{saving ? "Saving…" : "Save task"}</button></form>}{error && <p className="form-error" role="alert">{error}</p>}<div className="record-list">{data.tasks.length ? data.tasks.map((t: any) => <article key={t.id}><span className={`priority ${t.priority}`}></span><div><h3>{t.title}</h3><p>{t.description || "No description"}</p><small>{t.agent_id} · {t.integration || "internal"} · updated {new Date(t.updated_at).toLocaleString()}</small><MediaPanel contextType="task" contextId={t.id} attachments={data.attachments} generations={data.generations} onChange={onChange} compact /><div className="task-actions">{t.status !== "working" && t.status !== "done" && <button type="button" className="secondary" onClick={() => update(t.id, "working")}>Start</button>}{t.status !== "done" && <button type="button" onClick={() => update(t.id, "done")}>Mark done</button>}{t.status === "done" && <button type="button" className="ghost" onClick={() => update(t.id, "open")}>Reopen</button>}</div></div><Status kind="ready" text={t.status} /></article>) : <Empty title="No stored tasks" text="Create a task and it will persist across refreshes and sessions." />}</div></>; }

function Approvals({ approvals, onChange }: any) { const [error, setError] = useState(""); async function decide(id: string, status: string, exactChange?: string) { setError(""); const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "approval", id, status, exactChange }) }); try { await readApiResponse(response, "Could not record the approval decision."); await onChange(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not record the approval decision."); } } function edit(a: any) { const revised = window.prompt("Edit the exact proposed change", a.exact_change); if (revised?.trim() && revised.trim() !== a.exact_change) decide(a.id, "pending", revised.trim()); } return <><div className="page-intro"><p className="eyebrow">HUMAN CONTROL</p><h2>Approval queue</h2><p>Approval records your decision. It does not execute an external action unless a verified execution adapter exists.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="approval-list">{approvals.length ? approvals.map((a: any) => <article key={a.id}><div className="approval-top"><div><small>{a.target_platform} · {a.agent_id}</small><h3>{a.summary}</h3></div><Status kind={a.status === "pending" ? "awaiting_approval" : a.status === "approved" ? "ready" : "error"} text={a.status === "approved" && String(a.execution_result || "").includes("No external action executed") ? "Approved · not executed" : a.status} /></div><p><strong>Reason:</strong> {a.reason}</p><pre>{a.exact_change}</pre>{a.execution_result && <p className="execution-result" role="status"><strong>Result:</strong> {a.execution_result}</p>}<small>Created {new Date(a.created_at).toLocaleString()}</small>{a.status === "pending" && <div className="approval-actions"><button onClick={() => decide(a.id, "approved")}>Approve proposal</button><button className="secondary" onClick={() => decide(a.id, "rejected")}>Reject</button><button className="ghost" onClick={() => edit(a)}>Edit</button></div>}</article>) : <Empty title="No approvals waiting" text="Consequential employee requests will appear here with their exact proposed change." />}</div></>; }

function Automations({ data, onChange }: any) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", instruction: "", agentId: "monroe", cadence: "daily", dailyTime: "06:30", timezone: "America/Los_Angeles" });
  async function action(payload: Record<string, unknown>) { setBusy(String(payload.id || payload.action)); setError(""); try { const response = await fetch("/api/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); await readApiResponse(response, "The automation could not be updated."); await onChange(); return true; } catch (caught) { setError(caught instanceof Error ? caught.message : "The automation could not be updated."); return false; } finally { setBusy(""); } }
  async function create(event: FormEvent) { event.preventDefault(); if (await action({ action: "create", ...form })) { setOpen(false); setForm({ name: "", instruction: "", agentId: "monroe", cadence: "daily", dailyTime: "06:30", timezone: "America/Los_Angeles" }); } }
  return <><div className="page-intro action"><div><p className="eyebrow">24/7 OPERATIONS</p><h2>Recurring AI work</h2><p>Safe read-only assignments run in the background. External actions remain approval-gated.</p></div><button onClick={() => setOpen(!open)}>New schedule</button></div>{error && <p className="form-error" role="alert">{error}</p>}{open && <form className="automation-form" onSubmit={create}><input required placeholder="Schedule name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><textarea required placeholder="Describe the recurring read-only analysis, report, research, or draft" value={form.instruction} onChange={(event) => setForm({ ...form, instruction: event.target.value })} /><select value={form.agentId} onChange={(event) => setForm({ ...form, agentId: event.target.value })}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><select value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value })}><option value="daily">Daily</option><option value="hourly">Hourly</option></select>{form.cadence === "daily" && <input aria-label="Daily run time" type="time" value={form.dailyTime} onChange={(event) => setForm({ ...form, dailyTime: event.target.value })} />}<button disabled={busy === "create"}>{busy ? "Saving…" : "Save schedule"}</button></form>}<div className="automation-list">{data.schedules.length ? data.schedules.map((schedule: any) => <article key={schedule.id}><div><small>{schedule.agent_id} · {schedule.cadence}{schedule.daily_time ? ` at ${schedule.daily_time}` : ""}</small><h3>{schedule.name}</h3><p>{schedule.instruction}</p><span>Next run: {new Date(schedule.next_run_at).toLocaleString()}</span></div><div className="automation-actions"><Status kind={schedule.enabled ? "ready" : "connection_required"} text={schedule.enabled ? "Active" : "Paused"} /><button disabled={busy === schedule.id} onClick={() => action({ action: "run", id: schedule.id })}>{busy === schedule.id ? "Running…" : "Run now"}</button><button className="secondary" onClick={() => action({ action: "toggle", id: schedule.id, enabled: !schedule.enabled })}>{schedule.enabled ? "Pause" : "Resume"}</button></div></article>) : <Empty title="No recurring work yet" text="Create a safe schedule for reports, research, analysis, or drafts." />}</div></>;
}

function OperationsInbox({ items, onChange }: any) {
  const [error, setError] = useState("");
  async function markRead(id: string) { setError(""); try { const response = await fetch("/api/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read", id }) }); await readApiResponse(response, "The inbox item could not be updated."); await onChange(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The inbox item could not be updated."); } }
  return <><div className="page-intro"><p className="eyebrow">BACKGROUND RESULTS</p><h2>Operations inbox</h2><p>Completed work, failures, and requests for attention arrive here with a permanent audit trail.</p></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="inbox-list">{items.length ? items.map((item: any) => <article key={item.id} className={item.status === "unread" ? "unread" : ""}><div><small>{item.agent_id} · {item.kind.replaceAll("_", " ")}</small><h3>{item.title}</h3><p>{item.summary}</p><span>{new Date(item.created_at).toLocaleString()}</span></div>{item.status === "unread" ? <button onClick={() => markRead(item.id)}>Mark read</button> : <Status kind="ready" text="Read" />}</article>) : <Empty title="Inbox is clear" text="Background AI results and errors will appear here." />}</div></>;
}

function Memory({ memories, attachments, generations, onChange }: any) { return <><div className="page-intro"><p className="eyebrow">PERSISTENT BRAND MEMORY</p><h2>Approved truths</h2><p>Timestamped records and private media that shape every employee response.</p></div><div className="memory-grid">{memories.map((m: any) => <article key={m.id}><small>{m.category}</small><p>{m.content}</p><span>Approved · {new Date(m.updated_at).toLocaleDateString()}</span><MediaPanel contextType="memory" contextId={m.id} attachments={attachments} generations={generations} onChange={onChange} compact /></article>)}</div></>; }

function MediaPanel({ contextType, contextId, attachments, generations = [], onChange, compact = false }: any) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [creating, setCreating] = useState(false); const [generating, setGenerating] = useState(false); const [prompt, setPrompt] = useState(""); const [kind, setKind] = useState("image");
  const items = attachments.filter((item: any) => item.context_type === contextType && item.context_id === contextId);
  const jobs = generations.filter((item: any) => item.context_type === contextType && item.context_id === contextId && item.kind === "video" && item.status !== "completed");
  async function upload(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(""); const form = new FormData(); form.append("file", file); form.append("contextType", contextType); form.append("contextId", contextId); try { const response = await fetch("/api/media", { method: "POST", body: form }); await readApiResponse(response, "Upload failed"); await onChange(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Upload failed"); } finally { setBusy(false); event.target.value = ""; } }
  async function generate(event: FormEvent) { event.preventDefault(); const normalizedPrompt = prompt.trim().replace(/\s+/g, " "); if (!normalizedPrompt || generating) return; if (normalizedPrompt.length > generationPromptLimit) { setError(`Keep the prompt under ${generationPromptLimit.toLocaleString()} characters.`); return; } setGenerating(true); setError(""); try { const response = await fetch("/api/media/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contextType, contextId, kind, prompt: normalizedPrompt }) }); await readApiResponse(response, "Generation failed"); setPrompt(""); setCreating(false); await onChange(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Generation failed"); } finally { setGenerating(false); } }
  async function refreshJob(id: string) { if (generating) return; setGenerating(true); setError(""); try { const response = await fetch("/api/media/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh", id }) }); await readApiResponse(response, "Status check failed"); await onChange(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Status check failed"); } finally { setGenerating(false); } }
  return <div className={`media-panel ${compact ? "compact" : ""}`}><div className="media-actions"><strong>Media</strong><div><label className={busy ? "disabled" : ""}><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={upload} disabled={busy || generating} /><span>{busy ? "Uploading…" : "Upload"}</span></label><button type="button" disabled={generating} onClick={() => setCreating(!creating)}>{creating ? "Close" : "Create with AI"}</button></div></div>{creating && <form className="generation-form" onSubmit={generate}><select aria-label="Media type" value={kind} onChange={(event) => setKind(event.target.value)} disabled={generating}><option value="image">Image · GPT Image 2</option><option value="video">Video · Sora 2</option></select><textarea required aria-label="Generation prompt" placeholder="Describe the scene, product, styling, lighting, and composition…" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={generating} /><button disabled={!prompt.trim() || generating}>{generating ? "Creating…" : kind === "video" ? "Start video" : "Create image"}</button></form>}{jobs.map((job: any) => <div className="generation-job" key={job.id}><span>{job.status === "failed" ? "Video failed" : `Video ${job.status.replace("_", " ")} · ${job.progress || 0}%`}</span>{job.status !== "failed" && <button type="button" disabled={generating} onClick={() => refreshJob(job.id)}>Check status</button>}</div>)}{error && <p className="form-error" role="alert">{error}</p>}{items.length > 0 && <div className="media-grid">{items.map((item: any) => <a key={item.id} href={`/api/media?id=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" className="media-item">{item.mime_type.startsWith("image/") ? <img src={`/api/media?id=${encodeURIComponent(item.id)}`} alt={item.file_name} loading="lazy" /> : <video src={`/api/media?id=${encodeURIComponent(item.id)}`} controls preload="metadata" aria-label={item.file_name} />}<span>{item.file_name}</span><small>{item.source === "generated" ? "AI-created" : "Uploaded"}</small></a>)}</div>}</div>;
}

function Settings({ integrations, health, notifications, setNotifications }: any) {
  const [connectionMessage, setConnectionMessage] = useState(() => {
    const result = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("shopify");
    const metaResult = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("meta");
    const ga4Result = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("ga4");
    if (ga4Result) return ga4Result === "connected" ? "Google Analytics connected and verified with a live read-only report." : ga4Result === "no_property" ? "Google authorized access, but no GA4 property was available." : ga4Result === "denied" ? "Google Analytics authorization was cancelled." : ga4Result === "configuration" ? "Google Analytics credentials are incomplete on the server." : ga4Result === "permissions" ? "Google did not grant the required analytics.readonly scope." : "Google Analytics authorization could not be verified. Please try again.";
    if (metaResult) return metaResult === "connected" ? "Meta connected and verified with live read-only checks." : metaResult === "no_page" ? "Meta authorized the app, but no managed Facebook Page was available." : metaResult === "denied" ? "Meta authorization was cancelled." : metaResult === "configuration" ? "Meta connection credentials are incomplete on the server." : "Meta authorization could not be verified. Please try again.";
    return result === "connected" ? "Shopify connected and verified with live read-only checks." : result === "invalid" ? "Shopify rejected or expired the authorization request. Please try again." : result === "failed" ? "Shopify authorization failed. Please try again." : result === "permissions" ? "Shopify returned unapproved permissions. Review the active app version before reinstalling." : result === "storage_unavailable" ? "Shopify secure storage is unavailable on the backend." : result === "validation_failed" ? "Shopify authorized the app, but the required read-only checks failed. Confirm the app scopes and reinstall." : "";
  });
  const [connecting, setConnecting] = useState(false);
  const [setup, setSetup] = useState<"gmail" | "social" | "calendar" | "ga4" | "posthog" | null>(null);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const setupDetails = {
    gmail: { title: "Connect Gmail", text: "Create a Google OAuth web application for read-only inbox access and draft creation. Sending remains approval-gated.", href: "https://console.cloud.google.com/apis/credentials", label: "Open Google Cloud" },
    social: { title: "Connect social channels", text: "Connect Instagram, Facebook, TikTok, YouTube, Pinterest, or X directly. Each channel requires its own developer app and review before publishing can be enabled.", href: "https://developers.facebook.com/apps/", label: "Start with Meta" },
    calendar: { title: "Connect Google Calendar", text: "Create a Google OAuth web application with calendar read access. Event creation remains approval-gated.", href: "https://console.cloud.google.com/apis/credentials", label: "Open Google Cloud" },
    ga4: { title: "Connect Google Analytics 4", text: "Configure a Google OAuth web client using this exact callback: https://true-authentic-ai-operations.allin1xtra.chatgpt.site/api/integrations/ga4/callback. Only analytics.readonly is requested.", href: "https://console.cloud.google.com/apis/credentials", label: "Open Google Cloud" },
    posthog: { title: "Connect PostHog", text: "Add POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, and POSTHOG_HOST as server-side settings. A real read-only project request must pass before Ready appears.", href: "https://us.posthog.com/settings/user-api-keys", label: "Open PostHog" },
  } as const;
  const cards = [
    { key: "shopify", label: "SHOPIFY", action: "Connect Shopify" },
    { key: "gmail", label: "GMAIL", action: "Set up Gmail" },
    { key: "meta", label: "META · INSTAGRAM + FACEBOOK", action: "Connect Meta" },
    { key: "ga4", label: "GOOGLE ANALYTICS 4", action: "Connect GA4" },
    { key: "posthog", label: "POSTHOG", action: "Set up PostHog" },
    { key: "scheduling", label: "GOOGLE CALENDAR", action: "Set up Calendar" },
  ];
  async function connectShopify() {
    const shop = window.prompt("Enter your Shopify store domain", "2f1f04-9f.myshopify.com");
    if (!shop?.trim()) return;
    setConnecting(true); setConnectionMessage("");
    try {
      const response = await fetch("/api/integrations/shopify/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop }) });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.error || "Could not start Shopify authorization.");
      window.location.assign(body.url);
    } catch (caught) { setConnectionMessage(caught instanceof Error ? caught.message : "Could not start Shopify authorization."); setConnecting(false); }
  }
  async function connectMeta() {
    setConnectingMeta(true); setConnectionMessage("");
    try {
      const response = await fetch("/api/integrations/meta/start", { method: "POST" });
      const body = await readApiResponse(response, "Could not start Meta authorization.");
      if (typeof body.url !== "string") throw new Error("Meta authorization returned no destination.");
      window.location.assign(body.url);
    } catch (caught) { setConnectionMessage(caught instanceof Error ? caught.message : "Could not start Meta authorization."); setConnectingMeta(false); }
  }
  async function connectGa4() {
    setConnectionMessage("");
    try { const response = await fetch("/api/integrations/ga4/start", { method: "POST" }); const body = await readApiResponse(response, "Could not start Google Analytics authorization."); if (typeof body.url !== "string") throw new Error("Google Analytics authorization returned no destination."); window.location.assign(body.url); }
    catch (caught) { setConnectionMessage(caught instanceof Error ? caught.message : "Could not start Google Analytics authorization."); }
  }
  function openSetup(key: string) { setConnectionMessage(""); setSetup(key === "meta" ? "social" : key === "scheduling" ? "calendar" : key === "ga4" ? "ga4" : key === "posthog" ? "posthog" : "gmail"); }
  return <>
    <div className="page-intro"><p className="eyebrow">SYSTEM TRUTH</p><h2>Settings & connections</h2><p>Secrets are configured server-side only. Stored values are never returned to the browser.</p>{connectionMessage && <p className="connection-message" role="status">{connectionMessage}</p>}</div>
    {setup && <section className="setup-panel" aria-labelledby="setup-title"><div><p className="eyebrow">SECURE CONNECTION SETUP</p><h3 id="setup-title">{setupDetails[setup].title}</h3><p>{setupDetails[setup].text}</p><p className="setup-truth">Connection status will remain Required until OAuth and a live validation succeed.</p></div><div><a href={setupDetails[setup].href} target="_blank" rel="noreferrer">{setupDetails[setup].label}</a><button type="button" className="secondary" onClick={() => setSetup(null)}>Close</button></div></section>}
    <div className="settings-grid">
      <article className="setting-card featured"><div><small>OPENAI</small><h3>{statusLabel(health.ai.status)}</h3><p>{health.ai.status === "ready" ? `Live server-side validation passed through ${health.ai.provider === "vercel_ai_gateway" ? "Vercel AI Gateway" : "OpenAI"}.` : "Configure AI_GATEWAY_API_KEY or OPENAI_API_KEY in the hosted server environment, then run a live check."}</p><span>Last check: {health.ai.checkedAt ? new Date(health.ai.checkedAt).toLocaleString() : "Never"}</span></div><Status kind={health.ai.status} text={statusLabel(health.ai.status)} /></article>
      {cards.map(({ key, label, action }) => { const saved = integrations.find((item: any) => item.id === key); const live = health.integrations?.[key] || { status: "connection_required", checkedAt: null, configured: false }; const capabilities = key === "meta" ? "Facebook Page and Instagram professional account · read-only validation" : saved?.capabilities || "Server-side adapter not configured."; return <article className="setting-card" key={key}><div><small>{label}</small><h3>{statusLabel(live.status)}</h3><p>{capabilities}</p><span>Last successful check: {live.status === "ready" && live.checkedAt ? new Date(live.checkedAt).toLocaleString() : "Never"}</span></div><div className="setting-actions"><Status kind={live.status} text={statusLabel(live.status)} />{live.status !== "ready" && (key === "shopify" ? <button onClick={connectShopify} disabled={connecting}>{connecting ? "Connecting…" : action}</button> : key === "meta" && live.configured ? <button type="button" onClick={connectMeta} disabled={connectingMeta}>{connectingMeta ? "Connecting…" : action}</button> : key === "ga4" && live.configured ? <button type="button" onClick={connectGa4}>{action}</button> : <button type="button" onClick={() => openSetup(key)}>{action}</button>)}</div></article>; })}
      <article className="setting-card"><div><small>DATABASE</small><h3>{statusLabel(health.database.status)}</h3><p>D1 stores tasks, conversations, memory, approvals, integration state, and audit activity.</p><span>Last check: {health.database.checkedAt ? new Date(health.database.checkedAt).toLocaleString() : "Never"}</span></div><Status kind={health.database.status} text={statusLabel(health.database.status)} /></article>
      <article className="setting-card"><div><small>NOTIFICATIONS</small><h3>{notifications ? "Enabled" : "Muted"}</h3><p>In-app operational alerts only. External messages remain approval-gated.</p></div><button onClick={() => setNotifications(!notifications)}>{notifications ? "Mute" : "Enable"}</button></article>
    </div>
  </>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span>TA</span><strong>{title}</strong><p>{text}</p></div>; }
