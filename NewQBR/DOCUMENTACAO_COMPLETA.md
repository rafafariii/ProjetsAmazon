# Manager Team QBR — Documentação Completa

> Versão documentada: Junho 2026  
> Stack: Electron 31 + React 18 + Vite 5 + Tailwind CSS 3 + xlsx (SheetJS)

---

## 1. Visão Geral

**Manager Team QBR** é uma aplicação desktop (Electron) desenvolvida para gestão de squads ágeis em ambiente corporativo. Permite que times de PM, PO e TCL gerenciem sprints, capacidade da equipe, projetos, backlog, OKRs/KPIs e riscos — tudo com persistência em arquivo `.xlsx`, sem necessidade de banco de dados ou servidor.

O arquivo Excel funciona como "banco de dados portátil": pode ser editado diretamente por múltiplas pessoas (colaboração via rede/sharepoint) e depois carregado na aplicação para visualização e gestão.

---

## 2. Arquitetura Técnica

### 2.1 Processos Electron

```
Main Process (main.js)        ←→       Renderer Process (React/Vite)
  Node.js + xlsx (SheetJS)               App.jsx + Tailwind CSS
  Leitura/escrita de arquivos            Todo o UI
  Diálogos nativos (dialog)
  IPC handlers
        ↕ contextBridge (preload.js)
  window.electronAPI (5 métodos expostos de forma segura)
```

### 2.2 Segurança IPC
- `contextIsolation: true` — renderer isolado do Node.js
- `nodeIntegration: false` — sem acesso direto ao Node no renderer
- `sandbox: false` — apenas para permitir o preload usar `require()`
- Somente 5 métodos são expostos via `contextBridge.exposeInMainWorld`

### 2.3 Stack de Dependências

| Categoria | Lib | Versão |
|-----------|-----|--------|
| Framework desktop | electron | ^31.0.0 |
| Build/bundler | vite + @vitejs/plugin-react | ^5.3.1 |
| UI | react + react-dom | ^18.3.1 |
| Estilos | tailwindcss + postcss + autoprefixer | ^3.4.4 |
| Ícones | lucide-react | ^0.383.0 |
| Gráficos | recharts | ^2.12.7 |
| Excel | xlsx (SheetJS) | ^0.18.5 |
| Dev tooling | concurrently, cross-env, wait-on | — |
| Packaging | electron-builder | ^24.13.3 |

### 2.4 Scripts npm

```json
"dev":      "concurrently vite + electron (wait-on http://localhost:5173)"
"build":    "vite build"
"dist":     "vite build && electron-builder (todos os targets)"
"dist:mac": "vite build && electron-builder --mac"
"dist:win": "vite build && electron-builder --win"
"dist:linux":"vite build && electron-builder --linux"
```

### 2.5 Build / Packaging

- `appId`: `br.com.controle-jornada`
- `productName`: `Controle de Jornada`
- `asar: true`
- Arquivos empacotados: `dist/**/*`, `main.js`, `preload.js`
- Targets:
  - macOS → `dmg` + `zip`
  - Windows → `nsis` (instalador com opção de diretório) + `portable`
  - Linux → `AppImage` + `deb` (categoria Office)

---

## 3. Estrutura de Arquivos

```
electron-app/
├── main.js          # Processo principal Electron
├── preload.js       # Ponte contextBridge
├── index.html       # Entry HTML (título: Controle de Jornada)
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx     # Ponto de entrada React (ReactDOM.createRoot)
    ├── App.jsx      # Toda a aplicação (~2500 linhas, arquivo único)
    └── index.css    # Estilos globais + CSS variables Itaú
```

---

## 4. Design System (Itaú Brand)

### 4.1 Fontes
- **Inter** (Google Fonts) — pesos: 400, 500, 600, 700, 800
- Fallbacks: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`
- `-webkit-font-smoothing: antialiased` ativado

### 4.2 Paleta de Cores (CSS Variables)
```css
--itau-orange:       #EC7000   /* laranja principal, botões, destaques */
--itau-orange-dark:  #C55F00   /* hover states */
--itau-orange-light: #FF8C1A   /* variante clara */
--itau-orange-bg:    #FFF3E0   /* background de cards de destaque */
--itau-dark:         #1D1D1B   /* texto principal */
--itau-warm-bg:      #FFFBF7   /* fundo da aplicação (branco quente) */
```

### 4.3 Shapes "Pedra"
```css
.pedra    { border-radius: 18px; }   /* cards, modais, containers */
.pedra-sm { border-radius: 12px; }   /* botões, badges pequenos */
```

### 4.4 Scrollbar Personalizado
```css
/* Thumb: #f5c894 normal, #EC7000 hover — estilo fino (6px) */
```

### 4.5 Animação de Entrada
```css
@keyframes fadeSlideIn { from: opacity:0, translateY(6px); to: opacity:1, translateY(0); }
.animate-fade-in { animation: fadeSlideIn 0.2s ease-out; }
```

### 4.6 Focus Ring
- `outline: 2px solid #EC7000` com `outline-offset: 2px`

### 4.7 Seleção de Texto
- `background: #EC700030` (laranja translúcido)

---

## 5. API Electron (window.electronAPI)

Todos os métodos são `async` e retornam Promises. O fallback para desenvolvimento em browser sem Electron é definido no início de `App.jsx`.

### `selectFile(mode: 'open' | 'save') → Promise<string|null>`
- Abre diálogo nativo do sistema operacional
- `'open'` → filtro `.xlsx/.xls`, retorna caminho do arquivo ou `null`
- `'save'` → sugestão `controle-jornada.xlsx`, retorna caminho ou `null`

### `loadData(filePath: string) → Promise<DataObject|{error}>`
- Lê todas as abas do Excel
- Retorna objeto com keys: `sprints, equipe, projetos, historias, okrs, feriados, ferias, ausencias, capacidade_config, riscos`
- Suporta leitura com fallback para nomes de abas legados (ver Seção 8)

### `saveSheet(filePath, sheetName, data[]) → Promise<{success}|{error}>`
- Salva uma aba específica preservando todas as outras
- Utiliza `writeQueue` (fila de promessas) para evitar race conditions em saves simultâneos

### `createTemplate(filePath, withDemo: boolean) → Promise<{success}|{error}>`
- Cria arquivo Excel do zero com todas as abas e cabeçalhos
- `withDemo=true` → inclui dados de exemplo prontos para visualizar
- `withDemo=false` → cria apenas com cabeçalhos (template vazio)

### `selectAvatar(dbFilePath) → Promise<string|null>`
- Abre diálogo para selecionar imagem (jpg, jpeg, png, webp)
- Copia o arquivo para `avatars/` no mesmo diretório do Excel
- Retorna caminho absoluto da imagem copiada

