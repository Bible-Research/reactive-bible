import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import {
  reportInstalledBuild,
  reportUpdateOpened,
} from './updateTelemetry';

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  setTag: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('reportInstalledBuild', () => {
  it('only tags the first start', () => {
    reportInstalledBuild({ build: 95, version: '0.0.95' });
    expect(Sentry.setTag).toHaveBeenCalledWith('versionCode', '95');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('reports an installed update when the build grew', () => {
    reportInstalledBuild({ build: 83, version: '0.0.83' });
    reportInstalledBuild({ build: 97, version: '0.0.97' });
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'app update installed',
      expect.objectContaining({
        level: 'info',
        tags: expect.objectContaining({
          reportType: 'app-update',
          updateStep: 'installed',
          fromBuild: '83',
          toBuild: '97',
        }) as unknown,
      }),
    );
  });

  it('stays quiet on a same-build restart', () => {
    reportInstalledBuild({ build: 97, version: '0.0.97' });
    reportInstalledBuild({ build: 97, version: '0.0.97' });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('reportUpdateOpened', () => {
  it('sends a download-opened info event', () => {
    reportUpdateOpened(
      {
        versionCode: 97,
        versionName: '0.0.97',
        apkUrl: 'https://github.com/o/r/a.apk',
      },
      { build: 83, version: '0.0.83' },
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'app update download opened',
      expect.objectContaining({
        tags: expect.objectContaining({
          updateStep: 'download-opened',
          installedBuild: '83',
          offeredBuild: '97',
        }) as unknown,
      }),
    );
  });
});
