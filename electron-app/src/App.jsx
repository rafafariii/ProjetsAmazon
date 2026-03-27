/**
 * Controle de Jornada — React App (Renderer Process)
 *
 * Integração com Electron via window.electronAPI (injetado pelo preload.js).
 * Quando window.electronAPI não existe (ex: browser/CodeSandbox), o app
 * funciona em modo de demonstração com dados em memória.
 *
 * Fluxo de dados:
 *   Arquivo Excel → loadData (IPC) → transformação → useState
 *   useState (mutação) → useEffect → saveSheet (IPC) → Arquivo Excel
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Calendar, Users, FolderKanban, Plus, Trash2,
  Clock, CheckCircle2, Edit3, X, Layers, ChevronDown, ChevronUp,
  AlertTriangle, AlertCircle, Shield, Umbrella, Code2, Coffee,
  BarChart3, Zap, TrendingUp, CheckSquare, FolderOpen, FilePlus2,
  Save, Database, RefreshCw, HardDrive, Upload, UserCircle,
  Target, ArrowRight, Repeat2, MoveRight, Star, Cpu, Smile,
  Activity, PieChart, Headphones, BookOpen, ChevronRight
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// API ABSTRACTION
// Fallback para desenvolvimento em browser sem Electron
// ═══════════════════════════════════════════════════════════════
const api = typeof window !== 'undefined' && window.electronAPI
  ? window.electronAPI
  : {
      selectFile:     async ()             => null,
      loadData:       async ()             => ({ sprints: [], equipe: [], projetos: [], historias: [], error: 'Rodando sem Electron – modo demo' }),
      saveSheet:      async ()             => ({ success: true }),
      createTemplate: async ()             => ({ success: true }),
      selectAvatar:   async ()             => null,
    };

// ═══════════════════════════════════════════════════════════════
// HELPERS UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '–';

function dateDiff(a, b) {
  return Math.max(0, (new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

const AVATAR_PALETTE = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#ef4444','#3b82f6','#22c55e'];
const avatarBg = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
};

function dorRisk(project) {
  const total = project.stories.length;
  if (total === 0) return 'none';
  const notDor = project.stories.filter((s) => !s.hours).length;
  if (notDor === 0) return 'green';
  if (notDor / total < 0.5) return 'yellow';
  return 'red';
}

const RISK_STYLES = {
  none:   { card: 'border border-gray-200',                            badge: 'bg-gray-100 text-gray-500',   label: 'Sem histórias', icon: Shield,         iconColor: 'text-gray-400'  },
  green:  { card: 'border-2 border-green-400 shadow-lg shadow-green-100',  badge: 'bg-green-100 text-green-700', label: 'DoR Completo',  icon: CheckCircle2,   iconColor: 'text-green-500' },
  yellow: { card: 'border-2 border-yellow-400 shadow-lg shadow-yellow-100', badge: 'bg-yellow-100 text-yellow-700',label: 'Risco Médio',  icon: AlertTriangle, iconColor: 'text-yellow-500'},
  red:    { card: 'border-2 border-red-400 shadow-lg shadow-red-100',      badge: 'bg-red-100 text-red-600',    label: 'Alto Risco',    icon: AlertCircle,   iconColor: 'text-red-500'   },
};

const SPRINT_STYLES = {
  atual:     { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500',  row: 'bg-indigo-50/60 border-indigo-200'  },
  encerrada: { badge: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400',    row: 'bg-gray-50 border-gray-200'          },
  futura:    { badge: 'bg-violet-100 text-violet-600', dot: 'bg-violet-400',  row: 'bg-violet-50/40 border-violet-200'  },
};

// ═══════════════════════════════════════════════════════════════
// TRANSFORMAÇÕES EXCEL ↔ APP STATE
// ═══════════════════════════════════════════════════════════════

/** Excel rows → App state */
const fromExcel = {
  sprints: (rows = []) =>
    rows.filter((r) => r.id).map((r) => ({
      id:        String(r.id),
      name:      r.nome        || '',
      startDate: r.data_inicio || '',
      endDate:   r.data_fim    || '',
      status:    r.status      || 'futura',
    })),

  members: (rows = []) =>
    rows.filter((r) => r.id).map((r) => ({
      id:        String(r.id),
      name:      r.nome       || '',
      avatarUrl: r.avatar_url || '',
      hours: {
        vacation:   Number(r.horas_ferias  ?? 0),
        project:    Number(r.horas_projeto ?? 70),
        ceremonies: Number(r.horas_colab   ?? 20),
      },
    })),

  projects: (projRows = [], storyRows = []) =>
    projRows.filter((r) => r.id).map((r) => ({
      id:        String(r.id),
      name:      r.nome        || '',
      color:     r.cor         || '#6366f1',
      startDate: r.data_inicio || '',
      endDate:   r.data_fim    || '',
      stories: storyRows
        .filter((s) => s.id && String(s.projeto_id) === String(r.id))
        .map((s) => ({
          id:          String(s.id),
          title:       s.titulo         || '',
          assignee:    s.responsavel_id ? String(s.responsavel_id) : '',
          hours:       s.estimativa     ? Number(s.estimativa)     : null,
          description: s.descricao      || '',
          sprintId:    s.sprint_id      ? String(s.sprint_id)      : '',
        })),
    })),

  okrs: (rows = []) =>
    rows.filter((r) => r.id).map((r) => ({
      id:          String(r.id),
      tipo:        r.tipo      || 'KR',
      frente:      r.frente    || '',
      title:       r.titulo    || '',
      projectId:   r.projeto_id ? String(r.projeto_id) : '',
      baseline:    r.baseline  != null ? Number(r.baseline)  : 0,
      moonshot:    r.moonshot  != null ? Number(r.moonshot)  : 0,
      roofshot:    r.roofshot  != null ? Number(r.roofshot)  : 0,
      atual:       r.atual     != null ? Number(r.atual)     : 0,
      unit:        r.unidade   || '%',
      description: r.descricao || '',
      lowerIsBetter: r.lower_is_better ? true : false,
    })),
};

/** App state → Excel rows */
const toExcel = {
  sprints: (sprints) => sprints.map((s) => ({
    id:          s.id,
    nome:        s.name,
    data_inicio: s.startDate,
    data_fim:    s.endDate,
    status:      s.status,
  })),

  members: (members) => members.map((m) => ({
    id:            m.id,
    nome:          m.name,
    avatar_url:    m.avatarUrl || '',
    horas_ferias:  m.hours.vacation,
    horas_projeto: m.hours.project,
    horas_colab:   m.hours.ceremonies,
  })),

  projects: (projects) => projects.map((p) => ({
    id:          p.id,
    nome:        p.name,
    cor:         p.color,
    data_inicio: p.startDate,
    data_fim:    p.endDate,
  })),

  stories: (projects) =>
    projects.flatMap((p) =>
      p.stories.map((s) => ({
        id:             s.id,
        projeto_id:     p.id,
        sprint_id:      s.sprintId     || '',
        responsavel_id: s.assignee     || '',
        titulo:         s.title,
        descricao:      s.description  || '',
        estimativa:     s.hours        ?? null,
      }))
    ),

  okrs: (okrs) => okrs.map((o) => ({
    id:               o.id,
    tipo:             o.tipo,
    frente:           o.frente,
    titulo:           o.title,
    projeto_id:       o.projectId   || '',
    baseline:         o.baseline,
    moonshot:         o.moonshot,
    roofshot:         o.roofshot,
    atual:            o.atual,
    unidade:          o.unit,
    descricao:        o.description || '',
    lower_is_better:  o.lowerIsBetter ? 1 : 0,
  })),
};

