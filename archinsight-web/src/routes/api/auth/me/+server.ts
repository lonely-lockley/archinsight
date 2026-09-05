import { json } from '@sveltejs/kit';
import { currentUserResponse } from '$lib/server/auth/request-auth';

export const GET = async (event) => json(await currentUserResponse(event.cookies, event.locals.services));
