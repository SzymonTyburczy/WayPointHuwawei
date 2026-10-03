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
} from './runtime';
export { WaypointProvider, type WaypointProviderProps } from './react/WaypointProvider';
export { useGuide, useWaypointOverride } from './react/hooks';
export { useWaypoint } from './react/context';
export { GuideOverlay } from './react/GuideOverlay';
export { AuditOverlay, type AuditOverlayProps } from './react/AuditOverlay';
export { GuideBar } from './react/GuideBar';
