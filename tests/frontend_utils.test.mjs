import test from 'node:test';
import assert from 'node:assert/strict';
import { today, number, fmt, fmtUnit, efficiencyDelta, efficiencyText, efficiencyColor, key } from '../frontend/src/features/matrix/utils.ts';

test('shared row identifiers remain stable', () => {
  assert.equal(key(123), '123');
  assert.equal(key('0007'), '0007');
});
test('input numbers and invalid values', () => {
  assert.equal(number('0.25'), 0.25);
  assert.equal(number(42), 42);
  assert.equal(number('not-a-number'), 0);
});
test('work efficiency text and signs', () => {
  assert.equal(efficiencyDelta(null), null);
  assert.equal(efficiencyText(null), '—');
  assert.equal(efficiencyText(110), '+10%');
  assert.equal(efficiencyText(80), '−20%');
  assert.equal(efficiencyColor(100), 'inherit');
  assert.notEqual(efficiencyColor(110), efficiencyColor(80));
});
test('formatted values and local date string', () => {
  assert.equal(fmt(1.234), '1,2');
  assert.equal(fmtUnit(1.2345), '1,235');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
