import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../electron/store.cjs';
import { applyAction, createInitialState, normalizeState } from '../src/model.mjs';

function makeStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daynote-test-'));
  t.after(() => {
    const resolved = path.resolve(directory), parent = path.resolve(os.tmpdir());
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('daynote-test-')) throw new Error('Unsafe temporary test directory');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return new FileStore(directory, normalizeState);
}
test('desktop data persists across new store instances with the previous state backed up', (t) => {
  const store = makeStore(t), initial = store.load(createInitialState).state;
  const changed = applyAction(initial, { type: 'toggle', id: initial.tasks[0].id });
  store.save(changed);
  assert.deepEqual(new FileStore(store.directory, normalizeState).load(createInitialState).state, changed);
  assert.deepEqual(JSON.parse(fs.readFileSync(store.backup, 'utf8')), initial);
});
test('corrupt primary data recovers from backup without overwriting the valid backup', (t) => {
  const store = makeStore(t), initial = store.load(createInitialState).state;
  store.save(initial); fs.writeFileSync(store.file, 'broken JSON');
  const restored = store.load(createInitialState);
  assert.equal(restored.recovered, true); assert.deepEqual(restored.state, initial);
  store.save(restored.state);
  assert.deepEqual(JSON.parse(fs.readFileSync(store.backup, 'utf8')), initial);
});
test('unrecoverable files are preserved rather than silently reset', (t) => {
  const store = makeStore(t); fs.writeFileSync(store.file, 'broken primary'); fs.writeFileSync(store.backup, 'broken backup');
  assert.throws(() => store.load(createInitialState), /均无法读取/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), 'broken primary');
});
