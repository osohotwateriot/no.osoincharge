import Homey from "homey";
import OSOInChargeApp from "../../app";
import {
  CapabilityValueGetMap,
  DeviceDetails,
  DeviceListResponse,
  Store,
  StoreValueGetMap,
} from "../../types";
import OSOInChargeWaterHeaterDriver from "./driver";

const capabilityValueGetMap: CapabilityValueGetMap = {
  measure_power: (d) => (d.data?.actualLoadKwh ?? 0) * 1000,
  measure_temperature: (d) => d.control?.currentTemperature,
  water_heater_capacity_mixed_water: (d) => d.data?.capacityMixedWater40,
  water_heater_connection_state: (d) => d.connectionState?.connectionState,
  water_heater_current_set_point: (d) => d.control?.targetTemperature,
  water_heater_heating: (d) => d.control?.heater,
  water_heater_high_demand_mode: (d) => d.isInExtraEnergy,
  water_heater_mode: (d) => d.control?.mode,
  water_heater_optimization_mode: (d) => d.optimizationOption,
  water_heater_sleep_mode: (d) => d.isInPowerSave,
  water_heater_v40min: (d) => d.v40Min,
  water_heater_temperature_one: (d) => d.control?.currentTemperatureOne,
  water_heater_temperature_low: (d) => d.control?.currentTemperatureLow,
  water_heater_temperature_mid: (d) => d.control?.currentTemperatureMid,
  water_heater_temperature_top: (d) => d.control?.currentTemperatureTop,
};

const dataToStoreMap: StoreValueGetMap = {
  HasOneTemperature: (d) => !!d.control?.currentTemperatureOne,
  HasLowTemperature: (d) => !!d.control?.currentTemperatureLow,
  HasMidTemperature: (d) => !!d.control?.currentTemperatureMid,
  HasTopTemperature: (d) => !!d.control?.currentTemperatureTop,
};

export default class OSOInChargeWaterHeaterDevice extends Homey.Device {
  public declare driver: OSOInChargeWaterHeaterDriver;

  public id!: string;
  public subscription_key!: string;
  protected app!: OSOInChargeApp;

  async onInit() {
    this.app = this.homey.app as OSOInChargeApp;
    const { id } = this.getData() as DeviceDetails["data"];
    this.id = id;
    this.subscription_key = this.getSetting("subscription_key");

    await this.handleCapabilities();
    await this.syncDeviceFromList();
  }

