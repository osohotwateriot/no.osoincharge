import Homey from "homey";
import OSOInChargeApp from "../../app";
import {
  CapabilityValueGetMap,
  DeviceDetails,
  DeviceListResponse,
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

  protected async handleCapabilities(): Promise<void> {
    const requiredCapabilities = this.driver.getCapabilities();

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
      this.setUnavailable(this.homey.__("device.device_connection_expired")).catch(
        (error) => {
          this.error(error);
        },
      );
      this.error("Device is unavailable", this.id);
    } else {
      this.setAvailable();
      await this.updateSettings(data);
      await this.endSync(data);
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

  private getDeviceFromList(): DeviceListResponse | undefined {
    return this.app.deviceList
      .find((d) => d.subscription_key == this.subscription_key)
      ?.device_data?.find(
        (device: DeviceListResponse) => device.deviceId === this.id,
      ) as DeviceListResponse | undefined;
  }
}

module.exports = OSOInChargeWaterHeaterDevice;
