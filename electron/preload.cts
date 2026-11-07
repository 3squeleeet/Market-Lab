import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("marketLab", {
  invoke: (name: string, args: unknown = {}) =>
    ipcRenderer.invoke("lab:invoke", name, args),
  view: (symbol?: string) => ipcRenderer.invoke("lab:view", symbol),
});
