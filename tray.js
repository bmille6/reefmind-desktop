/**
 * ReefMind System Tray Management
 * Color-coded reef icon based on tank health
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

class ReefTray {
  constructor(iconPath) {
    this.tray = new Tray(this.createIcon('green'));
    this.tray.setToolTip('ReefMind - Simulator Mode');
    
    this.status = 'green';
    this.dataSource = 'simulator';
    this.params = {};
    
    this.updateMenu();
  }
  
  createIcon(color) {
    // For now, use the same icon. In production, generate colored versions.
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    
    // Resize for tray (platform-specific sizes)
    if (process.platform === 'darwin') {
      return icon.resize({ width: 16, height: 16 });
    } else if (process.platform === 'win32') {
      return icon.resize({ width: 16, height: 16 });
    } else {
      return icon.resize({ width: 22, height: 22 });
    }
  }
  
  updateStatus(status) {
    this.status = status;
    const icon = this.createIcon(status);
    this.tray.setImage(icon);
    this.updateMenu();
  }
  
  updateMenu(options = {}) {
    if (options.dataSource) this.dataSource = options.dataSource;
    if (options.params) this.params = options.params;
    if (options.status) this.updateStatus(options.status);
    
    const statusIcon = {
      green: '🟢',
      yellow: '🟡',
      red: '🔴',
    }[this.status] || '⚪';
    
    const sourceLabel = {
      simulator: 'Simulator',
      fusion: 'Apex Fusion',
      local: 'Local Apex',
    }[this.dataSource] || 'Unknown';
    
    const menu = Menu.buildFromTemplate([
      {
        label: `${statusIcon} ReefMind`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: this.params.ph ? `pH: ${this.params.ph}` : 'No data yet',
        enabled: false,
      },
      {
        label: this.params.alk ? `Alk: ${this.params.alk} dKH` : 'No data yet',
        enabled: false,
      },
      {
        label: this.params.temp ? `Temp: ${this.params.temp}°F` : 'No data yet',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'View Dashboard',
        click: () => {
          const windows = require('electron').BrowserWindow.getAllWindows();
          if (windows.length > 0) {
            windows[0].show();
            windows[0].focus();
          }
        },
      },
      {
        label: `Data Source: ${sourceLabel}`,
        submenu: [
          {
            label: '🔵 Simulator',
            type: 'radio',
            checked: this.dataSource === 'simulator',
            click: () => this.changeDataSource('simulator'),
          },
          {
            label: '🔵 Apex Fusion',
            type: 'radio',
            checked: this.dataSource === 'fusion',
            click: () => this.changeDataSource('fusion'),
          },
          {
            label: '🔵 Local Apex',
            type: 'radio',
            checked: this.dataSource === 'local',
            click: () => this.changeDataSource('local'),
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Quit ReefMind',
        click: () => {
          app.quit();
        },
      },
    ]);
    
    this.tray.setContextMenu(menu);
  }
  
  changeDataSource(source) {
    this.dataSource = source;
    
    // Update main process settings
    const { ipcMain } = require('electron');
    const windows = require('electron').BrowserWindow.getAllWindows();
    
    // TODO: Trigger settings update via IPC
    console.log(`Data source changed to: ${source}`);
    
    this.updateMenu();
  }
  
  on(event, handler) {
    this.tray.on(event, handler);
  }
}

module.exports = ReefTray;
