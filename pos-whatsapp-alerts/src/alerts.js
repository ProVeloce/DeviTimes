export function nextDailyRun(now = new Date()) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    9,
  ));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function createAlertService({ db, env, fetchImpl = fetch }) {
  return async function checkAndSendLowStockAlerts() {
    const thresholdResult = await db.query(
      "SELECT value FROM settings WHERE key = 'lowStockThreshold' LIMIT 1",
    );
    const storedThreshold = thresholdResult.rows[0]?.value;
    const threshold = storedThreshold == null || storedThreshold === ''
      ? 10
      : Number(JSON.parse(storedThreshold));

    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('The lowStockThreshold setting must be a non-negative number.');
    }

    const productsResult = await db.query(
      `SELECT name, code, stock_quantity AS stock
       FROM products
       WHERE is_active = true AND has_variants = false AND stock_quantity <= $1`,
      [threshold],
    );
    const variantsResult = await db.query(
      `SELECT p.name, pv.sku AS code, pv.stock_quantity AS stock, pv.color, pv.size
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       WHERE pv.is_active = true AND p.is_active = true AND pv.stock_quantity <= $1`,
      [threshold],
    );

    const lowStockItems = [
      ...productsResult.rows.map((row) => ({ ...row, variant: null })),
      ...variantsResult.rows.map((row) => ({
        ...row,
        variant: [row.color, row.size].filter(Boolean).join(' / ') || 'Variant',
      })),
    ];

    if (lowStockItems.length === 0) {
      return { sent: false, count: 0, message: 'No low stock items found' };
    }

    const recipient = env.RECIPIENT_PHONE_NUMBER.trim().replace(/\D/g, '');
    const normalizedRecipient = recipient.length === 10 ? `91${recipient}` : recipient;
    if (!normalizedRecipient) {
      throw new Error('RECIPIENT_PHONE_NUMBER is missing or invalid.');
    }

    let message = `⚠️ *Low Stock Alert — Devi Times*\n\nThe following items are running low on stock (Threshold: *${threshold}*):\n\n`;
    lowStockItems.forEach((item, index) => {
      const itemName = item.variant ? `${item.name} (${item.variant})` : item.name;
      message += `${index + 1}. *${itemName}*\n   • Code: \`${item.code}\`\n   • Current Stock: *${item.stock}*\n\n`;
    });
    message += 'Please restock these items soon.';

    const url = `https://api.green-api.com/waInstance${env.GREEN_API_ID_INSTANCE}/sendMessage/${env.GREEN_API_TOKEN_INSTANCE}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: `${normalizedRecipient}@c.us`,
        message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Green API returned status ${response.status}: ${errorText}`);
    }

    return {
      sent: true,
      count: lowStockItems.length,
      response: await response.json(),
    };
  };
}
