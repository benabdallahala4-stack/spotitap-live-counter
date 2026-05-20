import { createServer, type ServerOptions } from '../server.js';

export async function createTestApp(options: ServerOptions) {
  return createServer(options);
}
