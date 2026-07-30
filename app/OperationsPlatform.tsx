/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Agent = { id: string; name: string; role: string; initials: string; accent: string; capabilities: string[]; tools: string[] };
type Data = { tasks: any[]; memories: any[]; approvals: any[]; integrations: any[]; activity: any[] };

const agents: Agent[] = [
  { id: "monroe", name: "Monroe", role: "Business Manager", initials: "MO", accent: "#9f3548", capabilities: ["Daily priorities", "Business reporting", "Supplier comparison"], tools: ["Business memory", "Tasks"] },
  { id: "sage", name: "Sage", role: "Social Media Manager", initials: "SA", accent: "#74604c", capabilities: ["Content calendar", "Campaign planning", "Social analytics"], tools: ["Metricool (connection required)", "Approvals"] },
  { id: "cleo", name: "Cleo", role: "Customer Experience", initials: "CL", accent: "#8a5369", capabilities: ["Inbox review", "Support drafts", "Order communication"], tools: ["Gmail (connection required)", "Approvals"] },
  { id: "lennox", name: "Lennox", role: "Commerce Manager", initials: "LE", accent: "#6f2434", capabilities: ["Shopify orders", "Product monitoring", "Conversion analysis"], tools: ["Shopify (connection required)", "Approvals"] },
  { id: "avery", name: "Avery", role: "Product & Drop Manager", initials: "AV", accent: "#4b5963", capabilities: ["Drop planning", "Tech packs", "Production milestones"], tools: ["Product memory", "Tasks"] },
];

const empty: Data = { tasks: [], memories: [], approvals: [], integrations: [], activity: [] };

export default function OperationsPlatform() {
  const [view, setView] = useState("dashboard");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [ai, setAi] = useState<{ configured: boolean; ai: string }>({ configured: false, ai: "connection_required" });

  async function refresh(showLoading = false) {
    if (showLoading) setLoading(true); setError("");
    try {
      const [stateRes, healthRes] = await Promise.all([fetch("/api/state"), fetch("/api/health")]);
      const state = await stateRes.json(); const health = await healthRes.json();
      if (!stateRes.ok || !state.success) throw new Error(state.error || "Persistent data unavailable");
      setData(state); setAi(health);
    } catch (e) { setError(e instanceof Error ? e.message : "Backend unavailable"); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(true); }, []);

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
    ["dashboard", "Command center"], ["team", "AI employees"], ["tasks", "Tasks"], ["approvals", "Approvals"], ["memory", "Brand memory"], ["settings", "Settings"]
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark"><span>TA</span><div><strong>TRUE AUTHENTIC</strong><small>AI OPERATIONS</small></div></div>
      <nav aria-label="Primary navigation">{nav.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSelected(null); }}>{label}{id === "approvals" && pending.length > 0 && <b>{pending.length}</b>}</button>)}</nav>
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
        {view === "dashboard" && <Dashboard data={data} ai={ai} agents={agents} pending={pending} openAgent={(a: Agent) => { setSelected(a); setView("employee"); }} go={setView} />}
        {view === "team" && <Team agents={agents} ai={ai} open={(a: Agent) => { setSelected(a); setView("employee"); }} />}
        {view === "employee" && selected && <Employee agent={selected} ai={ai} data={data} onNewApproval={refresh} />}
        {view === "tasks" && <Tasks data={data} onChange={refresh} />}
        {view === "approvals" && <Approvals approvals={data.approvals} onChange={refresh} />}
        {view === "memory" && <Memory memories={data.memories} />}
        {view === "settings" && <Settings integrations={data.integrations} ai={ai} notifications={notifications} setNotifications={setNotifications} />}
      </section>}
    </main>
  </div>;
}

function Status({ kind, text }: { kind: string; text: string }) { return <span className={`status ${kind}`}>{text}</span>; }