---

## 6. Estrutura do Excel (Banco de Dados)

O arquivo `.xlsx` possui 10 abas. Cada aba corresponde a uma entidade do sistema.

### 6.1 Sprints
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | Identificador único (ex: `sp1`) |
| nome | string | Nome da sprint (ex: `Sprint 1`) |
| data_inicio | string YYYY-MM-DD | Data de início |
| data_fim | string YYYY-MM-DD | Data de término |
| status | enum | `futura` \| `atual` \| `encerrada` |

**Regra:** Apenas uma sprint pode ter `status = 'atual'` por vez (não há validação hard, é convenção do usuário).

### 6.2 Equipe
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | Identificador único (ex: `m1`) |
| nome | string | Nome completo do membro |
| avatar_url | string | Caminho absoluto da imagem (pode ser vazio) |

### 6.3 Projetos
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | Identificador único (ex: `p1`) |
| nome | string | Nome do projeto |
| cor | string hex | Cor de identificação visual (default: `#EC7000`) |
| data_inicio | string YYYY-MM-DD | |
| data_fim | string YYYY-MM-DD | |

### 6.4 Backlog (antigo: Historias)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | Identificador único |
| projeto_id | string | FK → Projetos.id |
| sprint_id | string | FK → Sprints.id (pode ser vazio) |
| responsavel_id | string | FK → Equipe.id (pode ser vazio) |
| titulo | string | Título do item |
| descricao | string | Descrição detalhada |
| estimativa | number\|null | Horas estimadas |
| story_points | number\|null | Story points |
| tipo | enum | `historia` \| `task` \| `bug` |

### 6.5 OKRs
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| tipo | enum | `KR` \| `KPI` |
| frente | string | Frente estratégica (ex: `Modernização`) |
| titulo | string | Título do objetivo/resultado |
| projeto_id | string | FK → Projetos.id |
| baseline | number | Valor de partida |
| moonshot | number | Meta ambiciosa |
| roofshot | number | Meta conservadora |
| atual | number | Valor atual medido |
| unidade | string | Unidade de medida (ex: `%`, `pts`, `min`) |
| descricao | string | Contexto |
| lower_is_better | 0\|1 | 1 = quanto menor, melhor |

### 6.6 Feriados (antigo: Config_Feriados)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| data | string YYYY-MM-DD | Data do feriado |

### 6.7 Ferias (antigo: Equipe_Ferias)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| membro_id | string | FK → Equipe.id |
| data_inicio | string YYYY-MM-DD | |
| data_fim | string YYYY-MM-DD | |

### 6.8 Ausencias
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| membro_id | string | FK → Equipe.id |
| data | string YYYY-MM-DD | |
| tipo | string | `day_off` \| `treinamento` \| etc |

### 6.9 Capacidade (antigo: Capacidade_Config)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| membro_id | string | FK → Equipe.id |
| sprint_id | string | FK → Sprints.id |
| horas_projeto_dia | number | Horas de projeto por dia (default: 6) |
| horas_cerimonias_dia | number | Horas de cerimônias por dia (default: 2) |

### 6.10 Riscos
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| titulo | string | |
| descricao | string | Contexto e detalhes |
| categoria | enum | `tecnico` \| `negocio` \| `dependencia` \| `operacional` |
| probabilidade | enum | `baixa` \| `media` \| `alta` |
| impacto | enum | `baixo` \| `medio` \| `alto` |
| status | enum | `aberto` \| `mitigado` \| `fechado` |
| mitigacao | string | Plano de mitigação |
| responsavel_id | string | FK → Equipe.id |

---

## 7. Gerenciamento de Estado (App.jsx)

### 7.1 Estados Principais
```javascript
// Arquivo/sessão
filePath         // caminho do .xlsx atual (persiste em localStorage)
squadName        // nome do squad (persiste em localStorage)
dataLoaded       // boolean — dados carregados com sucesso
loadError        // string|null — mensagem de erro
isSaving         // boolean — feedback visual
lastSaved        // Date|null

// Dados da aplicação
sprints          // Sprint[]
members          // Member[]
projects         // Project[] — contém stories[] aninhadas
okrs             // OKR[]
holidays         // Holiday[]
vacations        // Vacation[]
absences         // Absence[]
capacityConfigs  // CapacityConfig[]
riscos           // Risco[]
```

### 7.2 Transformações Excel ↔ Estado

Dois objetos utilitários realizam a conversão bidirecional:

- **`fromExcel`**: Converte linhas brutas do xlsx (nomes em português) para objetos de estado (nomes em inglês/camelCase)
- **`toExcel`**: Converte estado da aplicação de volta para linhas do xlsx

Exemplo do mapeamento para Backlog:
```
Excel: projeto_id, sprint_id, responsavel_id, titulo, estimativa, story_points, tipo
App:   projectId,  sprintId,  assignee,        title,  hours,      storyPoints,  type
```

### 7.3 Auto-Save Pattern

Cada entidade possui um `useEffect` dedicado que salva automaticamente quando o estado muda:
```javascript
useEffect(() => {
  if (!dataLoaded || !filePath || !canSave()) return;
  save('Backlog', toExcel.stories(projects));
}, [projects, dataLoaded]);
```

**Mecanismo `blockSaveRef`**: Evita que o carregamento inicial dispare auto-saves desnecessários. Um `useRef` é setado como `true` antes do carregamento e limpo na primeira execução de qualquer efeito de save.

### 7.4 Race Condition Prevention

A função `writeSheet` em `main.js` usa uma fila global (`writeQueue`) baseada em chain de Promises:
```javascript
let writeQueue = Promise.resolve();
function writeSheet(...) {
  writeQueue = writeQueue.then(() => { /* operação de escrita */ });
  return writeQueue;
}
```
Isso garante que saves simultâneos (múltiplos `useEffect` disparando ao mesmo tempo) sejam executados sequencialmente, sem risco de um sobrescrever o outro.

---

## 8. Migração de Nomes de Abas (Legado)

Abas foram renomeadas para nomes mais amigáveis. O sistema suporta arquivos antigos automaticamente.

### 8.1 Mapa de Renomeação
| Novo (atual) | Antigo (legado) |
|---|---|
| `Backlog` | `Historias` |
| `Feriados` | `Config_Feriados` |
| `Ferias` | `Equipe_Ferias` |
| `Capacidade` | `Capacidade_Config` |

### 8.2 Leitura com Fallback (`readAny`)
```javascript
const readAny = (wb, ...names) => {
  for (const n of names) {
    const rows = readSheet(wb, n);
    if (rows.length > 0) return rows;
  }
  return [];
};
// Ex: readAny(workbook, 'Backlog', 'Historias')
```

