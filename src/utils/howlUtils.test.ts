import { describe, it, expect, vi } from 'vitest';
import type { Howl } from 'howler';
import { disposeHowl } from './howlUtils';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

describe('disposeHowl', () => {
  const makeHowl = () => ({
    stop: vi.fn(),
    off: vi.fn(),
    volume: vi.fn(),
    unload: vi.fn(),
  });

  it('stops, detaches listeners, mutes and unloads in order',
    () => {
      // stop() must run before off() so 'stop' subscribers (the
      // playlist bounds-checker cleanup) still fire; off() must
      // precede unload() so a rejected pending play() reaches
      // no handler.
      const howl = makeHowl();
      disposeHowl(howl as unknown as Howl);
      expect(howl.stop).toHaveBeenCalledOnce();
      expect(howl.off).toHaveBeenCalledOnce();
      expect(howl.volume).toHaveBeenCalledWith(0);
      expect(howl.unload).toHaveBeenCalledOnce();
      expect(
        howl.stop.mock.invocationCallOrder[0],
      ).toBeLessThan(howl.off.mock.invocationCallOrder[0]);
      expect(
        howl.off.mock.invocationCallOrder[0],
      ).toBeLessThan(howl.unload.mock.invocationCallOrder[0]);
    },
  );

  it('revokes the blob URL', () => {
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    disposeHowl(null, 'blob:abc');
    expect(revoke).toHaveBeenCalledWith('blob:abc');
    revoke.mockRestore();
  });

  it('tolerates a null Howl and null blob URL', () => {
    expect(() => disposeHowl(null)).not.toThrow();
  });

  it('still revokes the blob URL when the Howl is null', () => {
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    disposeHowl(null, 'blob:xyz');
    expect(revoke).toHaveBeenCalledWith('blob:xyz');
    revoke.mockRestore();
  });

  it('warns instead of throwing when teardown fails', () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const howl = makeHowl();
    howl.stop.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(
      () => disposeHowl(howl as unknown as Howl),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
