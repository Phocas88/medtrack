import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function request(message: string, website = '') {
  return new Request('https://stokora.example.test/api/contact', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Sender', company: 'Sample Supply', email: 'pilot@example.test',
      interest: 'pilot', message, website,
    }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('inquiry delivery', () => {
  it('accepts an inquiry only after provider confirmation and coalesces duplicate submissions', async () => {
    vi.stubEnv('WEB3FORMS_ACCESS_KEY', 'fixture-key');
    const provider = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true })));
    vi.stubGlobal('fetch', provider);
    const input = 'We want to test receiving and counting stock.';
    const results = await Promise.all([POST(request(input)), POST(request(input))]);
    expect(results.map(result => result.status)).toEqual([202, 202]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await results[0].json()).toEqual({ status: 'accepted' });
  });

  it('returns a retryable error if the provider rejects the submission', async () => {
    vi.stubEnv('WEB3FORMS_ACCESS_KEY', 'fixture-key');
    const provider = vi.fn().mockImplementationOnce(() => Promise.resolve(Response.json({ success: false })))
      .mockImplementationOnce(() => Promise.resolve(Response.json({ success: true })));
    vi.stubGlobal('fetch', provider);
    const input = 'We want help with finding parts in our bins.';
    expect((await POST(request(input))).status).toBe(503);
    expect((await POST(request(input))).status).toBe(202);
  });

  it('rejects bot-field submissions and reports missing configuration', async () => {
    vi.stubEnv('WEB3FORMS_ACCESS_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY', '');
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);
    expect((await POST(request('No provider is configured for this test.', 'https://example.test'))).status).toBe(400);
    expect((await POST(request('A real message requires a delivery provider.'))).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
});
