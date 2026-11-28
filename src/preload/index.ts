import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import { type AhralApi, type ImportProgress, IpcChannels } from '../shared/api'

// Expose a narrow, typed API instead of ipcRenderer itself,
// so the UI can only call the operations we explicitly allow.
const api: AhralApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  getReadiness: (blueprint) => ipcRenderer.invoke(IpcChannels.getReadiness, blueprint),
  startStudyExam: (settings) => ipcRenderer.invoke(IpcChannels.startStudyExam, settings),
  recordAnswer: (examId, position, response) =>
    ipcRenderer.invoke(IpcChannels.recordAnswer, examId, position, response),
  listDocuments: () => ipcRenderer.invoke(IpcChannels.listDocuments),
  // The main process opens the system file dialog itself.
  choosesFileInPage: false,
  importDocument: () => ipcRenderer.invoke(IpcChannels.importDocument),
  onImportProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: ImportProgress) => listener(progress)
    ipcRenderer.on(IpcChannels.importProgress, handler)
    return () => ipcRenderer.removeListener(IpcChannels.importProgress, handler)
  },
  getDocument: (id) => ipcRenderer.invoke(IpcChannels.getDocument, id),
  deleteDocument: (id) => ipcRenderer.invoke(IpcChannels.deleteDocument, id),
  startExam: (documentId, settings) => ipcRenderer.invoke(IpcChannels.startExam, documentId, settings),
  answerQuestion: (examId, position, response) =>
    ipcRenderer.invoke(IpcChannels.answerQuestion, examId, position, response),
  finishExam: (examId) => ipcRenderer.invoke(IpcChannels.finishExam, examId)
}

contextBridge.exposeInMainWorld('api', api)
