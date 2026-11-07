import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("marketLab", {
  load: () => ipcRenderer.invoke("session:load"),
  save: (session: unknown) => ipcRenderer.invoke("session:save", session),
});
