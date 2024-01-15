import Homey from "homey/lib/Homey";

interface Loggable {
  error(...errorArgs: any[]): void;
  log(...logArgs: any[]): void;
}

export type HomeyClass = new (...args: any[]) => Loggable & {
  readonly homey: Homey;
  readonly setWarning?: (warning: string) => Promise<void>;
};

export type CapabilityValueGetMap = {
  [key: string]: (
    d: Partial<DeviceListResponse>,
  ) => boolean | string | number | undefined;
};

export type StoreValueGetMap = {
  [key: string]: (d: Partial<DeviceListResponse>) => boolean;
};

export interface LoginCredentials {
  subscription_key: string;
}

export interface UserDetailsReponse {
  email: string;
}

export interface DeviceSubscriptionKeyData {
  subscription_key: string;
  device_data: DeviceListResponse[];
}

export interface DeviceListControlResponse {
  heater: string;
  mode: string;
  targetTemperature: number;
  targetTemperatureLow: number;
  targetTemperatureHigh: number;
  minTemperature: number;
  maxTemperature: number;
  currentTemperature: number;
  currentTemperatureOne: number | undefined;
  currentTemperatureLow: number | undefined;
  currentTemperatureMid: number | undefined;
  currentTemperatureTop: number | undefined;
}

export interface DeviceListDataResponse {
  actualLoadKwh: number;
  tappingCapacitykWh: number;
  capacityMixedWater40: number;
}

export interface DeviceListConnectionStateResponse {
  connectionState: string;
}

export interface DeviceListResponse {
  deviceId: string;
  subscription_key: string;
  deviceName: string;
  deviceType: string;
  connectionState: DeviceListConnectionStateResponse;
  control: DeviceListControlResponse;
  data: DeviceListDataResponse;
  powerConsumption: number;
  volume: number;
  v40Min: number;
  v40LevelMin: number;
  v40LevelMax: number;
  optimizationOption: string;
  isInPowerSave: boolean;
  isInExtraEnergy: boolean;
}

export interface Store {
  readonly HasOneTemperature: boolean;
  readonly HasLowTemperature: boolean;
  readonly HasMidTemperature: boolean;
  readonly HasTopTemperature: boolean;
}

export interface Settings {
  subscription_key: string;
}

export interface DeviceDetails {
  readonly capabilities: string[];
  readonly data: {
    readonly id: string;
  };
  readonly settings: Settings;
  readonly name: string;
  readonly store: Store;
}
