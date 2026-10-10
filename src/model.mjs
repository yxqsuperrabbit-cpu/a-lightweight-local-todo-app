export const COLORS = ['cream', 'sage', 'lavender', 'peach', 'sky'];
export const CATEGORIES = ['工作', '生活', '学习'];
const id = () => globalThis.crypto.randomUUID();
const dateValue = (value) => value ? new Date(value).getTime() : NaN;
export function localInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function isToday(value, now = Date.now()) {
  if (!value) return false;
  const a = new Date(value), b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export const isOverdue = (task, now = Date.now()) => !task.completed && dateValue(task.dueAt) < now;
export function normalizeState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.tasks) || value.tasks.length > 10000) throw new Error('备份格式不正确，或任务数量超过 10000 条。');
  const seen = new Set();
  const date = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || !Number.isFinite(dateValue(v))) throw new Error('任务中的日期时间无效。');
    return new Date(v).toISOString();
  };
  const tasks = value.tasks.map((task) => {
    if (!task || typeof task.id !== 'string' || task.id.length > 100 || seen.has(task.id)) throw new Error('任务编号无效或重复。');
    seen.add(task.id);
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120) throw new Error('任务标题需为 1～120 个字符。');
    if (typeof task.notes !== 'string' || task.notes.length > 5000) throw new Error('任务内容不能超过 5000 个字符。');
    return {
      id: task.id, title: task.title.trim(), notes: task.notes,
      category: CATEGORIES.includes(task.category) ? task.category : '生活',
      color: COLORS.includes(task.color) ? task.color : 'sage',
      priority: ['normal', 'high'].includes(task.priority) ? task.priority : 'normal',
      pinned: task.pinned === true, completed: task.completed === true,
      dueAt: date(task.dueAt), remindAt: date(task.remindAt), remindedAt: date(task.remindedAt),
      reminderMode: ['none', 'custom', '0', '5', '15', '30'].includes(task.reminderMode) ? task.reminderMode : task.remindAt ? 'custom' : 'none',
      createdAt: date(task.createdAt) || new Date().toISOString(), updatedAt: date(task.updatedAt) || new Date().toISOString()
    };
  });
  const settings = value.settings || {};
  const notifications = (Array.isArray(value.notifications) ? value.notifications : []).slice(0, 100).map((item) => {
    if (!item || typeof item.id !== 'string' || typeof item.taskId !== 'string' || typeof item.title !== 'string') throw new Error('提醒记录格式无效。');
    return { id: item.id.slice(0, 100), taskId: item.taskId.slice(0, 100), title: item.title.slice(0, 120), createdAt: date(item.createdAt) || new Date().toISOString(), read: item.read === true };
  });
  return { version: 1, tasks, notifications, settings: { theme: settings.theme === 'dark' ? 'dark' : 'light', accent: COLORS.includes(settings.accent) ? settings.accent : 'sage', sound: settings.sound !== false } };
}
export function createInitialState(now = Date.now()) {
  const at = (day, hour, minute = 0) => {
    const date = new Date(now); date.setDate(date.getDate() + day); date.setHours(hour, minute, 0, 0); return date.toISOString();
  };
  const seed = (title, notes, category, color, dueAt, extra = {}) => ({
    id: id(), title, notes, category, color, priority: 'normal', pinned: false, completed: false,
    dueAt, remindAt: null, remindedAt: null, reminderMode: 'none', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), ...extra
  });
  return { version: 1, settings: { theme: 'light', accent: 'sage', sound: true }, notifications: [], tasks: [
    seed('让好想法，有一个落脚点', '这是你的第一张待办卡片。点击卡片，试着写下今天最想完成的一件事。', '工作', 'sage', at(0, 18), { pinned: true, priority: 'high' }),
    seed('给自己留一点阅读时间', '读 20 页喜欢的书，记下一个值得回味的句子。慢一点，也没关系。', '学习', 'sage', at(0, 21)),
    seed('下班后，去散个步', '放下屏幕，走一段熟悉的小路。顺便买一束鲜花。', '生活', 'sage', at(0, 19, 30)),
    seed('整理本周的工作清单', '把零散的想法整理好，给重要的事情安排具体时间。', '工作', 'sage', at(1, 10)),
    seed('预约一次牙齿检查', '查一下附近诊所的预约时间，给自己的健康留个位置。', '生活', 'sage', at(-1, 17)),
    seed('整理桌面，开启新的一天', '清理桌面、泡一杯茶，准备开始。', '生活', 'sage', at(0, 9), { completed: true })
  ] };
}
export function getDueTasks(state, now = Date.now()) {
  return state.tasks.filter((task) => !task.completed && task.remindAt && !task.remindedAt && dateValue(task.remindAt) <= now);
}
export function applyAction(current, action, now = Date.now()) {
  const state = structuredClone(current), stamp = new Date(now).toISOString();
  const find = (taskId) => { const task = state.tasks.find((t) => t.id === taskId); if (!task) throw new Error('这条任务已不存在。'); return task; };
  switch (action.type) {
    case 'upsert': {
      const input = action.task;
      if (!input || typeof input !== 'object') throw new Error('任务数据无效。');
      const previous = input.id ? find(input.id) : null;
      const next = {
        ...input, id: previous?.id || id(), completed: previous?.completed || false,
        createdAt: previous?.createdAt || stamp, updatedAt: stamp,
        remindedAt: previous && previous.remindAt === input.remindAt ? previous.remindedAt : null
      };
      if (previous) state.tasks[state.tasks.indexOf(previous)] = next; else state.tasks.unshift(next);
      break;
    }
    case 'toggle': { const task = find(action.id); task.completed = !task.completed; task.updatedAt = stamp; break; }
    case 'pin': { const task = find(action.id); task.pinned = !task.pinned; task.updatedAt = stamp; break; }
    case 'delete': state.tasks = state.tasks.filter((task) => task.id !== action.id); break;
    case 'restore': if (!state.tasks.some((task) => task.id === action.task.id)) state.tasks.unshift(action.task); break;
    case 'snooze': {
      const task = find(action.id);
      if (task.completed) throw new Error('已完成的任务无需稍后提醒。');
      const minutes = Number(action.minutes);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error('稍后提醒时间无效。');
      task.remindAt = new Date(now + minutes * 60000).toISOString(); task.reminderMode = 'custom'; task.remindedAt = null; task.updatedAt = stamp;
      state.notifications.filter((n) => n.taskId === task.id).forEach((n) => { n.read = true; });
      break;
    }
    case 'remind': {
      const due = getDueTasks(state, now);
      for (const task of due) {
        task.remindedAt = stamp;
        state.notifications.unshift({ id: id(), taskId: task.id, title: task.title, createdAt: stamp, read: false });
      }
      state.notifications = state.notifications.slice(0, 100);
      break;
    }
    case 'read': state.notifications.forEach((n) => { n.read = true; }); break;
    case 'settings': state.settings = { ...state.settings, ...action.settings }; break;
    case 'import': return normalizeState(action.state);
    default: throw new Error('不支持的操作。');
  }
  return normalizeState(state);
}
