// Voice control: utterance in, spoken reply out. It drives the same guide and
// audit as the touch UI and adds two things a screen-reader user needs: the
// position of the highlighted element ("at the bottom left") and a spoken
// summary of the screen. Pure TypeScript; every dependency is injected.
import type { CoreApi } from '../core/CoreApi';
import type { GuideState } from '../guide/GuideSession';
import type { AuditReport, Rect, Snapshot } from '../types';
import { guessLang, parseUtterance, type VoiceIntent, type VoiceLang } from './intents';
import { describePosition, say } from './messages';

export interface VoiceDeps {
  core: CoreApi;
  takeSnapshot: () => Promise<Snapshot>;
  /** Starts the guide; the promise resolves when the guide ends. */
  startGuide: (goal: string) => Promise<GuideState>;
  stopGuide: () => void;
  getGuide: () => GuideState;
  audit?: () => Promise<AuditReport>;
  speak: (text: string, lang: VoiceLang) => void | Promise<void>;
  viewport: () => Rect;
  /** Fixed reply language, or 'auto' to follow each utterance. */
  lang?: VoiceLang | 'auto';
  /** How many element names "what is here" reads before "and N more". */
  maxNamesRead?: number;
}

export interface VoiceTurn {
  heard: string;
  intent: VoiceIntent;
  reply: string;
  lang: VoiceLang;
}

const ACTIVE = new Set(['planning', 'showing']);

export class VoiceController {
  private lang: VoiceLang;
  private lastPrompt = '';
  private lastGoal = '';
  private lastStep = -1;
  private lastStatus: GuideState['status'] = 'idle';
  private lastReminder = false;

  constructor(private readonly deps: VoiceDeps) {
    this.lang = deps.lang && deps.lang !== 'auto' ? deps.lang : 'en';
  }

  get language(): VoiceLang {
    return this.lang;
  }

  /** Handles one recognised utterance and speaks the reply. */
  async handle(utterance: string): Promise<VoiceTurn> {
    if (this.deps.lang === 'auto' || this.deps.lang === undefined) this.lang = guessLang(utterance);
    const intent = parseUtterance(utterance);
    const reply = await this.reply(intent);
    if (reply) await this.speak(reply, intent.kind !== 'repeat');
    return { heard: utterance, intent, reply, lang: this.lang };
  }

  /** Feed every guide state change here; steps and outcomes are spoken. */
  onGuideState(state: GuideState): void {
    const lang = this.lang;
    if (state.status === 'showing' && state.step !== this.lastStep) {
      this.lastStep = state.step;
      this.lastReminder = false;
      void this.speak(this.stepPrompt(state));
    } else if (state.status === 'showing' && state.reminder && !this.lastReminder) {
      this.lastReminder = true;
      void this.speak(`${say.stillWaiting(lang)} ${this.stepPrompt(state)}`);
    } else if (state.status !== this.lastStatus) {
      if (state.status === 'done') void this.speak(say.done(lang));
      else if (state.status === 'asking') void this.speak(say.ask(lang));
      else if (state.status === 'stopped' && state.reason !== 'cancelled') void this.speak(say.failed(state.message ?? state.reason ?? '', lang));
    }
    if (!ACTIVE.has(state.status)) this.lastStep = -1;
    this.lastStatus = state.status;
  }

  private async reply(intent: VoiceIntent): Promise<string> {
    const lang = this.lang;
    const guide = this.deps.getGuide();
    const active = ACTIVE.has(guide.status);
    switch (intent.kind) {
      case 'empty':
        return say.didNotHear(lang);
      case 'help':
        return say.help(lang);
      case 'stop':
        this.deps.stopGuide();
        return say.stopped(lang);
      case 'repeat':
        return this.lastPrompt || say.nothingToRepeat(lang);
      case 'back':
        return say.goBack(lang);
      case 'next':
        if (active) return guide.status === 'showing' ? this.stepPrompt(guide) : '';
        if (this.lastGoal) return this.start(this.lastGoal);
        return say.noGuide(lang);
      case 'whereAmI': {
        const plan = await this.overview();
        let out = say.whereAmI(plan.title, lang);
        if (active) out += say.guideProgress(guide.goal, Math.max(1, guide.step), lang);
        return out;
      }
      case 'describe': {
        const plan = await this.overview();
        const max = this.deps.maxNamesRead ?? 5;
        const named = plan.candidates.filter((c) => c.name).map((c) => c.name);
        const unnamed = plan.candidates.length - named.length;
        return say.describe(plan.title, named.slice(0, max), Math.max(0, named.length - max), unnamed, lang);
      }
      case 'audit': {
        if (!this.deps.audit) return say.help(lang);
        const report = await this.deps.audit();
        return say.audit(report.score?.score ?? 0, report.counts.errors, report.counts.warnings, lang);
      }
      case 'goal':
        return this.start(intent.goal);
    }
  }

  private start(goal: string): string {
    this.lastGoal = goal;
    this.lastStep = -1;
    // Not awaited: the guide runs for many seconds and reports through onGuideState.
    void this.deps.startGuide(goal).catch(() => undefined);
    return say.starting(goal, this.lang);
  }

  private async overview() {
    const snap = await this.deps.takeSnapshot();
    if (snap.error) return { title: '', candidates: [] as { name: string }[] };
    // The planner gives the title and the sanitised, gated candidate list.
    return this.deps.core.planStep('', snap, { steps: [], canGoBack: false });
  }

  private stepPrompt(state: GuideState): string {
    const lang = this.lang;
    const a = state.action;
    if (!a) return state.caption;
    switch (a.a) {
      case 'tap': {
        const where = state.target ? describePosition(state.target.frame, this.deps.viewport(), lang) : '';
        return state.target?.name ? say.tap(state.target.name, where, lang) : say.tapUnnamed(where, lang);
      }
      case 'scroll':
        return say.scroll(a.dir, lang);
      case 'back':
        return say.back(lang);
      case 'done':
        return say.done(lang);
      case 'ask':
        return say.ask(lang);
    }
  }

  private async speak(text: string, remember = true): Promise<void> {
    if (!text) return;
    if (remember) this.lastPrompt = text;
    try {
      await this.deps.speak(text, this.lang);
    } catch {
      // Speech output is best-effort; the caption stays on screen.
    }
  }
}
