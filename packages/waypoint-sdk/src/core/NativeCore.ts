import NativeWaypointCore from '../specs/NativeWaypointCore';
import { JsonCore, type CoreApi } from './CoreApi';

/** The core backed by the cxxTurboModule, or null when the native module is not linked. */
export function createNativeCore(): CoreApi | null {
  return NativeWaypointCore ? new JsonCore(NativeWaypointCore) : null;
}
