import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import { type AhralApi, type ImportStage, IpcChannels } from '../shared/api'

// Expose a narrow, typed API instead of ipcRenderer itself,
// so the UI can only call the operations we explicitly allow.
const api: AhralApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
  listDocuments: () => ipcRenderer.invoke(IpcChannels.listDocuments),
  importDocument: () => ipcRenderer.invoke(IpcChannels.importDocument),
  onImportProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, stage: ImportStage) => listener(stage)
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
