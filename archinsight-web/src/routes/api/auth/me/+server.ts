import { json } from '@sveltejs/kit';
import { currentUserResponse } from '$lib/server/auth/request-auth';
import { eventEnv } from '$lib/server/auth/svelte-event';

export const GET = async (event) => json(await currentUserResponse(event.cookies, eventEnv(event)));
