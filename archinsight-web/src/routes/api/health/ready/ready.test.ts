import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

type ReadyEvent = Parameters<typeof GET>[0];

describe('GET /api/health/ready', () => {
  it('reports readiness after the database accepts a query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
    const response = await GET(event({ get: vi.fn().mockResolvedValue({ query }) }));

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith('select 1');
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      service: 'archinsight-web'
    });
  });

  it('reports unavailability without exposing database errors', async () => {
    const response = await GET(event({ get: vi.fn().mockRejectedValue(new Error('database credentials leaked')) }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      service: 'archinsight-web'
    });
  });
});

function event(database: { get(): Promise<unknown> }): ReadyEvent {
  return {
    locals: {
      services: { database }
    }
  } as unknown as ReadyEvent;
}
