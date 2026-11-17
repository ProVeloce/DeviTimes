import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlertService, nextDailyRun } from '../src/alerts.js';

test('schedules the next alert for 09:00 UTC', () => {
  assert.equal(
    nextDailyRun(new Date('2026-06-01T08:59:00Z')).toISOString(),
    '2026-06-01T09:00:00.000Z',
  );
  assert.equal(
    nextDailyRun(new Date('2026-06-01T09:00:00Z')).toISOString(),
    '2026-06-02T09:00:00.000Z',
  );
});

test('uses the default threshold and skips WhatsApp when stock is sufficient', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const checkAlerts = createAlertService({
    db,
    env: {},
    fetchImpl: () => assert.fail('WhatsApp should not be called'),
  });

  assert.deepEqual(await checkAlerts(), {
    sent: false,
    count: 0,
    message: 'No low stock items found',
  });
  assert.deepEqual(queries[1].params, [10]);
  assert.deepEqual(queries[2].params, [10]);
});

test('sends an alert for low-stock variants with a normalized recipient', async () => {
  const queries = [];
  let request;
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('FROM settings')) return { rows: [{ value: '5' }] };
      if (sql.includes('FROM products')) return { rows: [] };
      return {
        rows: [{ name: 'Clock', code: 'CLK-1', stock: 2, color: 'Black', size: 'Wall' }],
      };
    },
  };
  const checkAlerts = createAlertService({
    db,
    env: {
      GREEN_API_ID_INSTANCE: 'instance',
      GREEN_API_TOKEN_INSTANCE: 'token',
      RECIPIENT_PHONE_NUMBER: '(638) 509-9015',
    },
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ idMessage: 'message-id' }) };
    },
  });

  assert.deepEqual(await checkAlerts(), {
    sent: true,
    count: 1,
    response: { idMessage: 'message-id' },
  });
  assert.equal(request.body.chatId, '916385099015@c.us');
  assert.match(request.body.message, /Clock \(Black \/ Wall\)/);
  assert.deepEqual(queries[2].params, [5]);
});
