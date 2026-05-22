import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const consoleHtmlPath = path.resolve(process.cwd(), 'src/prototype-console/index.html');

export async function registerConsoleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/prototype-console', async (_request, reply) => {
    const html = await readFile(consoleHtmlPath, 'utf8');
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
