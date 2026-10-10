const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSmoke(window, { root, checkReminders, getState, startHidden = false }) {
  const output = path.join(root, 'artifacts'); fs.mkdirSync(output, { recursive: true });
  const run = (source) => window.webContents.executeJavaScript(source);
  const until = async (source) => {
    for (let i = 0; i < 100; i++) { if (await run(source)) return; await wait(50); }
    throw new Error(`UI timeout: ${source}`);
  };
  const screenshot = async (name) => { await wait(120); fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG()); };
  const errors = [];
  window.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  await until(`document.querySelectorAll('.task-card').length > 0`);
  assert.equal(await run(`!!window.daynote`), true);
  if (startHidden) {
    assert.equal(window.isVisible(), false);
    await wait(200); assert.equal(window.isVisible(), false);
    window.show();
    for (let i = 0; i < 40 && !window.isVisible(); i++) await wait(50);
    assert.equal(window.isVisible(), true);
  }
  const startup = await run(`window.daynote.getStartupStatus()`);
  assert.equal(startup.supported, true);
  assert.equal(typeof startup.enabled, 'boolean');
  const initialCount = getState().tasks.length;
  assert.equal(await run(`document.querySelectorAll('.brand, .avatar, .workspace-label, .welcome-row, .overview, .offline-note, .breadcrumb, .content-footer').length`), 0);
  assert.equal(await run(`document.querySelectorAll('#editor input[name="color"]').length`), 0);
  assert.equal(getState().settings.accent, 'sage');
  // Imported older tasks can retain their old data fields; the global theme must still color every card.
  const legacy = structuredClone(getState());
  legacy.tasks.forEach((task, index) => { task.color = ['cream', 'sage', 'lavender', 'peach', 'sky'][index % 5]; });
  await run(`window.daynote.dispatch({ type: 'import', state: ${JSON.stringify(legacy)} })`);
  await until(`document.body.dataset.accent === 'sage'`);
  const cardColors = () => run(`[...new Set([...document.querySelectorAll('.task-card')].map(card => getComputedStyle(card).backgroundColor))]`);
  assert.equal((await cardColors()).length, 1);
  await screenshot('desktop-demo.png');
  await run(`document.querySelector('[data-action="settings"]').click(); document.querySelector('input[name="accent"][value="sky"]').click();`);
  await until(`document.body.dataset.accent === 'sky'`);
  await run(`document.querySelector('[data-close="settings"]').click();`);
  await run(`document.querySelector('.sidebar-add').click(); document.querySelector('#task-title').value = 'Demo 验证 <卡片>'; document.querySelector('#task-notes').value = '本地保存与提醒验证'; document.querySelector('#reminder-mode').value = 'custom'; document.querySelector('#reminder-mode').dispatchEvent(new Event('change')); const d = new Date(Date.now() - 60000); const pad = n => String(n).padStart(2, '0'); document.querySelector('#task-reminder').value = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); document.querySelector('#task-form').requestSubmit();`);
  await until(`!document.querySelector('#editor').open`);
  assert.equal(getState().tasks.length, initialCount + 1);
  assert.equal((await cardColors()).length, 1);
  const taskId = getState().tasks.find((task) => task.title === 'Demo 验证 <卡片>').id;
  const card = `[data-id="${taskId}"]`;
  window.close(); checkReminders(); await wait(100);
  assert.equal(window.isVisible(), false);
  assert.equal(getState().notifications.filter((item) => item.taskId === taskId).length, 1);
  checkReminders(); assert.equal(getState().notifications.filter((item) => item.taskId === taskId).length, 1);
  window.show();
  await run(`document.querySelector('[data-action="notifications"]').click();`);
  await until(`document.querySelector('#notifications').open`);
  await screenshot('reminder-center.png');
  await run(`document.querySelector('#notification-list ${card} [data-action="snooze"]').click();`);
  await until(`document.querySelector('#notification-list ${card} h3 .status-dot') === null`);
  const snoozed = getState().tasks.find((task) => task.id === taskId).remindAt;
  assert.ok(new Date(snoozed).getTime() > Date.now() + 9 * 60000);
  await run(`document.querySelector('[data-close="notifications"]').click(); document.querySelector('#task-grid ${card} [data-action="edit"]').click();`);
  await until(`document.querySelector('#editor').open`);
  await screenshot('task-editor.png');
  await run(`document.querySelector('#task-title').value = 'Demo 已编辑'; document.querySelector('#task-form').requestSubmit();`);
  await until(`!document.querySelector('#editor').open`);
  assert.equal(getState().tasks.find((task) => task.id === taskId).remindAt, snoozed);
  await run(`document.querySelector('#task-grid ${card} [data-action="toggle"]').click();`);
  await until(`!document.querySelector('#task-grid ${card}')`);
  assert.equal(getState().tasks.find((task) => task.id === taskId).completed, true);
  await run(`document.querySelector('[data-status="completed"]').click();`);
  await until(`!!document.querySelector('#task-grid ${card}')`);
  await run(`document.querySelector('#task-grid ${card} [data-action="edit"]').click(); document.querySelector('#delete-task').click();`);
  await until(`!document.querySelector('#editor').open`);
  assert.equal(getState().tasks.some((task) => task.id === taskId), false);
  await run(`document.querySelector('#toast-action').click();`);
  await until(`!!document.querySelector('#task-grid ${card}')`);
  assert.equal(getState().tasks.some((task) => task.id === taskId), true);
  await run(`document.querySelector('#search').value = '不存在的词'; document.querySelector('#search').dispatchEvent(new Event('input'));`);
  assert.equal(await run(`document.querySelectorAll('.task-card').length`), 0);
  await run(`document.querySelector('#search').value = ''; document.querySelector('#search').dispatchEvent(new Event('input')); document.querySelector('[data-action="settings"]').click(); document.querySelector('#theme-toggle').checked = true; document.querySelector('#theme-toggle').dispatchEvent(new Event('change'));`);
  await until(`document.body.dataset.theme === 'dark'`);
  const palettes = {};
  for (const mode of ['dark', 'light']) {
    await run(`document.querySelector('#theme-toggle').checked = ${mode === 'dark'}; document.querySelector('#theme-toggle').dispatchEvent(new Event('change'));`);
    await until(`document.body.dataset.theme === '${mode}'`);
    const colors = [];
    for (const accent of ['sage', 'cream', 'lavender', 'peach', 'sky']) {
      await run(`document.querySelector('input[name="accent"][value="${accent}"]').click();`);
      await until(`document.body.dataset.accent === '${accent}'`);
      assert.equal(getState().settings.accent, accent);
      const backgrounds = await cardColors(); assert.equal(backgrounds.length, 1); colors.push(backgrounds[0]);
    }
    assert.equal(new Set(colors).size, 5);
    palettes[mode] = colors;
  }
  await screenshot('theme-settings.png');
  await run(`document.querySelector('#theme-toggle').checked = true; document.querySelector('#theme-toggle').dispatchEvent(new Event('change'));`);
  await until(`document.body.dataset.theme === 'dark'`);
  await screenshot('dark-settings.png');
  await run(`document.querySelector('#theme-toggle').checked = false; document.querySelector('#theme-toggle').dispatchEvent(new Event('change'));`);
  await until(`document.body.dataset.theme === 'light'`);
  await run(`document.querySelector('[data-close="settings"]').click(); document.querySelector('[data-status="pending"]').click();`);
  await new Promise((resolve) => { window.webContents.once('did-finish-load', resolve); window.reload(); });
  await until(`document.body.dataset.accent === 'sky' && document.querySelectorAll('.task-card').length > 0`);
  assert.equal((await cardColors()).length, 1);
  await screenshot('blue-theme.png');
  await run(`document.querySelector('[data-action="settings"]').click(); document.querySelector('input[name="accent"][value="sage"]').click();`);
  await until(`document.body.dataset.accent === 'sage'`);
  await run(`document.querySelector('[data-close="settings"]').click();`);
  window.setSize(980, 760); await wait(200);
  assert.equal(await run(`document.documentElement.scrollWidth > window.innerWidth`), false);
  await screenshot('compact-desktop.png');
  assert.equal(errors.length, 0, errors.join('\n'));
  const result = { passed: true, initialTasks: initialCount, startHidden, startupSupported: startup.supported, cases: ['startup status read without changing Windows', ...(startHidden ? ['login launch stays hidden'] : []), 'minimal layout', 'legacy tasks follow global color', 'new cards follow theme', 'five colors in light and dark mode', 'theme color survives reload', 'desktop bridge', 'task creation', 'safe text rendering', 'close window to tray', 'hidden window reminder', 'reminder deduplication', 'snooze', 'edit preserves reminder seconds', 'complete task', 'delete and undo', 'search', 'theme persistence', 'compact layout'], palettes, consoleErrors: errors };
  fs.writeFileSync(path.join(output, 'desktop-smoke.json'), JSON.stringify(result, null, 2));
  return result;
}
async function runPreviewSmoke(window, { root }) {
  const run = (source) => window.webContents.executeJavaScript(source);
  for (let i = 0; i < 100; i++) { if (await run(`document.querySelectorAll('.task-card').length > 0`)) break; await wait(50); }
  assert.equal(await run(`!!window.daynote`), false);
  assert.ok(await run(`document.querySelectorAll('.task-card').length > 0`));
  const initial = await run(`JSON.parse(localStorage.getItem('daynote.demo.v1')).tasks.length`);
  await run(`document.querySelector('.sidebar-add').click(); document.querySelector('#task-title').value = '浏览器预览验证'; document.querySelector('#task-form').requestSubmit();`);
  for (let i = 0; i < 100; i++) { if (!(await run(`document.querySelector('#editor').open`))) break; await wait(50); }
  assert.equal(await run(`JSON.parse(localStorage.getItem('daynote.demo.v1')).tasks.length`), initial + 1);
  await window.reload(); await wait(500);
  assert.equal(await run(`JSON.parse(localStorage.getItem('daynote.demo.v1')).tasks.length`), initial + 1);
  assert.ok(await run(`document.querySelector('#task-grid').textContent.includes('浏览器预览验证')`));
  const result = { passed: true, cases: ['localhost preview', 'browser storage adapter', 'create task', 'reload persistence'] };
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts', 'preview-smoke.json'), JSON.stringify(result, null, 2));
  return result;
}
module.exports = { runSmoke, runPreviewSmoke };