### 8.3 Migração Automática na Escrita
Quando um arquivo com nomes antigos é carregado e qualquer dado é salvo, a função `writeSheet` detecta a aba legada e a remove automaticamente:
```javascript
const LEGACY_SHEET_NAMES = { 'Backlog': 'Historias', ... };
// Se 'Historias' existe e estamos escrevendo 'Backlog' → deleta 'Historias'
```

---

## 9. Módulos (Views) da Aplicação

### 9.1 Dashboard
**Localização no menu:** Aba 1 — ícone `LayoutDashboard`

**Conteúdo:**
- 4 Stat Cards: Sprint Atual, Nº de Membros, Itens com Estimativa (X/Y), Riscos Abertos
- Card "Radar de Riscos" — mostra contagem de Alto impacto / Abertos / Mitigados + lista dos 3 mais críticos
- Card "Capacidade por Membro" — barra de progresso por membro mostrando horas alocadas vs. capacidade na sprint atual. Indica OVERLOAD em vermelho quando horas alocadas > capacidade
- Cards por Projeto — DoR (Definition of Ready) por projeto: verde (100% com estimativa), amarelo (<50% sem estimativa), vermelho (≥50% sem estimativa)
- **Gantt Timeline** — linha do tempo dos projetos com swimlanes por membro, barras coloridas por projeto

**Cálculo de Capacidade:**
```
diasUteis = dias úteis entre início e fim da sprint (excluindo feriados)
diasVacas = dias de férias do membro que coincidem com a sprint
diasAusencias = ausências avulsas do membro na sprint
diasDisp = diasUteis - diasVacas - diasAusencias
horasProjeto = diasDisp × horas_projeto_dia
horasCerimonias = diasDisp × horas_cerimonias_dia
```

### 9.2 Sprints
**Localização no menu:** Aba 2 — ícone `Calendar`

**Funcionalidades:**
- Listagem de sprints em cards expansíveis (chevron up/down)
- Cada card mostra: nome, período, dias úteis totais, dias restantes (se sprint atual), nº de itens, horas totais
- Ao expandir: lista de histórias da sprint (com badge de tipo, horas e story points)
- Criar, editar e deletar sprint via modal
- Ao deletar sprint: todos os itens do backlog têm `sprintId` zerado (dissociação automática)

**Campos do formulário:**
- Nome, Data de Início, Data de Término, Status (futura/atual/encerrada)

**Badges de status:**
- `atual` → laranja
- `encerrada` → cinza
- `futura` → azul

### 9.3 Equipe
**Localização no menu:** Aba 3 — ícone `Users`

**Funcionalidades:**
- Cards de membros com avatar (foto ou inicial gerada com cor hash da paleta)
- Upload de foto de avatar (cópia local para pasta `avatars/` ao lado do Excel)
- Adicionar / editar / remover membros
- Ao remover membro: itens do backlog têm `assignee` zerado
- Sub-seção "Capacidade por Sprint": tabela com horas de projeto e cerimônias por sprint por membro, editável inline
- Sub-seção "Férias": período de férias por membro (impacta cálculo de capacidade)
- Sub-seção "Ausências": dias avulsos por membro (day_off, treinamento, etc.)

**Avatar:**
- Geração automática de cor por hash do nome (paleta de 8 cores: laranja, rosa, teal, âmbar, violeta, vermelho, azul, verde)
- Exibe inicial(is) do nome em branco sobre o fundo colorido
- Se `avatarUrl` presente: usa `file://` + caminho absoluto

### 9.4 Projetos
**Localização no menu:** Aba 4 — ícone `FolderKanban`

**Funcionalidades:**
- Cards de projetos com cor personalizável (color picker nativo)
- Criar / editar / deletar projetos
- Para cada projeto: lista de stories/tasks/bugs com modal de adição/edição
- Badges de tipo: História (verde sólido, texto branco), Task (azul sólido, texto branco), Bug (vermelho sólido, texto branco)
- Campos da história/task: Título, Responsável (select com membros), Sprint (select com sprints), Tipo (história/task/bug), Story Points, Horas, Descrição

**Regra de edição de stories:**
```javascript
// Usa functional update para evitar stale closure
setProjects(prev => prev.map(p => {
  if (p.id !== resolvedProjId) return p;
  return { ...p, stories: p.stories.map(s => s.id === storyModal ? { ...s, ...campos } : s) };
}));
```

### 9.5 OKRs & KPIs
**Localização no menu:** Aba 5 — ícone `Target`

**Funcionalidades:**
- Listagem de OKRs e KPIs com badge diferenciador
- Barra de progresso visual: baseline → moonshot → roofshot
- Suporte a `lowerIsBetter` (inverte a lógica de progresso — ex: tempo de resposta)
- Frentes estratégicas pré-definidas: Engenharia, Produto, Design, Marketing, Suporte, Modernização, Experiência, Eficiência, Dados & Analytics, Atendimento
- Associação a projeto (opcional)
- Criar / editar / deletar via modal

**Campos:** Tipo (KR/KPI), Frente, Título, Projeto, Baseline, Moonshot, Roofshot, Valor Atual, Unidade, Lower is Better, Descrição

### 9.6 Radar de Riscos
**Localização no menu:** Aba 6 — ícone `ShieldAlert`

**Funcionalidades:**
- Matriz de risco 3×3 (Probabilidade × Impacto) com células coloridas
  - Verde (score ≤ 2): baixa × baixo
  - Âmbar (score ≤ 4): casos médios
  - Vermelho (score ≥ 6): combinações críticas
- Score = `RISCO_SCORE[prob]` × `RISCO_SCORE[impact]` (1-3 cada)
- Cada célula da matriz mostra os riscos abertos posicionados nela (ícone da categoria + título truncado)
- Lista filtrada por status (todos / aberto / mitigado / fechado)
- Ações rápidas: Marcar como Mitigado, Fechar, Editar, Deletar
- Modal de criação/edição completo

**Categorias de Risco:**
| Categoria | Cor | Ícone |
|-----------|-----|-------|
| `tecnico` | `#3B82F6` (azul) | `Wrench` |
| `negocio` | `#F59E0B` (âmbar) | `BarChart3` |
| `dependencia` | `#8B5CF6` (violeta) | `Unlink` |
| `operacional` | `#14B8A6` (teal) | `Settings2` |

**Status de Risco:**
| Status | Cor |
|--------|-----|
| `aberto` | vermelho |
| `mitigado` | âmbar |
| `fechado` | cinza |

**Campos do formulário:** Título*, Categoria, Probabilidade, Impacto, Status, Responsável, Descrição, Plano de Mitigação

