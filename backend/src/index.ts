import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import app, { warmDb } from './app.js';
import { getRuntimeEnv } from './runtime-env.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: true });

const env = getRuntimeEnv();

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function handleRequest(
  incoming: import('node:http').IncomingMessage,
  outgoing: import('node:http').ServerResponse
) {
  try {
    const hostHeader = incoming.headers.host ?? 'localhost';
    const forwardedProtocol = incoming.headers['x-forwarded-proto'];
    const protocol = Array.isArray(forwardedProtocol)
      ? forwardedProtocol[0]
      : forwardedProtocol?.split(',')[0];
    const url = new URL(incoming.url ?? '/', `${protocol ?? 'http'}://${hostHeader}`);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined && !hopByHopHeaders.has(name.toLowerCase())) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const method = incoming.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD'
      ? undefined
      : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    const request = new Request(url, {
      method,
      headers,
      ...(body ? { body, duplex: 'half' as const } : {}),
    });
    const response = await app.fetch(request, env);

    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    if (!response.body) {
      outgoing.end();
      return;
    }
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(outgoing);
  } catch (error) {
    console.error('[api] request failed', error);
    if (outgoing.headersSent) {
      outgoing.destroy(error instanceof Error ? error : undefined);
      return;
    }
    outgoing.statusCode = 500;
    outgoing.setHeader('Content-Type', 'application/json');
    outgoing.end(JSON.stringify({ success: false, message: 'Internal server error', data: null }));
  }
}

async function start() {
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  await warmDb(env);
  const server = createServer((incoming, outgoing) => {
    void handleRequest(incoming, outgoing);
  });
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
    console.log(`Devi Times API listening on port ${port}`);
  });
}

void start().catch((error: unknown) => {
  console.error('[api] startup failed', error);
  process.exitCode = 1;
});
