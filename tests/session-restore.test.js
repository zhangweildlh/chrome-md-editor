import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLastFileRecord,
  isLastFileUsable,
  DEFAULT_MAX_AGE_MS,
} from '../src/session-restore.js';

test('buildLastFileRecord fills defaults', () => {
  const r = buildLastFileRecord({ content: '# hi' });
  assert.equal(r.content, '# hi');
  assert.equal(r.filename, 'untitled.md');
  assert.equal(r.sourceUrl, null);
  assert.equal(typeof r.timestamp, 'number');
});

test('buildLastFileRecord keeps filename and sourceUrl', () => {
  const r = buildLastFileRecord({
    content: 'x',
    filename: ' notes.md ',
    sourceUrl: 'file:///tmp/notes.md',
    timestamp: 42,
  });
  assert.equal(r.filename, 'notes.md');
  assert.equal(r.sourceUrl, 'file:///tmp/notes.md');
  assert.equal(r.timestamp, 42);
});

test('isLastFileUsable rejects empty or stale records', () => {
  assert.equal(isLastFileUsable(null), false);
  assert.equal(isLastFileUsable({ content: 'a' }), false);
  assert.equal(
    isLastFileUsable({ content: 'a', filename: 'a.md', timestamp: 1 }, 1 + DEFAULT_MAX_AGE_MS + 1),
    false
  );
  assert.equal(
    isLastFileUsable({ content: 'a', filename: 'a.md', timestamp: 100 }, 200),
    true
  );
});
