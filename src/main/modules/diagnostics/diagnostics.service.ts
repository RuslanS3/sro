import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

type Level = 'info' | 'warn' | 'error';

type LogEntry = {
  level: Level;
  event: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
};

export class DiagnosticsService {
  private readonly baseDir: string;
  private readonly runDir: string;

  constructor() {
    this.baseDir = path.join(app.getPath('userData'), 'diagnostics');
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    this.runDir = path.join(this.baseDir, runId);
    fs.mkdirSync(this.runDir, { recursive: true });
  }

  getRunDir(): string {
    return this.runDir;
  }

  log(level: Level, event: string, message: string, details?: Record<string, unknown>): void {
    const payload: LogEntry = {
      level,
      event,
      message,
      details,
      timestamp: new Date().toISOString()
    };

    fs.appendFileSync(path.join(this.runDir, 'events.log'), `${JSON.stringify(payload)}\n`, 'utf8');
  }

  writeSnapshot(name: string, content: string): string {
    const snapshotPath = path.join(this.runDir, name);
    fs.writeFileSync(snapshotPath, content, 'utf8');
    return snapshotPath;
  }
}
