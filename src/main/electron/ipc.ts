import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.contracts';
import type {
  GetCompanyByIcoInput,
  UiProgressEvent
} from '../../shared/justice-company.contracts';
import type {
  DppoProgressEvent,
  GenerateDppoXmlInput
} from '../../shared/dppo.contracts';
import { FetchCompanyByIcoUseCase } from '../app/use-cases/fetch-company-by-ico.usecase';
import { generateDppoXml } from '../modules/dppo/submit-dppo';
import type { DppoLogger, LogLevel } from '../modules/dppo/logger';

class IpcDppoLogger implements DppoLogger {
  constructor(private readonly window: BrowserWindow) {}

  log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
    const event: DppoProgressEvent = {
      level,
      message,
      details,
      timestamp: new Date().toISOString()
    };

    this.window.webContents.send(IPC_CHANNELS.DPPO_PROGRESS, event);
  }
}

export function registerIpcHandlers(window: BrowserWindow): void {
  const useCase = new FetchCompanyByIcoUseCase();

  ipcMain.handle(IPC_CHANNELS.FETCH_COMPANY_BY_ICO, async (_event, input: GetCompanyByIcoInput) => {
    const progress = (progressEvent: UiProgressEvent): void => {
      window.webContents.send(IPC_CHANNELS.PROGRESS, progressEvent);
    };

    return useCase.execute(input, progress);
  });

  ipcMain.handle(IPC_CHANNELS.GENERATE_DPPO_XML, async (_event, input: GenerateDppoXmlInput) => {
    const logger = new IpcDppoLogger(window);
    return generateDppoXml(input.payload, input.options, logger);
  });
}
