import { useState, useMemo } from "react";
import {
  Users, Calendar, FolderKanban, LayoutDashboard, Plus, Trash2,
  ChevronDown, ChevronRight, Clock, UserCircle, Briefcase,
  BarChart3, PieChart, AlertTriangle, CheckCircle2, Edit3, X,
  Palmtree, Target, Layers
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell,
  RadialBarChart, RadialBar
} from "recharts";

// ─── Mock Data ───────────────────────────────────────────────
const INITIAL_SPRINT = {
  startDate: "2026-03-16",
  endDate: "2026-03-27",
};

const INITIAL_MEMBERS = [
  {
    id: "m1", name: "Ana Souza", avatar: null, capacityHours: 90,
    vacations: [{ start: "2026-03-23", end: "2026-03-25" }],
  },
  {
    id: "m2", name: "Carlos Lima", avatar: null, capacityHours: 90,
    vacations: [],
  },
  {
    id: "m3", name: "Juliana Mendes", avatar: null, capacityHours: 90,
    vacations: [{ start: "2026-03-19", end: "2026-03-20" }],
  },
];

const INITIAL_PROJECTS = [
  {
    id: "p1", name: "Portal do Cliente", color: "#6366f1",
    stories: [
      { id: "s1", title: "Tela de Login OAuth", hours: 16, assignee: "m1", done: true },
      { id: "s2", title: "Dashboard principal", hours: 24, assignee: "m2", done: false },
      { id: "s3", title: "Perfil do usuário", hours: 12, assignee: "m3", done: false },
    ],
  },
  {
    id: "p2", name: "API de Pagamentos", color: "#f59e0b",
    stories: [
      { id: "s4", title: "Integração Stripe", hours: 20, assignee: "m2", done: false },
      { id: "s5", title: "Webhooks de notificação", hours: 14, assignee: "m1", done: true },
      { id: "s6", title: "Relatório de transações", hours: 18, assignee: "m3", done: false },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

function businessDaysBetween(start, end) {
  let count = 0;
  const d = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  while (d <= e) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function vacationDaysInSprint(vacations, sprintStart, sprintEnd) {
  let total = 0;
  const ss = new Date(sprintStart + "T00:00:00");
  const se = new Date(sprintEnd + "T00:00:00");
  for (const v of vacations) {
    const vs = new Date(v.start + "T00:00:00");
    const ve = new Date(v.end + "T00:00:00");
    const overlapStart = vs < ss ? ss : vs;
    const overlapEnd = ve > se ? se : ve;
    if (overlapStart <= overlapEnd) {
      total += businessDaysBetween(
        overlapStart.toISOString().slice(0, 10),
        overlapEnd.toISOString().slice(0, 10)
      );
    }
  }
  return total;
}

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444"];
function avatarColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── Sub-Components ──────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const bg = avatarColor(name);
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "#6366f1" }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
      <div className="rounded-xl p-2.5" style={{ backgroundColor: color + "18" }}>
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

function ProgressBar({ value, max, color = "#6366f1", height = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <input
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
        {...props}
      />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <select className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all bg-white" {...props}>
        {children}
      </select>
    </div>
  );
}

function Btn({ children, variant = "primary", className = "", ...props }) {
  const base = "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-sm",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-400",
    ghost: "text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:ring-gray-300",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

// ─── TABS ────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sprint", label: "Sprint", icon: Calendar },
  { id: "team", label: "Equipe", icon: Users },
  { id: "projects", label: "Projetos", icon: FolderKanban },
];

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function CapacityDashboard() {
  const [tab, setTab] = useState("dashboard");
  const [sprint, setSprint] = useState(INITIAL_SPRINT);
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [projects, setProjects] = useState(INITIAL_PROJECTS);

  // ── Modals ──
  const [memberModal, setMemberModal] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [projectModal, setProjectModal] = useState(false);
  const [storyModal, setStoryModal] = useState(null); // projectId
  const [vacationModal, setVacationModal] = useState(null); // memberId

  // ── Form states ──
  const [mf, setMf] = useState({ name: "", capacityHours: 90 });
  const [pf, setPf] = useState({ name: "", color: "#6366f1" });
  const [sf, setSf] = useState({ title: "", hours: "", assignee: "" });
  const [vf, setVf] = useState({ start: "", end: "" });

  // ── Computed data ──
  const sprintDays = useMemo(() => {
    if (!sprint.startDate || !sprint.endDate) return 0;
    return businessDaysBetween(sprint.startDate, sprint.endDate);
  }, [sprint]);

  const memberCapacity = useMemo(() => {
    return members.map((m) => {
      const vacDays = vacationDaysInSprint(m.vacations, sprint.startDate, sprint.endDate);
      const hoursPerDay = sprintDays > 0 ? m.capacityHours / sprintDays : 0;
      const vacImpact = Math.round(vacDays * hoursPerDay);
      const effectiveCap = m.capacityHours - vacImpact;
      let assigned = 0;
      for (const p of projects) {
        for (const s of p.stories) {
          if (s.assignee === m.id) assigned += s.hours;
        }
      }
      return {
        ...m,
        vacDays,
        vacImpact,
        effectiveCap,
        assigned,
        remaining: effectiveCap - assigned,
      };
    });
  }, [members, projects, sprint, sprintDays]);

  const totalCapacity = useMemo(() => memberCapacity.reduce((a, b) => a + b.effectiveCap, 0), [memberCapacity]);
  const totalAssigned = useMemo(() => memberCapacity.reduce((a, b) => a + b.assigned, 0), [memberCapacity]);
  const totalStories = useMemo(() => projects.reduce((a, p) => a + p.stories.length, 0), [projects]);
  const doneStories = useMemo(() => projects.reduce((a, p) => a + p.stories.filter((s) => s.done).length, 0), [projects]);

  // ── Handlers ──
  const addMember = () => {
    if (!mf.name.trim()) return;
    if (editMember) {
      setMembers((prev) => prev.map((m) => m.id === editMember.id ? { ...m, name: mf.name, capacityHours: Number(mf.capacityHours) } : m));
      setEditMember(null);
    } else {
      setMembers((prev) => [...prev, { id: uid(), name: mf.name, avatar: null, capacityHours: Number(mf.capacityHours), vacations: [] }]);
    }
    setMf({ name: "", capacityHours: 90 });
    setMemberModal(false);
  };

  const removeMember = (id) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setProjects((prev) => prev.map((p) => ({ ...p, stories: p.stories.map((s) => s.assignee === id ? { ...s, assignee: "" } : s) })));
  };

  const addProject = () => {
    if (!pf.name.trim()) return;
    setProjects((prev) => [...prev, { id: uid(), name: pf.name, color: pf.color, stories: [] }]);
    setPf({ name: "", color: "#6366f1" });
    setProjectModal(false);
  };

  const removeProject = (id) => setProjects((prev) => prev.filter((p) => p.id !== id));

  const addStory = () => {
    if (!sf.title.trim() || !sf.hours) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === storyModal
          ? { ...p, stories: [...p.stories, { id: uid(), title: sf.title, hours: Number(sf.hours), assignee: sf.assignee, done: false }] }
          : p
      )
    );
    setSf({ title: "", hours: "", assignee: "" });
    setStoryModal(null);
  };

  const removeStory = (projId, storyId) =>
    setProjects((prev) => prev.map((p) => (p.id === projId ? { ...p, stories: p.stories.filter((s) => s.id !== storyId) } : p)));

  const toggleDone = (projId, storyId) =>
    setProjects((prev) => prev.map((p) => (p.id === projId ? { ...p, stories: p.stories.map((s) => (s.id === storyId ? { ...s, done: !s.done } : s)) } : p)));

  const updateAssignee = (projId, storyId, assignee) =>
    setProjects((prev) => prev.map((p) => (p.id === projId ? { ...p, stories: p.stories.map((s) => (s.id === storyId ? { ...s, assignee } : s)) } : p)));

  const addVacation = () => {
    if (!vf.start || !vf.end) return;
    setMembers((prev) => prev.map((m) => (m.id === vacationModal ? { ...m, vacations: [...m.vacations, { start: vf.start, end: vf.end }] } : m)));
    setVf({ start: "", end: "" });
    setVacationModal(null);
  };

  const removeVacation = (memberId, idx) =>
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, vacations: m.vacations.filter((_, i) => i !== idx) } : m)));

  // ── Chart data ──
  const projectChartData = useMemo(() => {
    return projects.map((p) => {
      const total = p.stories.length;
      const done = p.stories.filter((s) => s.done).length;
      const totalH = p.stories.reduce((a, s) => a + s.hours, 0);
      const doneH = p.stories.reduce((a, s) => a + (s.done ? s.hours : 0), 0);
      return { name: p.name, Concluído: doneH, Pendente: totalH - doneH, color: p.color, pctDone: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
  }, [projects]);

  const capacityChartData = useMemo(() => {
    return memberCapacity.map((m) => ({
      name: m.name.split(" ")[0],
      Alocado: m.assigned,
      Disponível: Math.max(m.remaining, 0),
      Férias: m.vacImpact,
    }));
  }, [memberCapacity]);

  const capacityPieData = useMemo(() => [
    { name: "Alocado", value: totalAssigned },
    { name: "Disponível", value: Math.max(totalCapacity - totalAssigned, 0) },
  ], [totalCapacity, totalAssigned]);

  const PIE_COLORS = ["#6366f1", "#e0e7ff"];

  // ═════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* ── Sidebar ── */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-100 flex flex-col z-40">
        <div className="px-6 py-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Layers size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Release QBR</h1>
              <p className="text-xs text-gray-400">Gestão de Capacidade</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <t.icon size={18} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="bg-indigo-50 rounded-xl p-3.5">
            <p className="text-xs font-medium text-indigo-700 mb-1">Sprint Atual</p>
            <p className="text-xs text-indigo-500">
              {sprint.startDate && sprint.endDate
                ? `${new Date(sprint.startDate + "T00:00:00").toLocaleDateString("pt-BR")} – ${new Date(sprint.endDate + "T00:00:00").toLocaleDateString("pt-BR")}`
                : "Não configurada"}
            </p>
            <p className="text-xs text-indigo-400 mt-0.5">{sprintDays} dias úteis</p>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="ml-64 p-8">
        {/* ════════ DASHBOARD ════════ */}
        {tab === "dashboard" && (
          <div>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Dashboard da Release</h2>
              <p className="text-gray-500 text-sm mt-1">Visão geral de capacidade e progresso dos projetos</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <StatCard icon={Users} label="Membros" value={members.length} sub="na equipe" color="#6366f1" />
              <StatCard icon={Clock} label="Capacidade Total" value={`${totalCapacity}h`} sub={`${totalAssigned}h alocadas`} color="#14b8a6" />
              <StatCard icon={FolderKanban} label="Projetos" value={projects.length} sub="na release" color="#f59e0b" />
              <StatCard
                icon={totalCapacity - totalAssigned < 0 ? AlertTriangle : CheckCircle2}
                label="Horas Livres"
                value={`${totalCapacity - totalAssigned}h`}
                sub={totalCapacity - totalAssigned < 0 ? "Sobre-alocação!" : "disponíveis"}
                color={totalCapacity - totalAssigned < 0 ? "#ef4444" : "#22c55e"}
              />
            </div>

            {/* Charts — Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
              {/* Progresso por Projeto */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-gray-900">Horas por Projeto</h3>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={projectChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Concluído" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Pendente" stackId="a" fill="#e0e7ff" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <div className="flex items-center gap-2 mb-4 self-start">
                  <PieChart size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-gray-900">Alocação Total</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <RPieChart>
                    <Pie data={capacityPieData} innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                      {capacityPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  </RPieChart>
                </ResponsiveContainer>
                <div className="flex gap-4 text-xs mt-2">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />Alocado: {totalAssigned}h</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-100" />Livre: {Math.max(totalCapacity - totalAssigned, 0)}h</span>
                </div>
              </div>
            </div>

            {/* Capacidade por Membro */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
              <div className="flex items-center gap-2 mb-5">
                <Users size={18} className="text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Capacidade por Membro</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={capacityChartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Alocado" stackId="a" fill="#6366f1" />
                  <Bar dataKey="Férias" stackId="a" fill="#fbbf24" />
                  <Bar dataKey="Disponível" stackId="a" fill="#e0e7ff" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Member mini-cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {memberCapacity.map((m) => {
                const pct = m.effectiveCap > 0 ? Math.round((m.assigned / m.effectiveCap) * 100) : 0;
                const over = m.remaining < 0;
                return (
                  <div key={m.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar name={m.name} size={40} />
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{m.name}</p>
                        <p className="text-xs text-gray-400">{m.effectiveCap}h efetivas na sprint</p>
                      </div>
                    </div>
                    <ProgressBar value={m.assigned} max={m.effectiveCap} color={over ? "#ef4444" : "#6366f1"} />
                    <div className="flex justify-between mt-2.5 text-xs">
                      <span className="text-gray-500">{m.assigned}h alocadas ({pct}%)</span>
                      <span className={over ? "text-red-500 font-medium" : "text-green-600 font-medium"}>
                        {over ? `${Math.abs(m.remaining)}h acima` : `${m.remaining}h livres`}
                      </span>
                    </div>
                    {m.vacDays > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                        <Palmtree size={13} /> {m.vacDays} dia(s) de férias na sprint (−{m.vacImpact}h)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════ SPRINT ════════ */}
        {tab === "sprint" && (
          <div>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Configuração da Sprint</h2>
              <p className="text-gray-500 text-sm mt-1">Defina as datas de início e fim da sprint atual</p>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 max-w-xl">
              <div className="flex items-center gap-2 mb-6">
                <Calendar size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Período da Sprint</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Data de Início"
                  type="date"
                  value={sprint.startDate}
                  onChange={(e) => setSprint((s) => ({ ...s, startDate: e.target.value }))}
                />
                <Input
                  label="Data de Fim"
                  type="date"
                  value={sprint.endDate}
                  onChange={(e) => setSprint((s) => ({ ...s, endDate: e.target.value }))}
                />
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 mt-2">
                <p className="text-sm text-indigo-700 font-medium">
                  <Clock size={14} className="inline mr-1.5 -mt-0.5" />
                  {sprintDays} dias úteis nesta sprint
                </p>
                <p className="text-xs text-indigo-500 mt-1">
                  Capacidade total da equipe: {totalCapacity}h ({members.length} membros)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════ TEAM ════════ */}
        {tab === "team" && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Equipe</h2>
                <p className="text-gray-500 text-sm mt-1">Gerencie membros, capacidade e férias</p>
              </div>
              <Btn onClick={() => { setEditMember(null); setMf({ name: "", capacityHours: 90 }); setMemberModal(true); }}>
                <Plus size={16} /> Novo Membro
              </Btn>
            </div>
            <div className="space-y-4">
              {memberCapacity.map((m) => {
                const pct = m.effectiveCap > 0 ? Math.round((m.assigned / m.effectiveCap) * 100) : 0;
                const over = m.remaining < 0;
                return (
                  <div key={m.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <Avatar name={m.name} size={48} />
                        <div>
                          <p className="font-semibold text-gray-900">{m.name}</p>
                          <p className="text-sm text-gray-400">Capacidade base: {m.capacityHours}h</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Btn variant="ghost" onClick={() => { setVacationModal(m.id); setVf({ start: "", end: "" }); }}>
                          <Palmtree size={15} /> Férias
                        </Btn>
                        <Btn variant="ghost" onClick={() => { setEditMember(m); setMf({ name: m.name, capacityHours: m.capacityHours }); setMemberModal(true); }}>
                          <Edit3 size={15} />
                        </Btn>
                        <Btn variant="danger" onClick={() => removeMember(m.id)}>
                          <Trash2 size={15} />
                        </Btn>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mb-3 text-center">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-500">Base</p>
                        <p className="text-lg font-bold text-gray-900">{m.capacityHours}h</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-3">
                        <p className="text-xs text-amber-600">Férias</p>
                        <p className="text-lg font-bold text-amber-700">−{m.vacImpact}h</p>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-3">
                        <p className="text-xs text-indigo-600">Alocado</p>
                        <p className="text-lg font-bold text-indigo-700">{m.assigned}h</p>
                      </div>
                      <div className={`rounded-xl p-3 ${over ? "bg-red-50" : "bg-green-50"}`}>
                        <p className={`text-xs ${over ? "text-red-500" : "text-green-600"}`}>Restante</p>
                        <p className={`text-lg font-bold ${over ? "text-red-600" : "text-green-700"}`}>{m.remaining}h</p>
                      </div>
                    </div>

                    <ProgressBar value={m.assigned} max={m.effectiveCap} color={over ? "#ef4444" : "#6366f1"} />
                    <p className="text-xs text-gray-400 mt-1.5">{pct}% alocado da capacidade efetiva ({m.effectiveCap}h)</p>

                    {m.vacations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.vacations.map((v, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg">
                            <Palmtree size={12} />
                            {new Date(v.start + "T00:00:00").toLocaleDateString("pt-BR")} – {new Date(v.end + "T00:00:00").toLocaleDateString("pt-BR")}
                            <button onClick={() => removeVacation(m.id, i)} className="text-amber-400 hover:text-red-500 ml-0.5"><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════ PROJECTS ════════ */}
        {tab === "projects" && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Projetos da Release</h2>
                <p className="text-gray-500 text-sm mt-1">Gerencie projetos, histórias e atribuições</p>
              </div>
              <Btn onClick={() => { setPf({ name: "", color: "#6366f1" }); setProjectModal(true); }}>
                <Plus size={16} /> Novo Projeto
              </Btn>
            </div>
            <div className="space-y-6">
              {projects.map((p) => {
                const totalH = p.stories.reduce((a, s) => a + s.hours, 0);
                const doneH = p.stories.reduce((a, s) => a + (s.done ? s.hours : 0), 0);
                const doneCount = p.stories.filter((s) => s.done).length;
                return (
                  <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-5 flex items-center justify-between border-b border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                        <h3 className="font-semibold text-gray-900">{p.name}</h3>
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
                          {doneCount}/{p.stories.length} histórias · {totalH}h total
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Btn variant="secondary" onClick={() => { setSf({ title: "", hours: "", assignee: "" }); setStoryModal(p.id); }}>
                          <Plus size={15} /> História
                        </Btn>
                        <Btn variant="danger" onClick={() => removeProject(p.id)}>
                          <Trash2 size={15} />
                        </Btn>
                      </div>
                    </div>
                    {/* Progress */}
                    <div className="px-6 pt-4 pb-2">
                      <ProgressBar value={doneH} max={totalH} color={p.color} height={6} />
                      <p className="text-xs text-gray-400 mt-1">{totalH > 0 ? Math.round((doneH / totalH) * 100) : 0}% concluído em horas</p>
                    </div>
                    {/* Stories */}
                    <div className="px-6 pb-4">
                      {p.stories.length === 0 && (
                        <p className="text-sm text-gray-400 py-4 text-center">Nenhuma história cadastrada</p>
                      )}
                      {p.stories.map((s) => {
                        const assigneeMember = members.find((m) => m.id === s.assignee);
                        return (
                          <div key={s.id} className={`flex items-center justify-between py-3 border-b border-gray-50 last:border-0 ${s.done ? "opacity-60" : ""}`}>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleDone(p.id, s.id)}
                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                  s.done ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-indigo-400"
                                }`}
                              >
                                {s.done && <CheckCircle2 size={14} className="text-white" />}
                              </button>
                              <span className={`text-sm ${s.done ? "line-through text-gray-400" : "text-gray-700"}`}>{s.title}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-lg font-medium">{s.hours}h</span>
                              <select
                                value={s.assignee}
                                onChange={(e) => updateAssignee(p.id, s.id, e.target.value)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 min-w-[130px]"
                              >
                                <option value="">Sem responsável</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                              {assigneeMember && <Avatar name={assigneeMember.name} size={26} />}
                              <button onClick={() => removeStory(p.id, s.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ═══ MODALS ═══ */}
      <Modal open={memberModal} onClose={() => setMemberModal(false)} title={editMember ? "Editar Membro" : "Novo Membro"}>
        <Input label="Nome completo" placeholder="Ex: Maria Silva" value={mf.name} onChange={(e) => setMf((f) => ({ ...f, name: e.target.value }))} />
        <Input label="Capacidade (horas/sprint)" type="number" value={mf.capacityHours} onChange={(e) => setMf((f) => ({ ...f, capacityHours: e.target.value }))} />
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-500">
          <UserCircle size={14} className="inline mr-1.5 -mt-0.5" />
          A foto de perfil poderá ser adicionada posteriormente (campo preparado para upload).
        </div>
        <Btn className="w-full justify-center" onClick={addMember}>{editMember ? "Salvar Alterações" : "Adicionar Membro"}</Btn>
      </Modal>

      <Modal open={projectModal} onClose={() => setProjectModal(false)} title="Novo Projeto">
        <Input label="Nome do projeto" placeholder="Ex: Portal do Cliente" value={pf.name} onChange={(e) => setPf((f) => ({ ...f, name: e.target.value }))} />
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Cor do projeto</label>
          <div className="flex gap-2">
            {["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#14b8a6", "#8b5cf6", "#f97316"].map((c) => (
              <button
                key={c}
                onClick={() => setPf((f) => ({ ...f, color: c }))}
                className={`w-8 h-8 rounded-lg transition-all ${pf.color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <Btn className="w-full justify-center" onClick={addProject}>Criar Projeto</Btn>
      </Modal>

      <Modal open={!!storyModal} onClose={() => setStoryModal(null)} title="Nova História">
        <Input label="Título" placeholder="Ex: Tela de Login OAuth" value={sf.title} onChange={(e) => setSf((f) => ({ ...f, title: e.target.value }))} />
        <Input label="Estimativa (horas)" type="number" placeholder="Ex: 16" value={sf.hours} onChange={(e) => setSf((f) => ({ ...f, hours: e.target.value }))} />
        <Select label="Responsável" value={sf.assignee} onChange={(e) => setSf((f) => ({ ...f, assignee: e.target.value }))}>
          <option value="">Sem responsável</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
        <Btn className="w-full justify-center" onClick={addStory}>Adicionar História</Btn>
      </Modal>

      <Modal open={!!vacationModal} onClose={() => setVacationModal(null)} title="Registrar Férias">
        <Input label="Data de início" type="date" value={vf.start} onChange={(e) => setVf((f) => ({ ...f, start: e.target.value }))} />
        <Input label="Data de fim" type="date" value={vf.end} onChange={(e) => setVf((f) => ({ ...f, end: e.target.value }))} />
        <Btn className="w-full justify-center" onClick={addVacation}>Registrar Período</Btn>
      </Modal>
    </div>
  );
}
