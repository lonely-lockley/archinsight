import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  conflict,
  forbidden,
  invalidRequest,
  notFound,
  payloadTooLarge,
  serviceUnavailable,
  unauthorized
} from '$lib/server/errors/application-error';
import { jsonEndpoint, requestJson } from './route-utils';

describe('project route error contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [invalidRequest('Invalid input'), 400, 'INVALID_REQUEST'],
    [unauthorized('Authentication required'), 401, 'UNAUTHORIZED'],
    [forbidden('Forbidden'), 403, 'FORBIDDEN'],
    [notFound('Missing project'), 404, 'NOT_FOUND'],
    [conflict('Duplicate project'), 409, 'CONFLICT'],
    [payloadTooLarge('Payload is too large'), 413, 'PAYLOAD_TOO_LARGE'],
    [serviceUnavailable('Renderer unavailable'), 503, 'SERVICE_UNAVAILABLE']
  ])('maps expected application failures without losing their public contract', async (failure, status, code) => {
    const response = await jsonEndpoint(event(), () => {
      throw failure;
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: failure.message, code });
  });

  it('hides unexpected failures and returns a traceable correlation id', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await jsonEndpoint(event('request-123'), () => {
      throw new Error('database password was exposed here');
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe('request-123');
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      correlationId: 'request-123'
    });
    expect(logged).toHaveBeenCalledWith(
      '[request-123] Unexpected API failure',
      expect.objectContaining({ message: 'database password was exposed here' })
    );
  });

  it('reports malformed JSON as invalid input', async () => {
    const malformed = event(undefined, async () => {
      throw new SyntaxError('Unexpected token');
    });

    const response = await jsonEndpoint(malformed, () => requestJson(malformed));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Request body must be valid JSON',
      code: 'INVALID_REQUEST'
    });
  });
});

function event(requestId?: string, json: () => Promise<unknown> = async () => null) {
  return {
    request: {
      headers: new Headers(requestId == null ? {} : { 'x-request-id': requestId }),
      json
    }
  } as never;
}
