import { createServer, type ServerOptions } from '../server.js';

type TestAppOptions = Omit<ServerOptions, 'logger' | 'trustProxy' | 'adminToken'> &
  Partial<Pick<ServerOptions, 'logger' | 'trustProxy' | 'adminToken'>>;

export async function createTestApp(options: TestAppOptions) {
  return createServer({
    logger: false,
    trustProxy: false,
    adminToken: 'test-admin-token-0123456789',
    ...options
  });
}
