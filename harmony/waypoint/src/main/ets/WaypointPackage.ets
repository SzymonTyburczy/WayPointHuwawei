import { RNOHPackage } from '@rnoh/react-native-openharmony';
import type { UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { WaypointPlatformTurboModule } from './WaypointPlatformTurboModule';

/** ArkTS half of the Waypoint package; the C++ half is src/main/cpp/WaypointPackage.h. */
export class WaypointPackage extends RNOHPackage {
  override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule | null>([
      [WaypointPlatformTurboModule.NAME, (ctx: UITurboModuleContext) => new WaypointPlatformTurboModule(ctx)],
    ]);
  }

  override getDebugName(): string {
    return 'waypoint';
  }
}
