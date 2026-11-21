import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../lib/specs.js';

test('aramadan tür', () => {
  assert.equal(parseQuery('iphone 16 pro').type, 'phone');
  assert.equal(parseQuery('galaxy tab s10').type, 'tablet');
  assert.equal(parseQuery('ipad air').type, 'tablet');
  assert.equal(parseQuery('thinkpad e14 16gb').type, undefined);
});
