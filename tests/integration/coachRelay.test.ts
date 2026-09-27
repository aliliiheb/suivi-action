// @vitest-environment node
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import { coachMiddleware } from '../../server/coach';
async function host(run: (url: string) => Promise<void>, upstream: typeof fetch) {
  const middleware = coachMiddleware('test-secret', 'gpt-4.1-mini', upstream),
    server = createServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 404;
        res.end();
      }),
    );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
describe('Private OpenAI relay', () => {
  it('rejects cross-origin calls and never sends the key to the browser', async () => {
    let count = 0;
    await host(
      async (url) => {
        const status = await (await fetch(url + '/api/coach/status')).text();
        expect(status).not.toContain('test-secret');
        const r = await fetch(url + '/api/coach', {
          method: 'POST',
          headers: { Origin: 'https://external.example', 'Content-Type': 'application/json' },
          body: '{"question":"test"}',
        });
        expect(r.status).toBe(403);
        expect(count).toBe(0);
      },
      async () => {
        count++;
        return new Response('{}');
      },
    );
  });
  it('uses OpenAI only, disables response storage and returns just the answer', async () => {
    await host(
      async (url) => {
        const r = await fetch(url + '/api/coach', {
          method: 'POST',
          headers: { Origin: url, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: 'Help me plan', context: { capacity: 60 } }),
        });
        expect(await r.json()).toEqual({ answer: 'Choose one task.', model: 'gpt-4.1-mini' });
      },
      async (url, options) => {
        expect(url).toBe('https://api.openai.com/v1/responses');
        const body = JSON.parse(String(options?.body));
        expect(body.store).toBe(false);
        expect(body.max_output_tokens).toBe(1400);
        return new Response(
          JSON.stringify({
            output: [{ content: [{ type: 'output_text', text: 'Choose one task.' }] }],
          }),
        );
      },
    );
  });
  it('sanitizes provider errors', async () => {
    await host(
      async (url) => {
        const r = await fetch(url + '/api/coach', {
          method: 'POST',
          headers: { Origin: url, 'Content-Type': 'application/json' },
          body: '{"question":"test"}',
        });
        expect(r.status).toBe(429);
        expect(await r.json()).toEqual({ error: 'quota' });
      },
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'insufficient_quota', message: 'Sensitive provider detail' },
          }),
          { status: 429 },
        ),
    );
  });
});
