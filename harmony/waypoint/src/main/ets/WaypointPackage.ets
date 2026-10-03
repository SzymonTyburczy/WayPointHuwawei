import { RNPackage, TurboModulesFactory } from '@rnoh/react-native-openharmony/ts';
import type { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { WaypointPlatformTurboModule } from './WaypointPlatformTurboModule';

class WaypointTurboModulesFactory extends TurboModulesFactory {
  createTurboModule(name: string): TurboModule | null {
    if (name === WaypointPlatformTurboModule.NAME) {
      return new WaypointPlatformTurboModule(this.ctx);
    }
    return null;
  }

  hasTurboModule(name: string): boolean {
    return name === WaypointPlatformTurboModule.NAME;
  }
}

/** ArkTS half of the Waypoint package; the C++ half is WaypointPackage.h. */
export class WaypointPackage extends RNPackage {
  createTurboModulesFactory(ctx: TurboModuleContext): TurboModulesFactory {
    return new WaypointTurboModulesFactory(ctx);
  }
}
