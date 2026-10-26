import { describe, it, expect } from 'vitest';
import {
  BookNotInFilesetError,
  ClientInputError,
  ProviderError,
  RateLimitError,
  errorMessageFromBody,
  isBookNotInFilesetBody,
  isRateLimitMessage,
  throwFromErrorBody,
} from './errors';

/**
 * Deliberate post-split contract (documented in PR #158): the
 * old api.tsx fed `errorData.error || errorData.detail ||
 * fallback` straight into the thrown Error and the rate-limit
 * regex, so truthy non-string payloads string-coerced —
 * `{error: 429}` became RateLimitError('429') and
 * `{error: {message: 'x'}}` became Error('[object Object]').
 * The shared helpers ignore payloads they cannot turn into a
 * displayable message instead of coercing them; these tests
 * pin that classification for the edge shapes.
 */

const FALLBACKS = {
  bookNotInFileset: 'Book not available in this fileset',
  failure: 'Failed to fetch verses (HTTP 500)',
};

const responseWith = (body: unknown, status = 500): Response =>
  new Response(JSON.stringify(body), { status });

const thrownFrom = async (
  body: unknown,
  status = 500
): Promise<Error> =>
  throwFromErrorBody(responseWith(body, status), FALLBACKS)
    .catch((error: unknown) => error as Error);

const expectPlainError = (err: Error): void => {
  expect(err).toBeInstanceOf(Error);
  // BookNotInFilesetError extends ProviderError, so this also
  // rules it out.
  expect(err).not.toBeInstanceOf(ProviderError);
  expect(err).not.toBeInstanceOf(RateLimitError);
  expect(err).not.toBeInstanceOf(ClientInputError);
};

describe('isRateLimitMessage', () => {
  it('matches 429, "too many requests" and "rate limit"', () => {
    expect(isRateLimitMessage('HTTP 429')).toBe(true);
    expect(isRateLimitMessage('Too Many Requests')).toBe(true);
    expect(isRateLimitMessage('rate limit exceeded')).toBe(true);
    expect(isRateLimitMessage('rate-limited')).toBe(true);
  });

  it('does not match unrelated messages', () => {
    expect(isRateLimitMessage('provider unavailable'))
      .toBe(false);
  });
});

describe('isBookNotInFilesetBody', () => {
  it('detects the book_not_in_fileset error_code', () => {
    expect(isBookNotInFilesetBody(
      { error_code: 'book_not_in_fileset' }
    )).toBe(true);
    expect(isBookNotInFilesetBody(
      { error_code: 'provider_error' }
    )).toBe(false);
    expect(isBookNotInFilesetBody(null)).toBe(false);
    expect(isBookNotInFilesetBody(undefined)).toBe(false);
  });
});

describe('errorMessageFromBody', () => {
  it('prefers a string error field over detail', () => {
    expect(errorMessageFromBody(
      { error: 'boom', detail: 'alt' }, 'fb'
    )).toBe('boom');
  });

  it("reads an object error's string message", () => {
    expect(errorMessageFromBody(
      { error: { message: 'nested boom' } }, 'fb'
    )).toBe('nested boom');
  });

  it('uses a string detail when error is unusable', () => {
    expect(errorMessageFromBody(
      { error: 503, detail: 'detail msg' }, 'fb'
    )).toBe('detail msg');
    expect(errorMessageFromBody({ detail: 'd' }, 'fb'))
      .toBe('d');
  });

  it('ignores non-string payloads and returns the fallback',
    () => {
      expect(errorMessageFromBody({ error: 429 }, 'fb'))
        .toBe('fb');
      expect(errorMessageFromBody({ error: {} }, 'fb'))
        .toBe('fb');
      expect(errorMessageFromBody(
        { error: { message: 123 } }, 'fb'
      )).toBe('fb');
      expect(errorMessageFromBody(
        { detail: { nested: 'x' } }, 'fb'
      )).toBe('fb');
      expect(errorMessageFromBody({ error: '' }, 'fb'))
        .toBe('fb');
    }
  );

  it('returns the fallback for a missing body', () => {
    expect(errorMessageFromBody({}, 'fb')).toBe('fb');
    expect(errorMessageFromBody(null, 'fb')).toBe('fb');
    expect(errorMessageFromBody(undefined, 'fb')).toBe('fb');
  });
});