### 9.7 Configurações
**Localização no menu:** Aba 7 — ícone `Settings2`

**Funcionalidades:**
- Feriados: adicionar/remover datas (impactam cálculo de dias úteis em todas as sprints)
- Férias: gestão de períodos de férias por membro
- Ausências avulsas: gestão de faltas/day_off/treinamentos por membro

---

## 10. Componentes UI Atômicos (definidos em App.jsx)

| Componente | Descrição |
|------------|-----------|
| `Avatar` | Foto ou inicial gerada por hash. Props: `name, avatarUrl, size, ring` |
| `StatCard` | Card de métrica com ícone, label, valor e sub-texto. Props: `icon, label, value, sub, color` |
| `ProgressBar` | Barra de progresso. Props: `value, max, color, h (height em px)` |
| `Modal` | Overlay com backdrop. Props: `open, onClose, title, children` |
| `Btn` | Botão com variantes: `primary` (laranja), `secondary` (cinza), `danger` (vermelho). Props: `variant, size (sm), onClick, disabled` |
| `Input` | Input estilizado com label flutuante. Props: `label, type, value, onChange, placeholder` |
| `Sel` | Select estilizado com label. Props: `label, value, onChange, children` |
| `Textarea` | Textarea estilizado com label. Props: `label, value, onChange, placeholder, rows` |
| `GanttTimeline` | Linha do tempo com barras de projeto por sprint. Props: `projects, members, sprints` |

---

## 11. Tela Inicial (Sem Arquivo Carregado)

Quando `!filePath || !dataLoaded`, a aplicação exibe a tela de boas-vindas com:
- Nome do squad (editável, persiste em localStorage)
- Botão "Abrir Base de Dados" → `selectFile('open')` → `loadFromFile(path)`
- Botão "Criar Nova Base" → modal com opção "Com dados de exemplo" ou "Vazio" → `selectFile('save')` → `createTemplate(path, withDemo)` → `loadFromFile(path)`
- Indicador de erro de carregamento (quando `loadError !== null`)

---

## 12. Indicador de Save

Barra superior da aplicação mostra:
- Nome do squad (editável inline)
- Ícone de status: `RefreshCw` girando (salvando) ou `HardDrive` (salvo)
- Texto com hora do último save: `"Salvo às HH:MM:SS"` ou `"Salvando..."`
- Botão "Salvar Tudo" (`saveAll`) que dispara save de todas as abas em paralelo com `Promise.all`
- Botão "Trocar Base" para abrir outro arquivo
- Botão "Fechar" para desconectar sem sair da aplicação

---

## 13. Regras de Negócio Importantes

1. **Dias Úteis**: Calculados excluindo sábados, domingos e datas registradas em Feriados
2. **Capacidade = Horas de Projeto**: `(diasÚteis - férias - ausências) × horas_projeto_dia`
3. **OVERLOAD**: Quando `horasAlocadasNaSprint > capacidadeDeProjetoDoMembro`
4. **DoR (Definition of Ready)**: Um item está "em DoR" quando possui `estimativa` (horas) preenchida
5. **Riscos Alto Impacto**: `score = RISCO_SCORE[probability] × RISCO_SCORE[impact] >= 6`
   - RISCO_SCORE: baixa/baixo=1, media/medio=2, alta/alto=3
6. **Migração de Abas**: Na primeira gravação após abrir arquivo legado, as abas antigas são removidas automaticamente
7. **Persistência de Sessão**: `filePath` e `squadName` são salvos em `localStorage` para reabrir automaticamente na próxima sessão

---

## 14. Dados de Demonstração

Ao criar um arquivo com `withDemo=true`, as seguintes entidades são populadas:

- **4 Sprints**: sp1 (encerrada), sp2 (atual), sp3 e sp4 (futuras), 2 semanas cada
- **4 Membros**: Ana Souza, Carlos Lima, Juliana Mendes, Pedro Costa
- **3 Projetos**: Portal do Cliente (índigo), API de Pagamentos (âmbar), App Mobile (rosa)
- **12 Itens de Backlog**: mix de histórias, tasks e bugs distribuídos nos projetos/sprints
- **5 OKRs/KPIs**: cobrindo modernização, NPS, deploy, data warehouse e atendimento
- **2 Feriados** e **2 períodos de férias** de exemplo
- **16 configurações de capacidade** (4 membros × 4 sprints, 6h projeto + 2h cerimônias/dia)
- **4 Riscos**: técnico, negócio, operacional, dependência

---

## 15. Limitações Conhecidas

- Colaboração simultânea: sem lock de arquivo — recomenda-se edição turnada ou via SharePoint/rede (um salva por vez)
- Sem histórico de versões / undo além do undo nativo do React state
- Avatares são cópias locais — se o arquivo Excel for movido, os avatares precisam acompanhar a pasta `avatars/`
- Arquivo único (App.jsx ~2500 linhas) — intencional para simplificar o projeto

---

---

# PROMPT COMPLETO PARA RECRIAÇÃO DO PROJETO

---

## PROMPT DE ENGENHARIA — Para outra IA recriar o projeto do zero