// ═══════════════════════════════════════════════════════════════
// UI ATOMS (idênticos ao ControleDeJornada.jsx)
// ═══════════════════════════════════════════════════════════════
function Avatar({ name, avatarUrl, size = 36, ring = false }) {
  const [imgError, setImgError] = useState(false);
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const bg = avatarBg(name);

  // Converte caminho absoluto do sistema para URL file://
  const showImg = avatarUrl && !imgError;
  const src = showImg
    ? (avatarUrl.startsWith('file://') ? avatarUrl : `file://${avatarUrl.replace(/\\/g, '/')}`)
    : null;

  return (
    <div
      title={name}
      className={`rounded-full shrink-0 overflow-hidden flex items-center justify-center ${ring ? 'ring-2 ring-white' : ''}`}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-white font-semibold select-none" style={{ fontSize: size * 0.38 }}>
          {initials}
        </span>
      )}
    </div>
  );
}

function ProgressBar({ value, max, color = '#6366f1', h = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height: h }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all';
function Input({ label, ...p }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <input className={inputCls} {...p} />
    </div>
  );
}
function Textarea({ label, ...p }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <textarea className={`${inputCls} resize-none`} rows={3} {...p} />
    </div>
  );
}
function Sel({ label, children, ...p }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <select className={`${inputCls} bg-white`} {...p}>{children}</select>
    </div>
  );
}

