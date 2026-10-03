// Self-contained HTML audit report: one wireframe per screen, drawn from the
// snapshot's real frames and colours, with every finding boxed and labelled,
// before (condition A) and after accepting Waypoint's label suggestions (B).
import type { AuditReport, Finding, Rgba, Snapshot, UiNode } from '../../packages/waypoint-sdk/src/types';
import type { AppMap } from './crawl';

export interface ScreenAudit {
  id: string;
  title: string;
  before: { snapshot: Snapshot; report: AuditReport };
  after: { snapshot: Snapshot; report: AuditReport };
  /** What a screen reader says, stop by stop. */
  speechBefore: string[];
  speechAfter: string[];
}

export interface ReportMeta {
  app: string;
  generated: string;
  commit?: string;
  suggestionSource: string; // e.g. "no-model fallback labels" or "model qwen3-1.7b"
}

const WCAG: Record<string, { sc: string; name: string; title: string }> = {
  R1: { sc: '4.1.2', name: 'Name, Role, Value', title: 'Missing name' },
  R2: { sc: '2.5.8', name: 'Target Size (Minimum)', title: 'Small target' },
  R3: { sc: '1.4.3', name: 'Contrast (Minimum)', title: 'Low contrast' },
  R4: { sc: '4.1.2', name: 'Name, Role, Value', title: 'Missing role' },
  R5: { sc: '2.4.6', name: 'Headings and Labels', title: 'Duplicate name' },
  R6: { sc: '1.1.1', name: 'Non-text Content', title: 'Unnamed image' },
  R8: { sc: '2.4.3', name: 'Focus Order', title: 'Focus order' },
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function css(c: Rgba | undefined, fallback: string): string {
  if (!c) return fallback;
  const v = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  return `rgba(${v(c.r)},${v(c.g)},${v(c.b)},${Math.round(c.a * 1000) / 1000})`;
}

function n(x: number): string {
  return String(Math.round(x * 10) / 10);
}

/** SVG wireframe of one snapshot. Screen colours are the app's own, so they are literal. */
export function wireframe(snap: Snapshot, report: AuditReport, label: string): string {
  const vp = snap.viewport;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${n(vp.w)}" height="${n(vp.h)}" fill="#FFFFFF"/>`);
  const findingsById = new Map<number, Finding[]>();
  for (const f of report.findings) findingsById.set(f.nodeId, [...(findingsById.get(f.nodeId) ?? []), f]);

  for (const node of snap.nodes as UiNode[]) {
    if (!node.visible) continue;
    const { x, y, w, h } = node.frame;
    if (node.bg) parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${css(node.bg, '#FFFFFF')}" rx="2"/>`);
    if (node.component === 'Image') {
      const icon = w <= 32 && h <= 32;
      parts.push(
        icon
          ? `<circle cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" r="${n(Math.min(w, h) / 2.4)}" fill="#3B3355"/>`
          : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#hatch)" stroke="#9AA7B4" stroke-width="1" rx="8"/>`,
      );
    }
    if (node.component === 'TextInput') {
      parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#FFFFFF" stroke="#757575" stroke-width="1" rx="6"/>`);
    }
    if (node.component === 'Switch' || node.a11y.role === 'switch') {
      parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${css(node.bg, '#757575')}"/>`);
    }
    if (node.text && node.component !== 'TextInput') {
      const size = node.fontSize ?? 14;
      parts.push(
        `<text x="${n(x)}" y="${n(y + size * 0.95)}" font-size="${n(size)}" font-weight="${node.bold ? 700 : 400}" fill="${css(node.fg, '#000000')}" font-family="Atkinson Hyperlegible Next, system-ui, sans-serif">${esc(node.text.length > 46 ? `${node.text.slice(0, 44)}…` : node.text)}</text>`,
      );
    }
    if (node.actionable && !findingsById.has(node.id)) {
      parts.push(`<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${n(w - 1)}" height="${n(h - 1)}" fill="none" stroke="#7C8DA0" stroke-width="1" stroke-dasharray="3 3" rx="2"/>`);
    }
  }

  // Findings on top, errors last so they win where boxes overlap.
  const boxes = [...report.findings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? 1 : -1));
  for (const f of boxes) {
    const node = snap.nodes.find((x) => x.id === f.nodeId);
    if (!node) continue;
    const { x, y, w, h } = node.frame;
    const color = f.severity === 'error' ? '#C62828' : '#B26A00';
    const bw = Math.max(w, 10);
    const bh = Math.max(h, 10);
    const bx = x - (bw - w) / 2;
    const by = y - (bh - h) / 2;
    parts.push(
      `<g class="finding"><rect x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="2.5" rx="3"/>` +
        `<rect x="${n(bx)}" y="${n(Math.max(0, by - 13))}" width="22" height="13" fill="${color}" rx="2"/>` +
        `<text x="${n(bx + 11)}" y="${n(Math.max(0, by - 13) + 10)}" font-size="10" font-weight="700" text-anchor="middle" fill="#FFFFFF" font-family="Atkinson Hyperlegible Mono, ui-monospace, monospace">${f.rule}</text></g>`,
    );
  }
  return (
    `<svg class="wire" viewBox="-4 -14 ${n(vp.w + 8)} ${n(vp.h + 18)}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#E6EBF0"/><line x1="0" y1="0" x2="0" y2="8" stroke="#C9D2DB" stroke-width="3"/></pattern></defs>` +
    `<rect x="-3" y="-3" width="${n(vp.w + 6)}" height="${n(vp.h + 6)}" rx="18" fill="#1C2430"/>` +
    parts.join('') +
    `</svg>`
  );
}

