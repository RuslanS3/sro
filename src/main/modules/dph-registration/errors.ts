export class DphRegistrationAutomationError extends Error {
  constructor(
    message: string,
    readonly details?: {
      url?: string;
      pageTitle?: string;
      screenshotPath?: string;
    }
  ) {
    super(message);
    this.name = 'DphRegistrationAutomationError';
  }
}
