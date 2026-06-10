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
  Activity, PieChart, Headphones, BookOpen, ChevronRight,
  Settings2, TreePine, CalendarX2, LogOut,
  ShieldAlert, Unlink, Wrench, CheckCheck
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// API ABSTRACTION
// Fallback para desenvolvimento em browser sem Electron
// ═══════════════════════════════════════════════════════════════
const api = typeof window !== 'undefined' && window.electronAPI
  ? window.electronAPI
  : {
      selectFile:     async ()             => null,
      loadData:       async ()             => ({ sprints: [], equipe: [], projetos: [], historias: [], okrs: [], feriados: [], ferias: [], ausencias: [], capacidade_config: [], error: 'Rodando sem Electron – modo demo' }),
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

const AVATAR_PALETTE = ['#EC7000','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#ef4444','#3b82f6','#22c55e'];
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
  atual:     { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500',  row: 'bg-orange-50/60 border-orange-200'  },
  encerrada: { badge: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400',    row: 'bg-gray-50 border-gray-200'          },
  futura:    { badge: 'bg-blue-100 text-blue-600',     dot: 'bg-blue-400',    row: 'bg-blue-50/40 border-blue-200'      },
};

const FRENTES = ['Engenharia', 'Produto', 'Design', 'Marketing', 'Suporte', 'Modernização', 'Experiência', 'Eficiência', 'Dados & Analytics', 'Atendimento'];

const ITEM_TYPE_STYLES = {
  historia: { label: 'História', badge: 'bg-green-600 text-white',  dot: 'bg-green-600'  },
  task:     { label: 'Task',     badge: 'bg-blue-600 text-white',   dot: 'bg-blue-600'   },
  bug:      { label: 'Bug',      badge: 'bg-red-600 text-white',    dot: 'bg-red-600'    },
};

const RISCO_CATEGORY = {
  tecnico:     { label: 'Técnico',     color: '#3B82F6', icon: Wrench    },
  negocio:     { label: 'Negócio',     color: '#F59E0B', icon: BarChart3  },
  dependencia: { label: 'Dependência', color: '#8B5CF6', icon: Unlink    },
  operacional: { label: 'Operacional', color: '#14B8A6', icon: Settings2  },
};

// Matriz de risco: score = prob(1-3) × impact(1-3)
const RISCO_SCORE = { baixa: 1, media: 2, alta: 3, baixo: 1, medio: 2, alto: 3 };
const riscoLevel = (prob, impact) => {
  const s = (RISCO_SCORE[prob] ?? 2) * (RISCO_SCORE[impact] ?? 2);
  if (s <= 2) return { label: 'Baixo',  cls: 'bg-green-100 text-green-700',  cell: 'bg-green-100'  };
  if (s <= 4) return { label: 'Médio',  cls: 'bg-amber-100 text-amber-700',  cell: 'bg-amber-100'  };
  return              { label: 'Alto',   cls: 'bg-red-100 text-red-700',      cell: 'bg-red-100'    };
};

// ═══════════════════════════════════════════════════════════════
// BUSINESS DAY CALCULATIONS
// ═══════════════════════════════════════════════════════════════
function getBusinessDays(startDate, endDate, holidays = []) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const holidaySet = new Set(holidays.map(h => h.date));
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) count++;
  }
  return count;
}

function getMemberVacationDaysInSprint(memberId, sprintStart, sprintEnd, vacations) {
  const start = new Date(sprintStart + 'T00:00:00');
  const end = new Date(sprintEnd + 'T00:00:00');
  let count = 0;
  vacations.filter(v => v.memberId === memberId).forEach(v => {
    const vStart = new Date(v.startDate + 'T00:00:00');
    const vEnd = new Date(v.endDate + 'T00:00:00');
    const overlapStart = vStart > start ? vStart : start;
    const overlapEnd = vEnd < end ? vEnd : end;
    for (let d = new Date(overlapStart); d <= overlapEnd; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
    }
  });
  return count;
}

function getMemberAbsenceDaysInSprint(memberId, sprintStart, sprintEnd, absences) {
  const start = new Date(sprintStart + 'T00:00:00');
  const end = new Date(sprintEnd + 'T00:00:00');
  return absences.filter(a => {
    if (a.memberId !== memberId) return false;
    const d = new Date(a.date + 'T00:00:00');
    return d >= start && d <= end;
  }).length;
}

/**
 * Retorna a capacidade detalhada de um membro em uma sprint.
 * capacityConfigs: array de { id, memberId, sprintId, projectPerDay, ceremoniesPerDay }
 */
