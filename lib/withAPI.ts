import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import type { HomeyClass } from "../types";

type APIClass = new (...args: any[]) => {
  api: AxiosInstance;
  get<T>(url: string, subscription_key: string) : Promise<axios.AxiosResponse<T, any>>;
  put(url: string, subscription_key: string, data?: any) : Promise<axios.AxiosResponse<any, any>>
  post(url: string, subscription_key: string) : Promise<axios.AxiosResponse<any, any>>
  delete(url: string, subscription_key: string) : Promise<axios.AxiosResponse<any, any>>
};

export default function withAPI<T extends HomeyClass>(base: T): APIClass & T {
  return class extends base {
    public api: AxiosInstance;

    public constructor(...args: any[]) {
      super(...args);
      this.api = axios.create();
      this.setupAxiosInterceptors();
    }

    public async get<T>(url: string, subscription_key: string) : Promise<axios.AxiosResponse<T, any>> {
      return this.api.get<T>(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": subscription_key,
        },
      });
    }

    public async put(url: string, subscription_key: string, data?: any) : Promise<axios.AxiosResponse<any, any>> {
      return this.api.put(
        url,
        data,
        {
          headers: {
            "Ocp-Apim-Subscription-Key": subscription_key,
          },
        },
      );
    }
  
    public async post(url: string, subscription_key: string) : Promise<axios.AxiosResponse<any, any>> {
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
  
    public async delete(url: string, subscription_key: string) : Promise<axios.AxiosResponse<any, any>> {
      return this.api.delete(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": subscription_key,
        },
      });
    }

    private setupAxiosInterceptors(): void {
      this.api.interceptors.request.use(
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig =>
          this.handleRequest(config),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError("request", error),
      );
      this.api.interceptors.response.use(
        (response: AxiosResponse): AxiosResponse =>
          this.handleResponse(response),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError("response", error),
      );
    }

    private handleRequest(
      config: InternalAxiosRequestConfig,
    ): InternalAxiosRequestConfig {
      const updatedConfig: InternalAxiosRequestConfig = { ...config };
      this.log(
        "Sending request:",
        updatedConfig.url,
        updatedConfig.method === "post" ? updatedConfig.data : "",
      );
      return updatedConfig;
    }

    private handleResponse(response: AxiosResponse): AxiosResponse {
      this.log("Received response:", response.config.url, response.data);
      return response;
    }

    private async handleError(
      type: "request" | "response",
      error: AxiosError,
    ): Promise<AxiosError> {
      this.error(
        `Error in ${type}:`,
        error.config?.url,
        error.response?.data ?? error,
      );
      await this.setErrorWarning(error);
      return Promise.reject(error);
    }

    private async setErrorWarning(error: AxiosError): Promise<void> {
      if (!this.setWarning) {
        return;
      }
      await this.setWarning(error.message);
    }
  };
}