describe('throwFromErrorBody', () => {
  it('throws BookNotInFilesetError for book_not_in_fileset',
    async () => {
      const err = await thrownFrom({
        error_code: 'book_not_in_fileset',
        error: 'Malachi is OT-only',
      });
      expect(err).toBeInstanceOf(BookNotInFilesetError);
      expect(err.message).toBe('Malachi is OT-only');
    }
  );

  it('uses a string detail for the BNIF message', async () => {
    const err = await thrownFrom({
      error_code: 'book_not_in_fileset',
      detail: 'Malachi is OT-only',
    });
    expect(err).toBeInstanceOf(BookNotInFilesetError);
    expect(err.message).toBe('Malachi is OT-only');
  });

  it('uses the BNIF fallback when the body carries no message',
    async () => {
      const err = await thrownFrom(
        { error_code: 'book_not_in_fileset' }
      );
      expect(err).toBeInstanceOf(BookNotInFilesetError);
      expect(err.message)
        .toBe('Book not available in this fileset');
    }
  );

  it('throws RateLimitError for a rate_limited error_code',
    async () => {
      const err = await thrownFrom({
        error_code: 'rate_limited',
        error: 'slow down',
      });
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.message).toBe('slow down');
    }
  );

  it('throws RateLimitError for a rate-limit-shaped message',
    async () => {
      const err = await thrownFrom(
        { error: 'HTTP 429 from upstream' }
      );
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.message).toBe('HTTP 429 from upstream');
    }
  );

  it('throws ProviderError for any other coded failure',
    async () => {
      const err = await thrownFrom({
        error_code: 'provider_error',
        error: 'boom',
      });
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).not.toBeInstanceOf(BookNotInFilesetError);
      expect(err).not.toBeInstanceOf(ClientInputError);
      expect(err.message).toBe('boom');
    }
  );

  it('throws ClientInputError for missing_parameter at 400',
    async () => {
      const err = await thrownFrom(
        {
          error_code: 'missing_parameter',
          error: 'fileset_id is required',
        },
        400
      );
      expect(err).toBeInstanceOf(ClientInputError);
      // Deliberately NOT a ProviderError — instanceof checks
      // would render the upstream-failure UI for our own bad
      // request.
      expect(err).not.toBeInstanceOf(ProviderError);
      expect(err.message).toBe('fileset_id is required');
    }
  );

  it('throws ClientInputError for invalid_parameter at 400',
    async () => {
      const err = await thrownFrom(
        {
          error_code: 'invalid_parameter',
          error: 'invalid language_iso',
        },
        400
      );
      expect(err).toBeInstanceOf(ClientInputError);
      expect(err).not.toBeInstanceOf(ProviderError);
      expect(err.message).toBe('invalid language_iso');
    }
  );

  it('throws ClientInputError for any coded HTTP 400 body',
    async () => {
      const err = await thrownFrom(
        { error_code: 'whatever', error: 'bad request' },
        400
      );
      expect(err).toBeInstanceOf(ClientInputError);
      expect(err).not.toBeInstanceOf(ProviderError);
      expect(err.message).toBe('bad request');
    }
  );

  // Precedence pins: the established buckets must win over
  // the generic coded-400 client-input mapping.
  it('keeps book_not_in_fileset precedence at HTTP 400',
    async () => {
      const err = await thrownFrom(
        { error_code: 'book_not_in_fileset' }, 400
      );
      expect(err).toBeInstanceOf(BookNotInFilesetError);
      expect(err).not.toBeInstanceOf(ClientInputError);
    }
  );

  it('keeps rate_limited precedence at HTTP 400', async () => {
    const err = await thrownFrom(
      { error_code: 'rate_limited', error: 'slow down' }, 400
    );
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).not.toBeInstanceOf(ClientInputError);
    expect(err.message).toBe('slow down');
  });

  it('throws ProviderError for an unknown code at non-400',
    async () => {
      const err = await thrownFrom(
        { error_code: 'upstream_gone', error: 'boom' }, 502
      );
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).not.toBeInstanceOf(ClientInputError);
      expect(err.message).toBe('boom');
    }
  );

  it('throws a plain Error for a codeless string error',
    async () => {
      const err = await thrownFrom({ error: 'plain boom' });
      expectPlainError(err);
      expect(err.message).toBe('plain boom');
    }
  );

  // Deliberate post-split behavior: a bare numeric payload is
  // no longer string-coerced into the rate-limit check — the
  // pre-split code threw RateLimitError('429') for this shape.
  it('treats {error: 429} as a plain Error, not rate-limited',
    async () => {
      const err = await thrownFrom({ error: 429 });
      expectPlainError(err);
      expect(err.message)
        .toBe('Failed to fetch verses (HTTP 500)');
    }
  );

  // The old code coerced the object to '[object Object]' and
  // threw a plain Error; the helper now reads the nested
  // message, which also feeds the rate-limit check.
  it('reads {error: {message}} into the classification',
    async () => {
      const rateLimited = await thrownFrom(
        { error: { message: 'rate limit exceeded' } }
      );
      expect(rateLimited).toBeInstanceOf(RateLimitError);
      expect(rateLimited.message).toBe('rate limit exceeded');

      const plain = await thrownFrom(
        { error: { message: 'upstream broke' } }
      );
      expectPlainError(plain);
      expect(plain.message).toBe('upstream broke');

      const coded = await thrownFrom({
        error_code: 'provider_error',
        error: { message: 'upstream broke' },
      });
      expect(coded).toBeInstanceOf(ProviderError);
      expect(coded.message).toBe('upstream broke');
    }
  );

  it('falls back for {detail: {nested}} instead of coercing',
    async () => {
      const err = await thrownFrom(
        { detail: { nested: 'x' } }
      );
      expectPlainError(err);
      expect(err.message)
        .toBe('Failed to fetch verses (HTTP 500)');
    }
  );

  it('falls back for a missing or non-JSON body', async () => {
    const empty = await throwFromErrorBody(
      new Response(null, { status: 500 }), FALLBACKS
    ).catch((error: unknown) => error as Error);
    expectPlainError(empty);
    expect(empty.message)
      .toBe('Failed to fetch verses (HTTP 500)');

    const notJson = await throwFromErrorBody(
      new Response('<html>oops</html>', { status: 500 }),
      FALLBACKS
    ).catch((error: unknown) => error as Error);
    expectPlainError(notJson);
    expect(notJson.message)
      .toBe('Failed to fetch verses (HTTP 500)');
  });
});
