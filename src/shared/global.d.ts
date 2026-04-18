import type { AutomationApi } from './ipc.contracts';

declare global {
  interface Window {
    automationApi: AutomationApi;
  }
}

export {};
