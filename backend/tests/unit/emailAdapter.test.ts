import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { createResendEmailAdapter } from '../../src/lib/emailAdapter';

const silentLogger = pino({ level: 'silent' });

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

function mockFetchOk() {
  return vi.fn<FetchFn>(async () =>
    new Response(JSON.stringify({ id: 'msg_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchErr(status: number, body = 'nope') {
  return vi.fn<FetchFn>(async () => new Response(body, { status }));
}

describe('createResendEmailAdapter', () => {
  const baseArgs = {
    to: 'user@example.com',
    resetUrl: 'https://app.example.com/reset-password?token=abc',
    ttlMinutes: 60,
  };

  it('POSTs to the Resend API with the expected shape', async () => {
    const fetchImpl = mockFetchOk();
    const adapter = createResendEmailAdapter({
      apiKey: 'test-key',
      fromEmail: 'Personal Finance <noreply@example.com>',
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await adapter.sendPasswordReset(baseArgs);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      from: 'Personal Finance <noreply@example.com>',
      to: 'user@example.com',
      subject: expect.stringMatching(/reset/i),
    });
    expect(body.text).toContain(baseArgs.resetUrl);
    expect(body.text).toContain('60 minutes');
    expect(body.html).toContain(baseArgs.resetUrl);
  });

  it('escapes HTML-unsafe characters in the reset URL', async () => {
    const fetchImpl = mockFetchOk();
    const adapter = createResendEmailAdapter({
      apiKey: 'k',
      fromEmail: 'noreply@example.com',
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await adapter.sendPasswordReset({
      ...baseArgs,
      resetUrl: 'https://app.example.com/reset?token=a"><script>x</script>',
    });

    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.html).not.toContain('<script>');
    expect(body.html).toContain('&lt;script&gt;');
    expect(body.html).toContain('&quot;');
  });

  it('throws when Resend returns a non-2xx status', async () => {
    const fetchImpl = mockFetchErr(422, 'validation error');
    const adapter = createResendEmailAdapter({
      apiKey: 'k',
      fromEmail: 'noreply@example.com',
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(adapter.sendPasswordReset(baseArgs)).rejects.toThrow(/422/);
  });
});
