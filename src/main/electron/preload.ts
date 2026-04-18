import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AutomationApi } from '../../shared/ipc.contracts';

const automationApi: AutomationApi = {
  fetchCompanyByIco: (input) => ipcRenderer.invoke(IPC_CHANNELS.FETCH_COMPANY_BY_ICO, input),
  onProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(payload as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on(IPC_CHANNELS.PROGRESS, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROGRESS, wrapped);
  },
  generateDppoXml: (input) => ipcRenderer.invoke(IPC_CHANNELS.GENERATE_DPPO_XML, input),
  onDppoProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      listener(payload as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on(IPC_CHANNELS.DPPO_PROGRESS, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DPPO_PROGRESS, wrapped);
  },
  openXmlPath: (xmlPath) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_XML_PATH, xmlPath)
};

contextBridge.exposeInMainWorld('automationApi', automationApi);
