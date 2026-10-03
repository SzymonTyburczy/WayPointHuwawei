// Turns accepted label suggestions into source edits. Matching is by testID, the
// one identifier the snapshot and the source share:
//
//   <Pressable testID="tab-settings" …>        →  testID="tab-settings" accessibilityLabel="Settings"
//   { kind: 'row', testID: 'tab-settings', … } →  testID: 'tab-settings', label: 'Settings'
//
// Elements that already carry a label are left alone, so running it twice is a
// no-op. Only string-literal testIDs are matched; computed ones are reported as
// not found.
import ts from 'typescript';

export type Fixes = Record<string, string>; // testID -> label

export interface FixOptions {
  /** Property added to object literals that hold a testID (the demo app's spec uses "label"). */
  objectProp?: string;
}

export interface Edit {
  testID: string;
  label: string;
  kind: 'jsx' | 'object';
  line: number; // 1-based
  offset: number;
  insert: string;
}

export interface FileResult {
  edits: Edit[];
  output: string;
  /** testIDs found in this file that already had a label. */
  alreadyLabelled: string[];
}

const LABEL_PROPS = new Set(['accessibilityLabel', 'aria-label']);

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs') || fileName.endsWith('.cjs')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function propName(name: ts.PropertyName | ts.JsxAttributeName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function jsxLiteral(init: ts.JsxAttributeValue | undefined): string | undefined {
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text;
  return undefined;
}

export function jsxString(label: string): string {
  // JSX attribute strings have no escapes; use an expression when needed.
  return /["{}<>]/.test(label) ? `{${JSON.stringify(label)}}` : `"${label}"`;
}

export function fixSource(fileName: string, source: string, fixes: Fixes, opts: FixOptions = {}): FileResult {
  const objectProp = opts.objectProp ?? 'label';
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const edits: Edit[] = [];
  const alreadyLabelled: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && propName(node.name) === 'testID') {
      const id = jsxLiteral(node.initializer);
      if (id !== undefined && fixes[id] !== undefined) {
        const attrs = node.parent;
        const has = attrs.properties.some((p) => ts.isJsxAttribute(p) && LABEL_PROPS.has(propName(p.name) ?? ''));
        if (has) alreadyLabelled.push(id);
        else {
          edits.push({
            testID: id,
            label: fixes[id],
            kind: 'jsx',
            line: sf.getLineAndCharacterOfPosition(node.end).line + 1,
            offset: node.end,
            insert: ` accessibilityLabel=${jsxString(fixes[id])}`,
          });
        }
      }
    }
    if (ts.isPropertyAssignment(node) && propName(node.name) === 'testID' && ts.isStringLiteralLike(node.initializer)) {
      const id = node.initializer.text;
      if (fixes[id] !== undefined && ts.isObjectLiteralExpression(node.parent)) {
        const has = node.parent.properties.some((p) => {
          const n = p.name ? propName(p.name) : undefined;
          return n === objectProp || (n !== undefined && LABEL_PROPS.has(n));
        });
        if (has) alreadyLabelled.push(id);
        else {
          // Match the quote style of the testID literal next to it.
          const quote = source[node.initializer.getStart(sf)] === '"' ? '"' : "'";
          const value = quote + fixes[id].replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`) + quote;
          edits.push({
            testID: id,
            label: fixes[id],
            kind: 'object',
            line: sf.getLineAndCharacterOfPosition(node.end).line + 1,
            offset: node.end,
            insert: `, ${objectProp}: ${value}`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  let output = source;
  for (const e of [...edits].sort((a, b) => b.offset - a.offset)) {
    output = output.slice(0, e.offset) + e.insert + output.slice(e.offset);
  }
  return { edits, output, alreadyLabelled };
}

/** Line-level unified diff for in-line insertions (line counts never change). */
export function lineDiff(fileName: string, before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const out = [`--- a/${fileName}`, `+++ b/${fileName}`];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) out.push(`@@ -${i + 1} +${i + 1} @@`, `-${a[i]}`, `+${b[i]}`);
  }
  return out.length > 2 ? out.join('\n') + '\n' : '';
}

/**
 * Accepts the formats Waypoint produces: a plain {testID: label} map, the eval's
 * audit.json ({ overrides }), the app's exported fixes ({ fixes }), or a list of
 * findings with testID and suggestion.label.
 */
export function readFixes(json: unknown): Fixes {
  if (Array.isArray(json)) {
    const out: Fixes = {};
    for (const f of json as Array<{ testID?: string; suggestion?: { label?: string } }>) {
      if (f.testID && f.suggestion?.label) out[f.testID] = f.suggestion.label;
    }
    return out;
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (o.overrides && typeof o.overrides === 'object') return readFixes(o.overrides);
    if (o.fixes && typeof o.fixes === 'object') return readFixes(o.fixes);
    if (Array.isArray(o.findings)) return readFixes(o.findings);
    const out: Fixes = {};
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string') out[k] = v;
    return out;
  }
  throw new Error('fixes must be a JSON object or array');
}
