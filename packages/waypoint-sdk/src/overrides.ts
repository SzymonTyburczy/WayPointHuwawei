// Accepted label suggestions, keyed by testID. Components that call
// useWaypointOverride(testID) pick them up at once, without a rebuild (RFC-001 §8).

export type Listener = () => void;

export class OverrideStore {
  private labels = new Map<string, string>();
  private listeners = new Set<Listener>();
  private version = 0;

  get(testID: string | undefined): string | undefined {
    return testID ? this.labels.get(testID) : undefined;
  }

  set(testID: string, label: string): void {
    this.labels.set(testID, label);
    this.emit();
  }

  setMany(entries: Record<string, string>): void {
    for (const [k, v] of Object.entries(entries)) this.labels.set(k, v);
    this.emit();
  }

  clear(): void {
    this.labels.clear();
    this.emit();
  }

  entries(): Record<string, string> {
    return Object.fromEntries(this.labels);
  }

  /** Changes on every mutation; used as the useSyncExternalStore snapshot. */
  getVersion = (): number => this.version;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}
