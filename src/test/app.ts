import { createServer, type ServerOptions } from '../server.js';

type TestAppOptions = Omit<ServerOptions, 'logger' | 'trustProxy'> &
  Partial<Pick<ServerOptions, 'logger' | 'trustProxy'>>;

export async function createTestApp(options: TestAppOptions) {
  return createServer({
    logger: false,
    trustProxy: false,
    ...options
  });
}
