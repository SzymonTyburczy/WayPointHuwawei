export * from './types';
export { JsonCore, CoreError, isActionError, type CoreApi, type CoreStrings, type ParsedAction } from './core/CoreApi';
export { createNativeCore } from './core/NativeCore';
export {
  BackendError,
  withTimeout,
  type BackendInfo,
  type CompletionRequest,
  type CompletionResult,
  type LlmBackend,
} from './llm/LlmBackend';
export { RemoteBackend, buildChatBody, isLoopbackUrl, type RemoteBackendOptions } from './llm/RemoteBackend';
export { LocalBackend, FallbackBackend, type LocalBackendOptions } from './llm/LocalBackend';
export { LoggingBackend, MemoryLog, type CallLogEntry, type LogSink } from './llm/logging';
export {
  GuideSession,
  defaultGuideOptions,
  realClock,
  type Clock,
  type GuideDeps,
  type GuideOptions,
  type GuideState,
  type GuideStatus,
  type GuideTarget,
  type StepEvent,
  type StopReason,
} from './guide/GuideSession';
export { captionFor } from './guide/captions';
export { suggestLabels, parseLabelReply, type SuggestStats } from './audit/suggest';
export { ringBox, captionPlacement, findingBox, type Box } from './overlay/geometry';
export { OverrideStore } from './overrides';
export {
  Waypoint,
  WaypointRuntime,
  createBackend,
  setCurrentRuntime,
  type AuditResult,
  type BackendConfig,
  type LocalConfig,
  type RemoteConfig,
  type SnapshotSource,
} from './runtime';
export { WaypointProvider, type WaypointProviderProps } from './react/WaypointProvider';
export { useGuide, useWaypointOverride, useWaypointTarget } from './react/hooks';
export { TargetRegistry, type Measurable, type TargetInfo } from './registry/TargetRegistry';
export { useWaypoint } from './react/context';
export { GuideOverlay } from './react/GuideOverlay';
export { AuditOverlay, type AuditOverlayProps } from './react/AuditOverlay';
export { GuideBar } from './react/GuideBar';
export { VoiceButton, type VoiceButtonProps } from './react/VoiceButton';
export { VoiceController, type VoiceDeps, type VoiceTurn } from './voice/VoiceController';
export { parseUtterance, guessLang, normalise, type VoiceIntent, type VoiceLang } from './voice/intents';
export { describePosition, positionOf, say, type Position } from './voice/messages';
export { PlatformSpeechInput, SPEECH_EVENT, type SpeechInput, type SpeechEvent, type ListenResult } from './voice/SpeechInput';