function detail(f: Finding): string {
  const d = f.data ?? {};
  switch (f.rule) {
    case 'R2':
      return `${d.w} × ${d.h} vp`;
    case 'R3':
      return `${d.ratio}:1 (needs ${d.threshold}:1) · ${d.fg} on ${d.bg}`;
    case 'R5':
      return `“${esc(d.name)}”`;
    case 'R8':
      return `jumps ${esc(d.direction)} after “${esc(d.from)}”`;
    default:
      return d.imageSrc ? `icon ${esc(d.imageSrc)}` : '';
  }
}

function findingRows(snap: Snapshot, report: AuditReport): string {
  if (report.findings.length === 0) return '<p class="none">No findings on this screen.</p>';
  const rows = report.findings.map((f) => {
    const node = snap.nodes.find((x) => x.id === f.nodeId);
    const w = WCAG[f.rule];
    const fix = f.suggestion ? `<code>${esc(f.suggestion.patch)}</code>${f.suggestion.confidence === 'low' ? ' <span class="low">fallback</span>' : ''}` : '';
    return `<tr><td><span class="rule ${f.severity}">${f.rule}</span></td><td>${esc(w.title)}<span class="sc">WCAG ${w.sc}</span></td><td><code>${esc(node?.testID ?? `#${f.nodeId}`)}</code></td><td>${detail(f)}</td><td>${fix}</td></tr>`;
  });
  return `<div class="table"><table><thead><tr><th>Rule</th><th>Problem</th><th>Element</th><th>Measured</th><th>Suggested fix</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

/** Screens as boxes in columns by depth; edges are the controls between them. */
export function appMapSvg(map: AppMap, label: string): string {
  const colW = 200;
  const rowH = 40;
  const boxW = 150;
  const boxH = 28;
  const cols = new Map<number, string[]>();
  for (const s of [...map.screens].sort((a, b) => a.depth - b.depth)) cols.set(s.depth, [...(cols.get(s.depth) ?? []), s.id]);
  // Order each column by the position of the parent that first reaches it.
  const pos = new Map<string, { x: number; y: number }>();
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length));
  for (const [d, ids] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
    const parentY = (id: string) => {
      const ys = map.edges.filter((e) => e.to === id && pos.has(e.from)).map((e) => pos.get(e.from)!.y);
      return ys.length ? Math.min(...ys) : 0;
    };
    ids.sort((a, b) => parentY(a) - parentY(b));
    const offset = ((maxRows - ids.length) * rowH) / 2;
    ids.forEach((id, i) => pos.set(id, { x: 8 + d * colW, y: 8 + offset + i * rowH }));
  }
  const width = 8 + cols.size * colW;
  const height = 16 + maxRows * rowH;
  const byId = new Map(map.screens.map((s) => [s.id, s]));
  const edges = map.edges
    .filter((e) => byId.get(e.to)!.depth === byId.get(e.from)!.depth + 1)
    .map((e) => {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const x1 = a.x + boxW;
      const y1 = a.y + boxH / 2;
      const x2 = b.x;
      const y2 = b.y + boxH / 2;
      const mx = (x1 + x2) / 2;
      return `<path class="map-edge ${e.name ? 'named' : 'unnamed'}" d="M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"><title>${esc(e.testID)}: ${e.name ? `“${esc(e.name)}”` : 'no name'}</title></path>`;
    })
    .join('');
  const nodes = map.screens
    .map((s) => {
      const p = pos.get(s.id)!;
      const t = s.title.length > 18 ? `${s.title.slice(0, 17)}…` : s.title;
      return `<g class="map-node ${s.byName ? 'reach' : 'lost'}"><rect x="${p.x}" y="${p.y}" width="${boxW}" height="${boxH}" rx="6"/><text x="${p.x + 10}" y="${p.y + 18}">${esc(t)}</text></g>`;
    })
    .join('');
  return `<svg class="map" viewBox="0 0 ${width} ${height}" width="${width}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${edges}${nodes}</svg>`;
}