function Dashboard({ data, ai, agents, pending, openAgent, go }: any) {
  return <>
    <div className="hero"><div><p className="eyebrow">DAILY COMMAND BRIEF</p><h2>Operate with proof.<br />Move with approval.</h2><p>One verified view of commerce, customer experience, content, and first-drop work.</p><div className="hero-actions"><button onClick={() => go("team")}>View your team</button><button className="secondary" onClick={() => go("approvals")}>Review approvals</button></div></div><div className="truth-seal"><span>THE TRUTH IS</span><strong>ALWAYS</strong><span>AUTHENTIC</span></div></div>
    <div className="stats"><article><small>OPEN TASKS</small><strong>{data.tasks.filter((t: any) => t.status !== "done").length}</strong><span>Stored records</span></article><article><small>AWAITING APPROVAL</small><strong>{pending.length}</strong><span>Nothing executes automatically</span></article><article><small>CONNECTED SYSTEMS</small><strong>{data.integrations.filter((i: any) => i.status === "ready" || i.status === "connected").length}</strong><span>Verified checks only</span></article><article><small>AI ENGINE</small><strong>{ai.configured ? "READY" : "—"}</strong><span>{ai.configured ? "Server-side" : "Connection required"}</span></article></div>
    <div className="section-heading"><div><p className="eyebrow">YOUR TEAM</p><h2>AI employees</h2></div><button className="text-btn" onClick={() => go("team")}>View all →</button></div>
    <div className="agent-grid compact">{agents.map((a: Agent) => <AgentCard key={a.id} agent={a} ai={ai} open={() => openAgent(a)} />)}</div>
    <div className="two-col"><article className="panel"><div className="panel-head"><h3>Priority queue</h3><button onClick={() => go("tasks")}>Open tasks</button></div>{data.tasks.length ? data.tasks.slice(0, 4).map((t: any) => <div className="row" key={t.id}><span className={`priority ${t.priority}`}></span><div><strong>{t.title}</strong><small>{t.agent_id} · {t.status}</small></div></div>) : <Empty title="No tasks yet" text="Create the first operational task to populate this queue." />}</article><article className="panel"><div className="panel-head"><h3>Integration truth</h3><button onClick={() => go("settings")}>Settings</button></div>{data.integrations.slice(0, 5).map((i: any) => <div className="integration-row" key={i.id}><div><strong>{i.name}</strong><small>{i.explanation}</small></div><Status kind={i.status} text={i.status.replaceAll("_", " ")} /></div>)}</article></div>
  </>;
}

function AgentCard({ agent, ai, open }: { agent: Agent; ai: any; open: () => void }) { const ready = ai.configured; return <article className="agent-card" style={{ "--agent": agent.accent } as any}><div className="avatar">{agent.initials}</div><div className="agent-copy"><h3>{agent.name}</h3><p>{agent.role}</p><Status kind={ready ? "ready" : "connection_required"} text={ready ? "Ready" : "Connection required"} /></div><button onClick={open} aria-label={`Open ${agent.name}`}>Open employee</button></article>; }

function Team({ agents, ai, open }: any) { return <><div className="page-intro"><p className="eyebrow">FIVE SPECIALISTS · ONE OPERATING SYSTEM</p><h2>Your AI team</h2><p>Status is based on verified backend and integration state—never decorative labels.</p></div><div className="agent-grid">{agents.map((a: Agent) => <AgentCard key={a.id} agent={a} ai={ai} open={() => open(a)} />)}</div></>; }

function Employee({ agent, ai, data, onNewApproval }: any) {
  const [message, setMessage] = useState(""); const [sending, setSending] = useState(false); const [messages, setMessages] = useState<any[]>([]); const [error, setError] = useState("");
  async function send(e: FormEvent) { e.preventDefault(); if (!message.trim() || sending) return; const prompt = message; setMessage(""); setMessages((m) => [...m, { role: "user", text: prompt }]); setSending(true); setError(""); try { const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: agent.id, message: prompt, conversationId: `${agent.id}-workspace`, context: { brand: "True Authentic Apparel", approvalMode: true } }) }); const body = await res.json(); if (!res.ok && !body.message) throw new Error(body.error || "Request failed"); setMessages((m) => [...m, { role: "assistant", text: body.message, status: body.status }]); if (body.approvalRequired) onNewApproval(); } catch (e) { setError(e instanceof Error ? e.message : "Backend unavailable"); } finally { setSending(false); } }
  return <div className="workspace"><aside className="employee-info"><div className="big-avatar" style={{ background: agent.accent }}>{agent.initials}</div><h2>{agent.name}</h2><p>{agent.role}</p><Status kind={ai.configured ? "ready" : "connection_required"} text={ai.configured ? "Ready — AI connected" : "Connection required — AI engine missing"} /><h4>Capabilities</h4><ul>{agent.capabilities.map((c: string) => <li key={c}>{c}</li>)}</ul><h4>Connected tools</h4><ul>{agent.tools.map((t: string) => <li key={t}>{t}</li>)}</ul><h4>Assigned tasks</h4><p className="muted">{data.tasks.filter((t: any) => t.agent_id === agent.id).length} stored tasks</p></aside><div className="conversation"><div className="conversation-head"><div><p className="eyebrow">EMPLOYEE WORKSPACE</p><h2>Talk to {agent.name}</h2></div><span>Approval-first</span></div><div className="messages">{messages.length === 0 && <Empty title={`Start with ${agent.name}`} text="Ask for a read-only analysis or prepare an action for approval." />}{messages.map((m, i) => <div key={i} className={`message ${m.role}`}><small>{m.role === "user" ? "BRANDON" : agent.name.toUpperCase()}</small><p>{m.text}</p>{m.status === "awaiting_approval" && <Status kind="awaiting_approval" text="Awaiting approval" />}</div>)}{sending && <div className="typing"><span></span><span></span><span></span></div>}</div>{error && <p className="form-error">{error}</p>}<form className="composer" onSubmit={send}><textarea aria-label={`Message ${agent.name}`} placeholder={ai.configured ? `Ask ${agent.name} about operations…` : "AI connection required. Approval proposals still work."} value={message} onChange={(e) => setMessage(e.target.value)} /><button disabled={!message.trim() || sending}>{sending ? "Working…" : "Send"}</button></form></div></div>;
}

