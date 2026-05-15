declare const process: {
  env: Record<string, string | undefined>;
};

declare const require: {
  (moduleName: string): any;
  resolve(moduleName: string): string;
};

declare module "@tarojs/service" {
  export interface IPluginContext {
    initialConfig: Record<string, any>;
    modifyWebpackChain(callback: (params: { chain: any }) => void): void;
    modifyRunnerOpts(callback: (params: { opts: any }) => void): void;
  }
}
