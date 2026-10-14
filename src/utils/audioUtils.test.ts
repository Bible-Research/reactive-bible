import { describe, it, expect, vi } from 'vitest';
import type { Howl } from 'howler';
import { getPlayPosition, getHtml5AudioNode } from './audioUtils';
import { FakeHowl } from '../__tests__/mocks/FakeHowl';

vi.mock('howler', async () => ({
  Howl: (await import('../__tests__/mocks/FakeHowl')).FakeHowl,
}));

const loadedHowl = (): FakeHowl => {
  const howl = new FakeHowl({ src: ['x.mp3'], html5: true });
  howl.emit('load');
  return howl;
};

describe('getPlayPosition', () => {
  it('returns null for a null Howl', () => {
    expect(getPlayPosition(null)).toBeNull();
  });

  it('returns null while the sound is still loading', () => {
    const howl = new FakeHowl({ src: ['x.mp3'], html5: true });
    // seek() on a loading sound returns the Howl itself, not a
    // number — the guard must treat that as "no position".
    expect(howl.state()).toBe('loading');
    expect(howl.seek()).toBe(howl);
    expect(getPlayPosition(howl as unknown as Howl)).toBeNull();
  });

  it('returns the seek position once loaded', () => {
    const howl = loadedHowl();
    howl.seek(42);
    expect(getPlayPosition(howl as unknown as Howl)).toBe(42);
  });

  it('returns null when the position is not finite', () => {
    const howl = loadedHowl();
    howl.seek(Number.NaN);
    expect(getPlayPosition(howl as unknown as Howl)).toBeNull();
    howl.seek(Number.POSITIVE_INFINITY);
    expect(getPlayPosition(howl as unknown as Howl)).toBeNull();
  });

  it('returns null after unload', () => {
    const howl = loadedHowl();
    howl.seek(10);
    howl.unload();
    expect(getPlayPosition(howl as unknown as Howl)).toBeNull();
  });
});

describe('getHtml5AudioNode', () => {
  it('returns null for a null Howl', () => {
    expect(getHtml5AudioNode(null)).toBeNull();
  });

  it('returns the html5 <audio> element while loading', () => {
    const howl = new FakeHowl({ src: ['x.mp3'], html5: true });
    const node = getHtml5AudioNode(howl as unknown as Howl);
    expect(node).toBeInstanceOf(HTMLAudioElement);
  });

  it('returns null for a Howl with no sound nodes', () => {
    const howl = loadedHowl();
    howl.unload();
    expect(howl._sounds).toHaveLength(0);
    expect(
      getHtml5AudioNode(howl as unknown as Howl),
    ).toBeNull();
  });

  it('returns null when the node is not an HTMLAudioElement', () => {
    const fake = {
      _sounds: [{ _node: { not: 'audio' } }],
    };
    expect(
      getHtml5AudioNode(fake as unknown as Howl),
    ).toBeNull();
  });
});
