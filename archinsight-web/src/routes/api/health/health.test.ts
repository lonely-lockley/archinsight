import { describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('GET /api/health', () => {
    it('returns web backend health status', async () => {
        const response = GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            status: 'ok',
            service: 'archinsight-web'
        });
    });
});
