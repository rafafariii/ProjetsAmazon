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
 * Abre (ou cria) um workbook, atualiza/insere uma aba e salva.
 * Preserva todas as outras abas existentes.
 */
function writeSheet(filePath, sheetName, data) {
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

  XLSX.writeFile(workbook, filePath);
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
    { id: 'm1', nome: 'Ana Souza',      avatar_url: '', horas_ferias: 8,  horas_projeto: 60, horas_colab: 22 },
    { id: 'm2', nome: 'Carlos Lima',    avatar_url: '', horas_ferias: 0,  horas_projeto: 72, horas_colab: 18 },
    { id: 'm3', nome: 'Juliana Mendes', avatar_url: '', horas_ferias: 16, horas_projeto: 52, horas_colab: 22 },
    { id: 'm4', nome: 'Pedro Costa',    avatar_url: '', horas_ferias: 0,  horas_projeto: 70, horas_colab: 20 },
  ],
  Projetos: [
    { id: 'p1', nome: 'Portal do Cliente', cor: '#6366f1', data_inicio: '2026-03-16', data_fim: '2026-04-10' },
    { id: 'p2', nome: 'API de Pagamentos', cor: '#f59e0b', data_inicio: '2026-03-23', data_fim: '2026-04-17' },
    { id: 'p3', nome: 'App Mobile',        cor: '#ec4899', data_inicio: '2026-04-06', data_fim: '2026-04-24' },
  ],
  Historias: [
    { id: 's1',  projeto_id: 'p1', sprint_id: 'sp1', responsavel_id: 'm1', titulo: 'Tela de Login OAuth',      descricao: 'Autenticação Google/Microsoft via NextAuth.js.',         estimativa: 16   },
    { id: 's2',  projeto_id: 'p1', sprint_id: 'sp1', responsavel_id: 'm2', titulo: 'Dashboard principal',      descricao: 'KPIs: usuários ativos, conversão e receita.',            estimativa: 24   },
    { id: 's3',  projeto_id: 'p1', sprint_id: 'sp2', responsavel_id: 'm3', titulo: 'Perfil do usuário',        descricao: 'Edição de perfil com upload para S3.',                   estimativa: 12   },
    { id: 's4',  projeto_id: 'p1', sprint_id: 'sp2', responsavel_id: 'm4', titulo: 'Configurações da conta',   descricao: 'Notificações, segurança e integrações.',                  estimativa: 10   },
    { id: 's5',  projeto_id: 'p2', sprint_id: 'sp1', responsavel_id: 'm2', titulo: 'Integração Stripe',        descricao: 'SDK Stripe para pagamentos recorrentes.',                 estimativa: 20   },
    { id: 's6',  projeto_id: 'p2', sprint_id: 'sp2', responsavel_id: 'm1', titulo: 'Webhooks de notificação',  descricao: '',                                                       estimativa: null },
    { id: 's7',  projeto_id: 'p2', sprint_id: 'sp2', responsavel_id: 'm3', titulo: 'Relatório de transações',  descricao: '',                                                       estimativa: null },
    { id: 's8',  projeto_id: 'p2', sprint_id: 'sp3', responsavel_id: 'm4', titulo: 'Estorno e reembolso',      descricao: '',                                                       estimativa: null },
    { id: 's9',  projeto_id: 'p3', sprint_id: 'sp3', responsavel_id: 'm4', titulo: 'Setup React Native + CI',  descricao: '',                                                       estimativa: null },
    { id: 's10', projeto_id: 'p3', sprint_id: 'sp4', responsavel_id: 'm4', titulo: 'Tela de Onboarding',       descricao: '',                                                       estimativa: null },
    { id: 's11', projeto_id: 'p3', sprint_id: 'sp4', responsavel_id: 'm2', titulo: 'Push Notifications',       descricao: '',                                                       estimativa: null },
  ],
  OKRs: [
    { id: 'okr1', tipo: 'KR',  frente: 'modernizacao',   titulo: 'Migração para arquitetura cloud-native',   projeto_id: 'p1', baseline: 0,  moonshot: 80,  roofshot: 100, atual: 35,  unidade: '%',   descricao: 'Percentual de serviços migrados para arquitetura cloud-native' },
    { id: 'okr2', tipo: 'KPI', frente: 'experiencia',    titulo: 'NPS dos usuários do portal',               projeto_id: 'p1', baseline: 42, moonshot: 65,  roofshot: 75,  atual: 48,  unidade: 'pts', descricao: 'Net Promoter Score mensurado mensalmente' },
    { id: 'okr3', tipo: 'KR',  frente: 'eficiencia',     titulo: 'Redução do tempo de deploy (minutos)',     projeto_id: 'p2', baseline: 45, moonshot: 15,  roofshot: 10,  atual: 28,  unidade: 'min', lower_is_better: 1, descricao: 'Tempo médio de deploy em produção — quanto menor, melhor' },
    { id: 'okr4', tipo: 'KPI', frente: 'dados_analytics', titulo: 'Cobertura de dados no Data Warehouse',  projeto_id: 'p2', baseline: 60, moonshot: 85,  roofshot: 95,  atual: 70,  unidade: '%',   lower_is_better: 0, descricao: 'Percentual de domínios de negócio com dados no DW' },
    { id: 'okr5', tipo: 'KR',  frente: 'atendimento',    titulo: 'Tempo médio de resposta ao cliente (min)', projeto_id: 'p3', baseline: 8,  moonshot: 3,   roofshot: 2,   atual: 5.5, unidade: 'min', lower_is_better: 1, descricao: 'Tempo médio de primeira resposta ao cliente — quanto menor, melhor' },
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
    return {
      sprints:   readSheet(workbook, 'Sprints'),
      equipe:    readSheet(workbook, 'Equipe'),
      projetos:  readSheet(workbook, 'Projetos'),
      historias: readSheet(workbook, 'Historias'),
      okrs:      readSheet(workbook, 'OKRs'),
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
    writeSheet(filePath, sheetName, data);
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
      Sprints:   withDemo ? DEMO_DATA.Sprints   : [{ id: '', nome: '', data_inicio: '', data_fim: '', status: '' }],
      Equipe:    withDemo ? DEMO_DATA.Equipe    : [{ id: '', nome: '', avatar_url: '', horas_ferias: 0, horas_projeto: 70, horas_colab: 20 }],
      Projetos:  withDemo ? DEMO_DATA.Projetos  : [{ id: '', nome: '', cor: '#6366f1', data_inicio: '', data_fim: '' }],
      Historias: withDemo ? DEMO_DATA.Historias : [{ id: '', projeto_id: '', sprint_id: '', responsavel_id: '', titulo: '', descricao: '', estimativa: null }],
      OKRs:      withDemo ? DEMO_DATA.OKRs      : [{ id: '', tipo: 'KR', frente: '', titulo: '', projeto_id: '', baseline: 0, moonshot: 0, roofshot: 0, atual: 0, unidade: '%', descricao: '' }],
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