  async onAdded() {
    await this.syncDeviceFromList();
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: {
      [key: string]: boolean | string | number | undefined | null;
    };
    newSettings: {
      [key: string]: boolean | string | number | undefined | null;
    };
    changedKeys: string[];
  }): Promise<string | void> {
    this.subscription_key = this.getSetting("subscription_key");
  }

  async forceOn(type: any) {
    await this.app.forceWaterHeaterOn(
      this.subscription_key,
      this.id,
      type == "until-maximum-temperature",
    );
  }

  async forceOff(type: any) {
    await this.app.forceWaterHeaterOff(
      this.subscription_key,
      this.id,
      type == "until-maximum-temperature",
    );
  }

  async enableHighDemand() {
    await this.app.enableHighDemand(this.subscription_key, this.id);
  }

  async disableHighDemand() {
    await this.app.disableHighDemand(this.subscription_key, this.id);
  }

  async turnOnSleepMode(from: string, to: string) {
    await this.app.turnOnSleepMode(this.subscription_key, this.id, from, to);
  }

  async turnOffSleepMode() {
    await this.app.turnOffSleepMode(this.subscription_key, this.id);
  }

  protected async handleCapabilities(): Promise<void> {
    const requiredCapabilities = this.driver.getCapabilities(
      this.getStore() as Store,
    );

    await this.getCapabilities()
      .filter(
        (capability: string) => !requiredCapabilities.includes(capability),
      )
      .reduce<Promise<void>>(async (acc, capability: string) => {
        await acc;
        await this.removeCapability(capability);
      }, Promise.resolve());

    await requiredCapabilities.reduce<Promise<void>>(
      async (acc, capability: string) => {
        await acc;
        return this.addCapability(capability);
      },
      Promise.resolve(),
    );
  }

  public async syncDeviceFromList(): Promise<void> {
    const data: DeviceListResponse | undefined = this.getDeviceFromList();
    if (data == undefined) {
      this.setUnavailable(
        this.homey.__("device.device_connection_expired"),
      ).catch((error) => {
        this.error(error);
      });
      this.error("Device is unavailable", this.id);
    } else {
      this.setAvailable();

      let previousTopTemperature = this.getCurrentTopTemperature(undefined);
      let previousLowTemperature = this.getCurrentLowTemperature(undefined);

      await this.updateSettings(data);
      await this.updateStore(data);
      await this.endSync(data);

      let currentTopTemperature = this.getCurrentTopTemperature(data);
      let currentLowTemperature = this.getCurrentLowTemperature(data);
      if (
        currentTopTemperature != previousTopTemperature ||
        currentLowTemperature != previousLowTemperature
      ) {
        await this.driver.triggerTemperatureFlows(this, {
          currentLowTemp: currentLowTemperature,
          currentTopTemp: currentTopTemperature,
          previousLowTemp: previousLowTemperature,
          previousTopTemp: previousTopTemperature,
        });
      }
    }
  }

  protected async updateSettings(
    data: DeviceListResponse | undefined,
  ): Promise<void> {
    if (!data || data === undefined) {
      return;
    }
    await this.setSettings({
      subscription_key: data.subscription_key,
    });
  }

  protected async updateStore(
    data: DeviceListResponse | undefined,
  ): Promise<void> {
    if (!data || data === undefined) {
      return;
    }

    let store = this.getStore() as Store;
    const updates = await Promise.all(
      Object.keys(dataToStoreMap)
        .filter(
          (key: string) =>
            store[key as keyof Store] !== dataToStoreMap[key](data),
        )
        .map(async (key: string): Promise<boolean> => {
          await this.setStoreValue(key, dataToStoreMap[key](data));
          return true;
        }),
    );
    if (updates.some(Boolean)) {
      await this.handleCapabilities();
    }
  }

  private async endSync(
    data: Partial<DeviceListResponse> | undefined,
  ): Promise<void> {
    await this.updateCapabilities(data);
  }

  private async updateCapabilities(
    data: Partial<DeviceListResponse> | undefined,
  ): Promise<void> {
    if (!data) return;

    const capabilities = this.getCapabilities();
    capabilities.forEach((capability) => {
      if (capability in capabilityValueGetMap)
        this.setCapabilityValue(
          capability,
          capabilityValueGetMap[capability](data),
        );
    });
  }

  private getCurrentTopTemperature(
    data: DeviceListResponse | undefined,
  ): number | undefined {
    let store = this.getStore() as Store;
    let key = "";
    if (store.HasTopTemperature) key = "water_heater_temperature_top";
    else if (store.HasMidTemperature) key = "water_heater_temperature_mid";
    else if (store.HasLowTemperature) key = "water_heater_temperature_low";
    else if (store.HasOneTemperature) key = "water_heater_temperature_one";

    if (!key) return undefined;

    if (data) return capabilityValueGetMap[key](data) as number;
    else return this.getCapabilityValue(key);
  }

  private getCurrentLowTemperature(
    data: DeviceListResponse | undefined,
  ): number | undefined {
    let store = this.getStore() as Store;
    let key = "";
    if (store.HasOneTemperature) key = "water_heater_temperature_one";
    else if (store.HasLowTemperature) key = "water_heater_temperature_low";
    else if (store.HasMidTemperature) key = "water_heater_temperature_mid";
    else if (store.HasTopTemperature) key = "water_heater_temperature_top";

    if (!key) return undefined;

    if (data) return capabilityValueGetMap[key](data) as number;
    else return this.getCapabilityValue(key);
  }

  private getDeviceFromList(): DeviceListResponse | undefined {
    return this.app.deviceList
      .find((d) => d.subscription_key == this.subscription_key)
      ?.device_data?.find(
        (device: DeviceListResponse) => device.deviceId === this.id,
      ) as DeviceListResponse | undefined;
  }
}

module.exports = OSOInChargeWaterHeaterDevice;
