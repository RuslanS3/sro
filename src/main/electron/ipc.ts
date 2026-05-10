import { BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { IPC_CHANNELS } from '../../shared/ipc.contracts';
import type {
  GetCompanyByIcoInput,
  UiProgressEvent
} from '../../shared/justice-company.contracts';
import type {
  DppoProgressEvent,
  GenerateDppoXmlInput
} from '../../shared/dppo.contracts';
import type {
  DphRegistrationProgressEvent,
  GenerateDphRegistrationInput
} from '../../shared/dph-registration.contracts';
import { FetchCompanyByIcoUseCase } from '../app/use-cases/fetch-company-by-ico.usecase';
import { generateDppoXml } from '../modules/dppo/submit-dppo';
import type { DppoLogger, LogLevel } from '../modules/dppo/logger';
import { generateDphRegistration } from '../modules/dph-registration/submit-dph-registration';
import type {
  DphRegistrationLogger,
  LogLevel as DphLogLevel
} from '../modules/dph-registration/logger';

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

class IpcDphRegistrationLogger implements DphRegistrationLogger {
  constructor(private readonly window: BrowserWindow) {}

  log(level: DphLogLevel, message: string, details?: Record<string, unknown>): void {
    const event: DphRegistrationProgressEvent = {
      level,
      message,
      details,
      timestamp: new Date().toISOString()
    };

    this.window.webContents.send(IPC_CHANNELS.DPH_REGISTRATION_PROGRESS, event);
  }
}

export function registerIpcHandlers(window: BrowserWindow): void {
  const useCase = new FetchCompanyByIcoUseCase();

  ipcMain.removeHandler(IPC_CHANNELS.FETCH_COMPANY_BY_ICO);
  ipcMain.handle(IPC_CHANNELS.FETCH_COMPANY_BY_ICO, async (_event, input: GetCompanyByIcoInput) => {
    const progress = (progressEvent: UiProgressEvent): void => {
      window.webContents.send(IPC_CHANNELS.PROGRESS, progressEvent);
    };

    return useCase.execute(input, progress);
  });

  ipcMain.removeHandler(IPC_CHANNELS.GENERATE_DPPO_XML);
  ipcMain.handle(IPC_CHANNELS.GENERATE_DPPO_XML, async (_event, input: GenerateDppoXmlInput) => {
    const logger = new IpcDppoLogger(window);
    return generateDppoXml(input.payload, input.options, logger);
  });

  ipcMain.removeHandler(IPC_CHANNELS.GENERATE_DPH_REGISTRATION);
  ipcMain.handle(
    IPC_CHANNELS.GENERATE_DPH_REGISTRATION,
    async (_event, input: GenerateDphRegistrationInput) => {
      const logger = new IpcDphRegistrationLogger(window);
      return generateDphRegistration(input.payload, input.options, logger);
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.OPEN_XML_PATH);
  ipcMain.handle(IPC_CHANNELS.OPEN_XML_PATH, async (_event, xmlPath: string) => {
    if (!xmlPath || typeof xmlPath !== 'string') {
      return { ok: false, message: 'Invalid XML path.' };
    }

    const normalized = path.resolve(xmlPath);
    if (!fs.existsSync(normalized)) {
      return { ok: false, message: 'XML file not found.' };
    }

    shell.showItemInFolder(normalized);
    const openResult = await shell.openPath(normalized);
    if (openResult) {
      return { ok: true, message: openResult };
    }
    return { ok: true };
  });
}
