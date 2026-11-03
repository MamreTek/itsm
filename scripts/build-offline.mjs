import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    write: false,
    sourcemap: false,
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(root, 'src/app/main.tsx'),
      name: 'MamreTekITSM',
      formats: ['iife'],
    },
  },
});
const output = (Array.isArray(result) ? result : [result]).flatMap(
  (r) => r.output,
);
const chunks = output.filter((item) => item.type === 'chunk');
const styles = output.filter(
  (item) => item.type === 'asset' && item.fileName.endsWith('.css'),
);
const otherAssets = output.filter(
  (item) => item.type === 'asset' && !item.fileName.endsWith('.css'),
);
if (
  chunks.length !== 1 ||
  chunks[0].imports.length ||
  chunks[0].dynamicImports.length ||
  otherAssets.length
) {
  throw new Error(
    'Offline preview must contain one self-contained script and inline styles only.',
  );
}
const script = chunks[0].code.replace(/<\/script/gi, '<\\/script');
const css = styles
  .map((item) =>
    typeof item.source === 'string'
      ? item.source
      : new TextDecoder().decode(item.source),
  )
  .join('\n');
if (/<\/style/i.test(css) || /@import\s|url\(\s*["']?(?!data:|#)/i.test(css)) {
  throw new Error('Offline preview CSS must not reference external resources.');
}
const template = await readFile(resolve(root, 'index.html'), 'utf8');
const title = template.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'MamreTek ITSM';
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#143d36" />
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript>请启用 JavaScript 以体验 ITSM 模拟原型。</noscript>
<script>${script}</script>
</body>
</html>`;
await mkdir(resolve(root, 'offline'), { recursive: true });
await writeFile(resolve(root, 'offline/index.html'), html);
console.log(
  `Offline preview ready: offline/index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB). Open this file directly; no server required.`,
);
