import axios, { AxiosError } from "axios";
import { App } from "homey";
import withApi from "./lib/withAPI";
import {
  LoginCredentials,
  UserDetailsReponse,
  DeviceListResponse,
  DeviceSubscriptionKeyData,
} from "./types";
import withTimers from "./lib/withTimers";
import OSOInChargeWaterHeaterDevice from "./drivers/water-heater/device";
import { Driver } from "homey/lib/Device";

axios.defaults.baseURL = "https://api.osoenergy.no/water-heater-api";

export default class OSOInChargeApp extends withApi(withTimers(App)) {
  public deviceList: DeviceSubscriptionKeyData[] = [];

  #syncInterval: NodeJS.Timeout | null = null;

  async onInit() {
    await this.listDevices();
  }

  public async login(loginCredentials: LoginCredentials): Promise<boolean> {
    try {
      const { subscription_key } = loginCredentials;
      if (!subscription_key) {
        return false;
      }

      let success = true;
      await this.get<UserDetailsReponse>("/1/User/Details", subscription_key)
        .then((response) => {
          if (response.data.email === undefined) {
            success = false;
          }
        })
        .catch((error: Error | AxiosError) => {
          if (axios.isAxiosError(error)) {
            if (error.response?.status == 403 || error.response?.status == 401)
              success = false;
          }
        });

      return success;
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  public async listDevices(
    subscription_key?: string,
  ): Promise<DeviceListResponse[]> {
    await this.fillSubscriptionKeys(subscription_key);
    this.planSyncFromDevices();

    if (this.deviceList.length == 0) return [];

    for (const subscription of this.deviceList) {
      await this.get<DeviceListResponse[]>(
        "/1/Device/all",
        subscription.subscription_key,
      )
        .then((response) => {
          response.data.forEach((device) => {
            device.subscription_key = subscription.subscription_key;
          });

          subscription.device_data = response.data;
        })
        .catch((error: Error | AxiosError) => {
          if (axios.isAxiosError(error)) {
            if (error.response?.status == 403 || error.response?.status == 401)
              subscription.device_data = [];
          }
        });
    }

    try {
      await this.syncDevicesFromList();
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error);
    }

    if (subscription_key)
      return (
        this.deviceList.find((e) => e.subscription_key == subscription_key)
          ?.device_data ?? []
      );
    else
      return this.deviceList
        .map((p) => p.device_data)
        .reduce((a, b) => {
          return a.concat(b);
        }, []);
  }

  public getDevices({
    driverId,
  }: { driverId?: string } = {}): OSOInChargeWaterHeaterDevice[] {
    let devices: OSOInChargeWaterHeaterDevice[] = (
      driverId !== undefined
        ? [this.homey.drivers.getDriver(driverId)]
        : Object.values(this.homey.drivers.getDrivers())
    ).flatMap(
      (driver: Driver): OSOInChargeWaterHeaterDevice[] =>
        driver.getDevices() as OSOInChargeWaterHeaterDevice[],
    );
    return devices;
  }

  private async fillSubscriptionKeys(subscription_key?: string) {
    const devices = this.getDevices();
    let allSubscriptionKeys = devices.map((d) => d.subscription_key);
    if (
      subscription_key != undefined &&
      allSubscriptionKeys.indexOf(subscription_key) == -1
    ) {
      allSubscriptionKeys.push(subscription_key);
    }

    allSubscriptionKeys.forEach((key) => {
      var existing = this.deviceList.find((d) => d.subscription_key == key);
      if (!existing) {
        this.deviceList.push({
          subscription_key: key,
          device_data: [],
        });
      }
    });

    var subscriptionsToRemove: DeviceSubscriptionKeyData[] = [];
    this.deviceList.forEach((deviceSubscription) => {
      var existing = allSubscriptionKeys.find(
        (s) => s == deviceSubscription.subscription_key,
      );
      if (!existing) subscriptionsToRemove.push(deviceSubscription);
    });

    if (subscriptionsToRemove.length > 0)
      subscriptionsToRemove.forEach((subscription) => {
        const index = this.deviceList.indexOf(subscription, 0);
        if (index > -1) {
          this.deviceList.splice(index, 1);
        }
      });
  }

  private planSyncFromDevices(): void {
    if (this.#syncInterval) {
      return;
    }
    this.#syncInterval = this.setInterval(
      async (): Promise<void> => {
        await this.listDevices();
      },
      { seconds: 15 },
      { actionType: "device list refresh", units: ["seconds"] },
    );
  }

  private async syncDevicesFromList(): Promise<void> {
    await Promise.all(
      this.getDevices().map(
        async (device: OSOInChargeWaterHeaterDevice): Promise<void> =>
          device.syncDeviceFromList(),
      ),
    );
  }

  public async forceWaterHeaterOn(
    subscription_key: string,
    deviceId: string,
    fullUtilization: boolean,
  ) {
    await this.post(
      `/1/Device/${deviceId}/TurnOn?fullUtilizationParam=${fullUtilization}`,
      subscription_key,
    ).catch((error: Error | AxiosError) => {
      this.log(error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status == 403 || error.response?.status == 401)
          throw new Error("Subscription key is not valid.");
        else if (error.response?.status == 400)
          throw new Error(
            "Rejected. Heater cannot be forced on at the moment.",
          );
        else throw new Error("Unknown error occured");
      }
    });
  }

  public async forceWaterHeaterOff(
    subscription_key: string,
    deviceId: string,
    fullUtilization: boolean,
  ) {
    await this.post(
      `/1/Device/${deviceId}/TurnOff?fullUtilization=${fullUtilization}`,
      subscription_key,
    ).catch((error: Error | AxiosError) => {
      if (axios.isAxiosError(error)) {
        if (error.response?.status == 403 || error.response?.status == 401)
          throw new Error("Subscription key is not valid.");
        else if (error.response?.status == 400)
          throw new Error(
            "Rejected. Heater cannot be forced off at the moment.",
          );
        else throw new Error("Unknown error occured");
      }
    });
  }

  public async get<T>(url: string, subscription_key: string) {
    return this.api.get<T>(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": subscription_key,
      },
    });
  }

  public async post(url: string, subscription_key: string) {
    return this.api.post(
      url,
      {},
      {
        headers: {
          "Ocp-Apim-Subscription-Key": subscription_key,
        },
      },
    );
  }
}

module.exports = OSOInChargeApp;
