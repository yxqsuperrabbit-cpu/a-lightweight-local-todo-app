import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ID, createStartupController, shouldShowAtLaunch } from '../electron/startup.cjs';

function fakeApp({ packaged = false, blocked = false, silentFailure = false } = {}) {
  let registration = null;
  const writes = [], reads = [];
  return {
    isPackaged: packaged, writes, reads,
    getAppPath: () => 'C:\\My Projects\\拾光',
    setLoginItemSettings: (options) => { writes.push(options); if (!silentFailure) registration = options.openAtLogin ? options : null; },
    getLoginItemSettings: (options) => {
      reads.push(options);
      return { openAtLogin: !!registration && registration.path === options.path && JSON.stringify(registration.args) === JSON.stringify(options.args), executableWillLaunchAtLogin: true,
        launchItems: [{ name: 'another-app', scope: 'user', enabled: true }, ...(registration ? [{ name: APP_ID, scope: 'user', enabled: !blocked }] : [])] };
    }
  };
}
test('reading startup status never enables it or mistakes another app for this app', () => {
  const app = fakeApp(), startup = createStartupController({ app, platform: 'win32', executable: 'C:\\Tools\\electron.exe' });
  assert.deepEqual(startup.read(), { supported: true, enabled: false, blocked: false });
  assert.equal(app.writes.length, 0);
});
test('development startup uses an absolute project path with the background flag', () => {
  const app = fakeApp(), startup = createStartupController({ app, platform: 'win32', executable: 'C:\\Program Files\\Electron\\electron.exe' });
  assert.equal(startup.set(true).enabled, true);
  assert.equal(app.writes[0].path, '"C:\\Program Files\\Electron\\electron.exe"');
  assert.deepEqual(app.writes[0].args, ['C:\\My Projects\\拾光', '--autostart']);
  assert.equal(app.writes[0].name, APP_ID);
  assert.deepEqual(app.reads[0], { path: app.writes[0].path, args: app.writes[0].args });
  assert.equal(startup.set(false).enabled, false);
  assert.equal(app.writes[1].name, APP_ID);
  assert.equal(app.writes[1].openAtLogin, false);
});
test('packaged startup runs its own executable without a development project argument', () => {
  const app = fakeApp({ packaged: true });
  createStartupController({ app, platform: 'win32', executable: 'C:\\Apps\\Daynote.exe' }).set(true);
  assert.deepEqual(app.writes[0].args, ['--autostart']);
});
test('Windows-disabled startup is reported as disabled rather than automatically re-enabled', () => {
  const app = fakeApp({ blocked: true }), startup = createStartupController({ app, platform: 'win32' });
  app.setLoginItemSettings({ ...startupOptions(app), name: APP_ID, openAtLogin: true });
  assert.deepEqual(startup.read(), { supported: true, enabled: false, blocked: true });
  assert.equal(app.writes.length, 1);
});
function startupOptions(app) { return { path: `"${process.execPath}"`, args: [app.getAppPath(), '--autostart'] }; }
test('silent Windows write failures are reported to the caller', () => {
  const app = fakeApp({ silentFailure: true });
  assert.throws(() => createStartupController({ app, platform: 'win32' }).set(true), /未能保存/);
});
test('invalid values and unsupported systems never write startup settings', () => {
  const app = fakeApp();
  assert.throws(() => createStartupController({ app, platform: 'win32' }).set('true'), /无效/);
  const unsupported = createStartupController({ app, platform: 'linux' });
  assert.equal(unsupported.read().supported, false); assert.throws(() => unsupported.set(true), /Windows/);
  assert.equal(app.writes.length, 0);
});
test('login starts hidden and manual launches open the window', () => {
  assert.equal(shouldShowAtLaunch(['Daynote.exe', '--autostart']), false);
  assert.equal(shouldShowAtLaunch(['Daynote.exe']), true);
});
