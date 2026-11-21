import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../lib/specs.js';

test('aramadan tür', () => {
  assert.equal(parseQuery('iphone 16 pro').type, 'phone');
  assert.equal(parseQuery('galaxy tab s10').type, 'tablet');
  assert.equal(parseQuery('ipad air').type, 'tablet');
  assert.equal(parseQuery('thinkpad e14 16gb').type, undefined);
});

test('aramada RAM ve depolama ayrımı, Apple işlemcileri', async () => {
  const { cpuScore } = await import('../lib/specs.js');
  assert.deepEqual(parseQuery('iphone 15 128gb'), { storage_gb: 128, type: 'phone' });
  assert.equal(parseQuery('i7 512gb ssd 16gb').ram_gb, 16);
  assert.equal(parseQuery('i7 512gb ssd 16gb').storage_gb, 512);
  assert.equal(parseQuery('1tb').storage_gb, 1000);
  assert.equal(parseQuery('search arcade').gpu_score, undefined);
  assert.equal(cpuScore('M3'), cpuScore('Apple M3'));
  assert.ok(cpuScore('M3 Max') > cpuScore('M3'));
  assert.equal(cpuScore('Samsung 990 M2 SSD'), null);
});