function getMemberSprintCapacity(memberId, sprint, capacityConfigs, holidays, vacations, absences) {
  if (!sprint?.startDate || !sprint?.endDate) {
    return { bizDays: 0, vacDays: 0, absDays: 0, availDays: 0, projectHours: 0, ceremoniesHours: 0, projectPerDay: 6, ceremoniesPerDay: 2 };
  }
  const cfg = capacityConfigs.find(c => c.memberId === memberId && c.sprintId === sprint.id);
  const projectPerDay    = cfg?.projectPerDay    ?? 6;
  const ceremoniesPerDay = cfg?.ceremoniesPerDay ?? 2;

  const bizDays   = getBusinessDays(sprint.startDate, sprint.endDate, holidays);
  const vacDays   = getMemberVacationDaysInSprint(memberId, sprint.startDate, sprint.endDate, vacations);
  const absDays   = getMemberAbsenceDaysInSprint(memberId, sprint.startDate, sprint.endDate, absences);
  const availDays = Math.max(0, bizDays - vacDays - absDays);

  return {
    bizDays,
    vacDays,
    absDays,
    availDays,
    projectHours:    availDays * projectPerDay,
    ceremoniesHours: availDays * ceremoniesPerDay,
    projectPerDay,
    ceremoniesPerDay,
  };
}

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
    })),

  capacityConfigs: (rows = []) =>
    rows.filter(r => r.membro_id && r.sprint_id).map(r => ({
      id:             uid(),
      memberId:       String(r.membro_id),
      sprintId:       String(r.sprint_id),
      projectPerDay:    Number(r.horas_projeto_dia    ?? 6),
      ceremoniesPerDay: Number(r.horas_cerimonias_dia ?? 2),
    })),

  projects: (projRows = [], storyRows = []) =>
    projRows.filter((r) => r.id).map((r) => ({
      id:        String(r.id),
      name:      r.nome        || '',
      color:     r.cor         || '#EC7000',
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
          type:        s.tipo           || 'historia',
          storyPoints: s.story_points != null ? Number(s.story_points) : null,
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

  holidays: (rows = []) =>
    rows.filter(r => r.data).map(r => ({ id: uid(), date: r.data })),

  vacations: (rows = []) =>
    rows.filter(r => r.membro_id).map(r => ({
      id: uid(), memberId: String(r.membro_id), startDate: r.data_inicio || '', endDate: r.data_fim || ''
    })),

  absences: (rows = []) =>
    rows.filter(r => r.membro_id).map(r => ({
      id: uid(), memberId: String(r.membro_id), date: r.data || '', type: r.tipo || 'day_off'
    })),

  riscos: (rows = []) =>
    rows.filter(r => r.id).map(r => ({
      id:          String(r.id),
      title:       r.titulo        || '',
      description: r.descricao     || '',
      category:    r.categoria     || 'tecnico',
      probability: r.probabilidade || 'media',
      impact:      r.impacto       || 'medio',
      status:      r.status        || 'aberto',
      mitigation:  r.mitigacao     || '',
      ownerId:     r.responsavel_id ? String(r.responsavel_id) : '',
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
    id:         m.id,
    nome:       m.name,
    avatar_url: m.avatarUrl || '',
  })),

  capacityConfigs: (configs) => configs.map(c => ({
    membro_id:          c.memberId,
    sprint_id:          c.sprintId,
    horas_projeto_dia:    c.projectPerDay,
    horas_cerimonias_dia: c.ceremoniesPerDay,
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
        story_points:   s.storyPoints  ?? null,
        tipo:           s.type         || 'historia',
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

  holidays: (holidays) => holidays.map(h => ({ data: h.date })),

  vacations: (vacations) => vacations.map(v => ({ membro_id: v.memberId, data_inicio: v.startDate, data_fim: v.endDate })),

  absences: (absences) => absences.map(a => ({ membro_id: a.memberId, data: a.date, tipo: a.type })),

  riscos: (riscos) => riscos.map(r => ({
    id:              r.id,
    titulo:          r.title,
    descricao:       r.description  || '',
    categoria:       r.category,
    probabilidade:   r.probability,
    impacto:         r.impact,
    status:          r.status,
    mitigacao:       r.mitigation   || '',
    responsavel_id:  r.ownerId      || '',
  })),
};

// ═══════════════════════════════════════════════════════════════
// UI ATOMS (idênticos ao ControleDeJornada.jsx)
// ═══════════════════════════════════════════════════════════════
function Avatar({ name, avatarUrl, size = 36, ring = false }) {
  const [imgError, setImgError] = useState(false);
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const bg = avatarBg(name);

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

function ProgressBar({ value, max, color = '#EC7000', h = 8 }) {
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

const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all';
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
    primary:   'bg-orange-600 text-white hover:bg-orange-700 shadow-sm focus:ring-orange-500',
    secondary: 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 focus:ring-gray-400',
    outline:   'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 hover:border-orange-300 focus:ring-orange-400',
    danger:    'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 focus:ring-red-400',
    ghost:     'text-gray-500 hover:text-gray-700 hover:bg-gray-50 focus:ring-gray-300',
    success:   'bg-green-600 text-white hover:bg-green-700 shadow-sm focus:ring-green-500',
  }[variant];
  return (
    <button className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${v} ${className}`} {...p}>
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = '#EC7000' }) {
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
        <BarChart3 size={18} className="text-orange-600" />
        <h3 className="font-semibold text-gray-900">Linha do Tempo da Release</h3>
        <span className="text-xs text-gray-400 ml-1">— Gantt com alocação de membros</span>
      </div>
      <div className="p-6">
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
        <div className="flex items-center mb-4">
          <div className="w-44 shrink-0" />
          <div className="flex-1 relative h-5">
            {sprintBands.map((s) => (
              <div key={s.id + '_d'} className="absolute text-xs text-gray-400" style={{ left: `${s.left}%` }}>{fmtDate(s.startDate)}</div>
            ))}
            <div className="absolute text-xs text-gray-400 right-0">{fmtDate(validSprints[validSprints.length - 1]?.endDate)}</div>
          </div>
        </div>
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
        <div className="flex flex-wrap items-center gap-4 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }} /> DoR Completo</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} /> Risco Médio</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} /> Alto Risco</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════════════════════════
function DashboardView({ sprints, members, projects, holidays, vacations, absences, capacityConfigs, riscos }) {
  const currentSprint    = sprints.find(s => s.status === 'atual');
  const totalStories     = projects.reduce((sum, p) => sum + p.stories.length, 0);
  const completedStories = projects.reduce((sum, p) => sum + p.stories.filter(s => s.hours).length, 0);

  const memberCapacity = useMemo(() => {
    if (!currentSprint?.startDate || !currentSprint?.endDate) return [];
    return members.map(m => {
      const cap = getMemberSprintCapacity(m.id, currentSprint, capacityConfigs, holidays, vacations, absences);
      const assigned = projects.reduce((sum, p) =>
        sum + p.stories
          .filter(s => s.assignee === m.id && s.sprintId === currentSprint.id && s.hours)
          .reduce((b, s) => b + s.hours, 0), 0);
      return {
        memberId:  m.id,
        name:      m.name,
        avatarUrl: m.avatarUrl,
        capacity:  cap.projectHours,
        assigned,
        overload:  assigned > cap.projectHours && cap.projectHours > 0,
      };
    });
  }, [members, currentSprint, projects, holidays, vacations, absences, capacityConfigs]);

  const riscosAbertos   = (riscos ?? []).filter(r => r.status === 'aberto');
  const riscosMitigados = (riscos ?? []).filter(r => r.status === 'mitigado');
  const riscosAltos     = riscosAbertos.filter(r => {
    const s = RISCO_SCORE[r.probability] * RISCO_SCORE[r.impact];
    return s >= 6;
  });

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Visão Geral da Release</h2>
        <p className="text-gray-500 text-sm mt-1">Acompanhe capacidade, riscos e progresso geral</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon={Calendar}     label="Sprint Atual"       value={currentSprint?.name ?? '–'}
          sub={`${sprints.filter(s=>s.status==='encerrada').length}/${sprints.length} encerradas`} color="#EC7000"/>
        <StatCard icon={Users}        label="Membros"            value={members.length}
          sub="no time"                                                                             color="#14b8a6"/>
        <StatCard icon={CheckSquare}  label="Itens com Estimativa" value={`${completedStories}/${totalStories}`}
          sub={`${totalStories - completedStories} aguardando`}                                    color="#22c55e"/>
        <StatCard icon={ShieldAlert}  label="Riscos Abertos"     value={riscosAbertos.length}
          sub={riscosAltos.length > 0 ? `${riscosAltos.length} de alto impacto` : 'nenhum crítico'} color={riscosAltos.length > 0 ? '#ef4444' : '#f59e0b'}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Riscos resumo */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={18} className="text-orange-600"/>
            <h3 className="font-semibold text-gray-900">Radar de Riscos</h3>
          </div>
          {(riscos ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum risco cadastrado</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Alto impacto', count: riscosAltos.length,   color: '#ef4444', bg: 'bg-red-50'   },
                { label: 'Abertos',      count: riscosAbertos.length,  color: '#f59e0b', bg: 'bg-amber-50' },
                { label: 'Mitigados',    count: riscosMitigados.length, color: '#22c55e', bg: 'bg-green-50' },
              ].map(r => (
                <div key={r.label} className={`flex items-center justify-between rounded-xl px-4 py-3 ${r.bg}`}>
                  <span className="text-sm font-medium" style={{ color: r.color }}>{r.label}</span>
                  <span className="text-2xl font-bold" style={{ color: r.color }}>{r.count}</span>
                </div>
              ))}
            </div>
          )}
          {riscosAltos.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
              {riscosAltos.slice(0, 3).map(r => {
                const Icon = RISCO_CATEGORY[r.category]?.icon ?? ShieldAlert;
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: RISCO_CATEGORY[r.category]?.color ?? '#6B7280' }}>
                      <Icon size={11} />
                    </div>
                    <span className="truncate">{r.title}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Capacidade por membro */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-5">
            <Zap size={18} className="text-orange-600"/>
            <h3 className="font-semibold text-gray-900">
              Capacidade por Membro {currentSprint && `— ${currentSprint.name}`}
            </h3>
          </div>
          {memberCapacity.length > 0 ? (
            <div className="space-y-4">
              {memberCapacity.map(mc => (
                <div key={mc.memberId} className={`rounded-xl p-3 border ${mc.overload ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={mc.name} avatarUrl={mc.avatarUrl} size={30}/>
                      <span className="text-sm font-medium text-gray-700">{mc.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-400">{mc.assigned}h / {mc.capacity}h proj.</span>
                      {mc.overload
                        ? <span className="font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-md">OVERLOAD +{mc.assigned - mc.capacity}h</span>
                        : <span className="font-semibold text-green-600">{mc.capacity - mc.assigned}h livres</span>
                      }
                    </div>
                  </div>
                  <ProgressBar value={mc.assigned} max={Math.max(mc.capacity, mc.assigned, 1)} color={mc.overload ? '#ef4444' : '#EC7000'} h={6}/>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{currentSprint ? 'Nenhum membro cadastrado.' : 'Nenhuma sprint com status "atual".'}</p>
          )}
        </div>
      </div>

      {/* Cards por projeto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {projects.map(p => {
          const r = dorRisk(p); const rs = RISK_STYLES[r];
          const dorCount = p.stories.filter(s => s.hours).length;
          const totalH   = p.stories.reduce((a, s) => a + (s.hours ?? 0), 0);
          return (
            <div key={p.id} className={`bg-white rounded-2xl p-5 ${rs.card}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:p.color}}/>
                  <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg font-medium ${rs.badge}`}>
                  <rs.icon size={11} className={`inline mr-1 ${rs.iconColor}`}/>{rs.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{dorCount}/{p.stories.length} em DoR · {totalH}h estimadas</p>
              <ProgressBar value={dorCount} max={Math.max(p.stories.length,1)} color={r==='green'?'#22c55e':r==='yellow'?'#f59e0b':'#ef4444'} h={5}/>
            </div>
          );
        })}
      </div>

      <GanttTimeline projects={projects} members={members} sprints={sprints}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SPRINTS VIEW
// ═══════════════════════════════════════════════════════════════
function SprintsView({ sprints, setSprints, projects, setProjects, members, holidays }) {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ name: '', startDate: '', endDate: '', status: 'futura' });
  const [editId, setEditId] = useState(null);
  const [expanded, setExpanded] = useState({});

  const handleSave = () => {
    if (!form.name || !form.startDate || !form.endDate) return;
    if (editId) {
      setSprints(sprints.map(s => s.id === editId ? { ...form, id: editId } : s));
    } else {
      setSprints([...sprints, { ...form, id: uid() }]);
    }
    setForm({ name: '', startDate: '', endDate: '', status: 'futura' });
    setEditId(null);
    setModal(false);
  };

  const handleEdit = (sprint) => {
    setForm(sprint);
    setEditId(sprint.id);
    setModal(true);
  };

  const handleDelete = (id) => {
    setSprints(sprints.filter(s => s.id !== id));
    setProjects(projects.map(p => ({
      ...p,
      stories: p.stories.map(s => s.sprintId === id ? { ...s, sprintId: '' } : s)
    })));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Sprints</h2>
        <Btn onClick={() => { setForm({ name: '', startDate: '', endDate: '', status: 'futura' }); setEditId(null); setModal(true); }}>
          <Plus size={16} /> Nova Sprint
        </Btn>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Sprint' : 'Nova Sprint'}>
        <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Sprint 1" />
        <Input label="Data de Início" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <Input label="Data de Término" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <Sel label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="futura">Futura</option>
          <option value="atual">Atual</option>
          <option value="encerrada">Encerrada</option>
        </Sel>
        <div className="flex gap-2">
          <Btn variant="primary" onClick={handleSave}>{editId ? 'Salvar' : 'Criar'}</Btn>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
        </div>
      </Modal>

      <div className="space-y-4">
        {sprints.map(sprint => {
          const bizDays = sprint.startDate && sprint.endDate ? getBusinessDays(sprint.startDate, sprint.endDate, holidays) : 0;
          const today = new Date().toISOString().slice(0, 10);
          const remainingDays = sprint.startDate && sprint.endDate && sprint.startDate <= today && today <= sprint.endDate
            ? getBusinessDays(today, sprint.endDate, holidays)
            : null;

          const st = SPRINT_STYLES[sprint.status];
          const isOpen = expanded[sprint.id];
          const sprintStories = projects.flatMap(p => p.stories.filter(s => s.sprintId === sprint.id).map(s => ({ ...s, projectId: p.id, projectColor: p.color, projectName: p.name })));
          const assignedHours = sprintStories.reduce((sum, s) => sum + (s.hours || 0), 0);

          return (
            <div key={sprint.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${st.row}`}>
              <div className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50" onClick={() => setExpanded({ ...expanded, [sprint.id]: !isOpen })}>
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-3 h-3 rounded-full ${st.dot}`} />
                  <div>
                    <h3 className="font-semibold text-gray-900">{sprint.name}</h3>
                    <p className="text-xs text-gray-500">
                      {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)} • <span className="font-medium">{bizDays} dias úteis</span>
                      {remainingDays !== null && ` • ${remainingDays} dias restantes`}
                    </p>
                  </div>
                </div>
                <div className="text-right mr-4">
                  <p className="text-sm font-semibold text-gray-900">{sprintStories.length}</p>
                  <p className="text-xs text-gray-500">{assignedHours}h</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setExpanded({ ...expanded, [sprint.id]: !isOpen }); }}>
                  {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>

              {isOpen && (
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-3">Histórias ({sprintStories.length})</h4>
                    <div className="space-y-2">
                      {sprintStories.length > 0 ? (
                        sprintStories.map(story => (
                          <div key={story.id} className="p-3 bg-white rounded-xl border border-gray-100 flex items-start gap-3">
                            <div className={`flex-1 min-w-0`}>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-gray-900 truncate">{story.title}</p>
                                {story.type && ITEM_TYPE_STYLES[story.type] && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${ITEM_TYPE_STYLES[story.type].badge}`}>
                                    {ITEM_TYPE_STYLES[story.type].label}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{story.projectName}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {story.hours != null && <span className="text-sm font-semibold text-gray-800">{story.hours}h</span>}
                              {story.storyPoints != null && <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{story.storyPoints} pts</span>}
                              {story.hours == null && story.storyPoints == null && <span className="text-sm text-gray-400">–</span>}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500 text-sm">Nenhuma história nesta sprint</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-gray-200">
                    <Btn variant="secondary" size="sm" onClick={() => handleEdit(sprint)}>
                      <Edit3 size={14} /> Editar
                    </Btn>
                    <Btn variant="danger" size="sm" onClick={() => handleDelete(sprint.id)}>
                      <Trash2 size={14} /> Deletar
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEAM VIEW
// ═══════════════════════════════════════════════════════════════
function TeamView({ members, setMembers, setProjects, projects, sprints, filePath, holidays, vacations, setVacations, absences, setAbsences, capacityConfigs, setCapacityConfigs }) {
  // ── member CRUD ─────────────────────────────────────────────
  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState({ name: '', avatarUrl: '' });

  // sprintConfigs: { [sprintId]: { projectPerDay, ceremoniesPerDay } }
  const [sprintConfigs, setSprintConfigs] = useState({});
  const [activeSprintTab, setActiveSprintTab] = useState(null);
  const [expandedSprints, setExpandedSprints] = useState({});
  const toggleSprintStories = (key) => setExpandedSprints(s => ({ ...s, [key]: !s[key] }));

  // ── vacation / absence modals ───────────────────────────────
  const [vacationModal, setVacationModal] = useState(null); // memberId
  const [absenceModal,  setAbsenceModal]  = useState(null); // memberId
  const [vacForm,  setVacForm]  = useState({ startDate: '', endDate: '' });
  const [absForm,  setAbsForm]  = useState({ date: '', type: 'day_off' });

  const openNew = () => {
    setEditId(null);
    setForm({ name: '', avatarUrl: '' });
    // Initialize sprintConfigs com defaults
    const defaults = {};
    sprints.forEach(sp => { defaults[sp.id] = { projectPerDay: 6, ceremoniesPerDay: 2 }; });
    setSprintConfigs(defaults);
    setActiveSprintTab(sprints[0]?.id || null);
    setModal(true);
  };

  const openEdit = (member) => {
    setEditId(member.id);
    setForm({ name: member.name, avatarUrl: member.avatarUrl || '' });
    // Carrega configs existentes, preenche defaults para sprints sem config
    const configs = {};
    sprints.forEach(sp => {
      const existing = capacityConfigs.find(c => c.memberId === member.id && c.sprintId === sp.id);
      configs[sp.id] = {
        projectPerDay:    existing?.projectPerDay    ?? 6,
        ceremoniesPerDay: existing?.ceremoniesPerDay ?? 2,
      };
    });
    setSprintConfigs(configs);
    setActiveSprintTab(sprints[0]?.id || null);
    setModal(true);
  };

  const saveMember = () => {
    if (!form.name.trim()) return;
    let memberId = editId;
    if (editId) {
      setMembers(ms => ms.map(m => m.id === editId ? { ...m, ...form } : m));
    } else {
      memberId = uid();
      setMembers(ms => [...ms, { id: memberId, ...form }]);
    }
    // Salva capacityConfigs: remove antigas deste membro, adiciona novas
    setCapacityConfigs(old => {
      const others = old.filter(c => c.memberId !== memberId);
      const news   = Object.entries(sprintConfigs).map(([sprintId, cfg]) => ({
        id: uid(), memberId, sprintId,
        projectPerDay:    cfg.projectPerDay,
        ceremoniesPerDay: cfg.ceremoniesPerDay,
      }));
      return [...others, ...news];
    });
    setModal(false);
  };

  const removeMember = (id) => {
    setMembers(ms => ms.filter(m => m.id !== id));
    setCapacityConfigs(old => old.filter(c => c.memberId !== id));
    setProjects(ps => ps.map(p => ({
      ...p, stories: p.stories.map(s => s.assignee === id ? { ...s, assignee: '' } : s)
    })));
  };

  const selectAvatar = async () => {
    if (!filePath) return;
    const path = await api.selectAvatar(filePath);
    if (path && !path.error) setForm(f => ({ ...f, avatarUrl: path }));
  };

  const saveVacation = (memberId) => {
    if (!vacForm.startDate || !vacForm.endDate) return;
    setVacations(vs => [...vs, { id: uid(), memberId, startDate: vacForm.startDate, endDate: vacForm.endDate }]);
    setVacForm({ startDate: '', endDate: '' });
    setVacationModal(null);
  };

  const saveAbsence = (memberId) => {
    if (!absForm.date) return;
    setAbsences(as => [...as, { id: uid(), memberId, date: absForm.date, type: absForm.type }]);
    setAbsForm({ date: '', type: 'day_off' });
    setAbsenceModal(null);
  };

  const setSprintCfg = (sprintId, key, val) =>
    setSprintConfigs(s => ({ ...s, [sprintId]: { ...s[sprintId], [key]: Number(val) || 0 } }));

  // ── render ──────────────────────────────────────────────────
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Equipe</h2>
          <p className="text-gray-500 text-sm mt-1">Gerencie membros e configure a capacidade por sprint</p>
        </div>
        <Btn onClick={openNew}><Plus size={16} /> Novo Membro</Btn>
      </div>

      {/* ── MODAL ─────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar Membro' : 'Novo Membro'}>
        {/* Nome e avatar */}
        <Input label="Nome completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Ana Souza" />
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Foto de perfil</label>
          <div className="flex items-center gap-4">
            {form.name
              ? <Avatar name={form.name} avatarUrl={form.avatarUrl} size={52} />
              : <div className="w-13 h-13 rounded-full bg-gray-100 flex items-center justify-center"><Users size={26} className="text-gray-400"/></div>
            }
            <div className="flex flex-col gap-1.5">
              <Btn variant="secondary" type="button" onClick={selectAvatar}>
                <Upload size={14}/>{form.avatarUrl ? 'Trocar foto' : 'Selecionar foto'}
              </Btn>
              {form.avatarUrl && (
                <button onClick={() => setForm(f => ({ ...f, avatarUrl: '' }))} className="text-xs text-red-400 hover:text-red-600">
                  Remover foto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Configuração de capacidade por sprint */}
        {sprints.length > 0 ? (
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Clock size={15} className="text-orange-600"/>Capacidade por Sprint
            </p>

            {/* Tabs de sprint */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {sprints.map(sp => {
                const st = SPRINT_STYLES[sp.status];
                return (
                  <button key={sp.id} onClick={() => setActiveSprintTab(sp.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      activeSprintTab === sp.id
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : `${st.badge} border-transparent hover:border-gray-300`
                    }`}>
                    {sp.name}
                  </button>
                );
              })}
            </div>

            {/* Painel da sprint ativa */}
            {sprints.filter(sp => sp.id === activeSprintTab).map(sp => {
              const cfg = sprintConfigs[sp.id] || { projectPerDay: 6, ceremoniesPerDay: 2 };
              const bizDays  = sp.startDate && sp.endDate ? getBusinessDays(sp.startDate, sp.endDate, holidays) : 0;
              const vacDays  = getMemberVacationDaysInSprint(editId || '__new__', sp.startDate, sp.endDate, vacations);
              const absDays  = getMemberAbsenceDaysInSprint(editId || '__new__', sp.startDate, sp.endDate, absences);
              const availDays = Math.max(0, bizDays - vacDays - absDays);
              const projHours = availDays * cfg.projectPerDay;
              const cerHours  = availDays * cfg.ceremoniesPerDay;

              return (
                <div key={sp.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  {/* Datas da sprint */}
                  <p className="text-xs text-gray-500 mb-4">
                    {fmtDate(sp.startDate)} → {fmtDate(sp.endDate)}
                  </p>

                  {/* Inputs */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Horas Projeto / Dia</label>
                      <input
                        type="number" min={0} max={24}
                        value={cfg.projectPerDay}
                        onChange={e => setSprintCfg(sp.id, 'projectPerDay', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Horas Cerimônias / Dia</label>
                      <input
                        type="number" min={0} max={24}
                        value={cfg.ceremoniesPerDay}
                        onChange={e => setSprintCfg(sp.id, 'ceremoniesPerDay', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* Breakdown automático */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-gray-200">
                      <span className="text-gray-500">Dias úteis na sprint</span>
                      <span className="font-medium text-gray-800">{bizDays} dias</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-200">
                      <span className="text-gray-500">( - ) Feriados</span>
                      <span className="font-medium text-amber-600">
                        {/* Calcula feriados que caem nos dias úteis da sprint */}
                        {(() => {
                          if (!sp.startDate || !sp.endDate) return '0 dias';
                          const start = new Date(sp.startDate + 'T00:00:00');
                          const end   = new Date(sp.endDate   + 'T00:00:00');
                          const hSet  = new Set(holidays.map(h => h.date));
                          let cnt = 0;
                          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                            const day = d.getDay();
                            if (day !== 0 && day !== 6 && hSet.has(d.toISOString().slice(0,10))) cnt++;
                          }
                          return `${cnt} dia${cnt !== 1 ? 's' : ''}`;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-200">
                      <span className="text-gray-500">( - ) Férias</span>
                      <span className="font-medium text-amber-600">{vacDays} dia{vacDays !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-200">
                      <span className="text-gray-500">( - ) Ausências</span>
                      <span className="font-medium text-amber-600">{absDays} dia{absDays !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-200 font-semibold">
                      <span className="text-gray-700">Dias disponíveis</span>
                      <span className="text-orange-700">{availDays} dias</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="text-orange-700 font-semibold">Total Projeto</span>
                      <span className="font-bold text-orange-700">{projHours}h</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-teal-700 font-semibold">Total Cerimônias</span>
                      <span className="font-bold text-teal-700">{cerHours}h</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            Cadastre sprints primeiro para configurar a capacidade por sprint.
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <Btn className="flex-1 justify-center" onClick={saveMember}>{editId ? 'Salvar' : 'Adicionar'}</Btn>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
        </div>
      </Modal>

      {/* ── CARDS DOS MEMBROS ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {members.map(member => {
          const memberVacations = vacations.filter(v => v.memberId === member.id);
          const memberAbsences  = absences.filter(a => a.memberId === member.id);

          return (
            <div key={member.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header do card */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} avatarUrl={member.avatarUrl} size={46} />
                  <div>
                    <p className="font-semibold text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-400">{memberVacations.length} período(s) de férias · {memberAbsences.length} ausência(s)</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Btn variant="ghost" onClick={() => openEdit(member)}><Edit3 size={15}/></Btn>
                  <Btn variant="danger" onClick={() => removeMember(member.id)}><Trash2 size={15}/></Btn>
                </div>
              </div>

              <div className="px-6 py-4 space-y-4">
                {/* Capacidade por sprint */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Capacidade Preditiva</p>
                  {sprints.length > 0 ? (
                    <div className="space-y-2">
                      {sprints.map(sp => {
                        const cap = getMemberSprintCapacity(member.id, sp, capacityConfigs, holidays, vacations, absences);
                        const st  = SPRINT_STYLES[sp.status];
                        const sprintStories = projects.flatMap(p =>
                          p.stories.filter(s => s.assignee === member.id && s.sprintId === sp.id)
                            .map(s => ({ ...s, projectName: p.name, projectColor: p.color }))
                        );
                        const assignedInSprint = sprintStories.filter(s => s.hours).reduce((a, s) => a + s.hours, 0);
                        const totalPoints = sprintStories.filter(s => s.storyPoints).reduce((a, s) => a + s.storyPoints, 0);
                        const overload = assignedInSprint > cap.projectHours && cap.projectHours > 0;
                        const expandKey = `${member.id}_${sp.id}`;
                        const isExpanded = expandedSprints[expandKey];
                        return (
                          <div key={sp.id} className={`rounded-xl border px-3 py-2.5 ${overload ? 'bg-red-50 border-red-200' : st.row}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${st.dot}`}/>
                                <span className="text-xs font-semibold text-gray-700">{sp.name}</span>
                                {overload && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-semibold">OVERLOAD</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {totalPoints > 0 && <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{totalPoints} pts</span>}
                                <span className="text-xs font-bold text-orange-700">{cap.projectHours}h proj · {cap.ceremoniesHours}h cer</span>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500">
                              {cap.availDays}d disponíveis
                              {cap.vacDays > 0 && ` · ${cap.vacDays}d férias`}
                              {cap.absDays > 0 && ` · ${cap.absDays}d ausência`}
                              <span className="ml-1 text-gray-400">({cap.projectPerDay}h proj/dia · {cap.ceremoniesPerDay}h cer/dia)</span>
                            </p>
                            {assignedInSprint > 0 && (
                              <ProgressBar value={assignedInSprint} max={Math.max(cap.projectHours, 1)} color={overload ? '#ef4444' : '#EC7000'} h={4} />
                            )}
                            {/* Toggle histórias */}
                            {sprintStories.length > 0 && (
                              <>
                                <button onClick={() => toggleSprintStories(expandKey)}
                                  className="mt-2 flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium w-full">
                                  {isExpanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                                  {sprintStories.length} {sprintStories.length === 1 ? 'item atribuído' : 'itens atribuídos'}
                                </button>
                                {isExpanded && (
                                  <div className="mt-2 space-y-1.5">
                                    {sprintStories.map(s => (
                                      <div key={s.id} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-2 border border-gray-100">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.projectColor }}/>
                                        <span className="text-xs text-gray-700 truncate flex-1">{s.title}</span>
                                        {s.type && ITEM_TYPE_STYLES[s.type] && (
                                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${ITEM_TYPE_STYLES[s.type].badge}`}>
                                            {ITEM_TYPE_STYLES[s.type].label}
                                          </span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                          {s.storyPoints != null && <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{s.storyPoints}pts</span>}
                                          {s.hours != null && <span className="text-xs text-gray-500">{s.hours}h</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Cadastre sprints para ver a capacidade.</p>
                  )}
                </div>

                {/* Férias */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Férias</p>
                    <button onClick={() => { setVacationModal(member.id); setVacForm({ startDate: '', endDate: '' }); }}
                      className="text-xs text-orange-600 hover:text-orange-700 font-medium">+ Adicionar</button>
                  </div>
                  {memberVacations.length > 0 ? (
                    <div className="space-y-1.5">
                      {memberVacations.map(v => (
                        <div key={v.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          <span className="text-amber-800">{fmtDate(v.startDate)} → {fmtDate(v.endDate)}</span>
                          <button onClick={() => setVacations(vs => vs.filter(x => x.id !== v.id))} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={13}/></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Nenhum período cadastrado</p>
                  )}
                </div>

                {/* Ausências */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ausências Rápidas</p>
                    <button onClick={() => { setAbsenceModal(member.id); setAbsForm({ date: '', type: 'day_off' }); }}
                      className="text-xs text-orange-600 hover:text-orange-700 font-medium">+ Adicionar</button>
                  </div>
                  {memberAbsences.length > 0 ? (
                    <div className="space-y-1.5">
                      {memberAbsences.map(a => {
                        const typeLabel = { day_off: 'Day Off', treinamento: 'Treinamento', consulta: 'Consulta' }[a.type] || a.type;
                        return (
                          <div key={a.id} className="flex items-center justify-between text-xs bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                            <span className="text-violet-800">{fmtDate(a.date)} · <span className="font-medium">{typeLabel}</span></span>
                            <button onClick={() => setAbsences(as => as.filter(x => x.id !== a.id))} className="text-red-400 hover:text-red-600 ml-2"><Trash2 size={13}/></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Nenhuma ausência cadastrada</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modais de férias e ausências */}
      <Modal open={!!vacationModal} onClose={() => setVacationModal(null)} title="Adicionar Férias">
        {vacationModal && (
          <>
            <Input label="Início" type="date" value={vacForm.startDate} onChange={e => setVacForm(f => ({ ...f, startDate: e.target.value }))} />
            <Input label="Fim"    type="date" value={vacForm.endDate}   onChange={e => setVacForm(f => ({ ...f, endDate: e.target.value }))} />
            <div className="flex gap-2">
              <Btn className="flex-1 justify-center" onClick={() => saveVacation(vacationModal)}>Salvar</Btn>
              <Btn variant="secondary" onClick={() => setVacationModal(null)}>Cancelar</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!absenceModal} onClose={() => setAbsenceModal(null)} title="Adicionar Ausência Rápida">
        {absenceModal && (
          <>
            <Input label="Data" type="date" value={absForm.date} onChange={e => setAbsForm(f => ({ ...f, date: e.target.value }))} />
            <Sel label="Tipo" value={absForm.type} onChange={e => setAbsForm(f => ({ ...f, type: e.target.value }))}>
              <option value="day_off">Day Off</option>
              <option value="treinamento">Treinamento</option>
              <option value="consulta">Consulta Médica</option>
            </Sel>
            <div className="flex gap-2">
              <Btn className="flex-1 justify-center" onClick={() => saveAbsence(absenceModal)}>Salvar</Btn>
              <Btn variant="secondary" onClick={() => setAbsenceModal(null)}>Cancelar</Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROJECTS VIEW
// ═══════════════════════════════════════════════════════════════
function ProjectsView({ projects, setProjects, members, sprints }) {
  const [projModal, setProjModal]   = useState(false);
  const [storyModal, setStoryModal] = useState(null);
  const [editProjId, setEditProjId] = useState(null);
  const [pf, setPf] = useState({ name: '', color: '#EC7000', startDate: '', endDate: '' });
  const [sf, setSf] = useState({ title: '', assignee: '', hours: '', storyPoints: '', description: '', sprintId: '', type: 'historia' });
  const [expandedStories, setExpandedStories] = useState({});

  const handleSaveProj = () => {
    if (!pf.name) return;
    if (editProjId) {
      setProjects(projects.map(p => p.id === editProjId ? { ...p, name: pf.name, color: pf.color, startDate: pf.startDate, endDate: pf.endDate } : p));
    } else {
      setProjects([...projects, { ...pf, id: uid(), stories: [] }]);
    }
    setPf({ name: '', color: '#EC7000', startDate: '', endDate: '' });
    setEditProjId(null);
    setProjModal(false);
  };

  const handleDeleteProj = (id) => {
    setProjects(projects.filter(p => p.id !== id));
  };

  const handleSaveStory = (projId) => {
    if (!sf.title) return;
    const isNew = !storyModal || storyModal.startsWith('new:');

    // Segurança: se projId veio undefined, tenta encontrar o projeto pelo id da história
    const resolvedProjId = projId
      ?? projects.find(p => p.stories.some(s => s.id === storyModal))?.id;

    if (!resolvedProjId) return; // projeto não encontrado — aborta silenciosamente

    setProjects(prev => prev.map(p => {
      if (p.id !== resolvedProjId) return p;
      if (!isNew) {
        // Editar história existente
        return {
          ...p,
          stories: p.stories.map(s =>
            s.id === storyModal
              ? { ...s, title: sf.title, assignee: sf.assignee, hours: sf.hours ? Number(sf.hours) : null, storyPoints: sf.storyPoints ? Number(sf.storyPoints) : null, description: sf.description, sprintId: sf.sprintId, type: sf.type }
              : s
          ),
        };
      } else {
        // Adicionar nova história
        return {
          ...p,
          stories: [...p.stories, { id: uid(), title: sf.title, assignee: sf.assignee, hours: sf.hours ? Number(sf.hours) : null, storyPoints: sf.storyPoints ? Number(sf.storyPoints) : null, description: sf.description, sprintId: sf.sprintId, type: sf.type }],
        };
      }
    }));
    setSf({ title: '', assignee: '', hours: '', storyPoints: '', description: '', sprintId: '', type: 'historia' });
    setStoryModal(null);
  };

  const handleDeleteStory = (projId, storyId) => {
    setProjects(projects.map(p => p.id === projId ? { ...p, stories: p.stories.filter(s => s.id !== storyId) } : p));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Projetos</h2>
        <Btn onClick={() => { setPf({ name: '', color: '#EC7000', startDate: '', endDate: '' }); setEditProjId(null); setProjModal(true); }}>
          <Plus size={16} /> Novo Projeto
        </Btn>
      </div>

      <Modal open={projModal} onClose={() => setProjModal(false)} title={editProjId ? 'Editar Projeto' : 'Novo Projeto'}>
        <Input label="Nome" value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="ex: API Backend" />
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
          <div className="flex gap-2 flex-wrap">
            {['#EC7000', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6', '#22c55e'].map(c => (
              <button key={c} onClick={() => setPf({ ...pf, color: c })} className={`w-8 h-8 rounded-lg border-2 ${pf.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <Input label="Data de Início" type="date" value={pf.startDate} onChange={(e) => setPf({ ...pf, startDate: e.target.value })} />
        <Input label="Data de Término" type="date" value={pf.endDate} onChange={(e) => setPf({ ...pf, endDate: e.target.value })} />
        <div className="flex gap-2">
          <Btn variant="primary" onClick={handleSaveProj}>{editProjId ? 'Salvar' : 'Criar'}</Btn>
          <Btn variant="secondary" onClick={() => setProjModal(false)}>Cancelar</Btn>
        </div>
      </Modal>

      <div className="space-y-6">
        {projects.map(proj => {
          const risk = dorRisk(proj);
          const riskStyle = RISK_STYLES[risk];
          return (
            <div key={proj.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden ${riskStyle.card}`}>
              {/* Accent bar com cor do projeto */}
              <div className="h-1 w-full" style={{ backgroundColor: proj.color }} />
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-4 h-4 rounded-lg mt-1" style={{ backgroundColor: proj.color }} />
                  <div>
                    <h3 className="font-semibold text-gray-900">{proj.name}</h3>
                    <p className="text-xs text-gray-500">{fmtDate(proj.startDate)} – {fmtDate(proj.endDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${riskStyle.badge}`}>{riskStyle.label}</span>
                  <button onClick={() => { setPf(proj); setEditProjId(proj.id); setProjModal(true); }} className="p-2 hover:bg-gray-100 rounded-lg"><Edit3 size={16} className="text-gray-600" /></button>
                  <button onClick={() => handleDeleteProj(proj.id)} className="p-2 hover:bg-red-50 rounded-lg"><Trash2 size={16} className="text-red-600" /></button>
                </div>
              </div>

              <div className="px-6 py-4">
                {(() => {
                  const totalH  = proj.stories.reduce((a, s) => a + (s.hours ?? 0), 0);
                  const totalPts = proj.stories.reduce((a, s) => a + (s.storyPoints ?? 0), 0);
                  if (!totalH && !totalPts) return null;
                  return (
                    <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
                      {totalH > 0 && <span className="font-medium text-gray-700">{totalH}h estimadas</span>}
                      {totalPts > 0 && <span className="font-semibold bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full">{totalPts} pts</span>}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="font-medium text-gray-900">Backlog <span className="text-gray-400 font-normal">({proj.stories.length})</span></h4>
                    {proj.stories.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {[
                          { type: 'historia', color: 'bg-orange-400' },
                          { type: 'task',     color: 'bg-amber-400'  },
                          { type: 'bug',      color: 'bg-red-400'    },
                        ].map(({ type, color }) => {
                          const count = proj.stories.filter(s => s.type === type).length;
                          if (!count) return null;
                          return (
                            <span key={type} className="flex items-center gap-1 text-xs text-gray-500">
                              <span className={`w-1.5 h-1.5 rounded-full ${color}`}/>
                              {count} {ITEM_TYPE_STYLES[type].label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Btn variant="outline" size="sm" onClick={() => { setSf({ title: '', assignee: '', hours: '', storyPoints: '', description: '', sprintId: '', type: 'historia' }); setStoryModal('new:' + proj.id); }}>
                    <Plus size={14} /> Novo Item
                  </Btn>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {proj.stories.map(story => (
                    <div key={story.id} className="bg-white rounded-xl border border-gray-100 flex items-stretch overflow-hidden group hover:border-gray-200 hover:shadow-sm transition-all">
                      {/* Stripe lateral por tipo */}
                      <div className={`w-1 shrink-0 ${ITEM_TYPE_STYLES[story.type]?.dot || 'bg-gray-300'}`} />
                      <div className="flex-1 flex items-start gap-3 p-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900 truncate text-sm">{story.title}</p>
                          {story.type && ITEM_TYPE_STYLES[story.type] && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${ITEM_TYPE_STYLES[story.type].badge}`}>
                              {ITEM_TYPE_STYLES[story.type].label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{story.assignee ? members.find(m => m.id === story.assignee)?.name : '–'} • Sprint: {story.sprintId ? sprints.find(s => s.id === story.sprintId)?.name : '–'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {story.hours != null && <span className="text-sm font-semibold text-gray-800">{story.hours}h</span>}
                        {story.storyPoints != null && <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{story.storyPoints} pts</span>}
                        {story.hours == null && story.storyPoints == null && <span className="text-sm text-gray-400">–</span>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setSf({ ...story, hours: story.hours ?? '', storyPoints: story.storyPoints ?? '' }); setStoryModal(story.id); }} className="p-1.5 hover:bg-orange-50 rounded-lg"><Edit3 size={14} className="text-orange-600" /></button>
                        <button onClick={() => handleDeleteStory(proj.id, story.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-600" /></button>
                      </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={storyModal ? true : false} onClose={() => setStoryModal(null)} title={storyModal?.startsWith('new:') ? 'Novo Item' : 'Editar Item'}>
        {storyModal && (
          <>
            <Input label="Título" value={sf.title} onChange={(e) => setSf({ ...sf, title: e.target.value })} placeholder="ex: Implementar autenticação" />
            <Sel label="Tipo" value={sf.type} onChange={(e) => setSf({ ...sf, type: e.target.value })}>
              <option value="historia">História</option>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
            </Sel>
            <Sel label="Atribuído para" value={sf.assignee} onChange={(e) => setSf({ ...sf, assignee: e.target.value })}>
              <option value="">Ninguém</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
            <Sel label="Sprint" value={sf.sprintId} onChange={(e) => setSf({ ...sf, sprintId: e.target.value })}>
              <option value="">Nenhuma</option>
              {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Sel>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimativa (horas)</label>
                <input type="number" value={sf.hours} onChange={(e) => setSf({ ...sf, hours: e.target.value })} min={0} className={inputCls} placeholder="ex: 8" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Story Points</label>
                <input type="number" value={sf.storyPoints} onChange={(e) => setSf({ ...sf, storyPoints: e.target.value })} min={0} className={inputCls} placeholder="ex: 5" />
              </div>
            </div>
            <Textarea label="Descrição" value={sf.description} onChange={(e) => setSf({ ...sf, description: e.target.value })} placeholder="Detalhes da história..." />
            <div className="flex gap-2">
              <Btn variant="primary" onClick={() => handleSaveStory(storyModal.startsWith('new:') ? storyModal.split(':')[1] : projects.find(p => p.stories.some(s => s.id === storyModal))?.id)}>
                Salvar
              </Btn>
              <Btn variant="secondary" onClick={() => setStoryModal(null)}>Cancelar</Btn>
            </div>
          </>
        )}
      </Modal>

      {projects.filter(p => p.startDate && p.endDate).length > 0 && <GanttTimeline projects={projects} members={members} sprints={sprints} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OKR COMPONENTS
// ═══════════════════════════════════════════════════════════════
function OkrProgressBar({ baseline, moonshot, roofshot, atual, unit, lowerIsBetter }) {
  const min = Math.min(baseline, moonshot, roofshot, atual);
  const max = Math.max(baseline, moonshot, roofshot, atual);
  const range = max - min || 1;
  const toPos = (v) => ((v - min) / range) * 100;

  const baselinePos = toPos(baseline);
  const moonshotPos = toPos(moonshot);
  const roofshotPos = toPos(roofshot);
  const atualPos = toPos(atual);

  return (
    <div className="space-y-2">
      <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute left-0 right-0 top-0 bottom-0 flex items-center px-3 pointer-events-none">
          <div className="absolute h-0.5 bg-gray-200" style={{ left: `${baselinePos}%`, right: 0 }} />
        </div>
        <div className="absolute top-1 h-6" style={{ left: `${moonshotPos}%`, transform: 'translateX(-50%)' }}>
          <div className="w-0.5 h-full bg-orange-400" />
        </div>
        <div className="absolute top-1 h-6" style={{ left: `${roofshotPos}%`, transform: 'translateX(-50%)' }}>
          <div className="w-0.5 h-full bg-orange-600" />
        </div>
        <div className="absolute top-1 h-6" style={{ left: `${atualPos}%`, transform: 'translateX(-50%)' }}>
          <div className="w-1 h-full bg-green-500 rounded-full" />
        </div>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Baseline: {baseline}{unit}</span>
        <span>Moonshot: {moonshot}{unit}</span>
        <span>Roofshot: {roofshot}{unit}</span>
        <span className="font-semibold text-gray-900">Atual: {atual}{unit}</span>
      </div>
    </div>
  );
}

function OkrCard({ okr, projects, onEdit, onDelete }) {
  const project = projects.find(p => p.id === okr.projectId);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${okr.tipo === 'O' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
              {okr.tipo === 'O' ? 'Objetivo' : 'Key Result'}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{okr.frente || '–'}</span>
          </div>
          <h4 className="font-semibold text-gray-900">{okr.title}</h4>
          {project && <p className="text-xs text-gray-500 mt-1">{project.name}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-2 hover:bg-gray-100 rounded-lg"><Edit3 size={16} className="text-gray-600" /></button>
          <button onClick={onDelete} className="p-2 hover:bg-red-50 rounded-lg"><Trash2 size={16} className="text-red-600" /></button>
        </div>
      </div>
      <OkrProgressBar baseline={okr.baseline} moonshot={okr.moonshot} roofshot={okr.roofshot} atual={okr.atual} unit={okr.unit} lowerIsBetter={okr.lowerIsBetter} />
      {okr.description && <p className="text-xs text-gray-600 mt-3">{okr.description}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OKRS VIEW
// ═══════════════════════════════════════════════════════════════
function OKRsView({ okrs, setOkrs, projects }) {
  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterFrente, setFilterFrente] = useState('all');
  const [filterTipo,   setFilterTipo]   = useState('all');

  const emptyForm = { tipo: 'KR', frente: '', title: '', projectId: '', baseline: 0, moonshot: 0, roofshot: 0, atual: 0, unit: '%', description: '', lowerIsBetter: false };
  const [form, setForm] = useState(emptyForm);

  const handleSave = () => {
    if (!form.title) return;
    if (editId) {
      setOkrs(okrs.map(o => o.id === editId ? { ...form, id: editId } : o));
    } else {
      setOkrs([...okrs, { ...form, id: uid() }]);
    }
    setForm(emptyForm);
    setEditId(null);
    setModal(false);
  };

  const handleEdit = (okr) => {
    setForm(okr);
    setEditId(okr.id);
    setModal(true);
  };

  const handleDelete = (id) => {
    setOkrs(okrs.filter(o => o.id !== id));
  };

  const filtered = okrs.filter(o => {
    if (filterFrente !== 'all' && o.frente !== filterFrente) return false;
    if (filterTipo !== 'all' && o.tipo !== filterTipo) return false;
    return true;
  });

  const frentes = FRENTES;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">OKRs</h2>
        <Btn onClick={() => { setForm(emptyForm); setEditId(null); setModal(true); }}>
          <Plus size={16} /> Novo OKR
        </Btn>
      </div>

      <div className="flex gap-3 flex-wrap mb-6">
        <Sel value={filterFrente} onChange={(e) => setFilterFrente(e.target.value)}>
          <option value="all">Todas as frentes</option>
          {frentes.map(f => <option key={f} value={f}>{f}</option>)}
        </Sel>
        <Sel value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
          <option value="all">Ambos (O e KR)</option>
          <option value="O">Apenas Objetivos</option>
          <option value="KR">Apenas Key Results</option>
        </Sel>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar OKR' : 'Novo OKR'}>
        <Sel label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="O">Objetivo</option>
          <option value="KR">Key Result</option>
        </Sel>
        <Sel label="Frente" value={form.frente} onChange={(e) => setForm({ ...form, frente: e.target.value })}>
          <option value="">Nenhuma</option>
          {frentes.map(f => <option key={f} value={f}>{f}</option>)}
        </Sel>
        <Input label="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex: Aumentar receita..." />
        <Sel label="Projeto (opcional)" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
          <option value="">Nenhum</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Sel>
        <Input label="Baseline" type="number" value={form.baseline} onChange={(e) => setForm({ ...form, baseline: Number(e.target.value) })} />
        <Input label="Moonshot" type="number" value={form.moonshot} onChange={(e) => setForm({ ...form, moonshot: Number(e.target.value) })} />
        <Input label="Roofshot" type="number" value={form.roofshot} onChange={(e) => setForm({ ...form, roofshot: Number(e.target.value) })} />
        <Input label="Atual" type="number" value={form.atual} onChange={(e) => setForm({ ...form, atual: Number(e.target.value) })} />
        <Input label="Unidade" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%, unid., etc" />
        <Textarea label="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="mb-4 flex items-center gap-3">
          <input type="checkbox" id="lower" checked={form.lowerIsBetter} onChange={(e) => setForm({ ...form, lowerIsBetter: e.target.checked })} />
          <label htmlFor="lower" className="text-sm text-gray-700">Quanto menor, melhor</label>
        </div>
        <div className="flex gap-2">
          <Btn variant="primary" onClick={handleSave}>{editId ? 'Salvar' : 'Criar'}</Btn>
          <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
        </div>
      </Modal>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(okr => (
          <OkrCard
            key={okr.id}
            okr={okr}
            projects={projects}
            onEdit={() => handleEdit(okr)}
            onDelete={() => handleDelete(okr.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && <div className="text-center py-12"><p className="text-gray-500">Nenhum OKR encontrado com esses filtros.</p></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONFIG VIEW
// ═══════════════════════════════════════════════════════════════
function ConfigView({ holidays, setHolidays, vacations, setVacations, members, absences, setAbsences }) {
  const [holidayDate, setHolidayDate] = useState('');
  const [vacationMemberId, setVacationMemberId] = useState('');
  const [vacationStart, setVacationStart] = useState('');
  const [vacationEnd, setVacationEnd] = useState('');
  const [absenceMemberId, setAbsenceMemberId] = useState('');
  const [absenceDate, setAbsenceDate] = useState('');
  const [absenceType, setAbsenceType] = useState('day_off');

  const handleAddHoliday = () => {
    if (!holidayDate) return;
    setHolidays([...holidays, { id: uid(), date: holidayDate }]);
    setHolidayDate('');
  };

  const handleAddVacation = () => {
    if (!vacationMemberId || !vacationStart || !vacationEnd) return;
    setVacations([...vacations, { id: uid(), memberId: vacationMemberId, startDate: vacationStart, endDate: vacationEnd }]);
    setVacationMemberId('');
    setVacationStart('');
    setVacationEnd('');
  };

  const handleAddAbsence = () => {
    if (!absenceMemberId || !absenceDate) return;
    setAbsences([...absences, { id: uid(), memberId: absenceMemberId, date: absenceDate, type: absenceType }]);
    setAbsenceMemberId('');
    setAbsenceDate('');
    setAbsenceType('day_off');
  };

  const holidaysSorted = useMemo(() => [...holidays].sort((a, b) => a.date.localeCompare(b.date)), [holidays]);
  const vacationsSorted = useMemo(() => [...vacations].sort((a, b) => a.startDate.localeCompare(b.startDate)), [vacations]);
  const absencesSorted = useMemo(() => [...absences].sort((a, b) => a.date.localeCompare(b.date)), [absences]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CalendarX2 size={18} className="text-orange-600" />
          Feriados
        </h3>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className={inputCls} />
            <Btn variant="primary" onClick={handleAddHoliday}>Adicionar</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Data</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Ação</th>
                </tr>
              </thead>
              <tbody>
                {holidaysSorted.map(h => (
                  <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-900">{fmtDate(h.date)}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => setHolidays(holidays.filter(x => x.id !== h.id))} className="text-red-600 hover:text-red-700 text-xs">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {holidaysSorted.length === 0 && <p className="text-gray-500 text-sm py-4">Nenhum feriado cadastrado</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TreePine size={18} className="text-orange-600" />
          Férias
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Sel value={vacationMemberId} onChange={(e) => setVacationMemberId(e.target.value)}>
              <option value="">Membro</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
            <input type="date" value={vacationStart} onChange={(e) => setVacationStart(e.target.value)} className={inputCls} placeholder="Início" />
            <input type="date" value={vacationEnd} onChange={(e) => setVacationEnd(e.target.value)} className={inputCls} placeholder="Fim" />
            <Btn variant="primary" onClick={handleAddVacation}>Adicionar</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Membro</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Início</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Fim</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Ação</th>
                </tr>
              </thead>
              <tbody>
                {vacationsSorted.map(v => (
                  <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-900">{members.find(m => m.id === v.memberId)?.name || v.memberId}</td>
                    <td className="py-2 px-3 text-gray-600">{fmtDate(v.startDate)}</td>
                    <td className="py-2 px-3 text-gray-600">{fmtDate(v.endDate)}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => setVacations(vacations.filter(x => x.id !== v.id))} className="text-red-600 hover:text-red-700 text-xs">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vacationsSorted.length === 0 && <p className="text-gray-500 text-sm py-4">Nenhuma férias cadastrada</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock size={18} className="text-orange-600" />
          Ausências Rápidas
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Sel value={absenceMemberId} onChange={(e) => setAbsenceMemberId(e.target.value)}>
              <option value="">Membro</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
            <input type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)} className={inputCls} />
            <Sel value={absenceType} onChange={(e) => setAbsenceType(e.target.value)}>
              <option value="day_off">Dia Livre</option>
              <option value="treinamento">Treinamento</option>
              <option value="consulta">Consulta</option>
            </Sel>
            <Btn variant="primary" onClick={handleAddAbsence}>Adicionar</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Membro</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Data</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Tipo</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">Ação</th>
                </tr>
              </thead>
              <tbody>
                {absencesSorted.map(a => (
                  <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-900">{members.find(m => m.id === a.memberId)?.name || a.memberId}</td>
                    <td className="py-2 px-3 text-gray-600">{fmtDate(a.date)}</td>
                    <td className="py-2 px-3 text-gray-600 capitalize">{a.type.replace('_', ' ')}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => setAbsences(absences.filter(x => x.id !== a.id))} className="text-red-600 hover:text-red-700 text-xs">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {absencesSorted.length === 0 && <p className="text-gray-500 text-sm py-4">Nenhuma ausência cadastrada</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FILE PICKER SCREEN
// ═══════════════════════════════════════════════════════════════
function FilePickerScreen({ onOpenFile, onNewFile, onNewFileWithDemo, error, isElectron, squadName, onSquadNameChange }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50/30 to-orange-100/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl shadow-orange-100 p-8 border border-orange-100">
          {/* Barra superior laranja Itaú */}
          <div className="h-1.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full mb-8 -mx-8 px-0" style={{marginTop: '-2rem', borderRadius: '1.5rem 1.5rem 0 0'}} />
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-700 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200">
              <FolderKanban size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">QBR Manager</h1>
          <p className="text-center text-gray-600 mb-8">Gerencie sprints, equipe, projetos e OKRs</p>

          {!isElectron && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-sm text-yellow-800">Modo Demo: Funcionando em navegador sem Electron</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Nome do Squad</label>
            <input type="text" value={squadName} onChange={(e) => onSquadNameChange(e.target.value)} className={inputCls} placeholder="ex: Squad Backend" />
          </div>

          <div className="space-y-3">
            {isElectron && (
              <>
                <Btn className="w-full" onClick={onOpenFile}>
                  <FolderOpen size={16} /> Abrir Arquivo
                </Btn>
                <Btn className="w-full" variant="secondary" onClick={onNewFile}>
                  <FilePlus2 size={16} /> Novo Arquivo
                </Btn>
              </>
            )}
            <Btn className="w-full" variant={isElectron ? 'secondary' : 'primary'} onClick={onNewFileWithDemo}>
              <Database size={16} /> {isElectron ? 'Demo com Dados' : 'Começar Demo'}
            </Btn>
          </div>

          <p className="text-center text-xs text-gray-500 mt-6">Todos os dados são salvos automaticamente no arquivo Excel</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RISCOS VIEW
// ═══════════════════════════════════════════════════════════════
function RiscosView({ riscos, setRiscos, members }) {
  const [modal, setModal] = useState(null); // null | 'new' | risco.id
  const [rf, setRf] = useState({ title: '', description: '', category: 'tecnico', probability: 'media', impact: 'medio', status: 'aberto', mitigation: '', ownerId: '' });
  const [filter, setFilter] = useState('todos'); // todos | aberto | mitigado | fechado

  const openNew  = () => { setRf({ title: '', description: '', category: 'tecnico', probability: 'media', impact: 'medio', status: 'aberto', mitigation: '', ownerId: '' }); setModal('new'); };
  const openEdit = (r)  => { setRf({ ...r }); setModal(r.id); };

  const handleSave = () => {
    if (!rf.title) return;
    if (modal === 'new') {
      setRiscos(prev => [...prev, { ...rf, id: uid() }]);
    } else {
      setRiscos(prev => prev.map(r => r.id === modal ? { ...rf, id: r.id } : r));
    }
    setModal(null);
  };

  const handleDelete = (id) => setRiscos(prev => prev.filter(r => r.id !== id));

  const handleClose  = (id) => setRiscos(prev => prev.map(r => r.id === id ? { ...r, status: 'fechado' } : r));
  const handleMitigate = (id) => setRiscos(prev => prev.map(r => r.id === id ? { ...r, status: 'mitigado' } : r));

  const visible = riscos.filter(r => filter === 'todos' || r.status === filter);

  // ── Matriz 3×3 ──────────────────────────────────────────────
  const PROBS   = ['alta', 'media', 'baixa'];
  const IMPACTS = ['baixo', 'medio', 'alto'];
  const abertos = riscos.filter(r => r.status === 'aberto');

  const cellRiscos = (prob, impact) => abertos.filter(r => r.probability === prob && r.impact === impact);

  const cellBg = (prob, impact) => {
    const s = RISCO_SCORE[prob] * RISCO_SCORE[impact];
    if (s <= 2) return 'bg-green-50 border-green-200';
    if (s <= 4) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  const STATUS_STYLE = {
    aberto:   { badge: 'bg-red-100 text-red-700',    label: 'Aberto'   },
    mitigado: { badge: 'bg-amber-100 text-amber-700', label: 'Mitigado' },
    fechado:  { badge: 'bg-gray-100 text-gray-500',  label: 'Fechado'  },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Radar de Riscos</h2>
          <p className="text-sm text-gray-500 mt-1">Mapeie e acompanhe os riscos do projeto por probabilidade e impacto</p>
        </div>
        <Btn onClick={openNew}><Plus size={16} /> Novo Risco</Btn>
      </div>

      {/* ── Matriz 3×3 ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <ShieldAlert size={18} className="text-orange-600" />
          <h3 className="font-semibold text-gray-900">Matriz de Risco — Riscos Abertos</h3>
          <span className="text-xs text-gray-400">probabilidade × impacto</span>
        </div>

        <div className="flex gap-3">
          {/* Y-axis label */}
          <div className="flex flex-col items-center justify-center w-6 shrink-0">
            <span className="text-xs text-gray-400 font-medium" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>PROBABILIDADE ↑</span>
          </div>

          <div className="flex-1">
            {/* Matrix grid */}
            <div className="grid gap-1" style={{ gridTemplateColumns: '80px 1fr 1fr 1fr' }}>
              {/* Header row */}
              <div />
              {IMPACTS.map(imp => (
                <div key={imp} className="text-center text-xs font-semibold text-gray-500 py-1 capitalize">{imp}</div>
              ))}
              {/* Data rows */}
              {PROBS.map(prob => (
                <>
                  <div key={prob + '_label'} className="flex items-center justify-end pr-2">
                    <span className="text-xs font-semibold text-gray-500 capitalize">{prob}</span>
                  </div>
                  {IMPACTS.map(impact => {
                    const items = cellRiscos(prob, impact);
                    const cat = RISCO_CATEGORY[items[0]?.category];
                    return (
                      <div key={prob + impact} className={`min-h-[72px] rounded-xl border p-2 flex flex-wrap gap-1 content-start ${cellBg(prob, impact)}`}>
                        {items.map(r => {
                          const CatIcon = RISCO_CATEGORY[r.category]?.icon ?? ShieldAlert;
                          return (
                            <button
                              key={r.id}
                              onClick={() => openEdit(r)}
                              title={r.title}
                              className="w-7 h-7 rounded-lg flex items-center justify-center hover:scale-110 transition-transform shadow-sm text-white text-xs font-bold"
                              style={{ backgroundColor: RISCO_CATEGORY[r.category]?.color ?? '#6B7280' }}
                            >
                              <CatIcon size={13} />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>

            {/* X-axis label */}
            <div className="text-center mt-2 text-xs text-gray-400 font-medium tracking-wide">IMPACTO →</div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-200"/><span>Baixo risco</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-200"/><span>Médio risco</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-200"/><span>Alto risco</span></div>
          <div className="ml-auto flex flex-wrap gap-3">
            {Object.entries(RISCO_CATEGORY).map(([key, v]) => {
              const Icon = v.icon;
              return (
                <div key={key} className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: v.color }}>
                    <Icon size={11} className="text-white" />
                  </div>
                  <span>{v.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Lista de riscos ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Todos os Riscos ({riscos.length})</h3>
          <div className="flex gap-1">
            {['todos', 'aberto', 'mitigado', 'fechado'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${filter === s ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <ShieldAlert size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum risco {filter !== 'todos' ? filter : 'cadastrado'}.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visible.map(r => {
              const level  = riscoLevel(r.probability, r.impact);
              const CatIcon = RISCO_CATEGORY[r.category]?.icon ?? ShieldAlert;
              const owner  = members.find(m => m.id === r.ownerId);
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.aberto;
              return (
                <div key={r.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50/50 group">
                  {/* Category icon */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                    style={{ backgroundColor: RISCO_CATEGORY[r.category]?.color ?? '#6B7280' }}>
                    <CatIcon size={16} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{r.title}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${level.cls}`}>{level.label}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.badge}`}>{st.label}</span>
                    </div>
                    {r.description && <p className="text-xs text-gray-500 mb-1 line-clamp-1">{r.description}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                      <span className="capitalize">{RISCO_CATEGORY[r.category]?.label}</span>
                      <span>Prob: <strong className="text-gray-600 capitalize">{r.probability}</strong></span>
                      <span>Impacto: <strong className="text-gray-600 capitalize">{r.impact}</strong></span>
                      {owner && <span>Responsável: <strong className="text-gray-600">{owner.name}</strong></span>}
                      {r.mitigation && <span>Mitigação: <em className="text-gray-600">{r.mitigation}</em></span>}
                    </div>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {r.status === 'aberto' && (
                      <button onClick={() => handleMitigate(r.id)} title="Marcar como mitigado"
                        className="p-1.5 hover:bg-amber-50 rounded-lg" ><CheckCheck size={14} className="text-amber-600" /></button>
                    )}
                    <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-orange-50 rounded-lg"><Edit3 size={14} className="text-orange-600" /></button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-500" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal Novo/Editar Risco ── */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'new' ? 'Novo Risco' : 'Editar Risco'}>
        <Input label="Título do Risco" value={rf.title} onChange={e => setRf({ ...rf, title: e.target.value })} placeholder="ex: Dependência crítica sem substituto" />
        <Textarea label="Descrição" value={rf.description} onChange={e => setRf({ ...rf, description: e.target.value })} placeholder="Contexto e detalhes do risco..." />
        <div className="grid grid-cols-2 gap-3">
          <Sel label="Categoria" value={rf.category} onChange={e => setRf({ ...rf, category: e.target.value })}>
            {Object.entries(RISCO_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Sel>
          <Sel label="Status" value={rf.status} onChange={e => setRf({ ...rf, status: e.target.value })}>
            <option value="aberto">Aberto</option>
            <option value="mitigado">Mitigado</option>
            <option value="fechado">Fechado</option>
          </Sel>
          <Sel label="Probabilidade" value={rf.probability} onChange={e => setRf({ ...rf, probability: e.target.value })}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </Sel>
          <Sel label="Impacto" value={rf.impact} onChange={e => setRf({ ...rf, impact: e.target.value })}>
            <option value="baixo">Baixo</option>
            <option value="medio">Médio</option>
            <option value="alto">Alto</option>
          </Sel>
        </div>
        <Textarea label="Plano de Mitigação" value={rf.mitigation} onChange={e => setRf({ ...rf, mitigation: e.target.value })} placeholder="Como vai reduzir ou eliminar o risco..." />
        <Sel label="Responsável" value={rf.ownerId} onChange={e => setRf({ ...rf, ownerId: e.target.value })}>
          <option value="">Ninguém</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Sel>
        <div className="flex gap-2 mt-2">
          <Btn variant="primary" onClick={handleSave}>Salvar</Btn>
          <Btn variant="secondary" onClick={() => setModal(null)}>Cancelar</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { id: 'dashboard', label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'sprints',   label: 'Sprints',       icon: Calendar        },
  { id: 'team',      label: 'Equipe',        icon: Users           },
  { id: 'projects',  label: 'Projetos',      icon: FolderKanban    },
  { id: 'okrs',      label: 'OKRs & KPIs',  icon: Target          },
  { id: 'riscos',    label: 'Riscos',        icon: ShieldAlert     },
  { id: 'config',    label: 'Configurações', icon: Settings2       },
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
  const [tab,             setTab]             = useState('dashboard');
  const [sprints,         setSprints]         = useState([]);
  const [members,         setMembers]         = useState([]);
  const [projects,        setProjects]        = useState([]);
  const [okrs,            setOkrs]            = useState([]);
  const [holidays,        setHolidays]        = useState([]);
  const [vacations,       setVacations]       = useState([]);
  const [absences,        setAbsences]        = useState([]);
  const [capacityConfigs, setCapacityConfigs] = useState([]);
  const [riscos,          setRiscos]          = useState([]);

  // Ref usado para bloquear auto-save no primeiro render após carregar
  // (evita que o carregamento acione save desnecessário e crie abas novas)
  const blockSaveRef = useRef(false);

  // ── Load data from Excel ────────────────────────────────────
  const loadFromFile = useCallback(async (path) => {
    setLoadError(null);
    blockSaveRef.current = true; // bloqueia saves até o efeito rodar
    setDataLoaded(false);
    try {
      const data = await api.loadData(path);
      if (data.error && !data.sprints) {
        setLoadError(data.error);
        return;
      }
      if (data.error) setLoadError(data.error);

      setSprints(fromExcel.sprints(data.sprints    || []));
      setMembers(fromExcel.members(data.equipe     || []));
      setProjects(fromExcel.projects(data.projetos || [], data.historias || []));
      setOkrs(fromExcel.okrs(data.okrs             || []));
      setHolidays(fromExcel.holidays(data.feriados              || []));
      setVacations(fromExcel.vacations(data.ferias             || []));
      setAbsences(fromExcel.absences(data.ausencias            || []));
      setCapacityConfigs(fromExcel.capacityConfigs(data.capacidade_config || []));
      setRiscos(fromExcel.riscos(data.riscos || []));
      setFilePath(path);
      try { localStorage.setItem('cj_filePath', path); } catch {}
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

  // Helper: verifica se pode salvar (bloqueia logo após carregar arquivo)
  const canSave = () => {
    if (blockSaveRef.current) { blockSaveRef.current = false; return false; }
    return true;
  };

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Sprints', toExcel.sprints(sprints));
  }, [sprints, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Equipe', toExcel.members(members));
  }, [members, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Projetos',  toExcel.projects(projects));
    save('Backlog', toExcel.stories(projects));
  }, [projects, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('OKRs', toExcel.okrs(okrs));
  }, [okrs, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Feriados', toExcel.holidays(holidays));
  }, [holidays, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Ferias', toExcel.vacations(vacations));
  }, [vacations, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Ausencias', toExcel.absences(absences));
  }, [absences, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Capacidade', toExcel.capacityConfigs(capacityConfigs));
  }, [capacityConfigs, dataLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('Riscos', toExcel.riscos(riscos));
  }, [riscos, dataLoaded]); // eslint-disable-line

  // ── Force save all sheets ───────────────────────────────────
  const saveAll = useCallback(async () => {
    if (!filePath || !dataLoaded) return;
    setIsSaving(true);
    try {
      await Promise.all([
        api.saveSheet(filePath, 'Sprints',    toExcel.sprints(sprints)),
        api.saveSheet(filePath, 'Equipe',     toExcel.members(members)),
        api.saveSheet(filePath, 'Projetos',   toExcel.projects(projects)),
        api.saveSheet(filePath, 'Backlog',    toExcel.stories(projects)),
        api.saveSheet(filePath, 'OKRs',       toExcel.okrs(okrs)),
        api.saveSheet(filePath, 'Feriados',   toExcel.holidays(holidays)),
        api.saveSheet(filePath, 'Ferias',     toExcel.vacations(vacations)),
        api.saveSheet(filePath, 'Ausencias',  toExcel.absences(absences)),
        api.saveSheet(filePath, 'Capacidade', toExcel.capacityConfigs(capacityConfigs)),
        api.saveSheet(filePath, 'Riscos',     toExcel.riscos(riscos)),
      ]);
      setLastSaved(new Date());
    } finally {
      setIsSaving(false);
    }
  }, [filePath, dataLoaded, sprints, members, projects, okrs, holidays, vacations, absences, capacityConfigs, riscos]);

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
    setHolidays([]);
    setVacations([]);
    setAbsences([]);
    setCapacityConfigs([]);
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50/40 via-white to-amber-50/20 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-orange-100/60 flex flex-col z-40 shadow-sm">
        {/* Barra laranja Itaú no topo */}
        <div className="h-1 bg-gradient-to-r from-orange-500 to-orange-600 w-full" />
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-md shadow-orange-200">
              <Layers size={18} className="text-white" />
            </div>
            <div>
              {squadName ? (
                <>
                  <h1 className="text-sm font-bold text-gray-900 leading-tight">Squad</h1>
                  <h1 className="text-sm font-bold text-orange-600 leading-tight truncate max-w-[140px]" title={squadName}>{squadName}</h1>
                </>
              ) : (
                <>
                  <h1 className="text-base font-bold text-gray-900 leading-tight">Manager Team</h1>
                  <h1 className="text-base font-bold text-orange-600 leading-tight">QBR</h1>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-orange-600 text-white shadow-md shadow-orange-200' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                <t.icon size={17} />{t.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          {/* Current sprint info */}
          <div className="bg-orange-50 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-orange-700 mb-0.5">{currentSprint?.name ?? 'Sprint não configurada'}</p>
            <p className="text-xs text-orange-500">{currentSprint ? `${fmtDate(currentSprint.startDate)} – ${fmtDate(currentSprint.endDate)}` : 'Configure em Sprints'}</p>
          </div>

          {/* DoR warning */}
          {totalDorIssues > 0 && (
            <div className="bg-red-50 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-600 font-medium">{totalDorIssues} item(s) sem DoR</p>
            </div>
          )}

          {/* Save status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {isSaving
                ? <><RefreshCw size={11} className="animate-spin text-orange-400" /> Salvando...</>
                : lastSaved
                  ? <><Save size={11} className="text-green-500" /> Salvo {lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
                  : <><HardDrive size={11} /> Excel pronto</>
              }
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={saveAll}
                disabled={isSaving}
                title="Forçar salvamento de todos os dados"
                className="text-orange-400 hover:text-orange-600 transition-colors disabled:opacity-40"
              >
                <Save size={14} />
              </button>
              <button onClick={handleDisconnect} title="Trocar arquivo" className="text-gray-300 hover:text-gray-500 transition-colors">
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          {/* Crédito */}
          <div className="pt-3 mt-1 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 leading-tight">Desenvolvido por</p>
            <p className="text-xs font-semibold text-orange-400 leading-tight mt-0.5">
              Rafael de Lima Santos
            </p>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="ml-64 p-8 max-w-[1400px]">
        {tab === 'dashboard' && <DashboardView sprints={sprints} members={members} projects={projects} holidays={holidays} vacations={vacations} absences={absences} capacityConfigs={capacityConfigs} riscos={riscos} />}
        {tab === 'sprints'   && <SprintsView sprints={sprints} setSprints={setSprints} projects={projects} setProjects={setProjects} members={members} holidays={holidays} />}
        {tab === 'team'      && <TeamView members={members} setMembers={setMembers} setProjects={setProjects} projects={projects} sprints={sprints} filePath={filePath} holidays={holidays} vacations={vacations} setVacations={setVacations} absences={absences} setAbsences={setAbsences} capacityConfigs={capacityConfigs} setCapacityConfigs={setCapacityConfigs} />}
        {tab === 'projects'  && <ProjectsView projects={projects} setProjects={setProjects} members={members} sprints={sprints} />}
        {tab === 'okrs'      && <OKRsView okrs={okrs} setOkrs={setOkrs} projects={projects} />}
        {tab === 'riscos'    && <RiscosView riscos={riscos} setRiscos={setRiscos} members={members} />}
        {tab === 'config'    && <ConfigView holidays={holidays} setHolidays={setHolidays} vacations={vacations} setVacations={setVacations} members={members} absences={absences} setAbsences={setAbsences} />}
      </main>
    </div>
  );
}
