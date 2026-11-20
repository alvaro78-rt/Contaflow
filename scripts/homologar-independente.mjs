import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { createGateway, fakeAccounts, fakePassword } from '../tests/homologacao/gateway.js';

const localPath = (path) => fileURLToPath(new URL(path, import.meta.url));
const rawOrigin = 'http://127.0.0.1:4179';
await mkdir(localPath('../.homologacao.local/'), { recursive: true, mode: 0o700 });
const gateway = await createGateway(localPath('../.homologacao.local/ficticio.sqlite'));
const app = await createServer({
  root: localPath('../'),
  configFile: false,
  envDir: false,
  define: { 'import.meta.env.VITE_CONTAFLOW_HOMOLOGACAO': 'true' },
  resolve: {
    alias: [
      { find: '@/api/base44Client', replacement: localPath('../tests/homologacao/browser-client.js') },
      { find: '@', replacement: localPath('../src') },
    ],
  },
  plugins: [react(), {
    name: 'contaflow-homologacao',
    configureServer(server) {
      server.middlewares.use('/__homologacao/functions', async (req, res) => {
        const name = req.url?.match(/^\/([A-Za-z]+)$/)?.[1];
        if (req.headers.host !== '127.0.0.1:4179' || req.headers.origin !== rawOrigin || req.method !== 'POST' ||
            req.headers['content-type'] !== 'application/json' || !name) {
          res.writeHead(403).end();
          return;
        }
        try {
          let size = 0;
          const chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 256 * 1024) {
              res.writeHead(413).end();
              return;
            }
            chunks.push(chunk);
          }
          const response = await gateway.invoke(name, new Request(rawOrigin + req.url, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.concat(chunks),
          }));
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'falha_servidor' }));
        }
      });
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 4179,
    strictPort: true,
    cors: false,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.homologacao.local/**'] },
  },
});

try {
  await app.listen();
  console.log('ContaFlow com dados fictícios: ' + rawOrigin + '/login');
  console.log('CPFs de teste:', fakeAccounts, 'Senha fictícia:', fakePassword);
} catch (error) {
  await app.close();
  gateway.close();
  throw error;
}
