import { registerAs } from '@nestjs/config';

export default registerAs('workers', () => ({
  compiler: process.env.COMPILER || 'http://localhost:3333',
  renderer: process.env.RENDERER || 'http://localhost:3334',
}));
