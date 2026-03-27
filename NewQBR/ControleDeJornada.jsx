import { useState, useMemo } from "react";
import {
  LayoutDashboard, Calendar, Users, FolderKanban, Plus, Trash2,
  Clock, CheckCircle2, Edit3, X, Layers, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, Shield, Info, Umbrella, Code2, Coffee,
  BarChart3, Flag, Target, Zap, TrendingUp, CheckSquare
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════
const INITIAL_SPRINTS = [
  { id: "sp1", name: "Sprint 1", startDate: "2026-03-02", endDate: "2026-03-13", status: "encerrada" },
  { id: "sp2", name: "Sprint 2", startDate: "2026-03-16", endDate: "2026-03-27", status: "atual" },
  { id: "sp3", name: "Sprint 3", startDate: "2026-03-30", endDate: "2026-04-10", status: "futura" },
  { id: "sp4", name: "Sprint 4", startDate: "2026-04-13", endDate: "2026-04-24", status: "futura" },
];

const INITIAL_MEMBERS = [
  {
    id: "m1", name: "Ana Souza",
    hours: { vacation: 8, project: 60, ceremonies: 22 },
  },
  {
    id: "m2", name: "Carlos Lima",
    hours: { vacation: 0, project: 72, ceremonies: 18 },
  },
  {
    id: "m3", name: "Juliana Mendes",
    hours: { vacation: 16, project: 52, ceremonies: 22 },
  },
  {
    id: "m4", name: "Pedro Costa",
    hours: { vacation: 0, project: 70, ceremonies: 20 },
  },
];

const INITIAL_PROJECTS = [
  {
    id: "p1", name: "Portal do Cliente", color: "#6366f1",
    startDate: "2026-03-16", endDate: "2026-04-10",
    stories: [
      { id: "s1", title: "Tela de Login OAuth", assignee: "m1", hours: 16, description: "Implementar autenticação via Google e Microsoft usando a biblioteca NextAuth.js. Incluir callback de sessão e middleware de proteção de rotas.", expanded: false },
      { id: "s2", title: "Dashboard principal", assignee: "m2", hours: 24, description: "Criar dashboard com métricas em tempo real usando Recharts. KPIs: usuários ativos, conversão e receita.", expanded: false },
      { id: "s3", title: "Perfil do usuário", assignee: "m3", hours: 12, description: "Tela de edição de perfil com upload de foto para S3, validação de formulário e preview em tempo real.", expanded: false },
      { id: "s4", title: "Configurações da conta", assignee: "m4", hours: 10, description: "Página de configurações com notificações, segurança e integrações externas.", expanded: false },
    ],
  },
  {
    id: "p2", name: "API de Pagamentos", color: "#f59e0b",
    startDate: "2026-03-23", endDate: "2026-04-17",
    stories: [
      { id: "s5", title: "Integração Stripe", assignee: "m2", hours: 20, description: "Integrar SDK do Stripe para pagamentos recorrentes e avulsos. Configurar webhooks de confirmação.", expanded: false },
      { id: "s6", title: "Webhooks de notificação", assignee: "m1", hours: null, description: "", expanded: false },
      { id: "s7", title: "Relatório de transações", assignee: "m3", hours: null, description: "", expanded: false },
      { id: "s8", title: "Estorno e reembolso", assignee: "m4", hours: null, description: "", expanded: false },
    ],
  },
  {
    id: "p3", name: "App Mobile", color: "#ec4899",
    startDate: "2026-04-06", endDate: "2026-04-24",
    stories: [
      { id: "s9",  title: "Setup React Native + CI/CD", assignee: "m4", hours: null, description: "", expanded: false },
      { id: "s10", title: "Tela de Onboarding", assignee: "m4", hours: null, description: "", expanded: false },
      { id: "s11", title: "Push Notifications", assignee: "m2", hours: null, description: "", expanded: false },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2, 9);

const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "–";

function dateDiff(a, b) {
  return Math.max(0, (new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

const AVATAR_PALETTE = ["#6366f1","#ec4899","#14b8a6","#f59e0b","#8b5cf6","#ef4444","#3b82f6","#22c55e"];
const avatarBg = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
};

function dorRisk(project) {
  const total = project.stories.length;
  if (total === 0) return "none";
  const notDor = project.stories.filter((s) => !s.hours).length;
  if (notDor === 0) return "green";
  if (notDor / total < 0.5) return "yellow";
  return "red";
}

const RISK_STYLES = {
  none:   { card: "border border-gray-200", badge: "bg-gray-100 text-gray-500", label: "Sem histórias", icon: Info, iconColor: "text-gray-400" },
  green:  { card: "border-2 border-green-400 shadow-lg shadow-green-100", badge: "bg-green-100 text-green-700", label: "DoR Completo", icon: CheckCircle2, iconColor: "text-green-500" },
  yellow: { card: "border-2 border-yellow-400 shadow-lg shadow-yellow-100", badge: "bg-yellow-100 text-yellow-700", label: "Risco Médio", icon: AlertTriangle, iconColor: "text-yellow-500" },
  red:    { card: "border-2 border-red-400 shadow-lg shadow-red-100", badge: "bg-red-100 text-red-600", label: "Alto Risco", icon: AlertCircle, iconColor: "text-red-500" },
};

const SPRINT_STYLES = {
  atual:     { badge: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500", row: "bg-indigo-50/60 border-indigo-200" },
  encerrada: { badge: "bg-gray-100 text-gray-500",    dot: "bg-gray-400",    row: "bg-gray-50 border-gray-200" },
  futura:    { badge: "bg-violet-100 text-violet-600", dot: "bg-violet-400",  row: "bg-violet-50/40 border-violet-200" },
};

// ═══════════════════════════════════════════════════════════════
// UI ATOMS
// ═══════════════════════════════════════════════════════════════
function Avatar({ name, size = 36, ring = false }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      title={name}
      className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${ring ? "ring-2 ring-white" : ""}`}
      style={{ width: size, height: size, backgroundColor: avatarBg(name), fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

function ProgressBar({ value, max, color = "#6366f1", h = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height: h }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl mx-4 p-6 ${wide ? "w-full max-w-2xl" : "w-full max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all";

function Input({ label, ...p }) { return <Field label={label}><input className={inputCls} {...p} /></Field>; }
function Textarea({ label, ...p }) { return <Field label={label}><textarea className={`${inputCls} resize-none`} rows={3} {...p} /></Field>; }
function Sel({ label, children, ...p }) {
  return <Field label={label}><select className={`${inputCls} bg-white`} {...p}>{children}</select></Field>;
}

function Btn({ children, variant = "primary", className = "", ...p }) {
  const v = {
    primary:   "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm focus:ring-indigo-500",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400",
    danger:    "bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-400",
    ghost:     "text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
    success:   "bg-green-600 text-white hover:bg-green-700 shadow-sm focus:ring-green-500",
  }[variant];
  return (
    <button className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${v} ${className}`} {...p}>
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "#6366f1", wide = false }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4 ${wide ? "col-span-2" : ""}`}>
      <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: color + "18" }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-sm text-gray-500 mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GANTT TIMELINE
// ═══════════════════════════════════════════════════════════════
function GanttTimeline({ projects, members, sprints }) {
  const validSprints = sprints.filter((s) => s.startDate && s.endDate);
  if (!validSprints.length || !projects.length) return null;

  const allDates = [...validSprints.map((s) => s.startDate), ...validSprints.map((s) => s.endDate)].sort();
  const releaseStart = new Date(allDates[0] + "T00:00:00");
  const releaseEnd = new Date(allDates[allDates.length - 1] + "T00:00:00");
  const totalDays = Math.max((releaseEnd - releaseStart) / 86400000, 1);

  const toLeft = (d) => {
    if (!d) return 0;
    const diff = (new Date(d + "T00:00:00") - releaseStart) / 86400000;
    return Math.max(0, Math.min(100, (diff / totalDays) * 100));
  };
  const toWidth = (s, e) => Math.max(1, toLeft(e) - toLeft(s));

  const sprintBands = validSprints.map((s) => ({
    ...s,
    left: toLeft(s.startDate),
    width: toWidth(s.startDate, s.endDate),
  }));

  const projectRows = projects
    .filter((p) => p.startDate && p.endDate)
    .map((p) => {
      const assigneeIds = [...new Set(p.stories.map((s) => s.assignee).filter(Boolean))];
      const assignees = assigneeIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
      return { ...p, left: toLeft(p.startDate), width: toWidth(p.startDate, p.endDate), assignees };
    });

  const risk = (p) => dorRisk(p);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <BarChart3 size={18} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-900">Linha do Tempo da Release</h3>
        <span className="text-xs text-gray-400 ml-2">Gráfico de Gantt com alocação de membros</span>
      </div>

      <div className="p-6">
        {/* Sprint header bands */}
        <div className="flex items-center mb-3">
          <div className="w-44 shrink-0" />
          <div className="flex-1 relative h-8">
            {sprintBands.map((s) => {
              const st = SPRINT_STYLES[s.status];
              return (
                <div
                  key={s.id}
                  className={`absolute top-0 h-full rounded-md flex items-center justify-center text-xs font-medium border ${st.row}`}
                  style={{ left: `calc(${s.left}% + 2px)`, width: `calc(${s.width}% - 4px)` }}
                >
                  <span className={`px-1.5 py-0.5 rounded-md text-xs ${st.badge}`}>{s.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Date labels */}
        <div className="flex items-center mb-4">
          <div className="w-44 shrink-0" />
          <div className="flex-1 relative h-5">
            {sprintBands.map((s) => (
              <div
                key={s.id + "_lbl"}
                className="absolute text-xs text-gray-400 flex gap-1"
                style={{ left: `${s.left}%`, transform: "translateX(-0%)" }}
              >
                {fmtDate(s.startDate)}
              </div>
            ))}
            <div className="absolute text-xs text-gray-400 right-0">{fmtDate(validSprints[validSprints.length - 1]?.endDate)}</div>
          </div>
        </div>

        {/* Vertical grid lines */}
        <div className="flex items-stretch">
          <div className="w-44 shrink-0" />
          <div className="flex-1 relative">
            {sprintBands.map((s) => (
              <div key={s.id + "_grid"} className="absolute top-0 bottom-0 border-l border-dashed border-gray-200" style={{ left: `${s.left}%` }} />
            ))}
            <div className="absolute top-0 bottom-0 right-0 border-r border-dashed border-gray-200" />

            {/* Project rows */}
            <div className="space-y-3 py-1">
              {projectRows.map((p) => {
                const r = risk(p);
                const barBorderColor = r === "green" ? "#22c55e" : r === "yellow" ? "#f59e0b" : r === "red" ? "#ef4444" : "#d1d5db";
                return (
                  <div key={p.id} className="relative" style={{ height: 44 }}>
                    {/* Bar */}
                    <div
                      className="absolute top-1 rounded-xl flex items-center px-3 gap-1.5 overflow-hidden"
                      style={{
                        left: `${p.left}%`,
                        width: `${Math.max(p.width, 8)}%`,
                        height: 36,
                        backgroundColor: p.color + "22",
                        border: `2px solid ${barBorderColor}`,
                      }}
                    >
                      {/* Assignee avatars */}
                      <div className="flex -space-x-1 shrink-0">
                        {p.assignees.slice(0, 4).map((m) => (
                          <Avatar key={m.id} name={m.name} size={22} ring />
                        ))}
                        {p.assignees.length > 4 && (
                          <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-xs text-white font-bold ring-2 ring-white">
                            +{p.assignees.length - 4}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold truncate" style={{ color: p.color }}>{p.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 mt-6 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Legenda de risco (DoR):</span>
          {[
            { color: "#22c55e", label: "DoR Completo" },
            { color: "#f59e0b", label: "Risco Médio" },
            { color: "#ef4444", label: "Alto Risco" },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: l.color }} />
              {l.label}
            </span>
          ))}
          <span className="ml-4 text-xs text-gray-400">Avatares dentro das barras = membros alocados</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════

/* ─── DASHBOARD ──────────────────────────────────────────────── */
function DashboardView({ sprints, members, projects }) {
  const totalProjectHours = members.reduce((a, m) => a + m.hours.project, 0);
  const totalAssigned = useMemo(() => {
    let sum = 0;
    for (const p of projects) for (const s of p.stories) if (s.hours) sum += s.hours;
    return sum;
  }, [projects]);
  const totalStories = projects.reduce((a, p) => a + p.stories.length, 0);
  const dorStories = projects.reduce((a, p) => a + p.stories.filter((s) => s.hours).length, 0);
  const riskProjects = { green: 0, yellow: 0, red: 0, none: 0 };
  projects.forEach((p) => riskProjects[dorRisk(p)]++);

  const currentSprint = sprints.find((s) => s.status === "atual");
  const closedSprints = sprints.filter((s) => s.status === "encerrada").length;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Visão Geral da Release</h2>
        <p className="text-gray-500 text-sm mt-1">Acompanhe capacidade, risco DoR e progresso geral</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon={Calendar} label="Sprint Atual" value={currentSprint?.name ?? "–"} sub={`${closedSprints}/${sprints.length} encerradas`} color="#6366f1" />
        <StatCard icon={Users} label="Membros" value={members.length} sub={`${totalProjectHours}h de projeto disponíveis`} color="#14b8a6" />
        <StatCard icon={TrendingUp} label="Horas Alocadas" value={`${totalAssigned}h`} sub={`de ${totalProjectHours}h disponíveis`} color={totalAssigned > totalProjectHours ? "#ef4444" : "#f59e0b"} />
        <StatCard icon={CheckSquare} label="Histórias em DoR" value={`${dorStories}/${totalStories}`} sub={`${totalStories - dorStories} aguardando refinamento`} color="#22c55e" />
      </div>

      {/* Risk cards + DoR detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Risk summary */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Status de Risco (DoR)</h3>
          </div>
          <div className="space-y-3">
            {[
              { key: "green",  label: "DoR Completo",  color: "#22c55e", bg: "bg-green-50" },
              { key: "yellow", label: "Risco Médio",   color: "#f59e0b", bg: "bg-yellow-50" },
              { key: "red",    label: "Alto Risco",    color: "#ef4444", bg: "bg-red-50" },
            ].map((r) => (
              <div key={r.key} className={`flex items-center justify-between rounded-xl px-4 py-3 ${r.bg}`}>
                <span className="text-sm font-medium" style={{ color: r.color }}>{r.label}</span>
                <span className="text-2xl font-bold" style={{ color: r.color }}>{riskProjects[r.key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Capacity bars */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-5">
            <Zap size={18} className="text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Capacidade por Membro</h3>
          </div>
          <div className="space-y-4">
            {members.map((m) => {
              const assigned = projects.reduce((a, p) => a + p.stories.filter((s) => s.assignee === m.id && s.hours).reduce((b, s) => b + s.hours, 0), 0);
              const pct = m.hours.project > 0 ? Math.round((assigned / m.hours.project) * 100) : 0;
              const over = assigned > m.hours.project;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.name} size={30} />
                      <span className="text-sm font-medium text-gray-700">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400">{assigned}h / {m.hours.project}h proj.</span>
                      <span className={`font-semibold ${over ? "text-red-600" : "text-green-600"}`}>
                        {over ? `+${assigned - m.hours.project}h acima` : `${m.hours.project - assigned}h livres`}
                      </span>
                    </div>
                  </div>
                  <ProgressBar value={assigned} max={m.hours.project} color={over ? "#ef4444" : "#6366f1"} h={6} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Projects DoR overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {projects.map((p) => {
          const r = dorRisk(p);
          const rs = RISK_STYLES[r];
          const dorCount = p.stories.filter((s) => s.hours).length;
          const totalH = p.stories.reduce((a, s) => a + (s.hours ?? 0), 0);
          return (
            <div key={p.id} className={`bg-white rounded-2xl p-5 ${rs.card}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg font-medium ${rs.badge}`}>
                  <rs.icon size={11} className={`inline mr-1 ${rs.iconColor}`} />
                  {rs.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{dorCount}/{p.stories.length} histórias em DoR · {totalH}h estimadas</p>
              <ProgressBar value={dorCount} max={p.stories.length} color={r === "green" ? "#22c55e" : r === "yellow" ? "#f59e0b" : "#ef4444"} h={5} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── SPRINTS ────────────────────────────────────────────────── */
function SprintsView({ sprints, setSprints }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", status: "futura" });
  const [editId, setEditId] = useState(null);

  const save = () => {
    if (!form.name.trim()) return;
    if (editId) {
      setSprints((prev) => prev.map((s) => (s.id === editId ? { ...s, ...form } : s)));
      setEditId(null);
    } else {
      setSprints((prev) => [...prev, { id: uid(), ...form }]);
    }
    setForm({ name: "", startDate: "", endDate: "", status: "futura" });
    setModal(false);
  };

  const openEdit = (s) => { setEditId(s.id); setForm({ name: s.name, startDate: s.startDate, endDate: s.endDate, status: s.status }); setModal(true); };
  const remove = (id) => setSprints((prev) => prev.filter((s) => s.id !== id));

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sprints da Release</h2>
          <p className="text-gray-500 text-sm mt-1">Uma release é composta por até 4 sprints</p>
        </div>
        <Btn onClick={() => { setEditId(null); setForm({ name: `Sprint ${sprints.length + 1}`, startDate: "", endDate: "", status: "futura" }); setModal(true); }}>
          <Plus size={16} /> Adicionar Sprint
        </Btn>
      </div>

      <div className="space-y-4">
        {sprints.map((s, i) => {
          const st = SPRINT_STYLES[s.status];
          const days = s.startDate && s.endDate ? Math.ceil(dateDiff(s.startDate, s.endDate)) : null;
          return (
            <div key={s.id} className={`rounded-2xl border p-6 ${st.row}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${s.status === "atual" ? "bg-indigo-600" : s.status === "encerrada" ? "bg-gray-400" : "bg-violet-500"}`}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-gray-900">{s.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${st.dot}`} />
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {s.startDate ? fmtDate(s.startDate) : "–"} → {s.endDate ? fmtDate(s.endDate) : "–"}
                      {days !== null && <span className="ml-2 text-gray-400">({days} dias)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn variant="ghost" onClick={() => openEdit(s)}><Edit3 size={15} /></Btn>
                  <Btn variant="danger" onClick={() => remove(s.id)}><Trash2 size={15} /></Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Sprint" : "Nova Sprint"}>
        <Input label="Nome da sprint" placeholder="Ex: Sprint 1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data de início" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <Input label="Data de fim" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
        <Sel label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="futura">Futura</option>
          <option value="atual">Atual</option>
          <option value="encerrada">Encerrada</option>
        </Sel>
        <Btn className="w-full justify-center mt-1" onClick={save}>{editId ? "Salvar" : "Adicionar Sprint"}</Btn>
      </Modal>
    </div>
  );
}

/* ─── TEAM ───────────────────────────────────────────────────── */
function TeamView({ members, setMembers, projects }) {
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", hours: { vacation: 0, project: 70, ceremonies: 20 } });

  const save = () => {
    if (!form.name.trim()) return;
    if (editId) {
      setMembers((prev) => prev.map((m) => (m.id === editId ? { ...m, ...form } : m)));
      setEditId(null);
    } else {
      setMembers((prev) => [...prev, { id: uid(), ...form }]);
    }
    setForm({ name: "", hours: { vacation: 0, project: 70, ceremonies: 20 } });
    setModal(false);
  };

  const openEdit = (m) => { setEditId(m.id); setForm({ name: m.name, hours: { ...m.hours } }); setModal(true); };
  const remove = (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const hf = (key, val) => setForm((f) => ({ ...f, hours: { ...f.hours, [key]: Number(val) || 0 } }));

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Equipe</h2>
          <p className="text-gray-500 text-sm mt-1">Gerencie capacidade com férias, projeto e cerimônias</p>
        </div>
        <Btn onClick={() => { setEditId(null); setForm({ name: "", hours: { vacation: 0, project: 70, ceremonies: 20 } }); setModal(true); }}>
          <Plus size={16} /> Novo Membro
        </Btn>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {members.map((m) => {
          const total = m.hours.vacation + m.hours.project + m.hours.ceremonies;
          const assigned = projects.reduce((a, p) => a + p.stories.filter((s) => s.assignee === m.id && s.hours).reduce((b, s) => b + s.hours, 0), 0);
          const remaining = m.hours.project - assigned;
          const over = remaining < 0;
          const assignedStories = projects.flatMap((p) => p.stories.filter((s) => s.assignee === m.id).map((s) => ({ ...s, projectName: p.name, projectColor: p.color })));

          return (
            <div key={m.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <Avatar name={m.name} size={48} />
                  <div>
                    <p className="font-semibold text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">{total}h totais nesta sprint</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Btn variant="ghost" onClick={() => openEdit(m)}><Edit3 size={15} /></Btn>
                  <Btn variant="danger" onClick={() => remove(m.id)}><Trash2 size={15} /></Btn>
                </div>
              </div>

              {/* 3-category bars */}
              <div className="space-y-3 mb-5">
                {[
                  { key: "vacation", label: "Férias", color: "#f59e0b", icon: Umbrella, bg: "bg-amber-50 text-amber-700" },
                  { key: "project",  label: "Horas de Projeto", color: "#6366f1", icon: Code2, bg: "bg-indigo-50 text-indigo-700" },
                  { key: "ceremonies", label: "Colaboração / Cerimônias", color: "#14b8a6", icon: Coffee, bg: "bg-teal-50 text-teal-700" },
                ].map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${c.bg}`}>
                        <c.icon size={11} /> {c.label}
                      </span>
                      <span className="text-xs font-semibold text-gray-600">{m.hours[c.key]}h</span>
                    </div>
                    <ProgressBar value={m.hours[c.key]} max={total} color={c.color} h={5} />
                  </div>
                ))}
              </div>

              {/* Project allocation */}
              <div className={`rounded-xl p-4 ${over ? "bg-red-50" : "bg-gray-50"}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-600">Horas de Projeto: alocado vs disponível</span>
                  <span className={`text-xs font-bold ${over ? "text-red-600" : "text-green-600"}`}>
                    {over ? `${Math.abs(remaining)}h acima` : `${remaining}h livres`}
                  </span>
                </div>
                <ProgressBar value={assigned} max={m.hours.project} color={over ? "#ef4444" : "#6366f1"} h={7} />
                <p className="text-xs text-gray-400 mt-1.5">{assigned}h alocadas de {m.hours.project}h de projeto</p>
              </div>

              {/* Assigned stories */}
              {assignedStories.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {assignedStories.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.projectColor }} />
                        <span className="text-gray-600 truncate max-w-[150px]">{s.title}</span>
                      </span>
                      <span className={s.hours ? "text-indigo-600 font-medium" : "text-red-400"}>
                        {s.hours ? `${s.hours}h` : "Sem estimativa"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Membro" : "Novo Membro"}>
        <Input label="Nome completo" placeholder="Ex: Maria Silva" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <p className="text-sm font-medium text-gray-700 mb-3">Distribuição de horas na sprint</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "vacation", label: "Férias" },
            { key: "project", label: "Projeto" },
            { key: "ceremonies", label: "Cerimônias" },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label} (h)</label>
              <input className={inputCls} type="number" value={form.hours[f.key]} onChange={(e) => hf(f.key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 my-3 text-xs text-indigo-600">
          Total: {form.hours.vacation + form.hours.project + form.hours.ceremonies}h nesta sprint
        </div>
        <Btn className="w-full justify-center" onClick={save}>{editId ? "Salvar" : "Adicionar"}</Btn>
      </Modal>
    </div>
  );
}

/* ─── PROJECTS ───────────────────────────────────────────────── */
function ProjectsView({ projects, setProjects, members, sprints }) {
  const [projModal, setProjModal] = useState(false);
  const [storyModal, setStoryModal] = useState(null);
  const [editProjId, setEditProjId] = useState(null);
  const [pf, setPf] = useState({ name: "", color: "#6366f1", startDate: "", endDate: "" });
  const [sf, setSf] = useState({ title: "", assignee: "", hours: "", description: "" });
  const [expandedStories, setExpandedStories] = useState({});

  const saveProject = () => {
    if (!pf.name.trim()) return;
    if (editProjId) {
      setProjects((prev) => prev.map((p) => (p.id === editProjId ? { ...p, ...pf } : p)));
      setEditProjId(null);
    } else {
      setProjects((prev) => [...prev, { id: uid(), ...pf, stories: [] }]);
    }
    setPf({ name: "", color: "#6366f1", startDate: "", endDate: "" });
    setProjModal(false);
  };

  const saveStory = () => {
    if (!sf.title.trim()) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === storyModal
          ? { ...p, stories: [...p.stories, { id: uid(), title: sf.title, assignee: sf.assignee, hours: sf.hours ? Number(sf.hours) : null, description: sf.description, expanded: false }] }
          : p
      )
    );
    setSf({ title: "", assignee: "", hours: "", description: "" });
    setStoryModal(null);
  };

  const removeProject = (id) => setProjects((prev) => prev.filter((p) => p.id !== id));
  const removeStory = (pid, sid) => setProjects((prev) => prev.map((p) => (p.id === pid ? { ...p, stories: p.stories.filter((s) => s.id !== sid) } : p)));
  const updateAssignee = (pid, sid, val) => setProjects((prev) => prev.map((p) => (p.id === pid ? { ...p, stories: p.stories.map((s) => (s.id === sid ? { ...s, assignee: val } : s)) } : p)));
  const updateHours = (pid, sid, val) => setProjects((prev) => prev.map((p) => (p.id === pid ? { ...p, stories: p.stories.map((s) => (s.id === sid ? { ...s, hours: val ? Number(val) : null } : s)) } : p)));

  const toggleStory = (id) => setExpandedStories((prev) => ({ ...prev, [id]: !prev[id] }));

  const PROJECT_COLORS = ["#6366f1", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#ef4444", "#3b82f6", "#22c55e"];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Projetos da Release</h2>
          <p className="text-gray-500 text-sm mt-1">A borda colorida indica o nível de risco do DoR</p>
        </div>
        <Btn onClick={() => { setEditProjId(null); setPf({ name: "", color: "#6366f1", startDate: "", endDate: "" }); setProjModal(true); }}>
          <Plus size={16} /> Novo Projeto
        </Btn>
      </div>

      <div className="space-y-6">
        {projects.map((p) => {
          const r = dorRisk(p);
          const rs = RISK_STYLES[r];
          const RiskIcon = rs.icon;
          const totalH = p.stories.reduce((a, s) => a + (s.hours ?? 0), 0);
          const dorCount = p.stories.filter((s) => s.hours).length;

          return (
            <div key={p.id} className={`bg-white rounded-2xl overflow-hidden ${rs.card}`}>
              {/* Project header */}
              <div className="px-6 py-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium ${rs.badge}`}>
                      <RiskIcon size={11} className={rs.iconColor} />
                      {rs.label}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
                      {dorCount}/{p.stories.length} DoR · {totalH}h estimadas
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.startDate && (
                      <span className="text-xs text-gray-400">
                        <Calendar size={12} className="inline mr-1" />
                        {fmtDate(p.startDate)} – {fmtDate(p.endDate)}
                      </span>
                    )}
                    <Btn variant="secondary" onClick={() => { setSf({ title: "", assignee: "", hours: "", description: "" }); setStoryModal(p.id); }}>
                      <Plus size={15} /> História
                    </Btn>
                    <Btn variant="ghost" onClick={() => { setEditProjId(p.id); setPf({ name: p.name, color: p.color, startDate: p.startDate, endDate: p.endDate }); setProjModal(true); }}>
                      <Edit3 size={15} />
                    </Btn>
                    <Btn variant="danger" onClick={() => removeProject(p.id)}>
                      <Trash2 size={15} />
                    </Btn>
                  </div>
                </div>
              </div>

              {/* Stories */}
              <div className="divide-y divide-gray-50">
                {p.stories.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhuma história cadastrada</p>
                )}
                {p.stories.map((s) => {
                  const isDor = !!s.hours;
                  const assigneeMember = members.find((m) => m.id === s.assignee);
                  const isExpanded = expandedStories[s.id];

                  return (
                    <div key={s.id} className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* DoR indicator */}
                        <div title={isDor ? "Em DoR" : "Sem estimativa — não está em DoR"}>
                          {isDor
                            ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                            : <AlertCircle size={18} className="text-red-400 shrink-0" />
                          }
                        </div>

                        {/* Title + expand */}
                        <button
                          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors text-left flex-1"
                          onClick={() => toggleStory(s.id)}
                        >
                          {s.title}
                          {s.description && (isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />)}
                        </button>

                        {/* Hours inline editor */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={s.hours ?? ""}
                            placeholder="horas?"
                            onChange={(e) => updateHours(p.id, s.id, e.target.value)}
                            className="w-20 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          <span className="text-xs text-gray-400">h</span>
                        </div>

                        {/* Assignee */}
                        <select
                          value={s.assignee}
                          onChange={(e) => updateAssignee(p.id, s.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[130px]"
                        >
                          <option value="">Sem responsável</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>

                        {assigneeMember && <Avatar name={assigneeMember.name} size={26} />}

                        {!isDor && (
                          <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-md font-medium whitespace-nowrap">Não DoR</span>
                        )}

                        <button onClick={() => removeStory(p.id, s.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-1">
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Accordion description */}
                      {isExpanded && (
                        <div className="mt-2.5 ml-7 p-3.5 bg-gray-50 rounded-xl text-sm text-gray-600 border border-gray-100">
                          {s.description ? s.description : <span className="text-gray-400 italic">Sem descrição cadastrada.</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gantt below projects */}
      <GanttTimeline projects={projects} members={members} sprints={sprints} />

      {/* Project Modal */}
      <Modal open={projModal} onClose={() => setProjModal(false)} title={editProjId ? "Editar Projeto" : "Novo Projeto"}>
        <Input label="Nome do projeto" placeholder="Ex: Portal do Cliente" value={pf.name} onChange={(e) => setPf((f) => ({ ...f, name: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data de início" type="date" value={pf.startDate} onChange={(e) => setPf((f) => ({ ...f, startDate: e.target.value }))} />
          <Input label="Data de fim" type="date" value={pf.endDate} onChange={(e) => setPf((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Cor do projeto</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setPf((f) => ({ ...f, color: c }))}
                className={`w-8 h-8 rounded-lg transition-all ${pf.color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <Btn className="w-full justify-center" onClick={saveProject}>{editProjId ? "Salvar" : "Criar Projeto"}</Btn>
      </Modal>

      {/* Story Modal */}
      <Modal open={!!storyModal} onClose={() => setStoryModal(null)} title="Nova História">
        <Input label="Título" placeholder="Ex: Tela de login" value={sf.title} onChange={(e) => setSf((f) => ({ ...f, title: e.target.value }))} />
        <Input
          label={<span>Estimativa de horas <span className="text-gray-400 font-normal">(opcional — obrigatório para DoR)</span></span>}
          type="number" placeholder="Ex: 16"
          value={sf.hours}
          onChange={(e) => setSf((f) => ({ ...f, hours: e.target.value }))}
        />
        {!sf.hours && (
          <div className="bg-red-50 rounded-xl p-3 -mt-1 mb-3 flex items-center gap-2 text-xs text-red-600">
            <AlertCircle size={13} /> Sem estimativa → história não estará em DoR
          </div>
        )}
        <Sel label="Responsável" value={sf.assignee} onChange={(e) => setSf((f) => ({ ...f, assignee: e.target.value }))}>
          <option value="">Sem responsável</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Sel>
        <Textarea label="Descrição (oculta por padrão)" placeholder="Detalhes, critérios de aceite, links..." value={sf.description} onChange={(e) => setSf((f) => ({ ...f, description: e.target.value }))} />
        <Btn className="w-full justify-center" onClick={saveStory}>Adicionar História</Btn>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sprints",   label: "Sprints",   icon: Calendar },
  { id: "team",      label: "Equipe",    icon: Users },
  { id: "projects",  label: "Projetos",  icon: FolderKanban },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [sprints, setSprints] = useState(INITIAL_SPRINTS);
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [projects, setProjects] = useState(INITIAL_PROJECTS);

  const currentSprint = sprints.find((s) => s.status === "atual");
  const totalDorIssues = projects.reduce((a, p) => a + p.stories.filter((s) => !s.hours).length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 font-sans">
      {/* ── Sidebar ── */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white/80 backdrop-blur-xl border-r border-gray-100/80 flex flex-col z-40">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
              <Layers size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Controle de</h1>
              <h1 className="text-base font-bold text-indigo-600 leading-tight">Jornada</h1>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          <div className="bg-indigo-50 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-indigo-700 mb-0.5">
              {currentSprint?.name ?? "Sprint não configurada"}
            </p>
            <p className="text-xs text-indigo-500">
              {currentSprint
                ? `${fmtDate(currentSprint.startDate)} – ${fmtDate(currentSprint.endDate)}`
                : "Configure em Sprints"}
            </p>
          </div>
          {totalDorIssues > 0 && (
            <div className="bg-red-50 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-600 font-medium">{totalDorIssues} história(s) sem DoR</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="ml-64 p-8 max-w-[1400px]">
        {tab === "dashboard" && <DashboardView sprints={sprints} members={members} projects={projects} />}
        {tab === "sprints"   && <SprintsView sprints={sprints} setSprints={setSprints} />}
        {tab === "team"      && <TeamView members={members} setMembers={setMembers} projects={projects} />}
        {tab === "projects"  && <ProjectsView projects={projects} setProjects={setProjects} members={members} sprints={sprints} />}
      </main>
    </div>
  );
}
