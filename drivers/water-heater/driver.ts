import Homey, { FlowCardTriggerDevice } from "homey";
import PairSession from "homey/lib/PairSession";
import OSOInChargeApp from "../../app";

import {
  DeviceListResponse,
  LoginCredentials,
  DeviceDetails,
  Store,
} from "../../types";
import OSOInChargeWaterHeaterDevice from "./device";

export default class OSOInChargeWaterHeaterDriver extends Homey.Driver {
  #app!: OSOInChargeApp;
  #topTemperatureBecomesGreaterThan!: FlowCardTriggerDevice;
  #topTemperatureBecomesLessThan!: FlowCardTriggerDevice;
  #lowTemperatureBecomesGreaterThan!: FlowCardTriggerDevice;
  #lowTemperatureBecomesLessThan!: FlowCardTriggerDevice;

  async onInit() {
    this.#app = this.homey.app as OSOInChargeApp;

    this.#topTemperatureBecomesGreaterThan =
      this.homey.flow.getDeviceTriggerCard(
        "top-temperature-becomes-greater-than",
      );
    this.#topTemperatureBecomesGreaterThan.registerRunListener(
      async (args, state) => {
        return (
          args.threshold <= state.currentTopTemp &&
          args.threshold > state.previousTopTemp
        );
      },
    );

    this.#topTemperatureBecomesLessThan = this.homey.flow.getDeviceTriggerCard(
      "top-temperature-becomes-less-than",
    );
    this.#topTemperatureBecomesLessThan.registerRunListener(
      async (args, state) => {
        return (
          args.threshold >= state.currentTopTemp &&
          args.threshold < state.previousTopTemp
        );
      },
    );

    this.#lowTemperatureBecomesGreaterThan =
      this.homey.flow.getDeviceTriggerCard(
        "low-temperature-becomes-greater-than",
      );
    this.#lowTemperatureBecomesGreaterThan.registerRunListener(
      async (args, state) => {
        return (
          args.threshold <= state.currentLowTemp &&
          args.threshold > state.previousLowTemp
        );
      },
    );

    this.#lowTemperatureBecomesLessThan = this.homey.flow.getDeviceTriggerCard(
      "low-temperature-becomes-less-than",
    );
    this.#lowTemperatureBecomesLessThan.registerRunListener(
      async (args, state) => {
        return (
          args.threshold >= state.currentLowTemp &&
          args.threshold < state.previousLowTemp
        );
      },
    );

    const forceOnCard = this.homey.flow.getActionCard("force-on");
    forceOnCard.registerRunListener(async (args) => {
      await args.device.forceOn(args.type);
    });

    const forceOffCard = this.homey.flow.getActionCard("force-off");
    forceOffCard.registerRunListener(async (args) => {
      await args.device.forceOff(args.type);
    });

    const turnOnHighDemand = this.homey.flow.getActionCard(
      "turn-on-high-demand",
    );
    turnOnHighDemand.registerRunListener(async (args) => {
      await args.device.enableHighDemand();
    });

    const turnOffHighDemand = this.homey.flow.getActionCard(
      "turn-off-high-demand",
    );
    turnOffHighDemand.registerRunListener(async (args) => {
      await args.device.disableHighDemand();
    });

    const turnOnSleepMode = this.homey.flow.getActionCard("turn-on-sleep-mode");
    turnOnSleepMode.registerRunListener(async (args) => {
      await args.device.turnOnSleepMode(args.from, args.to);
    });

    const turnOffSleepMode = this.homey.flow.getActionCard(
      "turn-off-sleep-mode",
    );
    turnOffSleepMode.registerRunListener(async (args) => {
      await args.device.turnOffSleepMode();
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
          true,
          currentSubscriptionKey,
        );
        return devices.map(
          ({
            deviceId,
            deviceName,
            subscription_key,
            control,
          }): DeviceDetails => {
            const store: Store = {
              HasOneTemperature: !!control.currentTemperatureOne,
              HasLowTemperature: !!control.currentTemperatureLow,
              HasMidTemperature: !!control.currentTemperatureMid,
              HasTopTemperature: !!control.currentTemperatureTop,
            };
            return {
              name: deviceName,
              data: {
                id: deviceId,
              },
              store: store,
              settings: {
                subscription_key: subscription_key,
              },
              capabilities: this.getCapabilities(store),
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
              true,
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

  public getCapabilities({
    HasOneTemperature,
    HasLowTemperature,
    HasMidTemperature,
    HasTopTemperature,
  }: Store): string[] {
    return [
      "onoff",
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
      ...(HasOneTemperature ? ["water_heater_temperature_one"] : []),
      ...(HasLowTemperature ? ["water_heater_temperature_low"] : []),
      ...(HasMidTemperature ? ["water_heater_temperature_mid"] : []),
      ...(HasTopTemperature ? ["water_heater_temperature_top"] : []),
    ];
  }

  async triggerTemperatureFlows(
    device: Homey.Device,
    state: object | undefined,
  ) {
    this.#topTemperatureBecomesGreaterThan
      .trigger(device, {}, state)
      .then(this.log)
      .catch(this.error);

    this.#topTemperatureBecomesLessThan
      .trigger(device, {}, state)
      .then(this.log)
      .catch(this.error);

    this.#lowTemperatureBecomesGreaterThan
      .trigger(device, {}, state)
      .then(this.log)
      .catch(this.error);

    this.#lowTemperatureBecomesLessThan
      .trigger(device, {}, state)
      .then(this.log)
      .catch(this.error);
  }
}

module.exports = OSOInChargeWaterHeaterDriver;
