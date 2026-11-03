import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let port = 5193;
let lanHost;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--port') port = Number(args[i + 1]);
  else if (args[i] === '--lan-host') lanHost = args[i + 1];
  else
    throw new Error(
      'Usage: npm run preview:local -- [--port 5193] [--lan-host <private local IPv4>]',
    );
  if (!args[i + 1]) throw new Error('Missing option value');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose a port between 1024 and 65535');
const localAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((item) => item && item.family === 'IPv4' && !item.internal)
  .map((item) => item.address);
const isPrivate = (address) =>
  /^10\./.test(address) ||
  /^192\.168\./.test(address) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(address);
if (lanHost && (!localAddresses.includes(lanHost) || !isPrivate(lanHost)))
  throw new Error(
    'LAN preview requires an assigned private IPv4 address; wildcard and public bindings are not supported',
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'offline/index.html')).catch(() => {
  throw new Error('Run npm run build:offline before starting the preview');
});
const servers = [];
const hosts = ['127.0.0.1', ...(lanHost ? [lanHost] : [])];
for (const host of hosts) {
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const path = request.url?.split('?')[0];
    if (path === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (path !== '/' && path !== '/index.html') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.byteLength,
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  });
  server.requestTimeout = 10000;
  servers.push(server);
  try {
    await new Promise((done, reject) => {
      server.once('error', reject);
      server.listen(port, host, done);
    });
  } catch (error) {
    for (const active of servers) active.close();
    throw error;
  }
}
for (const host of hosts)
  console.log(`ITSM prototype: http://${host}:${port}/`);
console.log(
  `Mock data only. No source files or real APIs are served. PID ${process.pid}. Stop with Ctrl+C or kill ${process.pid}.`,
);
const close = () => {
  for (const server of servers) server.close();
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
