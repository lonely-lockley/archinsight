import { json } from '@sveltejs/kit';

export const GET = () =>
    json({
        status: 'ok',
        service: 'archinsight-web'
    });
