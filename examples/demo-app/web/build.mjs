// Builds the web version of the demo app (react-native-web + the WebAssembly core).
//   node web/build.mjs           → web/dist/index.html + app.js, and web/dist/standalone.html (one file)
//   node web/build.mjs --serve   → rebuilds on change and serves http://127.0.0.1:8081
import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const repo = resolve(app, '../..');
const dist = join(here, 'dist');
const wasm = join(repo, 'cpp/build-wasm/waypoint.wasm');
const serve = process.argv.includes('--serve');

if (!existsSync(wasm)) {
  console.error(`Missing ${wasm}. Build the core for the browser first: cpp/wasm/build.sh (needs zig: pip install ziglang)`);
  process.exit(1);
}

// One copy of React for the app and the SDK; react-native → react-native-web plus a shim;
// the app's config.ts → the web config the page controls.
const resolvePlugin = {
  name: 'waypoint-web',
  setup(build) {
    const fromApp = (path, kind) => build.resolve(path, { resolveDir: app, kind, pluginData: 'app' });
    build.onResolve({ filter: /^react-native$/ }, () => ({ path: join(here, 'src/rn-shim.ts') }));
    build.onResolve({ filter: /^(react|react-dom|react-native-web)(\/.*)?$/ }, (args) =>
      args.pluginData === 'app' ? undefined : fromApp(args.path, args.kind),
    );
    build.onResolve({ filter: /^waypoint-sdk$/ }, () => ({ path: join(repo, 'packages/waypoint-sdk/src/index.ts') }));
    build.onResolve({ filter: /^\.\.?\/config$/ }, (args) =>
      args.importer.startsWith(join(app, 'src')) ? { path: join(here, 'src/config.web.ts') } : undefined,
    );
  },
};

const options = {
  entryPoints: [join(here, 'src/main.tsx')],
  bundle: true,
  outfile: join(dist, 'app.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  loader: { '.png': 'dataurl', '.wasm': 'binary', '.js': 'jsx' },
  define: {
    __DEV__: 'true', // the audit overlay is a development tool (RFC §4); the demo shows it
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
  },
  plugins: [resolvePlugin],
  logLevel: 'info',
};

const page = readFileSync(join(here, 'page.html'), 'utf8');
const doc = (body) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), doc(`${page}\n<script src="app.js"></script>`));

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, host: '127.0.0.1', port: 8081 });
  console.log(`CityRide with Waypoint: http://127.0.0.1:${port}`);
} else {
  await esbuild.build(options);
  const js = readFileSync(join(dist, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  // standalone.html opens from disk; fragment.html is the same page without the document shell.
  writeFileSync(join(dist, 'standalone.html'), doc(`${page}\n<script>${js}</script>`));
  writeFileSync(join(dist, 'fragment.html'), `${page}\n<script>${js}</script>\n`);
  console.log(`Wrote ${dist}/index.html, app.js, standalone.html (${Math.round(js.length / 1024)} KB of script)`);
}
