// Data model shared with the C++ core (RFC-001 §5). Fields marked "additive"
// are documented in docs/IMPLEMENTATION_PLAN.md.

export type Rect = { x: number; y: number; w: number; h: number }; // window coordinates, vp
export type Rgba = { r: number; g: number; b: number; a: number }; // sRGB, 0..1

export interface A11y {
  accessible: boolean;
  label?: string;
  hint?: string;
  role?: string;
  disabled?: boolean;
  hidden: boolean;
  selected?: boolean; // additive
  checked?: 'true' | 'false' | 'mixed'; // additive
}

export interface TextRun {
  fg: Rgba;
  fontSize: number;
  bold: boolean;
}

export interface UiNode {
  id: number;
  parent: number | null;
  depth: number;
  component: string;
  frame: Rect;
  visible: boolean;
  text?: string;
  fg?: Rgba;
  fontSize?: number;
  bold?: boolean;
  bg?: Rgba;
  opacity: number;
  a11y: A11y;
  actionable: boolean;
  name: string;
  testID?: string;
  nativeID?: string;
  imageSrc?: string;
  placeholder?: string; // additive
  runs?: TextRun[]; // additive
  pressable?: boolean; // additive, plan B
  drawsImage?: boolean; // additive
}

export interface Snapshot {
  rev: string;
  surfaceId: number;
  viewport: Rect;
  nodes: UiNode[];
  error?: string;
  partial?: boolean;
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

export interface Suggestion {
  label: string;
  patch: string;
  confidence?: 'model' | 'low';
}

export interface Finding {
  rule: RuleId;
  severity: 'error' | 'warning';
  nodeId: number;
  message: string;
  data?: Record<string, number | string>;
  suggestion?: Suggestion;
}

export interface AuditCounts {
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  R5: number;
  R6: number;
  errors: number;
  warnings: number;
}

export interface AuditReport {
  rev?: string;
  findings: Finding[];
  counts: AuditCounts;
  contrastUnknown: number;
  partial: boolean;
  nodeCount: number;
}

export type Action =
  | { a: 'tap'; id: number; index: number }
  | { a: 'scroll'; dir: 'up' | 'down' }
  | { a: 'back' }
  | { a: 'done' }
  | { a: 'ask' };

export interface Candidate {
  index: number;
  id: number;
  role: string;
  name: string;
  selected?: boolean;
  checked?: string;
  tab?: boolean;
  back?: boolean;
}

export interface HistoryEntry {
  a: 'tap' | 'scroll' | 'back';
  name?: string;
  dir?: 'up' | 'down';
}

export interface PlanHistory {
  steps: HistoryEntry[];
  canGoBack: boolean;
}

export interface Plan {
  system: string;
  prompt: string;
  grammar: string;
  candidates: Candidate[];
  allowed: { scrollUp: boolean; scrollDown: boolean; back: boolean };
  title: string;
  stop?: string;
}

export interface LabelRequest {
  system: string;
  prompt: string;
  grammar: string;
  fallback: string;
}

export interface LabelValidation {
  ok: boolean;
  reason?: string;
  label: string;
  patch: string;
}
