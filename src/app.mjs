import { applyAction, createInitialState, getDueTasks, normalizeState, localInput, isToday, isOverdue, CATEGORIES } from './model.mjs';

const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const desktop = !!window.daynote;
const storageKey = 'daynote.demo.v1';
let state, view = 'all', category = null, status = 'pending', editingId = null, pendingImport = null;
let toastTimer, toastCallback, renderMinute = '', mutationQueue = Promise.resolve();
let startupStatus = { supported: false, enabled: false, blocked: false };
const formatTime = (value, withDate = false) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', { ...(withDate ? { month: 'short', day: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};
const views = [{ id: 'all', title: '全部待办', icon: 'grid' }, { id: 'today', title: '今天', icon: 'sun' }, { id: 'overdue', title: '已逾期', icon: 'clock' }, { id: 'completed', title: '已完成', icon: 'check-circle' }];
function toast(message, actionLabel, callback, duration = 5000) {
  clearTimeout(toastTimer); $('#toast-text').textContent = message;
  $('#toast-action').textContent = actionLabel || ''; $('#toast-action').hidden = !actionLabel; toastCallback = callback;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; toastCallback = null; }, duration);
}
function setSaved(ok = true) {
  $('#storage-status').textContent = ok ? '本地已保存' : '保存失败，请重试';
}
const withBrowserLock = (callback) => navigator.locks ? navigator.locks.request('daynote-data', callback) : callback();
function loadBrowser() {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) {
    const initial = createInitialState(); localStorage.setItem(storageKey, JSON.stringify(initial)); return initial;
  }
  return normalizeState(JSON.parse(raw));
}
const adapter = desktop ? window.daynote : {
  load: async () => withBrowserLock(loadBrowser),
  dispatch: async (action) => withBrowserLock(() => {
    const next = applyAction(loadBrowser(), action); localStorage.setItem(storageKey, JSON.stringify(next)); return next;
  })
};
function dispatch(action) {
  const operation = mutationQueue.then(async () => {
    const next = await adapter.dispatch(action); state = next; render(); setSaved(); return next;
  });
  mutationQueue = operation.catch(() => {});
  return operation.catch((error) => { setSaved(false); toast(`未能保存：${error.message}`, null, null, 9000); throw error; });
}
function selectView(next, nextCategory = null) {
  view = next; category = nextCategory;
  status = view === 'completed' ? 'completed' : 'pending'; $('#search').value = ''; render();
}
function countFor(next) {
  if (next === 'completed') return state.tasks.filter((task) => task.completed).length;
  if (next === 'today') return state.tasks.filter((task) => !task.completed && isToday(task.dueAt)).length;
  if (next === 'overdue') return state.tasks.filter((task) => isOverdue(task)).length;
  return state.tasks.filter((task) => !task.completed).length;
}
function filteredTasks() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  const items = state.tasks.filter((task) => {
    if (category && task.category !== category) return false;
    if (view === 'today' && !isToday(task.dueAt)) return false;
    if (view === 'overdue' && !isOverdue(task)) return false;
    if (view === 'completed' && !task.completed) return false;
    if (status === 'pending' && task.completed) return false;
    if (status === 'completed' && !task.completed) return false;
    return !query || `${task.title} ${task.notes} ${task.category}`.toLocaleLowerCase().includes(query);
  });
  const sort = $('#sort').value;
  items.sort((a, b) => {
    const pin = Number(b.pinned) - Number(a.pinned); if (pin) return pin;
    if (sort === 'priority') { const priority = Number(b.priority === 'high') - Number(a.priority === 'high'); if (priority) return priority; }
    if (sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity) || new Date(b.createdAt) - new Date(a.createdAt);
  });
  return items;
}
function dateLabel(task) {
  if (!task.dueAt) return '未设置截止时间';
  if (isOverdue(task)) return `已逾期 · ${formatTime(task.dueAt, !isToday(task.dueAt))}`;
  return `${isToday(task.dueAt) ? '今天 ' : ''}${formatTime(task.dueAt, !isToday(task.dueAt))}`;
}
function renderCards() {
  const tasks = filteredTasks();
  $('#view-count').textContent = tasks.length;
  let html = tasks.map((task) => `<article class="task-card ${task.completed ? 'completed' : ''}" data-id="${escape(task.id)}">
    <div class="card-top"><span class="category-badge">${task.category}</span>${task.priority === 'high' ? '<span class="priority-badge">重要</span>' : ''}<button class="card-pin ${task.pinned ? 'pinned' : ''}" data-action="pin" aria-label="${task.pinned ? '取消置顶' : '置顶'} ${escape(task.title)}" title="${task.pinned ? '取消置顶' : '置顶'}">${icon('pin')}</button></div>
    <div class="card-title-row"><button class="complete-button" data-action="toggle" aria-label="${task.completed ? '标记未完成' : '完成'} ${escape(task.title)}">${task.completed ? icon('check') : ''}</button><button class="card-title" data-action="edit">${escape(task.title)}</button></div>
    <p class="card-notes">${escape(task.notes || '给这件事添一点细节…')}</p><div class="card-spacer"></div>
    <div class="card-footer"><span class="card-date ${isOverdue(task) ? 'overdue' : ''}">${icon('clock')}${escape(dateLabel(task))}</span>${task.remindAt && !task.completed ? `<span class="reminder-badge" title="${escape(formatTime(task.remindAt, true))}">${icon('bell')}${task.remindedAt ? '已提醒' : formatTime(task.remindAt, !isToday(task.remindAt))}</span>` : ''}</div>
  </article>`).join('');
  if (!tasks.length) html = `<div class="empty-state">${icon('leaf')}<h3>${$('#search').value.trim() ? '没有找到匹配的待办' : view === 'overdue' ? '没有逾期任务，真好' : status === 'completed' ? '每一个完成，都从开始算起' : '给今天留一点新的可能'}</h3><p>${$('#search').value.trim() ? '试试其他关键词，或切换筛选条件。' : '点击「新建待办」，记录下一件小事。'}</p></div>`;
  if (view !== 'completed' && status !== 'completed' && !$('#search').value.trim()) html += `<button class="add-card" data-action="new"><span class="add-circle">${icon('plus')}</span><strong>新建待办</strong></button>`;
  $('#task-grid').innerHTML = html;
}
function renderNotifications() {
  $('#notification-dot').hidden = !state.notifications.some((notification) => !notification.read);
  $('#notification-list').innerHTML = state.notifications.length ? state.notifications.map((notification) => {
    const task = state.tasks.find((item) => item.id === notification.taskId);
    return `<div class="notification-item" data-id="${escape(notification.taskId)}"><h3>${!notification.read ? '<span class="status-dot"></span>' : ''}${escape(notification.title)}</h3><p>${formatTime(notification.createdAt, true)} · ${!task ? '任务已删除' : task.completed ? '任务已完成' : '已到提醒时间'}</p>${task ? `<div class="notification-actions"><button class="text-button" data-action="edit">查看任务</button>${!task.completed ? '<button class="text-button" data-action="snooze">10 分钟后提醒</button><button class="text-button" data-action="toggle">标记完成</button>' : ''}</div>` : ''}</div>`;
  }).join('') : `<div class="notification-empty">${icon('bell')}<h3>暂时没有提醒</h3><p>为任务设置一个时间，到点我们会提醒你。</p></div>`;
}
function render() {
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.accent = state.settings.accent;
  $('#view-nav').innerHTML = views.map((item) => `<button class="nav-item ${view === item.id && !category ? 'active' : ''}" data-view="${item.id}">${icon(item.icon)}${item.title}<span class="nav-count">${countFor(item.id)}</span></button>`).join('');
  $('#category-nav').innerHTML = CATEGORIES.map((name) => `<button class="nav-item ${category === name ? 'active' : ''}" data-category="${name}"><span class="category-dot" data-category="${name}"></span>${name}<span class="nav-count">${state.tasks.filter((task) => !task.completed && task.category === name).length}</span></button>`).join('');
  const selected = views.find((item) => item.id === view);
  $('#view-heading').innerHTML = `${category || selected.title} <span id="view-count"></span>`;
  document.querySelectorAll('[data-status]').forEach((button) => { button.classList.toggle('active', button.dataset.status === status); button.disabled = ['completed', 'overdue'].includes(view) && button.dataset.status !== (view === 'completed' ? 'completed' : 'pending'); });
  $('#theme-toggle').checked = state.settings.theme === 'dark'; $('#sound-toggle').checked = state.settings.sound;
  document.querySelectorAll('input[name="accent"]').forEach((input) => { input.checked = input.value === state.settings.accent; });
  renderCards(); renderNotifications();
}
function reminderHint() {
  const mode = $('#reminder-mode').value;
  $('#custom-reminder-field').hidden = mode !== 'custom';
  $('#task-reminder').required = mode === 'custom';
  let text = '提醒时间和截止时间可以独立设置。';
  if (mode !== 'none' && mode !== 'custom') text = $('#task-due').value ? `将在截止时间${mode === '0' ? '到达时' : `前 ${mode} 分钟`}提醒。` : '请先设置截止日期与时间。';
  if (mode === 'custom' && $('#task-reminder').value && new Date($('#task-reminder').value).getTime() <= Date.now()) text = '这个时间已经过去，保存后会立即提醒。';
  $('#reminder-hint').textContent = text;
}
function openEditor(taskId) {
  const task = taskId ? state.tasks.find((item) => item.id === taskId) : null;
  if (taskId && !task) { toast('这条任务已不存在。'); return; }
  $('#notifications').close();
  editingId = task?.id || null; $('#task-form').reset();
  $('#editor-heading').textContent = task ? '编辑待办' : '新建待办';
  $('#task-title').value = task?.title || ''; $('#task-notes').value = task?.notes || '';
  $('#task-category').value = task?.category || category || '工作'; $('#task-priority').value = task?.priority || 'normal';
  $('#task-due').value = localInput(task?.dueAt); $('#task-reminder').value = localInput(task?.remindAt);
  $('#reminder-mode').value = task?.remindAt ? task.reminderMode || 'custom' : 'none'; $('#task-pinned').checked = task?.pinned || false;
  $('#delete-task').hidden = !task; $('#form-error').hidden = true; reminderHint();
  if (!$('#editor').open) $('#editor').showModal();
  $('#task-title').focus();
}
async function saveTask(event) {
  event.preventDefault(); const form = $('#task-form'); if (!form.reportValidity()) return;
  const previous = state.tasks.find((task) => task.id === editingId);
  const toISO = (value, oldValue) => value ? oldValue && localInput(oldValue) === value ? oldValue : new Date(value).toISOString() : null;
  const mode = $('#reminder-mode').value, dueAt = toISO($('#task-due').value, previous?.dueAt);
  let remindAt = null;
  try {
    if (mode === 'custom') remindAt = toISO($('#task-reminder').value, previous?.remindAt);
    else if (mode !== 'none') {
      if (!dueAt) throw new Error('请先设置截止日期与时间，或使用自定义提醒时间。');
      remindAt = new Date(new Date(dueAt).getTime() - Number(mode) * 60000).toISOString();
    }
    const task = { id: editingId, title: $('#task-title').value.trim(), notes: $('#task-notes').value.trim(), category: $('#task-category').value, priority: $('#task-priority').value, color: previous?.color || 'sage', dueAt, remindAt, reminderMode: mode, pinned: $('#task-pinned').checked };
    $('#save-task').disabled = true;
    await dispatch({ type: 'upsert', task }); $('#editor').close(); toast(editingId ? '已保存这张卡片。' : '新的小计划，已记下。');
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { $('#save-task').disabled = false; }
}
async function deleteTask() {
  const task = state.tasks.find((item) => item.id === editingId); if (!task) return;
  await dispatch({ type: 'delete', id: task.id }); $('#editor').close();
  toast('卡片已删除。', '撤销', async () => { await dispatch({ type: 'restore', task }); toast('卡片已恢复。'); }, 10000);
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `daynote-backup-${localInput(new Date().toISOString()).slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast('备份已导出。');
}
async function testNotification() {
  if (desktop) {
    const supported = await window.daynote.testNotification(); toast(supported ? '已发送测试，请查看系统通知。' : '系统通知不可用，应用内提醒仍会保留。'); return;
  }
  if (!('Notification' in window)) { toast('当前浏览器不支持系统通知，应用内提醒仍可使用。'); return; }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') { new Notification('拾光 · 提醒测试', { body: '到点提醒，让重要的事如期发生。', icon: './assets/app-icon.png', silent: !state.settings.sound }); toast('已发送测试，请查看系统通知。'); }
  else toast('未开启系统通知，应用内提醒仍可使用。');
  updatePermissionText();
}
function updatePermissionText() {
  $('#notification-permission').textContent = desktop ? '桌面通知展示受 Windows 通知设置影响。' : `浏览器通知${!('Notification' in window) ? '不可用' : Notification.permission === 'granted' ? '已允许' : Notification.permission === 'denied' ? '已被阻止' : '尚未开启'}，可点击测试。`;
}
function renderStartupStatus() {
  $('#startup-toggle').checked = startupStatus.enabled;
  $('#startup-toggle').disabled = !startupStatus.supported;
  $('#startup-hint').textContent = !desktop ? '仅 Windows 桌面版支持。' : !startupStatus.supported ? '当前系统无法使用开机自启动。' : startupStatus.blocked ? '已在 Windows 启动应用中禁用，可重新开启。' : '登录 Windows 后在托盘运行。';
}
async function refreshStartupStatus() {
  $('#startup-toggle').disabled = true;
  try {
    startupStatus = desktop ? await window.daynote.getStartupStatus() : { supported: false, enabled: false, blocked: false };
    renderStartupStatus();
  } catch (error) {
    startupStatus = { supported: false, enabled: false, blocked: false }; renderStartupStatus();
    $('#startup-hint').textContent = '无法读取开机启动设置，请重新打开软件。';
    console.error(error);
  }
}
async function tickBrowser() {
  if (desktop || !state) return;
  try {
    await withBrowserLock(() => {
      const current = loadBrowser(), due = getDueTasks(current);
      if (!due.length) return;
      const next = applyAction(current, { type: 'remind' }); localStorage.setItem(storageKey, JSON.stringify(next)); state = next; render();
      toast(due.length === 1 ? `到时间了：${due[0].title}` : `${due.length} 件事情到了提醒时间。`, '查看', () => { if (!$('#notifications').open) $('#notifications').showModal(); }, 12000);
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('拾光 · 到时间了', { body: due.length === 1 ? due[0].title : `${due.length} 件待办需要你的关注。`, icon: './assets/app-icon.png', silent: !state.settings.sound });
        notification.onclick = () => { window.focus(); if (!$('#notifications').open) $('#notifications').showModal(); notification.close(); };
      }
    });
  } catch (error) { setSaved(false); console.error(error); }
}
async function performAction(action, id) {
  if (action === 'new') openEditor();
  if (action === 'edit') openEditor(id);
  if (action === 'pin') await dispatch({ type: 'pin', id });
  if (action === 'toggle') { const done = state.tasks.find((task) => task.id === id)?.completed; await dispatch({ type: 'toggle', id }); toast(done ? '已移回待完成。' : '又完成了一件事，真好。'); }
  if (action === 'snooze') { await dispatch({ type: 'snooze', id, minutes: 10 }); toast('10 分钟后，再提醒你。'); }
  if (action === 'read') { await dispatch({ type: 'read' }); toast('已将提醒标记为已读。'); }
  if (action === 'notifications' && !$('#notifications').open) $('#notifications').showModal();
  if (action === 'settings') { updatePermissionText(); $('#settings').showModal(); await refreshStartupStatus(); }
  if (action === 'export') exportBackup();
  if (action === 'import') $('#import-file').click();
  if (action === 'test-notification') await testNotification();
}
document.addEventListener('click', (event) => {
  if (!state) return;
  const button = event.target.closest('button');
  if (!button) { const card = event.target.closest('.task-card'); if (card) openEditor(card.dataset.id); return; }
  if (button.dataset.close) $(`#${button.dataset.close}`).close();
  if (button.dataset.view) selectView(button.dataset.view);
  if (button.dataset.category) selectView('all', button.dataset.category);
  if (button.dataset.status) { status = button.dataset.status; render(); }
  if (button.dataset.action) performAction(button.dataset.action, button.closest('[data-id]')?.dataset.id).catch((error) => console.error(error));
});
$('#search').addEventListener('input', () => { if (state) renderCards(); });
$('#sort').addEventListener('change', () => { if (state) renderCards(); });
$('#task-form').addEventListener('submit', saveTask);
$('#delete-task').addEventListener('click', () => deleteTask().catch(console.error));
$('#reminder-mode').addEventListener('change', reminderHint); $('#task-due').addEventListener('input', reminderHint); $('#task-reminder').addEventListener('input', reminderHint);
$('#theme-toggle').addEventListener('change', () => dispatch({ type: 'settings', settings: { theme: $('#theme-toggle').checked ? 'dark' : 'light' } }).catch(console.error));
document.querySelectorAll('input[name="accent"]').forEach((input) => input.addEventListener('change', () => { if (input.checked) dispatch({ type: 'settings', settings: { accent: input.value } }).catch(console.error); }));
$('#sound-toggle').addEventListener('change', () => dispatch({ type: 'settings', settings: { sound: $('#sound-toggle').checked } }).catch(console.error));
$('#startup-toggle').addEventListener('change', async () => {
  if (!desktop || !startupStatus.supported) { renderStartupStatus(); return; }
  const enabled = $('#startup-toggle').checked; $('#startup-toggle').disabled = true;
  try {
    startupStatus = await window.daynote.setStartupEnabled(enabled); renderStartupStatus();
    toast(enabled ? '已开启开机自启动，下次登录 Windows 后生效。' : '已关闭开机自启动。');
  } catch (error) {
    await refreshStartupStatus(); toast(`未能设置：${error.message}`, null, null, 9000);
  }
});
$('.toast-close').addEventListener('click', () => { clearTimeout(toastTimer); $('#toast').hidden = true; });
$('#toast-action').addEventListener('click', async () => { const callback = toastCallback; $('#toast').hidden = true; clearTimeout(toastTimer); try { await callback?.(); } catch (error) { console.error(error); } });
document.addEventListener('keydown', (event) => {
  if (!state || document.querySelector('dialog[open]') || event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); openEditor(); }
  if (event.key === '/') { event.preventDefault(); $('#search').focus(); }
});
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
$('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('备份文件不能超过 10 MB。');
    pendingImport = normalizeState(JSON.parse(await file.text()));
    $('#import-description').textContent = `这份备份包含 ${pendingImport.tasks.length} 条任务。`;
    $('#settings').close(); $('#confirm-import').showModal();
  } catch (error) { toast(`无法导入：${error.message}`, null, null, 8000); }
});
$('#confirm-import-button').addEventListener('click', async () => {
  if (!pendingImport) return;
  try { await dispatch({ type: 'import', state: pendingImport }); pendingImport = null; $('#confirm-import').close(); toast('备份已恢复。'); }
  catch (error) { console.error(error); }
});
$('#settings-mode-note').textContent = desktop ? '关闭窗口后继续提醒；从托盘退出软件后停止提醒。' : '浏览器预览需要保持页面运行。清除浏览器数据前，请先导出备份。';
try {
  state = await adapter.load(); render();
  if (desktop) {
    window.daynote.onChange((next) => {
      const newReminders = next.notifications.filter((item) => !state.notifications.some((previous) => previous.id === item.id));
      state = next; render(); setSaved();
      if (newReminders.length) toast(newReminders.length === 1 ? `到时间了：${newReminders[0].title}` : `${newReminders.length} 件事情到了提醒时间。`, '查看', () => { if (!$('#notifications').open) $('#notifications').showModal(); }, 12000);
    });
    window.daynote.onOpenTask(openEditor); window.daynote.onError((message) => toast(message, null, null, 10000));
  } else window.addEventListener('storage', async (event) => { if (event.key === storageKey) { try { state = await adapter.load(); render(); } catch (error) { toast(`无法读取任务：${error.message}`); } } });
  refreshStartupStatus();
  setInterval(() => { tickBrowser(); const minute = localInput(new Date().toISOString()); if (minute !== renderMinute) { renderMinute = minute; render(); } }, 1000);
  tickBrowser();
} catch (error) {
  setSaved(false); $('#task-grid').innerHTML = `<div class="empty-state"><h3>无法读取本地记录</h3><p>${escape(error.message)} 原有数据没有被覆盖。</p></div>`;
  toast('本地数据读取失败，请检查浏览器存储或桌面数据文件。', null, null, 15000);
  console.error(error);
}
