import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each test re-imports the module so the memoized script-load
// promise starts fresh.
const importFums = async () => {
  vi.resetModules();
  return await import('./fums');
};

const captureScripts = () => {
  const appended: HTMLScriptElement[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation(
    (node: Node) => {
      appended.push(node as HTMLScriptElement);
      return node;
    }
  );
  return appended;
};

const flushPromises = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('reportFums', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any)._BAPI;
  });

  it('does nothing when meta is missing or has no token',
    async () => {
      const { reportFums } = await importFums();
      const appended = captureScripts();

      reportFums(undefined);
      reportFums(null);
      reportFums({});
      reportFums({ fumsId: '' });

      expect(appended).toHaveLength(0);
    });

  it('loads the tracker once and calls _BAPI.t with fumsId',
    async () => {
      const { reportFums } = await importFums();
      const appended = captureScripts();
      const t = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)._BAPI = { t };

      reportFums({ fumsId: 'token-1' });
      expect(appended).toHaveLength(1);
      expect(appended[0].src).toContain('fumsv2.min.js');
      expect(appended[0].async).toBe(true);

      appended[0].onload?.(new Event('load'));
      await flushPromises();
      expect(t).toHaveBeenCalledWith('token-1');

      // Second report reuses the loaded script.
      reportFums({ fumsId: 'token-2' });
      await flushPromises();
      expect(appended).toHaveLength(1);
      expect(t).toHaveBeenCalledWith('token-2');
    });

  it('extracts the token from meta.fums when fumsId is absent',
    async () => {
      const { reportFums } = await importFums();
      const appended = captureScripts();
      const t = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)._BAPI = { t };

      // API.Bible's schema: `fums` is a script snippet, not a
      // bare token.
      reportFums({
        fums: "<script>_BAPI.t('snippet-token')</script>",
      });
      expect(appended).toHaveLength(1);
      appended[0].onload?.(new Event('load'));
      await flushPromises();
      expect(t).toHaveBeenCalledWith('snippet-token');
    });

  it('prefers fumsId over the meta.fums snippet', async () => {
    const { reportFums } = await importFums();
    const appended = captureScripts();
    const t = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)._BAPI = { t };

    reportFums({
      fumsId: 'direct-token',
      fums: "<script>_BAPI.t('snippet-token')</script>",
    });
    appended[0].onload?.(new Event('load'));
    await flushPromises();
    expect(t).toHaveBeenCalledWith('direct-token');
    expect(t).not.toHaveBeenCalledWith('snippet-token');
  });

  it('does nothing when meta.fums embeds no token',
    async () => {
      const { reportFums } = await importFums();
      const appended = captureScripts();
      const t = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)._BAPI = { t };

      // A bare string must never reach _BAPI.t.
      reportFums({ fums: 'legacy-token' });
      reportFums({ fums: '<script>no token here</script>' });

      expect(appended).toHaveLength(0);
      expect(t).not.toHaveBeenCalled();
    });

  it('is silent when the tracker script fails to load',
    async () => {
      const { reportFums } = await importFums();
      const appended = captureScripts();

      expect(() => reportFums({ fumsId: 'x' })).not.toThrow();
      expect(appended).toHaveLength(1);
      appended[0].onerror?.(new Event('error'));
      await flushPromises();
      // No throw, no unhandled rejection.
    });
});
