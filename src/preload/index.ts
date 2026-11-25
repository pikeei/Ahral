import { contextBridge, ipcRenderer } from 'electron'
import { type AhralApi, IpcChannels } from '../shared/api'

// Expose a narrow, typed API instead of ipcRenderer itself,
// so the UI can only call the operations we explicitly allow.
const api: AhralApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo)
}

contextBridge.exposeInMainWorld('api', api)