```
Você é um desenvolvedor full stack sênior especializado em Electron, React e TypeScript.
Sua tarefa é criar do zero uma aplicação desktop completa chamada "Manager Team QBR".
Siga TODOS os requisitos abaixo com precisão. Não omita nenhuma funcionalidade.

═══════════════════════════════════════════════════════════════
PARTE 1 — STACK E CONFIGURAÇÃO DO PROJETO
═══════════════════════════════════════════════════════════════

Tecnologias obrigatórias:
- Electron 31
- React 18 + Vite 5
- Tailwind CSS 3
- lucide-react ^0.383.0
- recharts ^2.12.7
- xlsx (SheetJS) ^0.18.5
- electron-builder ^24.13.3
- concurrently, cross-env, wait-on (dev deps)

Estrutura de arquivos:
electron-app/
├── main.js           (processo principal Electron)
├── preload.js        (ponte contextBridge)
├── index.html        (entry HTML, título: "Controle de Jornada")
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx      (ReactDOM.createRoot)
    ├── App.jsx       (TODA a aplicação em arquivo único)
    └── index.css     (estilos globais)

package.json scripts:
- "dev": concurrently rodando vite e electron aguardando localhost:5173 com wait-on
- "build": vite build
- "dist": npm run build && electron-builder
- "dist:mac/win/linux": variantes por plataforma

electron-builder config (dentro do package.json):
- appId: "br.com.controle-jornada"
- productName: "Controle de Jornada"
- asar: true
- files: ["dist/**/*", "main.js", "preload.js"]
- mac: targets dmg + zip
- win: targets nsis (oneClick:false, allowChangeDir:true) + portable
- linux: targets AppImage + deb (categoria Office)

═══════════════════════════════════════════════════════════════
PARTE 2 — DESIGN SYSTEM (Itaú Brand)
═══════════════════════════════════════════════════════════════

Fonte: Inter do Google Fonts (pesos 400,500,600,700,800).
Fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica Neue, Arial, sans-serif.

CSS variables (index.css):
  --itau-orange:       #EC7000
  --itau-orange-dark:  #C55F00
  --itau-orange-light: #FF8C1A
  --itau-orange-bg:    #FFF3E0
  --itau-dark:         #1D1D1B
  --itau-warm-bg:      #FFFBF7

Body:
  font-family: Inter + fallbacks
  -webkit-font-smoothing: antialiased
  background: var(--itau-warm-bg) → #FFFBF7
  color: var(--itau-dark) → #1D1D1B

Classes CSS customizadas:
  .pedra    { border-radius: 18px; }
  .pedra-sm { border-radius: 12px; }

Scrollbar (webkit):
  width: 6px, height: 6px
  thumb: #f5c894 normal, #EC7000 hover

Animação .animate-fade-in:
  @keyframes fadeSlideIn { from: opacity:0 translateY(6px); to: opacity:1 translateY(0) }
  animation: 0.2s ease-out

Focus ring: outline 2px solid #EC7000, offset 2px
Seleção de texto: background #EC700030

═══════════════════════════════════════════════════════════════
PARTE 3 — ELECTRON: main.js
═══════════════════════════════════════════════════════════════

Janela:
  width: 1440, height: 900, minWidth: 1100, minHeight: 700
  backgroundColor: '#F8FAFC'
  titleBarStyle: 'hiddenInset' no macOS, 'default' nos outros
  webPreferences: contextIsolation:true, nodeIntegration:false, sandbox:false

Modo dev: NODE_ENV=development → loadURL('http://localhost:5173') + DevTools
Modo prod: loadFile('dist/index.html')

Funções internas do main.js:

1. readSheet(workbook, sheetName) → array de objetos
   Usa XLSX.utils.sheet_to_json com defval:null

2. writeQueue — chain de Promises para serializar escritas
   let writeQueue = Promise.resolve()
   
3. LEGACY_SHEET_NAMES = {
     'Backlog':    'Historias',
     'Feriados':   'Config_Feriados',
     'Ferias':     'Equipe_Ferias',
     'Capacidade': 'Capacidade_Config'
   }

4. writeSheet(filePath, sheetName, data):
   - Encadeia na writeQueue
   - Abre workbook existente ou cria novo com XLSX.utils.book_new()
   - Cria worksheet com XLSX.utils.json_to_sheet(data.length ? data : [{}])
   - Se aba já existe: substitui. Se não: append.
   - Migração: se sheetName está no LEGACY_SHEET_NAMES e o legado existe no workbook → delete workbook.Sheets[legacyName] e splice de SheetNames
   - XLSX.writeFile(workbook, filePath)
   - Erros são logados mas não re-thrown (fila não é interrompida)

5. autoWidth(ws, data) — aplica largura automática nas colunas

IPC Handlers:

'select-file' (mode: 'open'|'save'):
  - open: dialog.showOpenDialog, filtro xlsx/xls, retorna filePaths[0] ou null
  - save: dialog.showSaveDialog, defaultPath 'controle-jornada.xlsx', retorna filePath ou null

'load-data' (filePath):
  - Verifica existência do arquivo
  - readAny(wb, ...names) helper: itera nomes e retorna primeiro com rows.length > 0
  - Retorna objeto:
    sprints:           readAny(wb, 'Sprints')
    equipe:            readAny(wb, 'Equipe')
    projetos:          readAny(wb, 'Projetos')
    historias:         readAny(wb, 'Backlog',    'Historias')
    okrs:              readAny(wb, 'OKRs')
    feriados:          readAny(wb, 'Feriados',   'Config_Feriados')
    ferias:            readAny(wb, 'Ferias',      'Equipe_Ferias')
    ausencias:         readAny(wb, 'Ausencias')
    capacidade_config: readAny(wb, 'Capacidade', 'Capacidade_Config')
    riscos:            readAny(wb, 'Riscos')

'save-sheet' (filePath, sheetName, data):
  - Chama writeSheet e aguarda
  - Retorna { success: true } ou { error }

'select-avatar' (dbFilePath):
  - dialog para imagens jpg/jpeg/png/webp
  - Cria pasta avatars/ ao lado do Excel
  - Copia com nome único avatar_${Date.now()}${ext}
  - Retorna caminho absoluto ou null

'create-template' (filePath, withDemo):
  - Cria workbook do zero
  - SCHEMAS com 10 abas: Sprints, Equipe, Projetos, Backlog, OKRs, Feriados, Ferias, Ausencias, Capacidade, Riscos
  - Se withDemo=true usa DEMO_DATA, senão usa objetos com keys vazias/defaults
  - Aplica autoWidth em cada aba
  - XLSX.writeFile

DEMO_DATA (dados de exemplo para withDemo=true):
  Sprints: 4 sprints (sp1 encerrada, sp2 atual, sp3/sp4 futuras, ~2 semanas cada)
  Equipe: 4 membros (m1-m4: Ana Souza, Carlos Lima, Juliana Mendes, Pedro Costa)
  Projetos: 3 projetos (p1 Portal do Cliente #6366f1, p2 API de Pagamentos #f59e0b, p3 App Mobile #ec4899)
  Backlog: 12 itens (mix de historia/task/bug, distribuídos nos projetos/sprints, com estimativas variadas)
  OKRs: 5 registros (mix de KR e KPI, algumas com lower_is_better:1)
  Feriados: 2 datas
  Ferias: 2 registros
  Ausencias: 2 registros
  Capacidade: 16 registros (4 membros × 4 sprints, projectPerDay:6, ceremoniesPerDay:2)
  Riscos: 4 registros com categorias/probabilidades/impactos variados (usando colunas: probabilidade, impacto)

Colunas corretas da aba Riscos no Excel: id, titulo, descricao, categoria, probabilidade, impacto, status, mitigacao, responsavel_id

═══════════════════════════════════════════════════════════════
PARTE 4 — preload.js
═══════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile:     (mode)                        → invoke('select-file', mode)
  loadData:       (filePath)                    → invoke('load-data', filePath)
  saveSheet:      (filePath, sheetName, data)   → invoke('save-sheet', filePath, sheetName, data)
  createTemplate: (filePath, withDemo)          → invoke('create-template', filePath, withDemo)
  selectAvatar:   (dbFilePath)                  → invoke('select-avatar', dbFilePath)
})

═══════════════════════════════════════════════════════════════
PARTE 5 — App.jsx (arquivo único, toda a aplicação React)
═══════════════════════════════════════════════════════════════

--- 5.1 Imports lucide-react ---
LayoutDashboard, Calendar, Users, FolderKanban, Plus, Trash2,
Clock, CheckCircle2, Edit3, X, Layers, ChevronDown, ChevronUp,
AlertTriangle, AlertCircle, Shield, Umbrella, Code2, Coffee,
BarChart3, Zap, TrendingUp, CheckSquare, FolderOpen, FilePlus2,
Save, Database, RefreshCw, HardDrive, Upload, UserCircle,
Target, ArrowRight, Repeat2, MoveRight, Star, Cpu, Smile,
Activity, PieChart, Headphones, BookOpen, ChevronRight,
Settings2, TreePine, CalendarX2, LogOut,
ShieldAlert, Unlink, Wrench, CheckCheck

--- 5.2 API Abstraction ---
const api = window.electronAPI ?? {
  selectFile:     async () => null,
  loadData:       async () => ({ sprints:[], equipe:[], projetos:[], historias:[], okrs:[], feriados:[], ferias:[], ausencias:[], capacidade_config:[], riscos:[], error:'Modo demo' }),
  saveSheet:      async () => ({ success: true }),
  createTemplate: async () => ({ success: true }),
  selectAvatar:   async () => null,
}

--- 5.3 Helpers Utilitários ---
const uid = () => Math.random().toString(36).slice(2, 9)
const fmtDate = (d) → toLocaleDateString pt-BR (dia + mês abreviado)
function dateDiff(a, b) → Math.max(0, (dateB - dateA) / 86400000)
const AVATAR_PALETTE = ['#EC7000','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#ef4444','#3b82f6','#22c55e']
const avatarBg = (name) → hash simples → AVATAR_PALETTE[abs(h) % 8]

--- 5.4 Constantes de Estilo ---

SPRINT_STYLES = {
  atual:     { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', row: 'bg-orange-50/60 border-orange-200' }
  encerrada: { badge: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-400',   row: 'bg-gray-50 border-gray-200'        }
  futura:    { badge: 'bg-blue-100 text-blue-600',     dot: 'bg-blue-400',   row: 'bg-blue-50/40 border-blue-200'    }
}

ITEM_TYPE_STYLES = {
  historia: { label: 'História', badge: 'bg-green-600 text-white', dot: 'bg-green-600' }
  task:     { label: 'Task',     badge: 'bg-blue-600 text-white',  dot: 'bg-blue-600'  }
  bug:      { label: 'Bug',      badge: 'bg-red-600 text-white',   dot: 'bg-red-600'   }
}

RISCO_CATEGORY = {
  tecnico:     { label: 'Técnico',     color: '#3B82F6', icon: Wrench   }
  negocio:     { label: 'Negócio',     color: '#F59E0B', icon: BarChart3 }
  dependencia: { label: 'Dependência', color: '#8B5CF6', icon: Unlink   }
  operacional: { label: 'Operacional', color: '#14B8A6', icon: Settings2 }
}

RISCO_SCORE = { baixa:1, media:2, alta:3, baixo:1, medio:2, alto:3 }

riscoLevel(prob, impact):
  s = RISCO_SCORE[prob] * RISCO_SCORE[impact]
  s<=2 → { label:'Baixo', cls:'bg-green-100 text-green-700', cell:'bg-green-100' }
  s<=4 → { label:'Médio', cls:'bg-amber-100 text-amber-700', cell:'bg-amber-100' }
  else → { label:'Alto',  cls:'bg-red-100 text-red-700',     cell:'bg-red-100'   }

FRENTES = ['Engenharia','Produto','Design','Marketing','Suporte','Modernização','Experiência','Eficiência','Dados & Analytics','Atendimento']

RISK_STYLES = {
  none:   { card:'border border-gray-200', badge:'bg-gray-100 text-gray-500', label:'Sem histórias', icon: Shield, iconColor:'text-gray-400' }
  green:  { card:'border-2 border-green-400 shadow-lg shadow-green-100', badge:'bg-green-100 text-green-700', label:'DoR Completo', icon: CheckCircle2, iconColor:'text-green-500' }
  yellow: { card:'border-2 border-yellow-400 shadow-lg shadow-yellow-100', badge:'bg-yellow-100 text-yellow-700', label:'Risco Médio', icon: AlertTriangle, iconColor:'text-yellow-500' }
  red:    { card:'border-2 border-red-400 shadow-lg shadow-red-100', badge:'bg-red-100 text-red-600', label:'Alto Risco', icon: AlertCircle, iconColor:'text-red-500' }
}

dorRisk(project):
  total = project.stories.length; if 0 → 'none'
  notDor = stories sem hours; if 0 → 'green'; if <50% → 'yellow'; else 'red'

--- 5.5 Funções de Cálculo de Capacidade ---

getBusinessDays(startDate, endDate, holidays=[]):
  Itera dia a dia, exclui sábado(0)/domingo(6) e datas no Set de holidays
  Retorna contagem de dias úteis

getMemberVacationDaysInSprint(memberId, sprintStart, sprintEnd, vacations):
  Calcula sobreposição de período de férias com período da sprint
  Conta apenas dias úteis na sobreposição

getMemberAbsenceDaysInSprint(memberId, sprintStart, sprintEnd, absences):
  Conta absences do membro dentro do período da sprint

getMemberSprintCapacity(memberId, sprint, capacityConfigs, holidays, vacations, absences):
  Busca config (projectPerDay=6, ceremoniesPerDay=2 como defaults)
  bizDays = getBusinessDays(...)
  vacDays = getMemberVacationDaysInSprint(...)
  absDays = getMemberAbsenceDaysInSprint(...)
  availDays = max(0, bizDays - vacDays - absDays)
  Retorna: { bizDays, vacDays, absDays, availDays, projectHours, ceremoniesHours, projectPerDay, ceremoniesPerDay }

--- 5.6 Transformações Excel ↔ Estado (fromExcel / toExcel) ---

fromExcel:
  sprints(rows):        id, name←nome, startDate←data_inicio, endDate←data_fim, status
  members(rows):        id, name←nome, avatarUrl←avatar_url
  capacityConfigs(rows): id←uid(), memberId←membro_id, sprintId←sprint_id, projectPerDay←horas_projeto_dia, ceremoniesPerDay←horas_cerimonias_dia
  projects(projRows, storyRows):
    Mapeia projRows → Project com stories[] filtradas por projeto_id
    Story: id, title←titulo, assignee←responsavel_id, hours←estimativa, description←descricao, sprintId←sprint_id, type←tipo, storyPoints←story_points
  okrs(rows): id, tipo, frente, title←titulo, projectId←projeto_id, baseline, moonshot, roofshot, atual, unit←unidade, description←descricao, lowerIsBetter←lower_is_better
  holidays(rows): id←uid(), date←data
  vacations(rows): id←uid(), memberId←membro_id, startDate←data_inicio, endDate←data_fim
  absences(rows): id←uid(), memberId←membro_id, date←data, type←tipo
  riscos(rows): id, title←titulo, description←descricao, category←categoria, probability←probabilidade, impact←impacto, status, mitigation←mitigacao, ownerId←responsavel_id

toExcel: (inverso exato de fromExcel — converte de volta para colunas em português)
  stories: projects.flatMap(p => p.stories.map(s → { id, projeto_id:p.id, sprint_id:s.sprintId, responsavel_id:s.assignee, titulo:s.title, descricao:s.description, estimativa:s.hours, story_points:s.storyPoints, tipo:s.type }))
  riscos(riscos): { id, titulo, descricao, categoria, probabilidade←probability, impacto←impact, status, mitigacao, responsavel_id←ownerId }

--- 5.7 Componentes UI Atômicos ---

Avatar({ name, avatarUrl, size=36, ring=false }):
  Se avatarUrl e sem erro de img → <img src={avatarUrl} />
  Senão → div colorida com iniciais (avatarBg(name))
  Ring opcional: outline 2px white

StatCard({ icon: Icon, label, value, sub, color }):
  Card branco rounded-2xl com ícone colorido, valor grande, label e sub-texto

ProgressBar({ value, max, color, h=8 }):
  Barra horizontal com porcentagem calculada (min 0%, max 100%)
  Fundo cinza, fill com cor passada, transição suave

Modal({ open, onClose, title, children }):
  Overlay fixed com backdrop blur
  Container centralizado, rounded-2xl, shadow-xl
  Botão X no canto superior direito
  Fecha ao clicar no backdrop

Btn({ variant='primary', size, onClick, disabled, children }):
  primary:   bg-orange-600 text-white hover:bg-orange-700
  secondary: bg-gray-100 text-gray-700 hover:bg-gray-200
  danger:    bg-red-50 text-red-600 hover:bg-red-100
  size='sm': padding menor

Input({ label, type='text', value, onChange, placeholder, ...rest }):
  Label acima, input com bordas rounded-xl, focus ring laranja

Sel({ label, value, onChange, children }):
  Label acima, select estilizado

Textarea({ label, value, onChange, placeholder, rows=3 }):
  Label acima, textarea estilizado

GanttTimeline({ projects, members, sprints }):
  Linha do tempo visual horizontal
  Eixo X: sprints (datas)
  Eixo Y: membros
  Barras coloridas pela cor do projeto
  Mostra itens alocados por membro por sprint

--- 5.8 Views ---

TABS = [
  { id:'dashboard', label:'Dashboard',    icon:LayoutDashboard }
  { id:'sprints',   label:'Sprints',      icon:Calendar        }
  { id:'team',      label:'Equipe',       icon:Users           }
  { id:'projects',  label:'Projetos',     icon:FolderKanban    }
  { id:'okrs',      label:'OKRs & KPIs', icon:Target          }
  { id:'riscos',    label:'Riscos',       icon:ShieldAlert     }
  { id:'config',    label:'Configurações',icon:Settings2       }
]

DashboardView({ sprints, members, projects, holidays, vacations, absences, capacityConfigs, riscos }):
  - 4 StatCards: Sprint Atual, Membros, Itens com Estimativa (X/Y), Riscos Abertos
  - Riscos Abertos card: vermelho se riscosAltos.length>0, âmbar senão
  - Card "Radar de Riscos": 3 contadores (Alto impacto, Abertos, Mitigados) + lista top 3 críticos
  - riscoAlto: score >= 6
  - Card "Capacidade por Membro" (lg:col-span-2): para sprint atual, mostra barra assigned/capacity por membro
    OVERLOAD em vermelho quando assigned > capacity && capacity > 0
  - Cards por Projeto: dorRisk → RISK_STYLES → badge + barra de progresso DoR
  - GanttTimeline ao final

SprintsView({ sprints, setSprints, projects, setProjects, members, holidays }):
  - Listagem com cards expansíveis (chevron)
  - Header do card: dot colorido, nome, período, dias úteis, nº itens, horas total
  - Expandido: lista stories da sprint (com badges tipo, horas, story points) + botões editar/deletar
  - Modal: nome, data início, data fim, status (futura/atual/encerrada)
  - Ao deletar sprint: stories afetadas têm sprintId zerado

TeamView({ members, setMembers, setProjects, projects, sprints, filePath, holidays, vacations, setVacations, absences, setAbsences, capacityConfigs, setCapacityConfigs }):
  - Grid de cards de membros com Avatar, nome, botões editar/remover
  - Upload de avatar: chama api.selectAvatar(filePath), usa file:// protocol
  - Ao remover membro: stories do backlog têm assignee zerado
  - Tabela de Capacidade: membro × sprint, editar horas/dia inline
  - Sub-seção Férias: adicionar/editar/remover períodos
  - Sub-seção Ausências: adicionar/remover datas avulsas com tipo

ProjectsView({ projects, setProjects, members, sprints }):
  - Grid de cards de projetos (cor, nome, datas, nº stories)
  - Color picker nativo (input type=color) para cor do projeto
  - Listagem de stories em cada projeto com badges de tipo
  - Modal para adicionar/editar story:
    Campos: Título*, Tipo (história/task/bug), Responsável, Sprint, Story Points, Horas, Descrição
  - handleSaveStory usa functional update setProjects(prev => ...) para evitar stale closure
    resolvedProjId: tenta receber como argumento OU busca em prev via stories.some(s.id === storyModal)

OKRsView({ okrs, setOkrs, projects }):
  - Lista de OKRs/KPIs com barra de progresso baseline→moonshot→roofshot
  - Badge KR (azul) ou KPI (âmbar)
  - Progresso calculado: lowerIsBetter inverte a lógica
  - Modal: tipo, frente (select com FRENTES), título, projeto, baseline, moonshot, roofshot, atual, unidade, lower_is_better, descrição

RiscosView({ riscos, setRiscos, members }):
  - Matriz 3×3: PROBS=['alta','media','baixa'] × IMPACTS=['baixo','medio','alto']
  - cellBg por score: ≤2 verde, ≤4 âmbar, ≥6 vermelho
  - Cada célula mostra riscos abertos posicionados nela
  - Filtro de lista: todos | aberto | mitigado | fechado
  - Ações: Mitigar (muda status→mitigado), Fechar (→fechado), Editar, Deletar
  - Modal: título*, categoria, probabilidade, impacto, status, responsável, descrição, plano de mitigação
  - STATUS_STYLE: aberto=red, mitigado=amber, fechado=gray

ConfigView({ holidays, setHolidays, vacations, setVacations, members, absences, setAbsences }):
  - Feriados: lista de datas com delete, input date para adicionar
  - Férias: por membro (select), data início, data fim
  - Ausências: por membro, data, tipo

--- 5.9 App Component (componente raiz) ---

Estado:
  filePath (localStorage 'cj_filePath')
  squadName (localStorage 'cj_squadName')
  dataLoaded, loadError, isSaving, lastSaved
  tab (default: 'dashboard')
  sprints, members, projects, okrs, holidays, vacations, absences, capacityConfigs, riscos

blockSaveRef = useRef(false)

loadFromFile(path):
  1. blockSaveRef.current = true
  2. setDataLoaded(false), setLoadError(null)
  3. api.loadData(path) → transforma com fromExcel.* → setState*
  4. setFilePath(path), localStorage.setItem('cj_filePath', path)
  5. setDataLoaded(true)

canSave():
  if (blockSaveRef.current) { blockSaveRef.current = false; return false; }
  return true;

save(sheetName, data) → api.saveSheet(filePath, sheetName, data)

Auto-save effects (um por entidade):
  useEffect(() => {
    if (!dataLoaded || !filePath || !canSave()) return;
    save('NomeDaAba', toExcel.entidade(estado));
  }, [estado, dataLoaded]);
  Abas: Sprints, Equipe, Projetos/Backlog (quando projects muda → save Projetos E Backlog), OKRs, Feriados, Ferias, Ausencias, Capacidade, Riscos

saveAll() [useCallback]:
  Promise.all de api.saveSheet para todas as 10 abas
  Envolto em setIsSaving(true/false) + setLastSaved(new Date())

Auto-load no primeiro render:
  useEffect(() => { if (filePath && !dataLoaded) loadFromFile(filePath); }, [])

Tela de boas-vindas (quando !filePath || !dataLoaded):
  - Nome do squad editável
  - Botão "Abrir Base de Dados"
  - Botão "Criar Nova Base" → modal com opção demo/vazio

Layout principal (quando dataLoaded):
  - Sidebar fixa (w-64) com:
    - Logo/nome do app
    - Nome do squad editável
    - Navegação TABS com ícones
    - Indicador de save (isSaving ? RefreshCw giratório : HardDrive)
    - Texto "Salvo às HH:MM:SS" ou "Salvando..."
    - Botão "Salvar Tudo"
    - Botão "Trocar Base"
  - Main content (ml-64 p-8 max-w-[1400px]):
    Renderiza view ativa baseado em tab

═══════════════════════════════════════════════════════════════
PARTE 6 — REGRAS CRÍTICAS DE IMPLEMENTAÇÃO
═══════════════════════════════════════════════════════════════

1. RACE CONDITION: writeQueue em main.js é OBRIGATÓRIO para serializar escritas.
   Múltiplos useEffect podem disparar simultaneamente — a fila garante atomicidade.

2. STALE CLOSURE: handleSaveStory DEVE usar functional update:
   setProjects(prev => prev.map(...))
   Nunca usar a variável 'projects' diretamente dentro do handler.

3. blockSaveRef: DEVE ser setado como true ANTES de qualquer setState no loadFromFile.
   Evita que os useEffect de auto-save disparem durante o carregamento e criem abas novas
   em arquivos que ainda usam os nomes legados.

4. Fallback readAny: SEMPRE tentar o novo nome primeiro, depois o legado.
   Ex: readAny(wb, 'Backlog', 'Historias') — nunca o contrário.

5. Migração automática: writeSheet DEVE deletar a aba legada quando escrever a nova.
   Isso garante que após o primeiro save, o arquivo seja completamente migrado.

6. Colunas da aba Riscos no Excel: 'probabilidade' e 'impacto' (português).
   No estado React: 'probability' e 'impact' (inglês).
   toExcel.riscos mapeia probability→probabilidade, impact→impacto.
   fromExcel.riscos mapeia probabilidade→probability, impacto→impact.

7. Avatar: usa protocolo file:// para carregar imagens locais no Electron.
   Ex: <img src={`file://${avatarUrl}`} />

