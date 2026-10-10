const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, dialog, powerMonitor } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { FileStore } = require('./store.cjs');
const { APP_ID, createStartupController, shouldShowAtLaunch } = require('./startup.cjs');
const root = path.join(__dirname, '..');
const runtimeRoot = app.isPackaged ? path.dirname(process.execPath) : root;
const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'app-icon.ico') : path.join(root, 'assets', 'app-icon.ico');
const trayIconPath = app.isPackaged ? path.join(process.resourcesPath, 'app-icon.png') : path.join(root, 'assets', 'app-icon.png');
const previewMode = process.argv.includes('--preview-smoke-test');
const testMode = previewMode || process.argv.includes('--smoke-test');
app.setPath('userData', path.join(runtimeRoot, testMode ? '.runtime-smoke' : '.runtime'));
app.setAppUserModelId(APP_ID);
const startHidden = !shouldShowAtLaunch(process.argv);
let window, tray, quitting = false, state, store, model, timer;
const activeNotifications = new Set();
const locked = testMode || app.requestSingleInstanceLock();
if (!locked) app.quit();

function broadcast() { if (window && !window.isDestroyed()) window.webContents.send('state:changed', state); }
function update(action) { const next = model.applyAction(state, action); store.save(next); state = next; broadcast(); return state; }
function showWindow(taskId) {
  if (!window || window.isDestroyed()) createWindow();
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
  if (taskId) window.webContents.send('task:open', taskId);
}
function notify(title, body, taskId, silent = !state.settings.sound) {
  if (testMode) return true;
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title, body, silent, icon: trayIconPath });
  activeNotifications.add(notification);
  notification.on('click', () => showWindow(taskId));
  notification.on('close', () => activeNotifications.delete(notification));
  notification.on('failed', () => { activeNotifications.delete(notification); window?.webContents.send('app:error', '系统通知未能展示，请检查 Windows 通知设置。应用内提醒已保留。'); });
  notification.show();
  return true;
}
function checkReminders() {
  try {
    const due = model.getDueTasks(state);
    if (!due.length) return;
    update({ type: 'remind' });
    if (due.length > 1) notify('拾光 · 你有待办提醒', `${due.length} 件事情到了提醒时间，点击查看。`);
    else notify('拾光 · 到时间了', due[0].title, due[0].id);
  } catch (error) { console.error(error); window?.webContents.send('app:error', `提醒未能保存：${error.message}`); }
}
function createWindow() {
  window = new BrowserWindow({ width: 1340, height: 900, minWidth: 900, minHeight: 650, title: '拾光 · Daynote', backgroundColor: '#f7f8f5', autoHideMenuBar: true, show: false,
    icon: iconPath,
    webPreferences: { preload: previewMode ? undefined : path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const allowedUrl = previewMode ? 'http://127.0.0.1:4173/' : pathToFileURL(path.join(root, 'index.html')).href;
  window.webContents.on('will-navigate', (event, url) => { if (url !== allowedUrl) event.preventDefault(); });
  if (previewMode) window.loadURL(allowedUrl); else window.loadFile(path.join(root, 'index.html'));
  window.once('ready-to-show', () => { if (!startHidden) window.show(); });
  window.on('close', (event) => {
    if (!quitting && tray) {
      event.preventDefault(); window.hide();
      if (!window.hasExplainedTray) { window.hasExplainedTray = true; notify('拾光仍在运行', '窗口已收起到系统托盘，日期时间提醒会继续运行。'); }
    }
  });
}

if (locked) {
  app.on('second-instance', (_event, argv) => { if (shouldShowAtLaunch(argv)) showWindow(); });
  app.whenReady().then(async () => {
    model = await import(pathToFileURL(path.join(root, 'src', 'model.mjs')).href);
    const directory = process.env.DAYNOTE_DATA_DIR || path.join(runtimeRoot, testMode ? `artifacts/smoke-data-${Date.now()}` : 'data');
    store = new FileStore(directory, model.normalizeState);
    try {
      const loaded = store.load(model.createInitialState); state = loaded.state;
      if (loaded.recovered) dialog.showMessageBoxSync({ type: 'warning', message: '已从上一次有效备份恢复任务。', detail: '原任务文件读取失败；请导出备份并检查 data 目录。' });
    } catch (error) { dialog.showErrorBox('无法读取本地任务', error.message); app.quit(); return; }
    ipcMain.handle('state:load', () => state);
    ipcMain.handle('state:dispatch', (event, action) => {
      if (event.sender !== window.webContents) throw new Error('来源无效。');
      if (!['upsert', 'toggle', 'pin', 'delete', 'restore', 'snooze', 'read', 'settings', 'import'].includes(action?.type)) throw new Error('操作无效。');
      return update(action);
    });
    ipcMain.handle('notification:test', () => notify('拾光 · 提醒测试', '如果你看到了这条通知，系统提醒已准备就绪。'));
    const startup = createStartupController({ app });
    ipcMain.handle('startup:read', (event) => {
      if (event.sender !== window.webContents) throw new Error('来源无效。');
      return startup.read();
    });
    ipcMain.handle('startup:set', (event, enabled) => {
      if (event.sender !== window.webContents) throw new Error('来源无效。');
      if (testMode) throw new Error('验证模式不会修改 Windows 启动设置。');
      return startup.set(enabled);
    });
    createWindow();
    if (!previewMode) {
      const icon = nativeImage.createFromPath(trayIconPath);
      tray = new Tray(icon.resize({ width: 20, height: 20 }));
      tray.setToolTip('拾光 · 本地待办');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开拾光', click: () => showWindow() }, { type: 'separator' }, { label: '退出软件（停止提醒）', click: () => { quitting = true; app.quit(); } }]));
      tray.on('double-click', () => showWindow());
    }
    if (!testMode) {
      timer = setInterval(checkReminders, 1000);
      powerMonitor.on('resume', checkReminders);
      window.webContents.once('did-finish-load', checkReminders);
    } else {
      window.webContents.once('did-finish-load', async () => {
        try {
          const { runSmoke, runPreviewSmoke } = require('./smoke.cjs');
          const result = await (previewMode ? runPreviewSmoke(window, { root: runtimeRoot }) : runSmoke(window, { root: runtimeRoot, checkReminders, getState: () => state, startHidden }));
          console.log('Desktop smoke test passed:', JSON.stringify(result)); quitting = true; app.quit();
        } catch (error) { console.error(error); quitting = true; app.exit(1); }
      });
    }
  }).catch((error) => { console.error(error); app.exit(1); });
  app.on('before-quit', () => { quitting = true; clearInterval(timer); });
  app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });
}
