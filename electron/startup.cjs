const APP_ID = 'cn.daynote.desktop.demo';

function shouldShowAtLaunch(argv) { return !argv.includes('--autostart'); }

function createStartupController({ app, platform = process.platform, executable = process.execPath }) {
  // Electron 44 quotes each argument when writing the Windows launch command.
  // Use the absolute project path in development so login does not depend on cwd.
  const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
  const options = { path: `"${executable}"`, args };
  function read() {
    if (platform !== 'win32') return { supported: false, enabled: false, blocked: false };
    const details = app.getLoginItemSettings(options);
    const ownItem = details.launchItems?.find((item) => item.name === APP_ID && item.scope === 'user');
    const registered = details.openAtLogin === true;
    const blocked = registered && ownItem?.enabled === false;
    return { supported: true, enabled: registered && !blocked, blocked };
  }
  function set(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('开机启动设置无效。');
    if (platform !== 'win32') throw new Error('当前仅 Windows 桌面版支持开机自启动。');
    app.setLoginItemSettings({ ...options, name: APP_ID, openAtLogin: enabled, enabled });
    const result = read();
    if (result.enabled !== enabled) throw new Error('Windows 未能保存开机启动设置，请检查系统的启动应用设置。');
    return result;
  }
  return { read, set };
}

module.exports = { APP_ID, createStartupController, shouldShowAtLaunch };