function Tasks({ data, onChange }: any) { const [open, setOpen] = useState(false); const [form, setForm] = useState({ title: "", description: "", agentId: "monroe", priority: "medium" }); async function save(e: FormEvent) { e.preventDefault(); await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "task", ...form }) }); setOpen(false); setForm({ title: "", description: "", agentId: "monroe", priority: "medium" }); onChange(); } return <><div className="page-intro action"><div><p className="eyebrow">PERSISTENT OPERATIONS</p><h2>Tasks</h2><p>Totals are calculated from stored task records.</p></div><button onClick={() => setOpen(!open)}>New task</button></div>{open && <form className="task-form" onSubmit={save}><input required placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>low</option><option>medium</option><option>high</option></select><button>Save task</button></form>}<div className="record-list">{data.tasks.length ? data.tasks.map((t: any) => <article key={t.id}><span className={`priority ${t.priority}`}></span><div><h3>{t.title}</h3><p>{t.description || "No description"}</p><small>{t.agent_id} · {t.integration || "internal"} · updated {new Date(t.updated_at).toLocaleString()}</small></div><Status kind="ready" text={t.status} /></article>) : <Empty title="No stored tasks" text="Create a task and it will persist across refreshes and sessions." />}</div></>; }

function Approvals({ approvals, onChange }: any) { async function decide(id: string, status: string, exactChange?: string) { await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource: "approval", id, status, exactChange }) }); onChange(); } function edit(a: any) { const revised = window.prompt("Edit the exact proposed change", a.exact_change); if (revised?.trim() && revised.trim() !== a.exact_change) decide(a.id, "pending", revised.trim()); } return <><div className="page-intro"><p className="eyebrow">HUMAN CONTROL</p><h2>Approval queue</h2><p>Approving a proposal records the decision. Execution adapters remain disabled until their integrations are verified.</p></div><div className="approval-list">{approvals.length ? approvals.map((a: any) => <article key={a.id}><div className="approval-top"><div><small>{a.target_platform} · {a.agent_id}</small><h3>{a.summary}</h3></div><Status kind={a.status === "pending" ? "awaiting_approval" : a.status === "approved" ? "ready" : "error"} text={a.status} /></div><p><strong>Reason:</strong> {a.reason}</p><pre>{a.exact_change}</pre><small>Created {new Date(a.created_at).toLocaleString()}</small>{a.status === "pending" && <div className="approval-actions"><button onClick={() => decide(a.id, "approved")}>Approve record</button><button className="secondary" onClick={() => decide(a.id, "rejected")}>Reject</button><button className="ghost" onClick={() => edit(a)}>Edit</button></div>}</article>) : <Empty title="No approvals waiting" text="Consequential employee requests will appear here with their exact proposed change." />}</div></>; }

function Memory({ memories }: any) { return <><div className="page-intro"><p className="eyebrow">PERSISTENT BRAND MEMORY</p><h2>Approved truths</h2><p>Timestamped records that shape every employee response.</p></div><div className="memory-grid">{memories.map((m: any) => <article key={m.id}><small>{m.category}</small><p>{m.content}</p><span>Approved · {new Date(m.updated_at).toLocaleDateString()}</span></article>)}</div></>; }

function Settings({ integrations, ai, notifications, setNotifications }: any) { return <><div className="page-intro"><p className="eyebrow">SYSTEM TRUTH</p><h2>Settings & integrations</h2><p>Secrets are configured server-side only. No browser field stores credentials.</p></div><div className="settings-grid"><article className="setting-card featured"><div><small>AI ENGINE</small><h3>{ai.configured ? "Connected" : "AI connection required"}</h3><p>{ai.configured ? `Active authentication: ${ai.ai === "vercel_ai_gateway" ? "Vercel AI Gateway" : "server-side OpenAI API"}.` : "Add AI_GATEWAY_API_KEY or OPENAI_API_KEY to the hosted server environment."}</p></div><Status kind={ai.configured ? "ready" : "connection_required"} text={ai.configured ? "Ready" : "Connection required"} /></article>{integrations.filter((i: any) => i.id !== "ai").map((i: any) => <article className="setting-card" key={i.id}><div><small>{i.name.toUpperCase()}</small><h3>{i.explanation}</h3><p>{i.capabilities}</p><span>Last successful check: {i.last_checked ? new Date(i.last_checked).toLocaleString() : "Never"}</span></div><Status kind={i.status} text={i.status.replaceAll("_", " ")} /></article>)}<article className="setting-card"><div><small>NOTIFICATIONS</small><h3>{notifications ? "Enabled" : "Muted"}</h3><p>In-app operational alerts. External messages remain approval-gated.</p></div><button onClick={() => setNotifications(!notifications)}>{notifications ? "Mute" : "Enable"}</button></article></div></>; }

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span>TA</span><strong>{title}</strong><p>{text}</p></div>; }
