// Persistent logger that survives page reloads
class PersistentLogger {
  private logs: string[] = [];
  private maxLogs = 200;
  private storageKey = 'debug_logs';

  constructor() {
    // Load existing logs from localStorage
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      try {
        this.logs = JSON.parse(stored);
      } catch (e) {
        this.logs = [];
      }
    }
  }

  log(message: string, data?: any) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logEntry = data
      ? `[${timestamp}] ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] ${message}`;

    this.logs.push(logEntry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Save to localStorage
    localStorage.setItem(this.storageKey, JSON.stringify(this.logs));

    // Also log to console
    console.log(message, data || '');
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    localStorage.removeItem(this.storageKey);
  }

  dump(): string {
    return this.logs.join('\n');
  }
}

export const persistentLogger = new PersistentLogger();

// Make it available globally for debugging
(window as any).debugLogs = {
  get: () => persistentLogger.getLogs(),
  dump: () => console.log(persistentLogger.dump()),
  clear: () => persistentLogger.clear()
};
