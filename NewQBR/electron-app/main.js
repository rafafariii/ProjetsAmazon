/**
 * Controle de Jornada — Electron Main Process
 * Responsável por: criação da janela, diálogos de arquivo,
 * leitura/escrita do Excel via xlsx (Node.js only).
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path  = require('path');
const XLSX  = require('xlsx');
const fs    = require('fs');

// ─── Detecta modo desenvolvimento (npm run dev) ───────────────
const isDev = process.env.NODE_ENV === 'development';

// ─── Janela principal ─────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#F8FAFC',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // obrigatório — isola renderer do Node
      nodeIntegration: false,   // segurança: sem acesso direto ao Node no renderer
      sandbox: false,           // permite preload usar require()
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ═══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════

/**
 * Lê uma aba do workbook e retorna array de objetos.
 * Células vazias viram null (defval: null).
 */
function readSheet(workbook, sheetName) {
  if (!workbook.SheetNames.includes(sheetName)) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
}

/**
 * Fila global de escrita — garante que múltiplos saves simultâneos
 * sejam executados em sequência, evitando race condition onde uma
 * escrita sobrescreve alterações de outra que terminou antes.
 */
let writeQueue = Promise.resolve();

// Mapa de renomeação: novo nome → nome antigo (para migração automática)
const LEGACY_SHEET_NAMES = {
  'Backlog':    'Historias',
  'Feriados':   'Config_Feriados',
  'Ferias':     'Equipe_Ferias',
  'Capacidade': 'Capacidade_Config',
};

/**
 * Abre (ou cria) um workbook, atualiza/insere uma aba e salva.
 * Quando um nome de aba foi renomeado, remove a aba antiga automaticamente
 * para evitar que leituras futuras usem dados desatualizados.
 * Preserva todas as outras abas existentes.
 * Retorna uma Promise para que o IPC handler possa aguardar.
 */
function writeSheet(filePath, sheetName, data) {
  writeQueue = writeQueue
    .then(() => {
      let workbook;

      if (fs.existsSync(filePath)) {
        workbook = XLSX.readFile(filePath);
      } else {
        workbook = XLSX.utils.book_new();
      }

      const ws = XLSX.utils.json_to_sheet(data.length ? data : [{}]);

      if (workbook.SheetNames.includes(sheetName)) {
        workbook.Sheets[sheetName] = ws;
      } else {
        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      }

      // Migração: remove aba com nome antigo para evitar leitura duplicada
      const legacyName = LEGACY_SHEET_NAMES[sheetName];
      if (legacyName && workbook.SheetNames.includes(legacyName)) {
        delete workbook.Sheets[legacyName];
        workbook.SheetNames.splice(workbook.SheetNames.indexOf(legacyName), 1);
        console.log(`[migrate] Aba "${legacyName}" removida → agora usando "${sheetName}"`);
      }

      XLSX.writeFile(workbook, filePath);
    })
    .catch(err => {
      // Loga o erro mas NÃO re-throw — garante que a fila continue
      // funcionando para as próximas operações de escrita.
      console.error(`[writeSheet] Erro ao salvar "${sheetName}":`, err.message);
    });
  return writeQueue;
}

/**
 * Aplica largura automática nas colunas (QoL para abrir no Excel).
 */
function autoWidth(ws, data) {
  if (!data.length) return;
  const cols = Object.keys(data[0]).map((key) => ({
    wch: Math.max(key.length, ...data.map((r) => String(r[key] ?? '').length)) + 2,
  }));
  ws['!cols'] = cols;
}

