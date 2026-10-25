export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope = 'chembridge', level: LogLevel = envLevel()): Logger {
  const emit = (l: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (ORDER[l] < ORDER[level]) return;
    const time = new Date().toISOString().slice(11, 19);
    const tail = extra && Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
    const line = `${time} ${l.toUpperCase().padEnd(5)} [${scope}] ${msg}${tail}`;
    if (l === 'error' || l === 'warn') console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, e) => emit('debug', m, e),
    info: (m, e) => emit('info', m, e),
    warn: (m, e) => emit('warn', m, e),
    error: (m, e) => emit('error', m, e),
    child: (s) => createLogger(`${scope}:${s}`, level),
  };
}

/** A logger that discards everything (tests). */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

function envLevel(): LogLevel {
  const v = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return v in ORDER ? (v as LogLevel) : 'info';
}
