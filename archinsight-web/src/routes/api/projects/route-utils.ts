import { json, type RequestEvent } from '@sveltejs/kit';
import { eventEnv } from '$lib/server/auth/svelte-event';
import { ApplicationError, invalidRequest } from '$lib/server/errors/application-error';

type Handler<T> = (event: RequestEvent) => T | Promise<T>;

export async function jsonEndpoint<T>(event: RequestEvent, handler: Handler<T>): Promise<Response> {
  try {
    return json(await handler(event));
  } catch (error) {
    return errorResponse(event, error);
  }
}

export async function emptyEndpoint(event: RequestEvent, handler: Handler<void>): Promise<Response> {
  try {
    await handler(event);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(event, error);
  }
}

export function env(event: RequestEvent) {
  return eventEnv(event);
}

export function pathParam(event: RequestEvent, name: string): string {
  return (event.params as Record<string, string | undefined>)[name] ?? '';
}

export async function requestJson<T>(event: RequestEvent): Promise<T> {
  try {
    return await event.request.json() as T;
  } catch (error) {
    throw invalidRequest('Request body must be valid JSON', { cause: error });
  }
}

function errorResponse(event: RequestEvent, error: unknown): Response {
  if (error instanceof Response) {
    return error;
  }
  if (error instanceof ApplicationError) {
    return json({ error: error.publicMessage, code: error.code }, { status: error.status });
  }
  const correlationId = requestId(event);
  console.error(`[${correlationId}] Unexpected API failure`, error);
  return json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR', correlationId },
    { status: 500, headers: { 'x-request-id': correlationId } }
  );
}

function requestId(event: RequestEvent): string {
  const supplied = event.request.headers?.get('x-request-id')?.trim();
  if (supplied != null && /^[a-zA-Z0-9._:-]{1,100}$/u.test(supplied)) {
    return supplied;
  }
  return crypto.randomUUID();
}
