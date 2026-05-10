export type LogLevel = 'info' | 'warn' | 'error';

export type DphRegistrationLogger = {
  log: (level: LogLevel, message: string, details?: Record<string, unknown>) => void;
};

export class ConsoleDphRegistrationLogger implements DphRegistrationLogger {
  log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
    const payload = {
      level,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    // eslint-disable-next-line no-console
    console.log(`[DPH] ${JSON.stringify(payload)}`);
  }
}
