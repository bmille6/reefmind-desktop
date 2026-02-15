/**
 * ReefMind Preload Script
 * Bridge between main process and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Get current settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  
  // Update settings
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  // Show main window
  showWindow: () => ipcRenderer.invoke('show-window'),
  
  // Platform info
  platform: process.platform,
  
  // Is this Electron?
  isElectron: true,
});
