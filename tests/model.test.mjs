import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createInitialState, getDueTasks, normalizeState, isToday, localInput } from '../src/model.mjs';

const now = new Date('2026-10-10T10:00:00+08:00').getTime();
const empty = () => ({ ...createInitialState(now), tasks: [] });
const create = (remindAt = new Date(now + 60000).toISOString()) => applyAction(empty(), { type: 'upsert', task: { title: '提醒验证', notes: '测试数据', category: '工作', color: 'sage', priority: 'normal', pinned: false, dueAt: null, remindAt, reminderMode: 'custom' } }, now);

test('reminders survive a save/load round trip and fire only once', () => {
  const initial = create();
  const restored = normalizeState(JSON.parse(JSON.stringify(initial)));
  assert.equal(getDueTasks(restored, now).length, 0);
  assert.equal(getDueTasks(restored, now + 60000).length, 1);
  const fired = applyAction(restored, { type: 'remind' }, now + 60000);
  assert.equal(fired.notifications.length, 1);
  assert.equal(getDueTasks(fired, now + 120000).length, 0);
  assert.equal(applyAction(fired, { type: 'remind' }, now + 120000).notifications.length, 1);
});
test('editing a reminder cancels the old time and arms the new time', () => {
  const initial = create();
  const edited = applyAction(initial, { type: 'upsert', task: { ...initial.tasks[0], remindAt: new Date(now + 180000).toISOString() } }, now);
  assert.equal(getDueTasks(edited, now + 60000).length, 0);
  assert.equal(getDueTasks(edited, now + 180000).length, 1);
});
test('completion and deletion cancel pending reminders; undo restores task data', () => {
  const initial = create();
  const task = initial.tasks[0];
  assert.equal(getDueTasks(applyAction(initial, { type: 'toggle', id: task.id }, now), now + 120000).length, 0);
  const deleted = applyAction(initial, { type: 'delete', id: task.id }, now);
  assert.equal(getDueTasks(deleted, now + 120000).length, 0);
  assert.deepEqual(applyAction(deleted, { type: 'restore', task }, now).tasks[0], task);
});
test('wake-up catch-up handles multiple missed reminders without duplication', () => {
  const first = create(new Date(now - 60000).toISOString());
  const second = applyAction(first, { type: 'upsert', task: { ...first.tasks[0], id: null, title: '另一条', remindAt: new Date(now - 120000).toISOString() } }, now);
  assert.equal(getDueTasks(second, now + 86400000).length, 2);
  const fired = applyAction(second, { type: 'remind' }, now + 86400000);
  assert.equal(fired.notifications.length, 2);
  assert.equal(getDueTasks(fired, now + 86400001).length, 0);
});
test('snooze creates a new pending reminder and reads the previous notification', () => {
  const fired = applyAction(create(new Date(now - 1).toISOString()), { type: 'remind' }, now);
  const snoozed = applyAction(fired, { type: 'snooze', id: fired.tasks[0].id, minutes: 10 }, now);
  assert.equal(snoozed.notifications[0].read, true);
  assert.equal(snoozed.tasks[0].reminderMode, 'custom');
  assert.equal(getDueTasks(snoozed, now + 599999).length, 0);
  assert.equal(getDueTasks(snoozed, now + 600000).length, 1);
});
test('editing a title leaves an already fired reminder unchanged', () => {
  const fired = applyAction(create(new Date(now - 1).toISOString()), { type: 'remind' }, now);
  const edited = applyAction(fired, { type: 'upsert', task: { ...fired.tasks[0], title: '新标题' } }, now);
  assert.equal(getDueTasks(edited, now + 60000).length, 0);
});
test('invalid imports and blank titles are rejected before replacing state', () => {
  const initial = create();
  assert.throws(() => normalizeState({ ...initial, tasks: [initial.tasks[0], initial.tasks[0]] }), /重复/);
  assert.throws(() => normalizeState({ ...initial, tasks: [{ ...initial.tasks[0], remindAt: 'not a date' }] }), /日期/);
  assert.throws(() => applyAction(initial, { type: 'upsert', task: { ...initial.tasks[0], title: '   ' } }), /标题/);
  assert.throws(() => applyAction(initial, { type: 'snooze', id: initial.tasks[0].id, minutes: -1 }), /时间/);
  assert.equal(initial.tasks.length, 1);
});
test('local date inputs preserve local calendar fields', () => {
  const date = new Date(2026, 9, 10, 23, 45, 0);
  assert.equal(localInput(date.toISOString()), '2026-10-10T23:45');
  assert.equal(isToday(date.toISOString(), new Date(2026, 9, 10, 1).getTime()), true);
  assert.equal(isToday(date.toISOString(), new Date(2026, 9, 11, 1).getTime()), false);
});
