/**
 * Controle de Jornada — Preload Script
 *
 * Ponte de segurança entre o processo Main (Node.js) e o Renderer (React).
 * contextBridge.exposeInMainWorld garante que APENAS as funções explicitamente
 * listadas aqui ficam acessíveis via window.electronAPI no React.
 *
 * NUNCA exponha objetos inteiros do Electron (ex: ipcRenderer completo)
 * ou o módulo `require` — isso quebraria o isolamento de contexto.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Abre o diálogo nativo de arquivo.
   * @param {'open'|'save'} mode
   * @returns {Promise<string|null>} caminho do arquivo ou null se cancelado
   */
  selectFile: (mode) => ipcRenderer.invoke('select-file', mode),

  /**
   * Lê todas as abas do arquivo Excel e retorna os dados brutos.
   * @param {string} filePath
   * @returns {Promise<{sprints, equipe, projetos, historias}|{error}>}
   */
  loadData: (filePath) => ipcRenderer.invoke('load-data', filePath),

  /**
   * Salva uma aba específica do workbook.
   * Preserva as demais abas.
   * @param {string} filePath
   * @param {'Sprints'|'Equipe'|'Projetos'|'Historias'} sheetName
   * @param {object[]} data — array de objetos (linhas da planilha)
   * @returns {Promise<{success: true}|{error}>}
   */
  saveSheet: (filePath, sheetName, data) =>
    ipcRenderer.invoke('save-sheet', filePath, sheetName, data),

  /**
   * Cria um arquivo Excel novo com a estrutura do banco de dados.
   * @param {string} filePath — destino do arquivo
   * @param {boolean} withDemo — true inclui dados de exemplo
   * @returns {Promise<{success: true}|{error}>}
   */
  createTemplate: (filePath, withDemo) =>
    ipcRenderer.invoke('create-template', filePath, withDemo),

  /**
   * Abre diálogo de imagem, copia o arquivo para avatars/ e retorna o caminho.
   * @param {string} dbFilePath — caminho do Excel (para localizar a pasta avatars/)
   * @returns {Promise<string|null>} caminho absoluto da imagem ou null se cancelado
   */
  selectAvatar: (dbFilePath) =>
    ipcRenderer.invoke('select-avatar', dbFilePath),
});