function Btn({ children, variant = 'primary', className = '', ...p }) {
  const v = {
    primary:   'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm focus:ring-indigo-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400',
    danger:    'bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-400',
    ghost:     'text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:ring-gray-300',
    success:   'bg-green-600 text-white hover:bg-green-700 shadow-sm focus:ring-green-500',
  }[variant];
  return (
    <button className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${v} ${className}`} {...p}>
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = '#6366f1' }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-start gap-4">
      <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: color + '18' }}>
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
  if (!validSprints.length || !projects.filter(p => p.startDate && p.endDate).length) return null;

  const allDates = [...validSprints.map((s) => s.startDate), ...validSprints.map((s) => s.endDate)].sort();
  const releaseStart = new Date(allDates[0] + 'T00:00:00');
  const releaseEnd   = new Date(allDates[allDates.length - 1] + 'T00:00:00');
  const totalDays    = Math.max((releaseEnd - releaseStart) / 86400000, 1);

  const toLeft  = (d) => { if (!d) return 0; const diff = (new Date(d + 'T00:00:00') - releaseStart) / 86400000; return Math.max(0, Math.min(100, (diff / totalDays) * 100)); };
  const toWidth = (s, e) => Math.max(2, toLeft(e) - toLeft(s));

  const sprintBands = validSprints.map((s) => ({ ...s, left: toLeft(s.startDate), width: toWidth(s.startDate, s.endDate) }));

  const projectRows = projects.filter((p) => p.startDate && p.endDate).map((p) => {
    const assigneeIds = [...new Set(p.stories.map((s) => s.assignee).filter(Boolean))];
    const assignees   = assigneeIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
    return { ...p, left: toLeft(p.startDate), width: toWidth(p.startDate, p.endDate), assignees };
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <BarChart3 size={18} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-900">Linha do Tempo da Release</h3>
        <span className="text-xs text-gray-400 ml-1">— Gantt com alocação de membros</span>
      </div>
      <div className="p-6">
        {/* Sprint bands header */}
        <div className="flex items-center mb-2">
          <div className="w-44 shrink-0" />
          <div className="flex-1 relative h-8">
            {sprintBands.map((s) => {
              const st = SPRINT_STYLES[s.status];
              return (
                <div key={s.id} className={`absolute top-0 h-full rounded-md flex items-center justify-center border ${st.row}`}
                  style={{ left: `calc(${s.left}% + 2px)`, width: `calc(${s.width}% - 4px)` }}>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${st.badge}`}>{s.name}</span>
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
              <div key={s.id + '_d'} className="absolute text-xs text-gray-400" style={{ left: `${s.left}%` }}>{fmtDate(s.startDate)}</div>
            ))}
            <div className="absolute text-xs text-gray-400 right-0">{fmtDate(validSprints[validSprints.length - 1]?.endDate)}</div>
          </div>
        </div>
        {/* Project bars */}
        <div className="flex items-stretch">
          <div className="w-44 shrink-0" />
          <div className="flex-1 relative">
            {sprintBands.map((s) => (
              <div key={s.id + '_g'} className="absolute top-0 bottom-0 border-l border-dashed border-gray-200" style={{ left: `${s.left}%` }} />
            ))}
            <div className="space-y-3 py-1">
              {projectRows.map((p) => {
                const r = dorRisk(p);
                const borderColor = r === 'green' ? '#22c55e' : r === 'yellow' ? '#f59e0b' : r === 'red' ? '#ef4444' : '#d1d5db';
                return (
                  <div key={p.id} style={{ height: 44 }} className="relative">
                    <div className="absolute top-1 rounded-xl flex items-center px-3 gap-1.5 overflow-hidden"
                      style={{ left: `${p.left}%`, width: `${Math.max(p.width, 8)}%`, height: 36, backgroundColor: p.color + '22', border: `2px solid ${borderColor}` }}>
                      <div className="flex -space-x-1 shrink-0">
                        {p.assignees.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} avatarUrl={m.avatarUrl} size={22} ring />)}
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
        <div className="flex flex-wrap items-center gap-4 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <span className="font-medium">Risco DoR:</span>
          {[['#22c55e','DoR Completo'],['#f59e0b','Risco Médio'],['#ef4444','Alto Risco']].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5 text-gray-600">
              <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: c }} />{l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VIEWS (Dashboard, Sprints, Team, Projects)
// — Idênticas ao ControleDeJornada.jsx, sem alteração de lógica —
// ═══════════════════════════════════════════════════════════════

function DashboardView({ sprints, members, projects }) {
  const totalProjectHours = members.reduce((a, m) => a + m.hours.project, 0);
  const totalAssigned = useMemo(() => projects.reduce((a, p) => a + p.stories.reduce((b, s) => b + (s.hours ?? 0), 0), 0), [projects]);
  const totalStories  = projects.reduce((a, p) => a + p.stories.length, 0);
  const dorStories    = projects.reduce((a, p) => a + p.stories.filter((s) => s.hours).length, 0);
  const riskCount = { green: 0, yellow: 0, red: 0, none: 0 };
  projects.forEach((p) => riskCount[dorRisk(p)]++);
  const currentSprint = sprints.find((s) => s.status === 'atual');
  const closedSprints = sprints.filter((s) => s.status === 'encerrada').length;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Visão Geral da Release</h2>
        <p className="text-gray-500 text-sm mt-1">Acompanhe capacidade, risco DoR e progresso geral</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon={Calendar}    label="Sprint Atual"        value={currentSprint?.name ?? '–'} sub={`${closedSprints}/${sprints.length} encerradas`}         color="#6366f1" />
        <StatCard icon={Users}       label="Membros"             value={members.length}              sub={`${totalProjectHours}h de projeto`}                      color="#14b8a6" />
        <StatCard icon={TrendingUp}  label="Horas Alocadas"      value={`${totalAssigned}h`}         sub={`de ${totalProjectHours}h disponíveis`}                  color={totalAssigned > totalProjectHours ? '#ef4444' : '#f59e0b'} />
        <StatCard icon={CheckSquare} label="Histórias em DoR"    value={`${dorStories}/${totalStories}`} sub={`${totalStories - dorStories} aguardando refinamento`} color="#22c55e" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4"><Shield size={18} className="text-indigo-600" /><h3 className="font-semibold text-gray-900">Status de Risco (DoR)</h3></div>
          <div className="space-y-3">
            {[{key:'green',label:'DoR Completo',color:'#22c55e',bg:'bg-green-50'},{key:'yellow',label:'Risco Médio',color:'#f59e0b',bg:'bg-yellow-50'},{key:'red',label:'Alto Risco',color:'#ef4444',bg:'bg-red-50'}].map((r) => (
              <div key={r.key} className={`flex items-center justify-between rounded-xl px-4 py-3 ${r.bg}`}>
                <span className="text-sm font-medium" style={{color:r.color}}>{r.label}</span>
                <span className="text-2xl font-bold" style={{color:r.color}}>{riskCount[r.key]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-5"><Zap size={18} className="text-indigo-600" /><h3 className="font-semibold text-gray-900">Capacidade por Membro</h3></div>
          <div className="space-y-4">
            {members.map((m) => {
              const assigned = projects.reduce((a, p) => a + p.stories.filter((s) => s.assignee === m.id && s.hours).reduce((b, s) => b + s.hours, 0), 0);
              const over = assigned > m.hours.project;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5"><Avatar name={m.name} avatarUrl={m.avatarUrl} size={30} /><span className="text-sm font-medium text-gray-700">{m.name}</span></div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400">{assigned}h / {m.hours.project}h proj.</span>
                      <span className={`font-semibold ${over ? 'text-red-600' : 'text-green-600'}`}>{over ? `+${assigned - m.hours.project}h acima` : `${m.hours.project - assigned}h livres`}</span>
                    </div>
                  </div>
                  <ProgressBar value={assigned} max={m.hours.project} color={over ? '#ef4444' : '#6366f1'} h={6} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {projects.map((p) => {
          const r = dorRisk(p); const rs = RISK_STYLES[r];
          const dorCount = p.stories.filter((s) => s.hours).length;
          const totalH   = p.stories.reduce((a, s) => a + (s.hours ?? 0), 0);
          return (
            <div key={p.id} className={`bg-white rounded-2xl p-5 ${rs.card}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:p.color}}/><span className="font-semibold text-gray-900 text-sm">{p.name}</span></div>
                <span className={`text-xs px-2 py-1 rounded-lg font-medium ${rs.badge}`}><rs.icon size={11} className={`inline mr-1 ${rs.iconColor}`}/>{rs.label}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{dorCount}/{p.stories.length} em DoR · {totalH}h estimadas</p>
              <ProgressBar value={dorCount} max={p.stories.length} color={r==='green'?'#22c55e':r==='yellow'?'#f59e0b':'#ef4444'} h={5} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SprintsView({ sprints, setSprints, projects, setProjects, members }) {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ name: '', startDate: '', endDate: '', status: 'futura' });
  const [editId, setEditId] = useState(null);
  const [expanded, setExpanded] = useState({});

  const save = () => {
    if (!form.name.trim()) return;
    if (editId) { setSprints((p) => p.map((s) => s.id === editId ? { ...s, ...form } : s)); setEditId(null); }
    else        { setSprints((p) => [...p, { id: uid(), ...form }]); }
    setForm({ name: '', startDate: '', endDate: '', status: 'futura' });
    setModal(false);
  };

  const openEdit = (s) => { setEditId(s.id); setForm({ name: s.name, startDate: s.startDate, endDate: s.endDate, status: s.status }); setModal(true); };
  const remove   = (id) => setSprints((p) => p.filter((s) => s.id !== id));
  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // Reune todas as histórias de todos os projetos com info do projeto
  const allStories = useMemo(() =>
    projects.flatMap((p) => p.stories.map((s) => ({ ...s, projectName: p.name, projectColor: p.color, projectId: p.id }))),
    [projects]
  );

  // Move história para outra sprint
  const moveStory = (projectId, storyId, newSprintId) => {
    setProjects((ps) => ps.map((p) =>
      p.id === projectId
        ? { ...p, stories: p.stories.map((s) => s.id === storyId ? { ...s, sprintId: newSprintId } : s) }
        : p
    ));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sprints da Release</h2>
          <p className="text-gray-500 text-sm mt-1">Clique em uma sprint para ver e gerenciar suas histórias</p>
        </div>
        <Btn onClick={() => { setEditId(null); setForm({ name: `Sprint ${sprints.length + 1}`, startDate: '', endDate: '', status: 'futura' }); setModal(true); }}>
          <Plus size={16} /> Adicionar Sprint
        </Btn>
      </div>

      {/* Sprint summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {sprints.map((sp) => {
          const count = allStories.filter((s) => s.sprintId === sp.id).length;
          const dor   = allStories.filter((s) => s.sprintId === sp.id && s.hours).length;
          const st    = SPRINT_STYLES[sp.status];
          return (
            <div key={sp.id} className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${expanded[sp.id] ? 'ring-2 ring-indigo-500' : ''} ${st.row}`}
              onClick={() => toggleExpand(sp.id)}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-800 text-sm">{sp.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{sp.status}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><BookOpen size={11}/>{count} histórias</span>
                <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-500"/>{dor} DoR</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        {sprints.map((s, i) => {
          const st = SPRINT_STYLES[s.status];
          const days = s.startDate && s.endDate ? Math.ceil(dateDiff(s.startDate, s.endDate)) : null;
          const sprintStories = allStories.filter((st2) => st2.sprintId === s.id);
          const isOpen = expanded[s.id];

          return (
            <div key={s.id} className={`rounded-2xl border overflow-hidden ${st.row}`}>
              {/* Sprint header */}
              <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${s.status==='atual'?'bg-indigo-600':s.status==='encerrada'?'bg-gray-400':'bg-violet-500'}`}>{i+1}</div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-gray-900">{s.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${st.dot}`}/>
                        {s.status.charAt(0).toUpperCase()+s.status.slice(1)}
                      </span>
                      {sprintStories.length > 0 && (
                        <span className="text-xs bg-white/70 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                          {sprintStories.length} história{sprintStories.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {fmtDate(s.startDate)} → {fmtDate(s.endDate)}
                      {days !== null && <span className="ml-2 text-gray-400">({days} dias)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => toggleExpand(s.id)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 bg-white/60 px-3 py-1.5 rounded-lg border border-gray-200 transition-all"
                  >
                    <BookOpen size={13}/>
                    {isOpen ? 'Ocultar histórias' : 'Ver histórias'}
                    {isOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                  </button>
                  <Btn variant="ghost" onClick={() => openEdit(s)}><Edit3 size={15} /></Btn>
                  <Btn variant="danger" onClick={() => remove(s.id)}><Trash2 size={15} /></Btn>
                </div>
              </div>

              {/* Sprint stories panel */}
              {isOpen && (
                <div className="border-t border-gray-200/60 bg-white/60 divide-y divide-gray-100">
                  {sprintStories.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">Nenhuma história vinculada a esta sprint</p>
                  ) : (
                    sprintStories.map((story) => {
                      const assigneeMember = members.find((m) => m.id === story.assignee);
                      const isDor = !!story.hours;
                      const proj = projects.find((p) => p.id === story.projectId);
                      return (
                        <div key={story.id} className="flex items-center gap-3 px-5 py-3">
                          {isDor
                            ? <CheckCircle2 size={15} className="text-green-500 shrink-0"/>
                            : <AlertCircle  size={15} className="text-red-400 shrink-0"/>
                          }
                          {/* Project color dot */}
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: story.projectColor }}/>
                          <span className="text-sm text-gray-700 flex-1">{story.title}</span>
                          {/* Project chip */}
                          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 shrink-0 hidden md:inline">
                            {story.projectName}
                          </span>
                          {/* Hours */}
                          {story.hours && <span className="text-xs font-medium text-indigo-600 shrink-0">{story.hours}h</span>}
                          {/* Assignee */}
                          {assigneeMember && <Avatar name={assigneeMember.name} avatarUrl={assigneeMember.avatarUrl} size={24}/>}
                          {/* Move to sprint */}
                          <div className="shrink-0">
                            <select
                              value={story.sprintId}
                              onChange={(e) => moveStory(story.projectId, story.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              title="Mover para outra sprint (tombamento)"
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-600"
                            >
                              <option value="">Sem sprint</option>
                              {sprints.map((sp2) => (
                                <option key={sp2.id} value={sp2.id}>{sp2.name}</option>
                              ))}
                            </select>
                          </div>
                          {!isDor && (
                            <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-md font-medium shrink-0">
                              Não DoR
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Sprint' : 'Nova Sprint'}>
        <Input label="Nome" value={form.name} onChange={(e) => setForm((f) => ({...f, name: e.target.value}))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Início" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({...f, startDate: e.target.value}))} />
          <Input label="Fim"    type="date" value={form.endDate}   onChange={(e) => setForm((f) => ({...f, endDate: e.target.value}))} />
        </div>
        <Sel label="Status" value={form.status} onChange={(e) => setForm((f) => ({...f, status: e.target.value}))}>
          <option value="futura">Futura</option><option value="atual">Atual</option><option value="encerrada">Encerrada</option>
        </Sel>
        <Btn className="w-full justify-center mt-1" onClick={save}>{editId ? 'Salvar' : 'Adicionar Sprint'}</Btn>
      </Modal>
    </div>
  );
}

function TeamView({ members, setMembers, projects, sprints, filePath }) {
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', avatarUrl: '', hours: { vacation: 0, project: 70, ceremonies: 20 } });

  const save = () => {
    if (!form.name.trim()) return;
    if (editId) { setMembers((p) => p.map((m) => m.id === editId ? { ...m, ...form } : m)); setEditId(null); }
    else        { setMembers((p) => [...p, { id: uid(), avatarUrl: '', ...form }]); }
    setForm({ name: '', avatarUrl: '', hours: { vacation: 0, project: 70, ceremonies: 20 } });
    setModal(false);
  };

  const openEdit = (m) => {
    setEditId(m.id);
    setForm({ name: m.name, avatarUrl: m.avatarUrl || '', hours: { ...m.hours } });
    setModal(true);
  };
  const remove = (id) => setMembers((p) => p.filter((m) => m.id !== id));
  const hf = (key, val) => setForm((f) => ({ ...f, hours: { ...f.hours, [key]: Number(val) || 0 } }));

  const handleSelectAvatar = async () => {
    if (!filePath) return;
    const result = await api.selectAvatar(filePath);
    if (result && !result.error) {
      setForm((f) => ({ ...f, avatarUrl: result }));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div><h2 className="text-2xl font-bold text-gray-900">Equipe</h2><p className="text-gray-500 text-sm mt-1">Gerencie capacidade com férias, projeto e cerimônias</p></div>
        <Btn onClick={() => { setEditId(null); setForm({ name: '', hours: { vacation: 0, project: 70, ceremonies: 20 } }); setModal(true); }}><Plus size={16} /> Novo Membro</Btn>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {members.map((m) => {
          const total    = m.hours.vacation + m.hours.project + m.hours.ceremonies;
          const assigned = projects.reduce((a, p) => a + p.stories.filter((s) => s.assignee === m.id && s.hours).reduce((b, s) => b + s.hours, 0), 0);
          const remaining = m.hours.project - assigned;
          const over = remaining < 0;
          const assignedStories = projects.flatMap((p) =>
            p.stories.filter((s) => s.assignee === m.id)
              .map((s) => ({ ...s, projectName: p.name, projectColor: p.color }))
          );
          // Agrupa histórias por sprint
          const storiesBySprint = sprints.map((sp) => ({
            sprint: sp,
            stories: assignedStories.filter((s) => s.sprintId === sp.id),
            hours: assignedStories.filter((s) => s.sprintId === sp.id && s.hours).reduce((a, s) => a + s.hours, 0),
          }));
          const withoutSprint = assignedStories.filter((s) => !s.sprintId);

          return (
            <div key={m.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={48} />
                  <div>
                    <p className="font-semibold text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400">{total}h totais · {assigned}h alocadas</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Btn variant="ghost" onClick={() => openEdit(m)}><Edit3 size={15} /></Btn>
                  <Btn variant="danger" onClick={() => remove(m.id)}><Trash2 size={15} /></Btn>
                </div>
              </div>

              {/* Hours bars */}
              <div className="space-y-3 mb-5">
                {[{key:'vacation',label:'Férias',color:'#f59e0b',icon:Umbrella,bg:'bg-amber-50 text-amber-700'},
                  {key:'project',label:'Horas de Projeto',color:'#6366f1',icon:Code2,bg:'bg-indigo-50 text-indigo-700'},
                  {key:'ceremonies',label:'Colaboração / Cerimônias',color:'#14b8a6',icon:Coffee,bg:'bg-teal-50 text-teal-700'}].map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${c.bg}`}><c.icon size={11}/>{c.label}</span>
                      <span className="text-xs font-semibold text-gray-600">{m.hours[c.key]}h</span>
                    </div>
                    <ProgressBar value={m.hours[c.key]} max={total} color={c.color} h={5} />
                  </div>
                ))}
              </div>

              {/* Allocation bar */}
              <div className={`rounded-xl p-4 mb-4 ${over ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-600">Projeto: alocado vs disponível</span>
                  <span className={`text-xs font-bold ${over ? 'text-red-600' : 'text-green-600'}`}>
                    {over ? `${Math.abs(remaining)}h acima` : `${remaining}h livres`}
                  </span>
                </div>
                <ProgressBar value={assigned} max={m.hours.project} color={over ? '#ef4444' : '#6366f1'} h={7} />
                <p className="text-xs text-gray-400 mt-1.5">{assigned}h de {m.hours.project}h de projeto</p>
              </div>

              {/* Histórias agrupadas por sprint */}
              {assignedStories.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Histórias por Sprint</p>
                  <div className="space-y-2">
                    {storiesBySprint.filter((g) => g.stories.length > 0).map(({ sprint, stories: gs, hours: gh }) => {
                      const st = SPRINT_STYLES[sprint.status];
                      return (
                        <div key={sprint.id} className={`rounded-xl border overflow-hidden ${st.row}`}>
                          {/* Sprint label row */}
                          <div className="flex items-center justify-between px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${st.dot}`}/>
                              <span className="text-xs font-semibold text-gray-700">{sprint.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${st.badge}`}>{sprint.status}</span>
                            </div>
                            <span className="text-xs font-bold text-indigo-600">{gh}h</span>
                          </div>
                          {/* Stories */}
                          <div className="divide-y divide-gray-100/60">
                            {gs.map((s) => (
                              <div key={s.id} className="flex items-center gap-2 bg-white/70 px-3 py-2">
                                {s.hours
                                  ? <CheckCircle2 size={12} className="text-green-500 shrink-0"/>
                                  : <AlertCircle  size={12} className="text-red-400 shrink-0"/>
                                }
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.projectColor }}/>
                                <span className="text-xs text-gray-600 flex-1 truncate">{s.title}</span>
                                <span className="text-xs text-gray-400 shrink-0">{s.projectName}</span>
                                <span className={`text-xs font-medium shrink-0 ${s.hours ? 'text-indigo-600' : 'text-red-400'}`}>
                                  {s.hours ? `${s.hours}h` : 'Sem est.'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {withoutSprint.length > 0 && (
                      <div className="rounded-xl border border-dashed border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50">
                          <span className="text-xs font-semibold text-gray-400">Sem sprint definida</span>
                          <span className="text-xs text-gray-400">{withoutSprint.length} hist.</span>
                        </div>
                        {withoutSprint.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 bg-white px-3 py-2 border-t border-gray-100">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.projectColor }}/>
                            <span className="text-xs text-gray-500 flex-1 truncate">{s.title}</span>
                            <span className={`text-xs font-medium ${s.hours ? 'text-indigo-600' : 'text-red-400'}`}>
                              {s.hours ? `${s.hours}h` : 'Sem est.'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Membro' : 'Novo Membro'}>
        <Input label="Nome completo" value={form.name} onChange={(e) => setForm((f) => ({...f, name: e.target.value}))} />

        {/* ── Foto de perfil ── */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Foto de perfil</label>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="shrink-0">
              {form.name
                ? <Avatar name={form.name} avatarUrl={form.avatarUrl} size={56} />
                : <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><UserCircle size={28} className="text-gray-400" /></div>
              }
            </div>
            <div className="flex flex-col gap-2">
              <Btn variant="secondary" type="button" onClick={handleSelectAvatar}>
                <Upload size={14} />
                {form.avatarUrl ? 'Trocar foto' : 'Selecionar foto'}
              </Btn>
              {form.avatarUrl && (
                <button
                  onClick={() => setForm((f) => ({ ...f, avatarUrl: '' }))}
                  className="text-xs text-red-400 hover:text-red-600 text-left transition-colors"
                >
                  Remover foto
                </button>
              )}
              <p className="text-xs text-gray-400">JPG, PNG ou WEBP</p>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium text-gray-700 mb-3">Distribuição de horas na sprint</p>
        <div className="grid grid-cols-3 gap-3">
          {[{key:'vacation',label:'Férias'},{key:'project',label:'Projeto'},{key:'ceremonies',label:'Cerimônias'}].map((f) => (
            <div key={f.key}><label className="block text-xs text-gray-500 mb-1">{f.label} (h)</label><input className={inputCls} type="number" value={form.hours[f.key]} onChange={(e) => hf(f.key, e.target.value)}/></div>
          ))}
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 my-3 text-xs text-indigo-600">Total: {form.hours.vacation + form.hours.project + form.hours.ceremonies}h nesta sprint</div>
        <Btn className="w-full justify-center" onClick={save}>{editId ? 'Salvar' : 'Adicionar'}</Btn>
      </Modal>
    </div>
  );
}

function ProjectsView({ projects, setProjects, members, sprints }) {
  const [projModal, setProjModal]   = useState(false);
  const [storyModal, setStoryModal] = useState(null);
  const [editProjId, setEditProjId] = useState(null);
  const [pf, setPf] = useState({ name: '', color: '#6366f1', startDate: '', endDate: '' });
  const [sf, setSf] = useState({ title: '', assignee: '', hours: '', description: '', sprintId: '' });
  const [expandedStories, setExpandedStories] = useState({});

  const saveProject = () => {
    if (!pf.name.trim()) return;
    if (editProjId) { setProjects((p) => p.map((x) => x.id === editProjId ? { ...x, ...pf } : x)); setEditProjId(null); }
    else            { setProjects((p) => [...p, { id: uid(), ...pf, stories: [] }]); }
    setPf({ name: '', color: '#6366f1', startDate: '', endDate: '' }); setProjModal(false);
  };

  const saveStory = () => {
    if (!sf.title.trim()) return;
    setProjects((p) => p.map((x) => x.id === storyModal
      ? { ...x, stories: [...x.stories, { id: uid(), title: sf.title, assignee: sf.assignee, hours: sf.hours ? Number(sf.hours) : null, description: sf.description, sprintId: sf.sprintId || '' }] }
      : x));
    setSf({ title: '', assignee: '', hours: '', description: '', sprintId: '' }); setStoryModal(null);
  };

  const removeProject    = (id) => setProjects((p) => p.filter((x) => x.id !== id));
  const removeStory      = (pid, sid) => setProjects((p) => p.map((x) => x.id === pid ? { ...x, stories: x.stories.filter((s) => s.id !== sid) } : x));
  const updateAssignee   = (pid, sid, val) => setProjects((p) => p.map((x) => x.id === pid ? { ...x, stories: x.stories.map((s) => s.id === sid ? { ...s, assignee: val } : s) } : x));
  const updateHours      = (pid, sid, val) => setProjects((p) => p.map((x) => x.id === pid ? { ...x, stories: x.stories.map((s) => s.id === sid ? { ...s, hours: val ? Number(val) : null } : s) } : x));
  const updateStorySprint= (pid, sid, val) => setProjects((p) => p.map((x) => x.id === pid ? { ...x, stories: x.stories.map((s) => s.id === sid ? { ...s, sprintId: val } : s) } : x));
  const toggleStory      = (id) => setExpandedStories((p) => ({ ...p, [id]: !p[id] }));

  const COLORS = ['#6366f1','#f59e0b','#ec4899','#14b8a6','#8b5cf6','#ef4444','#3b82f6','#22c55e'];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div><h2 className="text-2xl font-bold text-gray-900">Projetos da Release</h2><p className="text-gray-500 text-sm mt-1">A borda colorida indica o nível de risco do DoR</p></div>
        <Btn onClick={() => { setEditProjId(null); setPf({ name: '', color: '#6366f1', startDate: '', endDate: '' }); setProjModal(true); }}><Plus size={16}/> Novo Projeto</Btn>
      </div>
      <div className="space-y-6">
        {projects.map((p) => {
          const r = dorRisk(p); const rs = RISK_STYLES[r];
          const totalH   = p.stories.reduce((a, s) => a + (s.hours ?? 0), 0);
          const dorCount = p.stories.filter((s) => s.hours).length;
          return (
            <div key={p.id} className={`bg-white rounded-2xl overflow-hidden ${rs.card}`}>
              <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{backgroundColor:p.color}}/>
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium ${rs.badge}`}><rs.icon size={11} className={rs.iconColor}/>{rs.label}</span>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">{dorCount}/{p.stories.length} DoR · {totalH}h</span>
                </div>
                <div className="flex items-center gap-2">
                  {p.startDate && <span className="text-xs text-gray-400"><Calendar size={12} className="inline mr-1"/>{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</span>}
                  <Btn variant="secondary" onClick={() => { setSf({ title:'',assignee:'',hours:'',description:'' }); setStoryModal(p.id); }}><Plus size={15}/>História</Btn>
                  <Btn variant="ghost" onClick={() => { setEditProjId(p.id); setPf({ name: p.name, color: p.color, startDate: p.startDate, endDate: p.endDate }); setProjModal(true); }}><Edit3 size={15}/></Btn>
                  <Btn variant="danger" onClick={() => removeProject(p.id)}><Trash2 size={15}/></Btn>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {p.stories.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nenhuma história cadastrada</p>}
                {p.stories.map((s) => {
                  const isDor = !!s.hours;
                  const assigneeMember = members.find((m) => m.id === s.assignee);
                  const isExpanded = expandedStories[s.id];
                  return (
                    <div key={s.id} className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div title={isDor ? 'Em DoR' : 'Sem estimativa – não está em DoR'}>
                          {isDor ? <CheckCircle2 size={18} className="text-green-500 shrink-0"/> : <AlertCircle size={18} className="text-red-400 shrink-0"/>}
                        </div>
                        <button className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors text-left flex-1" onClick={() => toggleStory(s.id)}>
                          {s.title}
                          {(s.description || true) && (isExpanded ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>)}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <input type="number" value={s.hours ?? ''} placeholder="horas?" onChange={(e) => updateHours(p.id, s.id, e.target.value)}
                            className="w-20 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
                          <span className="text-xs text-gray-400">h</span>
                        </div>
                        <select value={s.assignee} onChange={(e) => updateAssignee(p.id, s.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[130px]">
                          <option value="">Sem responsável</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        {assigneeMember && <Avatar name={assigneeMember.name} avatarUrl={assigneeMember.avatarUrl} size={26}/>}
                        {/* Sprint selector inline */}
                        <select value={s.sprintId || ''} onChange={(e) => updateStorySprint(p.id, s.id, e.target.value)}
                          title="Sprint desta história"
                          className="text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[90px]">
                          <option value="">Sem sprint</option>
                          {sprints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                        </select>
                        {!isDor && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-md font-medium whitespace-nowrap">Não DoR</span>}
                        <button onClick={() => removeStory(p.id, s.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-1"><Trash2 size={15}/></button>
                      </div>
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
      <GanttTimeline projects={projects} members={members} sprints={sprints} />
      {/* Project modal */}
      <Modal open={projModal} onClose={() => setProjModal(false)} title={editProjId ? 'Editar Projeto' : 'Novo Projeto'}>
        <Input label="Nome" value={pf.name} onChange={(e) => setPf((f) => ({...f, name: e.target.value}))}/>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data de início" type="date" value={pf.startDate} onChange={(e) => setPf((f) => ({...f, startDate: e.target.value}))}/>
          <Input label="Data de fim"    type="date" value={pf.endDate}   onChange={(e) => setPf((f) => ({...f, endDate: e.target.value}))}/>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
          <div className="flex flex-wrap gap-2">{COLORS.map((c) => (
            <button key={c} onClick={() => setPf((f) => ({...f, color: c}))}
              className={`w-8 h-8 rounded-lg transition-all ${pf.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`} style={{backgroundColor:c}}/>
          ))}</div>
        </div>
        <Btn className="w-full justify-center" onClick={saveProject}>{editProjId ? 'Salvar' : 'Criar Projeto'}</Btn>
      </Modal>
      {/* Story modal */}
      <Modal open={!!storyModal} onClose={() => setStoryModal(null)} title="Nova História">
        <Input label="Título" value={sf.title} onChange={(e) => setSf((f) => ({...f, title: e.target.value}))}/>
        <Input label={<span>Estimativa de horas <span className="text-gray-400 font-normal">(opcional — obrigatório para DoR)</span></span>}
          type="number" value={sf.hours} onChange={(e) => setSf((f) => ({...f, hours: e.target.value}))}/>
        {!sf.hours && (
          <div className="bg-red-50 rounded-xl p-3 -mt-1 mb-3 flex items-center gap-2 text-xs text-red-600">
            <AlertCircle size={13}/> Sem estimativa → história não estará em DoR
          </div>
        )}
        <Sel label="Sprint" value={sf.sprintId} onChange={(e) => setSf((f) => ({...f, sprintId: e.target.value}))}>
          <option value="">Sem sprint definida</option>
          {sprints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
        </Sel>
        <Sel label="Responsável" value={sf.assignee} onChange={(e) => setSf((f) => ({...f, assignee: e.target.value}))}>
          <option value="">Sem responsável</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Sel>
        <Textarea label="Descrição (oculta por padrão)" value={sf.description} onChange={(e) => setSf((f) => ({...f, description: e.target.value}))}/>
        <Btn className="w-full justify-center" onClick={saveStory}>Adicionar História</Btn>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OKRs / KPIs VIEW
// ═══════════════════════════════════════════════════════════════
const FRENTES = [
  { id: 'modernizacao',   label: 'Modernização',  color: '#6366f1', icon: Cpu      },
  { id: 'experiencia',    label: 'Experiência',   color: '#ec4899', icon: Smile    },
  { id: 'eficiencia',     label: 'Eficiência',    color: '#14b8a6', icon: Zap      },
  { id: 'dados_analytics',label: 'D&A',           color: '#f59e0b', icon: PieChart },
  { id: 'atendimento',    label: 'Atendimento',   color: '#3b82f6', icon: Headphones},
];

function OkrProgressBar({ baseline, moonshot, roofshot, atual, unit, lowerIsBetter }) {
  // Normaliza para uma escala 0-100 onde 100 = roofshot
  const min = lowerIsBetter ? roofshot : baseline;
  const max = lowerIsBetter ? baseline : roofshot;
  const range = max - min || 1;
  const pctAtual    = Math.min(100, Math.max(0, ((atual - min) / range) * 100));
  const pctMoonshot = Math.min(100, Math.max(0, ((moonshot - min) / range) * 100));

  const atualColor = lowerIsBetter
    ? (atual <= moonshot ? '#22c55e' : atual <= baseline ? '#f59e0b' : '#ef4444')
    : (atual >= moonshot ? '#22c55e' : atual >= baseline ? '#f59e0b' : '#ef4444');

  return (
    <div className="mt-3">
      {/* Track — overflow hidden para não vazar o fill */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        {/* Fill */}
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pctAtual}%`, backgroundColor: atualColor }}/>
      </div>
      {/* Moonshot marker line (fora do overflow hidden) */}
      <div className="relative h-0">
        <div className="absolute w-0.5 bg-violet-400 z-10"
          style={{ left: `${pctMoonshot}%`, top: '-12px', height: '12px' }}/>
        {/* Atual bubble */}
        <div className="absolute w-4 h-4 rounded-full border-2 border-white shadow z-20 -translate-x-1/2"
          style={{ left: `${pctAtual}%`, top: '-20px', backgroundColor: atualColor }}/>
      </div>
      {/* Labels */}
      <div className="flex justify-between text-xs text-gray-400 mt-3">
        <span>Base: {baseline}{unit}</span>
        <span className="text-violet-500 font-medium">Meta: {moonshot}{unit}</span>
        <span className="font-semibold" style={{ color: atualColor }}>Atual: {atual}{unit}</span>
        <span>Roof: {roofshot}{unit}</span>
      </div>
    </div>
  );
}

function OkrCard({ okr, projects, onEdit, onDelete }) {
  const frente = FRENTES.find((f) => f.id === okr.frente) || { label: okr.frente, color: '#6b7280', icon: Target };
  const FrenteIcon = frente.icon;
  const project = projects.find((p) => p.id === okr.projectId);
  const isKR = okr.tipo === 'KR';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Top accent */}
      <div className="h-1" style={{ backgroundColor: frente.color }}/>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${isKR ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'}`}>
              {isKR ? 'KR' : 'KPI'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium"
              style={{ backgroundColor: frente.color + '18', color: frente.color }}>
              <FrenteIcon size={11}/>{frente.label}
            </span>
            {project && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-gray-50 text-gray-500 border border-gray-100">
                <div className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ backgroundColor: project.color }}/>
                {project.name}
              </span>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={onEdit} className="text-gray-300 hover:text-indigo-500 transition-colors"><Edit3 size={14}/></button>
            <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
          </div>
        </div>
        {/* Title */}
        <h4 className="font-semibold text-gray-900 text-sm leading-snug mb-1">{okr.title}</h4>
        {okr.description && <p className="text-xs text-gray-400 mb-3 line-clamp-2">{okr.description}</p>}
        {/* Moonshot / Roofshot targets */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: 'Baseline',  val: okr.baseline,  bg: 'bg-gray-50',    txt: 'text-gray-600'  },
            { label: 'Moonshot',  val: okr.moonshot,  bg: 'bg-violet-50',  txt: 'text-violet-700'},
            { label: 'Roofshot',  val: okr.roofshot,  bg: 'bg-emerald-50', txt: 'text-emerald-700'},
          ].map(({ label, val, bg, txt }) => (
            <div key={label} className={`${bg} rounded-xl p-2 text-center`}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className={`text-sm font-bold ${txt}`}>{val}{okr.unit}</p>
            </div>
          ))}
        </div>
        <OkrProgressBar {...okr}/>
      </div>
    </div>
  );
}

function OKRsView({ okrs, setOkrs, projects }) {
  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterFrente, setFilterFrente] = useState('all');
  const [filterTipo,   setFilterTipo]   = useState('all');
  const emptyForm = { tipo: 'KR', frente: 'modernizacao', title: '', projectId: '', baseline: 0, moonshot: 0, roofshot: 0, atual: 0, unit: '%', description: '', lowerIsBetter: false };
  const [form, setForm] = useState(emptyForm);
  const ff = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const openNew  = () => { setEditId(null); setForm(emptyForm); setModal(true); };
  const openEdit = (okr) => {
    setEditId(okr.id);
    setForm({ tipo: okr.tipo, frente: okr.frente, title: okr.title, projectId: okr.projectId, baseline: okr.baseline, moonshot: okr.moonshot, roofshot: okr.roofshot, atual: okr.atual, unit: okr.unit, description: okr.description, lowerIsBetter: okr.lowerIsBetter });
    setModal(true);
  };
  const save = () => {
    if (!form.title.trim()) return;
    if (editId) { setOkrs((o) => o.map((x) => x.id === editId ? { ...x, ...form } : x)); setEditId(null); }
    else        { setOkrs((o) => [...o, { id: uid(), ...form }]); }
    setModal(false);
  };
  const remove = (id) => setOkrs((o) => o.filter((x) => x.id !== id));

  const filtered = okrs.filter((o) =>
    (filterFrente === 'all' || o.frente === filterFrente) &&
    (filterTipo   === 'all' || o.tipo   === filterTipo)
  );

  // Stats
  const krCount  = okrs.filter((o) => o.tipo === 'KR').length;
  const kpiCount = okrs.filter((o) => o.tipo === 'KPI').length;
  const onTrack  = okrs.filter((o) => {
    const pct = o.roofshot !== o.baseline ? Math.abs((o.atual - o.baseline) / (o.roofshot - o.baseline)) : 0;
    return pct >= 0.5;
  }).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">OKRs & KPIs da Release</h2>
          <p className="text-gray-500 text-sm mt-1">Acompanhe Key Results e indicadores por frente estratégica</p>
        </div>
        <Btn onClick={openNew}><Plus size={16}/> Novo OKR / KPI</Btn>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Target}       label="Total OKRs/KPIs"  value={okrs.length}   sub={`${krCount} KRs · ${kpiCount} KPIs`}      color="#6366f1"/>
        <StatCard icon={TrendingUp}   label="No Caminho"        value={onTrack}       sub={`de ${okrs.length} indicadores`}            color="#22c55e"/>
        <StatCard icon={Star}         label="Frentes Ativas"   value={[...new Set(okrs.map((o) => o.frente))].length} sub="frentes cobertas"  color="#f59e0b"/>
        <StatCard icon={FolderKanban} label="Projetos com OKR" value={[...new Set(okrs.map((o) => o.projectId).filter(Boolean))].length} sub="projetos vinculados" color="#14b8a6"/>
      </div>

      {/* Frente pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilterFrente('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${filterFrente === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
          Todas as frentes
        </button>
        {FRENTES.map((f) => {
          const FIcon = f.icon;
          const active = filterFrente === f.id;
          return (
            <button key={f.id} onClick={() => setFilterFrente(active ? 'all' : f.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border"
              style={active ? { backgroundColor: f.color, color: '#fff', borderColor: f.color } : { backgroundColor: f.color + '18', color: f.color, borderColor: f.color + '44' }}>
              <FIcon size={11}/>{f.label}
            </button>
          );
        })}
        <div className="ml-auto flex gap-2">
          {['all','KR','KPI'].map((t) => (
            <button key={t} onClick={() => setFilterTipo(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${filterTipo === t ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'}`}>
              {t === 'all' ? 'KR + KPI' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of OKR cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Target size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="font-medium">Nenhum OKR/KPI cadastrado</p>
          <p className="text-sm mt-1">Clique em "Novo OKR / KPI" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((okr) => (
            <OkrCard key={okr.id} okr={okr} projects={projects}
              onEdit={() => openEdit(okr)}
              onDelete={() => remove(okr.id)}/>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar OKR / KPI' : 'Novo OKR / KPI'}>
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Tipo" value={form.tipo} onChange={(e) => ff('tipo', e.target.value)}>
            <option value="KR">KR — Key Result</option>
            <option value="KPI">KPI — Indicador</option>
          </Sel>
          <Sel label="Frente" value={form.frente} onChange={(e) => ff('frente', e.target.value)}>
            {FRENTES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Sel>
        </div>
        <Input label="Título" value={form.title} onChange={(e) => ff('title', e.target.value)}/>
        <Sel label="Projeto vinculado" value={form.projectId} onChange={(e) => ff('projectId', e.target.value)}>
          <option value="">Sem projeto vinculado</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Sel>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Unidade (%,pts,min…)" value={form.unit} onChange={(e) => ff('unit', e.target.value)}/>
          <div className="mb-4 flex items-center gap-2 pt-7">
            <input type="checkbox" id="lib" checked={form.lowerIsBetter}
              onChange={(e) => ff('lowerIsBetter', e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600"/>
            <label htmlFor="lib" className="text-sm text-gray-700">Menor é melhor</label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Baseline (ponto de partida)" type="number" value={form.baseline} onChange={(e) => ff('baseline', Number(e.target.value))}/>
          <Input label="Atual" type="number" value={form.atual} onChange={(e) => ff('atual', Number(e.target.value))}/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input label="Moonshot (meta ambiciosa)" type="number" value={form.moonshot} onChange={(e) => ff('moonshot', Number(e.target.value))}/>
            <p className="text-xs text-violet-500 -mt-2 mb-2">Marcado na barra de progresso</p>
          </div>
          <div>
            <Input label="Roofshot (teto/máximo)" type="number" value={form.roofshot} onChange={(e) => ff('roofshot', Number(e.target.value))}/>
            <p className="text-xs text-emerald-500 -mt-2 mb-2">Extremo da escala</p>
          </div>
        </div>
        <Textarea label="Descrição" value={form.description} onChange={(e) => ff('description', e.target.value)}/>
        <Btn className="w-full justify-center" onClick={save}>{editId ? 'Salvar' : 'Adicionar OKR / KPI'}</Btn>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FILE PICKER SCREEN
// Exibida quando nenhum arquivo está carregado
// ═══════════════════════════════════════════════════════════════
function FilePickerScreen({ onOpenFile, onNewFile, onNewFileWithDemo, error, isElectron, squadName, onSquadNameChange }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        {/* Logo */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Layers size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Controle de</h1>
            <h1 className="text-2xl font-bold text-indigo-600 leading-tight">Jornada</h1>
          </div>
        </div>

        {/* Squad name input */}
        <div className="mb-7">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nome da Squad <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={squadName}
            onChange={(e) => onSquadNameChange(e.target.value)}
            placeholder="Ex: Squad Pagamentos, Time Plataforma..."
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm text-gray-800 placeholder-gray-300 bg-white"
          />
          <p className="text-xs text-gray-400 mt-1.5">Aparecerá no menu lateral no lugar de "Controle de Jornada"</p>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">Selecione sua Base de Dados</h2>
        <p className="text-gray-500 mb-8 text-sm">
          Todos os dados são armazenados em um arquivo Excel (.xlsx) local — sem servidor, sem nuvem, 100% seu.
        </p>

        {!isElectron && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>Modo navegador detectado.</strong> Para persistência real no Excel, rode a aplicação via Electron.
              Neste modo, os dados ficam apenas em memória.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={onOpenFile}
            className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-gray-200 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
              <FolderOpen size={22} className="text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Abrir arquivo existente</p>
              <p className="text-sm text-gray-400">Carrega um .xlsx já preenchido anteriormente</p>
            </div>
          </button>

          <button
            onClick={onNewFileWithDemo}
            className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-gray-200 hover:border-green-400 hover:shadow-md hover:shadow-green-100 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
              <Database size={22} className="text-green-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Criar arquivo com dados de exemplo</p>
              <p className="text-sm text-gray-400">Inicia com sprints, equipe e projetos demo para ver tudo funcionando</p>
            </div>
          </button>

          <button
            onClick={onNewFile}
            className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-gray-200 hover:border-violet-400 hover:shadow-md hover:shadow-violet-100 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
              <FilePlus2 size={22} className="text-violet-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Criar arquivo em branco</p>
              <p className="text-sm text-gray-400">Gera o template vazio com as abas e colunas corretas</p>
            </div>
          </button>
        </div>

        {error && (
          <div className="mt-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-8 text-center">
          <HardDrive size={12} className="inline mr-1" />
          Os dados são salvos automaticamente no arquivo Excel a cada alteração
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sprints',   label: 'Sprints',   icon: Calendar        },
  { id: 'team',      label: 'Equipe',    icon: Users           },
  { id: 'projects',  label: 'Projetos',  icon: FolderKanban    },
  { id: 'okrs',      label: 'OKRs & KPIs', icon: Target        },
];

export default function App() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  // ── File & load state ──────────────────────────────────────
  const [filePath, setFilePath] = useState(() => {
    try { return localStorage.getItem('cj_filePath') || null; } catch { return null; }
  });
  const [squadName, setSquadName] = useState(() => {
    try { return localStorage.getItem('cj_squadName') || ''; } catch { return ''; }
  });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError,  setLoadError]  = useState(null);
  const [isSaving,   setIsSaving]   = useState(false);
  const [lastSaved,  setLastSaved]  = useState(null);

  // ── App data state ─────────────────────────────────────────
  const [tab,      setTab]      = useState('dashboard');
  const [sprints,  setSprints]  = useState([]);
  const [members,  setMembers]  = useState([]);
  const [projects, setProjects] = useState([]);
  const [okrs,     setOkrs]     = useState([]);

  // ── Load data from Excel ────────────────────────────────────
  const loadFromFile = useCallback(async (path) => {
    setLoadError(null);
    setDataLoaded(false);
    try {
      const data = await api.loadData(path);
      if (data.error && !data.sprints) {
        // Hard error (file not found, etc.)
        setLoadError(data.error);
        return;
      }
      // Soft warning (e.g. no Electron) — still proceed
      if (data.error) setLoadError(data.error);

      setSprints(fromExcel.sprints(data.sprints    || []));
      setMembers(fromExcel.members(data.equipe     || []));
      setProjects(fromExcel.projects(data.projetos || [], data.historias || []));
      setOkrs(fromExcel.okrs(data.okrs             || []));
      setFilePath(path);
      try { localStorage.setItem('cj_filePath', path); } catch {}
      // Mark as loaded AFTER all state is set (React 18 batches these)
      setDataLoaded(true);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  // ── Auto-load on first render (remembered path) ─────────────
  useEffect(() => {
    if (filePath && !dataLoaded) {
      loadFromFile(filePath);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save helpers ───────────────────────────────────────
  const save = useCallback(async (sheetName, data) => {
    if (!filePath) return;
    setIsSaving(true);
    try {
      await api.saveSheet(filePath, sheetName, data);
      setLastSaved(new Date());
    } finally {
      setIsSaving(false);
    }
  }, [filePath]);

  /**
   * Cada useEffect abaixo dispara quando o dado correspondente muda.
   * O guard `dataLoaded` impede saves durante o carregamento inicial.
   * Note: após o carregamento, `dataLoaded` muda para true e estes
   * effects disparam uma vez com os dados recém-carregados —
   * esse save redundante é inofensivo (grava o mesmo que foi lido).
   */
  useEffect(() => {
    if (!dataLoaded || !filePath) return;
    save('Sprints', toExcel.sprints(sprints));
  }, [sprints, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath) return;
    save('Equipe', toExcel.members(members));
  }, [members, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath) return;
    save('Projetos',  toExcel.projects(projects));
    save('Historias', toExcel.stories(projects));
  }, [projects, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath) return;
    save('OKRs', toExcel.okrs(okrs));
  }, [okrs, dataLoaded]); // eslint-disable-line

  // ── File picker handlers ────────────────────────────────────
  const handleOpenFile = async () => {
    const path = await api.selectFile('open');
    if (path) await loadFromFile(path);
  };

  const handleNewFile = async (withDemo = false) => {
    const path = await api.selectFile('save');
    if (!path) return;
    const res = await api.createTemplate(path, withDemo);
    if (res?.error) { setLoadError(res.error); return; }
    await loadFromFile(path);
  };

  const handleDisconnect = () => {
    setDataLoaded(false);
    setFilePath(null);
    setSprints([]);
    setMembers([]);
    setProjects([]);
    setOkrs([]);
    try { localStorage.removeItem('cj_filePath'); } catch {}
  };

  // ── Computed for sidebar badge ──────────────────────────────
  const currentSprint    = sprints.find((s) => s.status === 'atual');
  const totalDorIssues   = projects.reduce((a, p) => a + p.stories.filter((s) => !s.hours).length, 0);

  // ── Show file picker if no file loaded ─────────────────────
  if (!dataLoaded) {
    return (
      <FilePickerScreen
        isElectron={isElectron}
        error={loadError}
        onOpenFile={handleOpenFile}
        onNewFile={() => handleNewFile(false)}
        onNewFileWithDemo={() => handleNewFile(true)}
        squadName={squadName}
        onSquadNameChange={(v) => {
          setSquadName(v);
          try { localStorage.setItem('cj_squadName', v); } catch {}
        }}
      />
    );
  }

  // ── Main app ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white/80 backdrop-blur-xl border-r border-gray-100/80 flex flex-col z-40">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
              <Layers size={18} className="text-white" />
            </div>
            <div>
              {squadName ? (
                <>
                  <h1 className="text-sm font-bold text-gray-900 leading-tight">Squad</h1>
                  <h1 className="text-sm font-bold text-indigo-600 leading-tight truncate max-w-[140px]" title={squadName}>{squadName}</h1>
                </>
              ) : (
                <>
                  <h1 className="text-base font-bold text-gray-900 leading-tight">Controle de</h1>
                  <h1 className="text-base font-bold text-indigo-600 leading-tight">Jornada</h1>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                <t.icon size={17} />{t.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          {/* Current sprint info */}
          <div className="bg-indigo-50 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-indigo-700 mb-0.5">{currentSprint?.name ?? 'Sprint não configurada'}</p>
            <p className="text-xs text-indigo-500">{currentSprint ? `${fmtDate(currentSprint.startDate)} – ${fmtDate(currentSprint.endDate)}` : 'Configure em Sprints'}</p>
          </div>

          {/* DoR warning */}
          {totalDorIssues > 0 && (
            <div className="bg-red-50 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-600 font-medium">{totalDorIssues} história(s) sem DoR</p>
            </div>
          )}

          {/* Save status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {isSaving
                ? <><RefreshCw size={11} className="animate-spin text-indigo-400" /> Salvando...</>
                : lastSaved
                  ? <><Save size={11} className="text-green-500" /> Salvo {lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
                  : <><HardDrive size={11} /> Excel pronto</>
              }
            </div>
            <button onClick={handleDisconnect} title="Trocar arquivo" className="text-gray-300 hover:text-gray-500 transition-colors">
              <FolderOpen size={14} />
            </button>
          </div>

          {/* Crédito */}
          <div className="pt-3 mt-1 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 leading-tight">Desenvolvido por</p>
            <p className="text-xs font-semibold text-indigo-400 leading-tight mt-0.5">
              Rafael de Lima Santos
            </p>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="ml-64 p-8 max-w-[1400px]">
        {tab === 'dashboard' && <DashboardView sprints={sprints} members={members} projects={projects} />}
        {tab === 'sprints'   && <SprintsView sprints={sprints} setSprints={setSprints} projects={projects} setProjects={setProjects} members={members} />}
        {tab === 'team'      && <TeamView members={members} setMembers={setMembers} projects={projects} sprints={sprints} filePath={filePath} />}
        {tab === 'projects'  && <ProjectsView projects={projects} setProjects={setProjects} members={members} sprints={sprints} />}
        {tab === 'okrs'      && <OKRsView okrs={okrs} setOkrs={setOkrs} projects={projects} />}
      </main>
    </div>
  );
}