function grade(score: number | undefined): string {
  const s = score ?? 0;
  const g = s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';
  return `<span class="grade g${g}" title="Score ${s} of 100">${s}<small>${g}</small></span>`;
}

export function renderHtmlReport(meta: ReportMeta, screens: ScreenAudit[], maps?: { before: AppMap; after: AppMap }): string {
  const avg = (k: 'before' | 'after') => Math.round(screens.reduce((a, s) => a + (s[k].report.score?.score ?? 0), 0) / screens.length);
  const total = (k: 'before' | 'after') => screens.reduce((a, s) => a + s[k].report.findings.length, 0);
  const distinct = (k: 'before' | 'after') => screens.reduce((a, s) => a + (s[k].report.score?.distinct ?? 0), 0);
  const actionable = screens.reduce((a, s) => a + (s.before.report.score?.actionable ?? 0), 0);
  const byRule = (k: 'before' | 'after') => {
    const m: Record<string, number> = {};
    for (const s of screens) for (const f of s[k].report.findings) m[f.rule] = (m[f.rule] ?? 0) + 1;
    return m;
  };
  const rb = byRule('before');
  const ra = byRule('after');
  const ordered = [...screens].sort((a, b) => (a.before.report.score?.score ?? 0) - (b.before.report.score?.score ?? 0));

  const cards = ordered
    .map(
      (s) => `
  <section class="screen" id="${esc(s.id)}">
    <header class="screen-head">
      <h2>${esc(s.title)}</h2>
      <div class="scores">${grade(s.before.report.score?.score)}<span class="arrow" aria-hidden="true">→</span>${grade(s.after.report.score?.score)}</div>
    </header>
    <div class="pair">
      <figure>${wireframe(s.before.snapshot, s.before.report, `${s.title}, defective`)}<figcaption>Before · ${s.before.report.findings.length} findings</figcaption></figure>
      <figure>${wireframe(s.after.snapshot, s.after.report, `${s.title}, after accepting suggestions`)}<figcaption>After · ${s.after.report.findings.length} findings</figcaption></figure>
      <div class="detail">${findingRows(s.before.snapshot, s.before.report)}
        <details class="speech"><summary>What a screen reader says</summary>
          <div class="speech-cols">
            <div><h3>Before</h3><ol>${s.speechBefore.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
            <div><h3>After</h3><ol>${s.speechAfter.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
          </div>
        </details>
      </div>
    </div>
  </section>`,
    )
    .join('\n');

  const reach = (m: AppMap) => m.screens.filter((s) => s.byName).length;
  const mapSection = maps
    ? `
  <section class="panel map-panel" id="app-map">
    <h2>Where an assistant can go</h2>
    <p class="lede">Every screen and every control between screens, found by pressing each control. Solid green boxes can be reached from Home using only named controls, which is what a voice assistant or a screen-reader user needs. Red dashed lines are controls without a name.</p>
    <div class="map-pair">
      <figure><div class="map-scroll">${appMapSvg(maps.before, 'App map before fixes')}</div><figcaption>Before · ${reach(maps.before)} of ${maps.before.screens.length} screens reachable by name</figcaption></figure>
      <figure><div class="map-scroll">${appMapSvg(maps.after, 'App map after fixes')}</div><figcaption>After · ${reach(maps.after)} of ${maps.after.screens.length} screens reachable by name</figcaption></figure>
    </div>
  </section>`
    : '';
  const ruleRows = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R8']
    .map((r) => `<tr><td><span class="rule">${r}</span></td><td>${WCAG[r].title}</td><td>WCAG ${WCAG[r].sc} ${WCAG[r].name}</td><td class="num">${rb[r] ?? 0}</td><td class="num">${ra[r] ?? 0}</td></tr>`)
    .join('');

  return `<title>${esc(meta.app)} Accessibility Audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;700&family=Atkinson+Hyperlegible+Next:wght@400;700;800&display=swap">
<style>
/* Layout: summary band, then one row per screen (before / after wireframes + findings), worst screen first. */
:root {
  --bg: #F3F5F8; --surface: #FFFFFF; --ink: #16202B; --muted: #536170; --line: #D5DCE4;
  --accent: #0B5FA5; --error: #B3261E; --warn: #8A5300; --ok: #1B6E3A; --ok-bg: #E3F2E8;
  --font-body: "Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-data: "Atkinson Hyperlegible Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0F151C; --surface: #17202A; --ink: #E7EDF3; --muted: #9AA8B6; --line: #2A3643;
  --accent: #6CB4F0; --error: #FF8A80; --warn: #F2B85B; --ok: #7BD49A; --ok-bg: #173826; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0F151C; --surface: #17202A; --ink: #E7EDF3; --muted: #9AA8B6; --line: #2A3643;
  --accent: #6CB4F0; --error: #FF8A80; --warn: #F2B85B; --ok: #7BD49A; --ok-bg: #173826; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--font-body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 28px; }
h1 { font-size: clamp(28px, 4vw, 40px); line-height: 1.1; font-weight: 800; margin: 0; text-wrap: balance; }
h2 { font-size: 22px; margin: 0; text-wrap: balance; }
.eyebrow { font: 700 12px/1 var(--font-data); letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
.lede { color: var(--muted); max-width: 68ch; margin: 10px 0 0; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 4px; }
.stat b { font: 800 28px/1.1 var(--font-data); font-variant-numeric: tabular-nums; }
.stat b .to { color: var(--muted); font-weight: 400; padding-inline: 8px; font-size: .8em; }
.stat span { color: var(--muted); font-size: 14px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 560px; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font: 700 12px/1.2 var(--font-data); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
td.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; text-align: right; }
code { font: 13px/1.4 var(--font-data); overflow-wrap: anywhere; }
.rule { display: inline-block; font: 700 12px/1 var(--font-data); padding: 4px 6px; border-radius: 4px; border: 1px solid var(--line); }
.rule.error { color: var(--error); border-color: var(--error); }
.rule.warning { color: var(--warn); border-color: var(--warn); }
.sc { display: block; font: 12px/1.3 var(--font-data); color: var(--muted); }
.low { font: 11px/1 var(--font-data); color: var(--warn); border: 1px solid var(--warn); border-radius: 3px; padding: 2px 4px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; color: var(--muted); font-size: 14px; }
.controls label { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; }
.controls input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.screen { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 14px; }
.screen-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.scores { display: flex; align-items: center; gap: 8px; }
.arrow { color: var(--muted); }
.grade { display: inline-flex; align-items: baseline; gap: 4px; font: 800 20px/1 var(--font-data); font-variant-numeric: tabular-nums; padding: 6px 10px; border-radius: 8px; border: 2px solid currentColor; }
.grade small { font-size: 13px; }
.gA, .gB { color: var(--ok); } .gC, .gD { color: var(--warn); } .gF { color: var(--error); }
.pair { display: grid; grid-template-columns: minmax(150px, 210px) minmax(150px, 210px) minmax(0, 1fr); gap: 16px; align-items: start; }
figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
figcaption { font: 13px/1.3 var(--font-data); color: var(--muted); text-align: center; }
.wire { width: 100%; height: auto; max-width: 100%; display: block; }
.detail { min-width: 0; }
.none { color: var(--ok); margin: 0; }
body.hide-findings .finding { display: none; }
body[data-vision="protanopia"] .wire { filter: url(#cv-protanopia); }
body[data-vision="deuteranopia"] .wire { filter: url(#cv-deuteranopia); }
body[data-vision="tritanopia"] .wire { filter: url(#cv-tritanopia); }
body[data-vision="achromatopsia"] .wire { filter: url(#cv-achromatopsia); }
.controls select { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; }
.controls select:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.map-panel { display: grid; gap: 10px; }
.map-pair { display: grid; gap: 16px; }
.map-scroll { overflow-x: auto; }
.map { display: block; height: auto; max-width: none; }
.map-node rect { stroke-width: 1.5; }
.map-node text { font: 12px var(--font-body); fill: var(--ink); }
.map-node.reach rect { fill: var(--ok-bg); stroke: var(--ok); }
.map-node.lost rect { fill: var(--surface); stroke: var(--muted); stroke-dasharray: 4 3; }
.map-node.lost text { fill: var(--muted); }
.map-edge { fill: none; stroke-width: 1.5; }
.map-edge.named { stroke: var(--ok); }
.map-edge.unnamed { stroke: var(--error); stroke-dasharray: 5 4; }
.speech { margin-top: 12px; }
.speech summary { cursor: pointer; font-weight: 700; }
.speech summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.speech-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.speech h3 { font: 700 12px/1.2 var(--font-data); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 8px 0 4px; }
.speech ol { margin: 0; padding-left: 22px; font: 13px/1.5 var(--font-data); }
footer { color: var(--muted); font-size: 13px; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr 1fr; } .detail { grid-column: 1 / -1; } }
@media (prefers-reduced-motion: no-preference) { .finding { transition: opacity .2s; } }
</style>
<div class="wrap">
  <header>
    <p class="eyebrow">Waypoint audit · ${screens.length} screens · ${esc(meta.generated.slice(0, 10))}</p>
    <h1>${esc(meta.app)} Accessibility Audit</h1>
    <p class="lede">Every screen of the demo app, drawn from its UI snapshot: real frames, real colours, one box per finding. Left: the app as shipped. Right: after accepting Waypoint's label suggestions (${esc(meta.suggestionSource)}). Labels fix names only, so size, contrast and role findings remain.</p>
  </header>
  <div class="summary">
    <div class="stat"><b>${avg('before')}<span class="to">→</span>${avg('after')}</b><span>Average score out of 100</span></div>
    <div class="stat"><b>${total('before')}<span class="to">→</span>${total('after')}</b><span>Findings, counted per screen (the tab bar repeats on four)</span></div>
    <div class="stat"><b>${distinct('before')}<span class="to">→</span>${distinct('after')}</b><span>Of ${actionable} controls, how many an assistant can tell apart</span></div>
    ${maps ? `<div class="stat"><b>${reach(maps.before)}<span class="to">→</span>${reach(maps.after)}</b><span>Of ${maps.before.screens.length} screens, how many an assistant can reach by name</span></div>` : ''}
  </div>
  <div class="panel">
    <div class="table"><table><thead><tr><th>Rule</th><th>Problem</th><th>Success criterion</th><th>Before</th><th>After</th></tr></thead><tbody>${ruleRows}</tbody></table></div>
  </div>
  ${mapSection}
  <div class="controls">
    <label for="toggle-findings"><input type="checkbox" id="toggle-findings" checked> Show finding boxes</label>
    <label for="vision">Colour vision <select id="vision">
      <option value="">Typical</option>
      <option value="protanopia">Protanopia (no red cones)</option>
      <option value="deuteranopia">Deuteranopia (no green cones)</option>
      <option value="tritanopia">Tritanopia (no blue cones)</option>
      <option value="achromatopsia">Achromatopsia (no colour)</option>
    </select></label>
    <span>Dashed outline: a control with no findings. Hatched: an image. Colour vision is an approximate simulation of the screens.</span>
  </div>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="cv-protanopia"><feColorMatrix type="matrix" values="0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0"/></filter>
    <filter id="cv-deuteranopia"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0"/></filter>
    <filter id="cv-tritanopia"><feColorMatrix type="matrix" values="0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0"/></filter>
    <filter id="cv-achromatopsia"><feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/></filter>
  </svg>
  ${cards}
  <footer>Generated by <code>eval/src/cli.ts report</code>${meta.commit ? ` at commit <code>${esc(meta.commit)}</code>` : ''}. Rules and thresholds: docs/ARCHITECTURE.md. Scores weigh names 40, targets 20, contrast 20, roles 10, images 10.</footer>
</div>
<script>
  document.getElementById('toggle-findings').addEventListener('change', function (e) {
    document.body.classList.toggle('hide-findings', !e.target.checked);
  });
  document.getElementById('vision').addEventListener('change', function (e) {
    document.body.dataset.vision = e.target.value;
  });
</script>
`;
}