8. Projetos e stories: stories são ANINHADAS dentro de cada projeto no estado React.
   Na aba Excel Backlog, stories são FLAT com projeto_id.
   fromExcel.projects une as duas abas; toExcel.stories usa flatMap.

9. Um único arquivo App.jsx para TODA a aplicação React.
   Todos os componentes e views são funções normais no mesmo arquivo.

10. O save de Backlog e Projetos são SEPARADOS:
    Quando `projects` muda → save 'Projetos' (dados do projeto) E save 'Backlog' (stories)
    useEffect([projects, dataLoaded]) → save('Projetos', toExcel.projects(projects))
                                        save('Backlog', toExcel.stories(projects))

═══════════════════════════════════════════════════════════════
PARTE 7 — CHECKLIST DE ENTREGA
═══════════════════════════════════════════════════════════════

[ ] main.js com todos os 5 IPC handlers
[ ] preload.js com contextBridge expondo os 5 métodos
[ ] src/index.css com variáveis Itaú, Inter, scrollbar, pedra classes, fadeSlideIn
[ ] src/main.jsx com ReactDOM.createRoot
[ ] src/App.jsx com:
    [ ] api abstraction com fallback
    [ ] Todas as constantes de estilo (SPRINT_STYLES, ITEM_TYPE_STYLES, RISCO_CATEGORY, etc)
    [ ] Funções de capacidade (getBusinessDays, getMemberSprintCapacity, etc)
    [ ] fromExcel e toExcel completos
    [ ] Componentes atômicos (Avatar, StatCard, ProgressBar, Modal, Btn, Input, Sel, Textarea, GanttTimeline)
    [ ] 7 views (Dashboard, Sprints, Team, Projects, OKRs, Riscos, Config)
    [ ] App component com todos os estados, loadFromFile, canSave, auto-saves, saveAll
    [ ] Tela de boas-vindas
    [ ] Layout com sidebar + main
[ ] package.json com todas as deps e scripts
[ ] vite.config.js, tailwind.config.js, postcss.config.js

Ao finalizar, rode `npm run dev` para verificar que a aplicação inicia sem erros.
```

---

*Documento gerado em 06/06/2026 — Manager Team QBR v1.0*
