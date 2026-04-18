export type LogLevel = 'info' | 'warn' | 'error';

export type DppoLogger = {
  log: (level: LogLevel, message: string, details?: Record<string, unknown>) => void;
};

export class ConsoleDppoLogger implements DppoLogger {
  log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
    const payload = {
      level,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    // eslint-disable-next-line no-console
    console.log(`[DPPO] ${JSON.stringify(payload)}`);
  }
}
