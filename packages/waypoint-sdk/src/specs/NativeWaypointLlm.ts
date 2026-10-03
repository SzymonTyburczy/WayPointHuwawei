// cxxTurboModule for the on-device llama.cpp backend (RFC-001 §10, §11).
// Inference runs on a worker thread; promises resolve through the JS call invoker.
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Resolves false when the file is missing, the checksum differs or loading fails.
  load(modelPath: string, nCtx: number, nThreads: number, sha256: string): Promise<boolean>;
  // Resolves to JSON {text, promptTokens, genTokens, ms}; rejects on failure.
  complete(system: string, prompt: string, grammar: string, maxTokens: number): Promise<string>;
  // JSON {model, nCtx} or {} when nothing is loaded.
  info(): string;
  unload(): void;
}

export default TurboModuleRegistry.get<Spec>('WaypointLlm');
