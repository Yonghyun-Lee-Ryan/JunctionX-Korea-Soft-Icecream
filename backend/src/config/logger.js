const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[(process.env.LOG_LEVEL ?? 'info').trim()] ?? LEVELS.info;

function emit(level, msg, meta) {
  if (LEVELS[level] > threshold) return;
  const line = { t: new Date().toISOString(), level, msg, ...(meta ?? {}) };
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};

/** 요청 1건당 한 줄. 의존성 없이 morgan 자리를 대신한다 */
export function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info('http', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms),
    });
  });
  next();
}
