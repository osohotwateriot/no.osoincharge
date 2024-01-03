import Homey from "homey";
import PairSession from "homey/lib/PairSession";
import OSOInChargeApp from "../../app";

import {
  DeviceListResponse,
  LoginCredentials,
  DeviceDetails,
} from "../../types";
import OSOInChargeWaterHeaterDevice from "./device";

export default class OSOInChargeWaterHeaterDriver extends Homey.Driver {
  #app!: OSOInChargeApp;

  async onInit() {
    this.#app = this.homey.app as OSOInChargeApp;

    const forceOnCard = this.homey.flow.getActionCard("force-on");
    forceOnCard.registerRunListener(async (args) => {
      await args.device.forceOn(args.type);
    });

    const forceOffCard = this.homey.flow.getActionCard("force-off");
    forceOffCard.registerRunListener(async (args) => {
      await args.device.forceOff(args.type);
    });
  }

  async onPair(session: PairSession): Promise<void> {
    let currentSubscriptionKey: string | undefined = undefined;

    session.setHandler(
      "test_subscription_key",
      async (data: LoginCredentials) => {
        try {
          currentSubscriptionKey = undefined;
          const result = await this.#app.login(data);
          if (result) {
            currentSubscriptionKey = data.subscription_key;
            return Promise.resolve();
          }
          return Promise.reject(this.homey.__("pair.invalid_subscription_key"));
        } catch (error) {
          this.error(error);
          return Promise.reject(error);
        }
      },
    );

    session.setHandler("list_devices", async (data) => {
      try {
        this.log("add_device");
        const devices: DeviceListResponse[] = await this.#app.listDevices(
          currentSubscriptionKey,
        );
        return devices.map(
          ({ deviceId, deviceName, subscription_key }): DeviceDetails => {
            return {
              name: deviceName,
              data: {
                id: deviceId,
              },
              store: {},
              settings: {
                subscription_key: subscription_key,
              },
              capabilities: this.getCapabilities(),
            };
          },
        );
      } catch (error) {
        this.error(error);
        return Promise.reject(error);
      }
    });
  }

  async onRepair(session: PairSession, device: Homey.Device): Promise<void> {
    session.setHandler(
      "test_subscription_key",
      async (data: LoginCredentials) => {
        try {
          var osoDevice = device as OSOInChargeWaterHeaterDevice;
          const result = await this.#app.login(data);
          if (result) {
            const deviceList = await this.#app.listDevices(
              data.subscription_key,
            );
            var existing = deviceList.find((d) => d.deviceId == osoDevice.id);
            if (existing) {
              osoDevice.subscription_key = data.subscription_key;
              osoDevice.syncDeviceFromList();
              return Promise.resolve();
            }
          }
          return Promise.reject(this.homey.__("pair.invalid_subscription_key"));
        } catch (error) {
          this.error(error);
          return Promise.reject(error);
        }
      },
    );

    session.setHandler("finish_repair", async (data) => {
      session.done();
    });
  }

  public getCapabilities(): string[] {
    return [
      "measure_power",
      "measure_temperature",
      "water_heater_capacity_mixed_water",
      "water_heater_connection_state",
      "water_heater_current_set_point",
      "water_heater_heating",
      "water_heater_high_demand_mode",
      "water_heater_mode",
      "water_heater_optimization_mode",
      "water_heater_sleep_mode",
      "water_heater_v40min",
    ];
  }
}

module.exports = OSOInChargeWaterHeaterDriver;
