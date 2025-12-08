type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

type LogDetails = Record<string, unknown> | string | number | boolean | null | undefined;

const RESET = '\x1b[0m';
const COLORS = {
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

const ICONS: Record<LogLevel, string> = {
  info: 'ℹ️ ',
  warn: '⚠️ ',
  error: '❌',
  debug: '🔍',
  success: '✅',
};

function color(text: string, tone: keyof typeof COLORS): string {
  return `${COLORS[tone]}${text}${RESET}`;
}

function formatDetails(details?: LogDetails): string {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details;
  if (typeof details === 'number' || typeof details === 'boolean') return String(details);
  try {
    const serialized = JSON.stringify(details);
    return serialized.length > 280 ? `${serialized.slice(0, 277)}...` : serialized;
  } catch {
    return '[unserializable details]';
  }
}

function emitPretty(level: LogLevel, scope: string, message: string, details?: LogDetails): void {
  const icon = ICONS[level] || ICONS.info;
  const scoped = scope ? `${color(`[${scope}]`, 'cyan')} ` : '';
  const detailText = formatDetails(details);
  const suffix = detailText ? ` — ${detailText}` : '';

  const line = `${icon} ${scoped}${message}${suffix}`;

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(color(line, 'gray'));
      break;
    case 'success':
      console.log(color(line, 'green'));
      break;
    case 'info':
    default:
      console.log(line);
  }
}

function emitStructured(level: LogLevel, scope: string, event: string, details?: LogDetails): void {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    event,
  };

  if (details !== undefined) {
    payload.details = details;
  }

  const message = JSON.stringify(payload);

  switch (level) {
    case 'error':
      console.error(message);
      break;
    case 'warn':
      console.warn(message);
      break;
    case 'debug':
      console.debug(message);
      break;
    case 'success':
    case 'info':
    default:
      console.info(message);
  }
}

export function logStructured(
  scope: string,
  event: string,
  details?: LogDetails,
  level: LogLevel = 'info',
): void {
  emitStructured(level, scope, event, details);
}

export function logSection(title: string): void {
  console.log(`\n${color(`=== ${title} ===`, 'cyan')}`);
}

export function logInfo(message: string): void {
  emitPretty('info', '', message);
}

export function logSuccess(message: string): void {
  emitPretty('success', '', message);
}

export function logWarning(message: string): void {
  emitPretty('warn', '', message);
}

export function logError(message: string): void {
  emitPretty('error', '', message);
}

export function logDetail(message: string): void {
  emitPretty('info', '', `  • ${message}`);
}

export function createLogger(
  scope: string,
  options: { structured?: boolean } = {},
) {
  const structured = options.structured ?? false;
  const emit = structured
    ? (level: LogLevel, event: string, details?: LogDetails) => emitStructured(level, scope, event, details)
    : (level: LogLevel, message: string, details?: LogDetails) => emitPretty(level, scope, message, details);

  return {
    section: (title: string) => logSection(title),
    info: (message: string, details?: LogDetails) => emit('info', message, details),
    success: (message: string, details?: LogDetails) => emit('success', message, details),
    warn: (message: string, details?: LogDetails) => emit('warn', message, details),
    error: (message: string, details?: LogDetails) => emit('error', message, details),
    debug: (message: string, details?: LogDetails) => emit('debug', message, details),
    detail: (message: string, details?: LogDetails) => emit('info', `• ${message}`, details),
  };
}



