import { json } from '@sveltejs/kit';

export const GET = async ({ locals }) => {
  try {
    const database = await locals.services.database.get();
    await database.query('select 1');
    return json({
      status: 'ready',
      service: 'archinsight-web'
    });
  } catch {
    return json(
      {
        status: 'unavailable',
        service: 'archinsight-web'
      },
      { status: 503 }
    );
  }
};
