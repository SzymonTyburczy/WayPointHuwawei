// The panel beside the phone: what the audit, a screen reader and the model see
// on the current screen. Plain DOM, outside the app, so it never enters a snapshot.
import { Waypoint, type Announcement, type AuditReport, type Plan, type Rect } from 'waypoint-sdk';

const RULES: Array<[keyof AuditReport['counts'], string]> = [
  ['R1', 'Missing name'],
  ['R2', 'Small target'],
  ['R3', 'Low contrast'],
  ['R4', 'Missing role'],
  ['R5', 'Duplicate name'],
  ['R6', 'Unnamed image'],
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function startInspector(highlight: (frame: Rect | null) => void): { refresh(): void } {
  const goal = $<HTMLInputElement>('wp-goal');
  let last = '';
  let busy = false;
  let items: Announcement[] = [];

  async function tick(force = false) {
    const rt = Waypoint.runtime();
    if (!rt || busy) return;
    busy = true;
    try {
      const snap = await rt.takeSnapshot();
      const key = `${snap.rev}|${goal.value}|${snap.error ?? ''}`;
      if (!force && key === last) return;
      last = key;
      if (snap.error) {
        $('wp-sr').innerHTML = `<li class="err">${esc(snap.error)}</li>`;
        return;
      }
      renderScore(rt.core.audit(snap));
      items = rt.core.announce(snap);
      renderReader(items);
      renderPlan(rt.core.planStep(goal.value.trim() || 'make the text bigger', snap, { steps: [], canGoBack: snap.nodes.some((n) => n.testID === 'header-back') }));
    } catch (e) {
      console.warn('inspector', e);
    } finally {
      busy = false;
    }
  }

  function renderScore(report: AuditReport) {
    const s = report.score;
    $('wp-score').textContent = s ? String(s.score) : '–';
    const grade = $('wp-grade');
    grade.textContent = s ? s.grade : '';
    grade.dataset.grade = s?.grade ?? '';
    $('wp-distinct').textContent = s ? `${s.distinct} of ${s.actionable}` : '–';
    $('wp-counts').innerHTML = RULES.map(([rule, title]) => {
      const n = report.counts[rule] ?? 0;
      return `<li class="${n ? 'hit' : ''}"><span class="rule">${rule}</span><span>${title}</span><span class="n">${n}</span></li>`;
    }).join('');
  }

  function renderReader(list: Announcement[]) {
    const ol = $('wp-sr');
    ol.innerHTML = list
      .map((a, i) => `<li data-i="${i}" tabindex="0" class="${a.unnamed ? 'unnamed' : ''}">${esc(a.text)}</li>`)
      .join('');
    $('wp-sr-count').textContent = `${list.length} stops, ${list.filter((a) => a.unnamed).length} without a name`;
  }

  function renderPlan(plan: Plan) {
    $('wp-prompt').textContent = plan.stop ? `(no prompt: ${plan.stop})` : plan.prompt;
    $('wp-grammar').textContent = plan.grammar;
    $('wp-cands').textContent = `${plan.candidates.length} candidates`;
  }

  const sr = $('wp-sr');
  const show = (e: Event) => {
    const li = (e.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
    highlight(li ? items[Number(li.dataset.i)]?.frame ?? null : null);
  };
  sr.addEventListener('mouseover', show);
  sr.addEventListener('focusin', show);
  sr.addEventListener('mouseleave', () => highlight(null));
  sr.addEventListener('focusout', () => highlight(null));
  goal.addEventListener('input', () => void tick());

  setInterval(() => void tick(), 700);
  return { refresh: () => void tick(true) };
}
