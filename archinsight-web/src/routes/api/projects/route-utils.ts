import { json, type RequestEvent } from '@sveltejs/kit';
import { eventEnv } from '$lib/server/auth/svelte-event';

type Handler<T> = (event: RequestEvent) => T | Promise<T>;

export async function jsonEndpoint<T>(event: RequestEvent, handler: Handler<T>): Promise<Response> {
  try {
    return json(await handler(event));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function emptyEndpoint(event: RequestEvent, handler: Handler<void>): Promise<Response> {
  try {
    await handler(event);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export function env(event: RequestEvent) {
  return eventEnv(event);
}

export function pathParam(event: RequestEvent, name: string): string {
  return (event.params as Record<string, string | undefined>)[name] ?? '';
}

function errorResponse(error: unknown): Response {
  if (error instanceof Response) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Bad request';
  return json({ error: message }, { status: 400 });
}
