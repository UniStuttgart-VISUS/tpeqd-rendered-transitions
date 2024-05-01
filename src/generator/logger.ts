export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
};

let loglevel: LogLevel = LogLevel.DEBUG;

export function setLoglevel(l: LogLevel) {
  loglevel = l;
}

export function replaceLoggingFunctions() {
  const innerDebug = console.debug.bind(console);
  const innerLog = console.log.bind(console);
  const innerWarn = console.warn.bind(console);
  const innerError = console.error.bind(console);

  console.debug = function(...args) { if (loglevel <= LogLevel.DEBUG) innerDebug(...args) }
  console.log   = function(...args) { if (loglevel <= LogLevel.INFO)  innerLog(...args) }
  console.warn  = function(...args) { if (loglevel <= LogLevel.WARN)  innerWarn(...args) }
  console.error = function(...args) { if (loglevel <= LogLevel.ERROR) innerError(...args) }
}


export function logTime(label?: string, level: LogLevel = LogLevel.DEBUG) {
  if (loglevel <= level) console.time(label);
}

export function logTimeEnd(label?: string, level: LogLevel = LogLevel.DEBUG) {
  if (loglevel <= level) console.timeEnd(label);
}

export function logTimeLog(label?: string, level: LogLevel = LogLevel.DEBUG, ...args) {
  if (loglevel <= level) console.timeLog(label, ...args);
}