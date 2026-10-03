#!/usr/bin/env -S npx tsx
// waypoint-fix: apply accepted label suggestions to source files.
//
//   waypoint-fix --fixes fixes.json src/                 dry run: print a diff
//   waypoint-fix --fixes fixes.json --write src/         edit the files
//   waypoint-fix --fixes audit.json --object-prop label src/app/spec.ts
//
// fixes.json: {"tab-settings": "Settings"}, the eval's audit.json, or the JSON the
// app logs after "Export fixes" in the audit panel (hdc hilog | grep WAYPOINT_FIXES).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, relative } from 'path';

import { fixSource, lineDiff, readFixes } from './fix';

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function files(path: string): string[] {
  const st = statSync(path);
  if (st.isFile()) return EXTS.has(extname(path)) ? [path] : [];
  return readdirSync(path)
    .filter((n) => n !== 'node_modules' && !n.startsWith('.') && n !== 'harmony')
    .flatMap((n) => files(join(path, n)));
}

function main(argv: string[]): number {
  const paths: string[] = [];
  let fixesPath = '';
  let write = false;
  let objectProp = 'label';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixes') fixesPath = argv[++i];
    else if (a === '--write') write = true;
    else if (a === '--object-prop') objectProp = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: waypoint-fix --fixes <fixes.json> [--write] [--object-prop label] <files or directories…>');
      return 0;
    } else paths.push(a);
  }
  if (!fixesPath || paths.length === 0) {
    console.error('usage: waypoint-fix --fixes <fixes.json> [--write] [--object-prop label] <files or directories…>');
    return 2;
  }
  const fixes = readFixes(JSON.parse(readFileSync(fixesPath, 'utf8')));
  const found = new Set<string>();
  let total = 0;
  for (const file of paths.flatMap(files)) {
    const before = readFileSync(file, 'utf8');
    const r = fixSource(file, before, fixes, { objectProp });
    r.alreadyLabelled.forEach((id) => found.add(id));
    if (r.edits.length === 0) continue;
    r.edits.forEach((e) => found.add(e.testID));
    total += r.edits.length;
    const rel = relative(process.cwd(), file);
    if (write) {
      writeFileSync(file, r.output);
      for (const e of r.edits) console.error(`${rel}:${e.line}  ${e.testID} → "${e.label}"`);
    } else {
      process.stdout.write(lineDiff(rel, before, r.output));
    }
  }
  const missing = Object.keys(fixes).filter((id) => !found.has(id));
  console.error(`${total} label${total === 1 ? '' : 's'} ${write ? 'written' : 'to write (dry run; add --write)'}.`);
  if (missing.length) console.error(`Not found as a literal testID: ${missing.join(', ')}`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
