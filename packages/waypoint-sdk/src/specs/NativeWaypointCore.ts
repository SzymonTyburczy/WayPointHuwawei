// cxxTurboModule, synchronous over JSI (RFC-001 §11). Implemented in
// harmony/waypoint/src/main/cpp/WaypointCoreTurboModule.cpp on top of cpp/core.
// Every method returns JSON; failures come back as {"error": "..."}.
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  snapshot(surfaceId: number): string; // JSON Snapshot
  finalize(rawSnapshotJson: string): string; // JSON Snapshot (plan B registry input)
  audit(snapshotJson: string): string; // JSON AuditReport
  planStep(goal: string, snapshotJson: string, historyJson: string): string; // JSON Plan
  parseAction(text: string, candidatesJson: string): string; // JSON Action | {error}
  labelRequest(snapshotJson: string, nodeId: number): string; // JSON LabelRequest
  validateLabel(snapshotJson: string, nodeId: number, label: string): string; // JSON LabelValidation
  announce(snapshotJson: string): string; // JSON {items: Announcement[]}, screen-reader order
}

export default TurboModuleRegistry.get<Spec>('WaypointCore');