// ═══════════════════════════════════════════════════════════════
// DADOS DEMO — usados ao criar template com exemplos
// ═══════════════════════════════════════════════════════════════
const DEMO_DATA = {
  Sprints: [
    { id: 'sp1', nome: 'Sprint 1', data_inicio: '2026-03-02', data_fim: '2026-03-13', status: 'encerrada' },
    { id: 'sp2', nome: 'Sprint 2', data_inicio: '2026-03-16', data_fim: '2026-03-27', status: 'atual'     },
    { id: 'sp3', nome: 'Sprint 3', data_inicio: '2026-03-30', data_fim: '2026-04-10', status: 'futura'    },
    { id: 'sp4', nome: 'Sprint 4', data_inicio: '2026-04-13', data_fim: '2026-04-24', status: 'futura'    },
  ],
  Equipe: [
    { id: 'm1', nome: 'Ana Souza',      avatar_url: '' },
    { id: 'm2', nome: 'Carlos Lima',    avatar_url: '' },
    { id: 'm3', nome: 'Juliana Mendes', avatar_url: '' },
    { id: 'm4', nome: 'Pedro Costa',    avatar_url: '' },
  ],
  Capacidade: [
    // Ana Souza
    { membro_id: 'm1', sprint_id: 'sp1', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm1', sprint_id: 'sp2', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm1', sprint_id: 'sp3', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm1', sprint_id: 'sp4', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    // Carlos Lima
    { membro_id: 'm2', sprint_id: 'sp1', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm2', sprint_id: 'sp2', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm2', sprint_id: 'sp3', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm2', sprint_id: 'sp4', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    // Juliana Mendes
    { membro_id: 'm3', sprint_id: 'sp1', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm3', sprint_id: 'sp2', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm3', sprint_id: 'sp3', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm3', sprint_id: 'sp4', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    // Pedro Costa
    { membro_id: 'm4', sprint_id: 'sp1', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm4', sprint_id: 'sp2', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm4', sprint_id: 'sp3', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
    { membro_id: 'm4', sprint_id: 'sp4', horas_projeto_dia: 6, horas_cerimonias_dia: 2 },
  ],
  Projetos: [
    { id: 'p1', nome: 'Portal do Cliente', cor: '#6366f1', data_inicio: '2026-03-16', data_fim: '2026-04-10' },
    { id: 'p2', nome: 'API de Pagamentos', cor: '#f59e0b', data_inicio: '2026-03-23', data_fim: '2026-04-17' },
    { id: 'p3', nome: 'App Mobile',        cor: '#ec4899', data_inicio: '2026-04-06', data_fim: '2026-04-24' },
  ],
  Backlog: [
    { id: 's1',  projeto_id: 'p1', sprint_id: 'sp1', responsavel_id: 'm1', titulo: 'Tela de Login OAuth',         descricao: 'Autenticação Google/Microsoft via NextAuth.js.',   estimativa: 16,   story_points: 8,  tipo: 'historia' },
    { id: 's2',  projeto_id: 'p1', sprint_id: 'sp1', responsavel_id: 'm2', titulo: 'Dashboard principal',         descricao: 'KPIs: usuários ativos, conversão e receita.',         estimativa: 24,   story_points: 13, tipo: 'historia' },
    { id: 's3',  projeto_id: 'p1', sprint_id: 'sp2', responsavel_id: 'm3', titulo: 'Perfil do usuário',           descricao: 'Edição de perfil com upload para S3.',                estimativa: 12,   story_points: 5,  tipo: 'historia' },
    { id: 's4',  projeto_id: 'p1', sprint_id: 'sp2', responsavel_id: 'm4', titulo: 'Configurações da conta',      descricao: 'Notificações, segurança e integrações.',              estimativa: 10,   story_points: 5,  tipo: 'historia' },
    { id: 's5',  projeto_id: 'p2', sprint_id: 'sp1', responsavel_id: 'm2', titulo: 'Integração Stripe',           descricao: 'SDK Stripe para pagamentos recorrentes.',             estimativa: 20,   story_points: 13, tipo: 'historia' },
    { id: 's6',  projeto_id: 'p2', sprint_id: 'sp2', responsavel_id: 'm1', titulo: 'Webhooks de notificação',     descricao: '',                                                   estimativa: null, story_points: 3,  tipo: 'task'     },
    { id: 's7',  projeto_id: 'p2', sprint_id: 'sp2', responsavel_id: 'm3', titulo: 'Relatório de transações',     descricao: '',                                                   estimativa: null, story_points: null, tipo: 'historia' },
    { id: 's8',  projeto_id: 'p2', sprint_id: 'sp3', responsavel_id: 'm4', titulo: 'Estorno e reembolso',         descricao: '',                                                   estimativa: null, story_points: null, tipo: 'historia' },
    { id: 's9',  projeto_id: 'p3', sprint_id: 'sp3', responsavel_id: 'm4', titulo: 'Setup React Native + CI',     descricao: '',                                                   estimativa: null, story_points: 2,  tipo: 'task'     },
    { id: 's10', projeto_id: 'p3', sprint_id: 'sp4', responsavel_id: 'm4', titulo: 'Tela de Onboarding',          descricao: '',                                                   estimativa: null, story_points: 8,  tipo: 'historia' },
    { id: 's11', projeto_id: 'p3', sprint_id: 'sp4', responsavel_id: 'm2', titulo: 'Push Notifications',          descricao: '',                                                   estimativa: null, story_points: 5,  tipo: 'historia' },
    { id: 's12', projeto_id: 'p1', sprint_id: 'sp2', responsavel_id: 'm1', titulo: 'Fix: Crash ao salvar perfil', descricao: 'Erro de null reference ao salvar sem avatar.',       estimativa: 4,    story_points: 1,  tipo: 'bug'      },
  ],
  OKRs: [
    { id: 'okr1', tipo: 'KR',  frente: 'Modernização',      titulo: 'Migração para arquitetura cloud-native',   projeto_id: 'p1', baseline: 0,  moonshot: 80,  roofshot: 100, atual: 35,  unidade: '%',   descricao: 'Percentual de serviços migrados para arquitetura cloud-native' },
    { id: 'okr2', tipo: 'KPI', frente: 'Experiência',       titulo: 'NPS dos usuários do portal',               projeto_id: 'p1', baseline: 42, moonshot: 65,  roofshot: 75,  atual: 48,  unidade: 'pts', descricao: 'Net Promoter Score mensurado mensalmente' },
    { id: 'okr3', tipo: 'KR',  frente: 'Eficiência',        titulo: 'Redução do tempo de deploy (minutos)',     projeto_id: 'p2', baseline: 45, moonshot: 15,  roofshot: 10,  atual: 28,  unidade: 'min', lower_is_better: 1, descricao: 'Tempo médio de deploy em produção — quanto menor, melhor' },
    { id: 'okr4', tipo: 'KPI', frente: 'Dados & Analytics', titulo: 'Cobertura de dados no Data Warehouse',    projeto_id: 'p2', baseline: 60, moonshot: 85,  roofshot: 95,  atual: 70,  unidade: '%',   lower_is_better: 0, descricao: 'Percentual de domínios de negócio com dados no DW' },
    { id: 'okr5', tipo: 'KR',  frente: 'Atendimento',       titulo: 'Tempo médio de resposta ao cliente (min)', projeto_id: 'p3', baseline: 8,  moonshot: 3,   roofshot: 2,   atual: 5.5, unidade: 'min', lower_is_better: 1, descricao: 'Tempo médio de primeira resposta ao cliente — quanto menor, melhor' },
  ],
  Feriados: [
    { data: '2026-04-03' },
    { data: '2026-04-21' },
  ],
  Ferias: [
    { membro_id: 'm1', data_inicio: '2026-03-02', data_fim: '2026-03-03' },
    { membro_id: 'm3', data_inicio: '2026-03-16', data_fim: '2026-03-19' },
  ],
  Ausencias: [
    { membro_id: 'm2', data: '2026-03-20', tipo: 'day_off'      },
    { membro_id: 'm4', data: '2026-04-06', tipo: 'treinamento'  },
  ],
  Riscos: [
    { id: 'r1', titulo: 'Dependência da API de pagamentos externa',     categoria: 'dependencia', probabilidade: 'alta',  impacto: 'alto',  status: 'aberto',   responsavel_id: 'm2', descricao: 'A API do Stripe pode sofrer instabilidade durante a integração.', mitigacao: 'Criar fallback para PIX e validar com sandbox antes do deploy.' },
    { id: 'r2', titulo: 'Atraso na entrega do design system',           categoria: 'negocio',     probabilidade: 'media', impacto: 'medio', status: 'aberto',   responsavel_id: 'm1', descricao: 'Componentes do DS ainda em revisão pelo time de Brand.',           mitigacao: 'Usar componentes provisórios e refatorar após aprovação.' },
    { id: 'r3', titulo: 'Capacidade reduzida na sprint 3',              categoria: 'operacional', probabilidade: 'alta',  impacto: 'medio', status: 'mitigado', responsavel_id: 'm3', descricao: 'Férias de dois membros coincidem com a sprint.',                   mitigacao: 'Histórias replanejadas para sprint 4 com buffer de 20%.' },
    { id: 'r4', titulo: 'Risco de regressão no módulo de autenticação', categoria: 'tecnico',     probabilidade: 'baixa', impacto: 'alto',  status: 'aberto',   responsavel_id: 'm4', descricao: 'Mudança de provedor OAuth pode afetar sessões ativas.',           mitigacao: 'Testes de integração obrigatórios antes do merge.' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Abre diálogo para selecionar ou criar arquivo Excel.
 * mode: 'open' → abrir existente | 'save' → criar novo
 */
ipcMain.handle('select-file', async (_event, mode) => {
  try {
    if (mode === 'open') {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar Base de Dados',
        filters: [{ name: 'Planilha Excel', extensions: ['xlsx', 'xls'] }],
        properties: ['openFile'],
      });
      return result.canceled ? null : result.filePaths[0];
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Criar Nova Base de Dados',
        defaultPath: 'controle-jornada.xlsx',
        filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
      });
      return result.canceled ? null : result.filePath;
    }
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Lê todas as abas do arquivo Excel e retorna os dados.
 */
ipcMain.handle('load-data', async (_event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { error: `Arquivo não encontrado: ${filePath}` };
    }
    const workbook = XLSX.readFile(filePath);
    // Lê com fallback para nomes antigos (compatibilidade retroativa)
    const readAny = (wb, ...names) => {
      for (const n of names) {
        const rows = readSheet(wb, n);
        if (rows.length > 0) return rows;
      }
      return [];
    };
    return {
      sprints:           readAny(workbook, 'Sprints'),
      equipe:            readAny(workbook, 'Equipe'),
      projetos:          readAny(workbook, 'Projetos'),
      historias:         readAny(workbook, 'Backlog',     'Historias'),
      okrs:              readAny(workbook, 'OKRs'),
      feriados:          readAny(workbook, 'Feriados',    'Config_Feriados'),
      ferias:            readAny(workbook, 'Ferias',      'Equipe_Ferias'),
      ausencias:         readAny(workbook, 'Ausencias'),
      capacidade_config: readAny(workbook, 'Capacidade',  'Capacidade_Config'),
      riscos:            readAny(workbook, 'Riscos'),
    };
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Salva uma aba específica do Excel.
 * Preserva todas as outras abas (lê o workbook completo antes de escrever).
 */
ipcMain.handle('save-sheet', async (_event, filePath, sheetName, data) => {
  try {
    await writeSheet(filePath, sheetName, data);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Abre diálogo para selecionar uma imagem de avatar.
 * Copia o arquivo para a pasta avatars/ ao lado do Excel
 * e retorna o caminho absoluto do arquivo copiado.
 */
ipcMain.handle('select-avatar', async (_event, dbFilePath) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar Foto do Membro',
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;

    const srcPath   = result.filePaths[0];
    const ext       = path.extname(srcPath).toLowerCase();
    const avatarsDir = path.join(path.dirname(dbFilePath), 'avatars');

    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    // Nome único baseado em timestamp para evitar colisões
    const destName = `avatar_${Date.now()}${ext}`;
    const destPath = path.join(avatarsDir, destName);
    fs.copyFileSync(srcPath, destPath);

    return destPath; // caminho absoluto — o renderer converte para file://
  } catch (err) {
    return { error: err.message };
  }
});

/**
 * Cria um arquivo Excel do zero.
 * withDemo=true → inclui os dados de exemplo para visualização imediata.
 * withDemo=false → cria apenas com os cabeçalhos (template vazio).
 */
ipcMain.handle('create-template', async (_event, filePath, withDemo) => {
  try {
    const workbook = XLSX.utils.book_new();

    const SCHEMAS = {
      Sprints:    withDemo ? DEMO_DATA.Sprints    : [{ id: '', nome: '', data_inicio: '', data_fim: '', status: '' }],
      Equipe:     withDemo ? DEMO_DATA.Equipe     : [{ id: '', nome: '', avatar_url: '' }],
      Projetos:   withDemo ? DEMO_DATA.Projetos   : [{ id: '', nome: '', cor: '#EC7000', data_inicio: '', data_fim: '' }],
      Backlog:    withDemo ? DEMO_DATA.Backlog    : [{ id: '', projeto_id: '', sprint_id: '', responsavel_id: '', titulo: '', descricao: '', estimativa: null, story_points: null, tipo: 'historia' }],
      OKRs:       withDemo ? DEMO_DATA.OKRs       : [{ id: '', tipo: 'KR', frente: '', titulo: '', projeto_id: '', baseline: 0, moonshot: 0, roofshot: 0, atual: 0, unidade: '%', descricao: '' }],
      Feriados:   withDemo ? DEMO_DATA.Feriados   : [{ data: '' }],
      Ferias:     withDemo ? DEMO_DATA.Ferias     : [{ membro_id: '', data_inicio: '', data_fim: '' }],
      Ausencias:  withDemo ? DEMO_DATA.Ausencias  : [{ membro_id: '', data: '', tipo: '' }],
      Capacidade: withDemo ? DEMO_DATA.Capacidade : [{ membro_id: '', sprint_id: '', horas_projeto_dia: 6, horas_cerimonias_dia: 2 }],
      Riscos:     withDemo ? DEMO_DATA.Riscos     : [{ id: '', titulo: '', categoria: '', probabilidade: '', impacto: '', status: 'aberto', responsavel_id: '', descricao: '', mitigacao: '' }],
    };

    for (const [name, data] of Object.entries(SCHEMAS)) {
      const ws = XLSX.utils.json_to_sheet(data);
      autoWidth(ws, data);
      XLSX.utils.book_append_sheet(workbook, ws, name);
    }

    XLSX.writeFile(workbook, filePath);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});
