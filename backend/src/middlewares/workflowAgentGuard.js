import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

const callers = new Map();
let activeRequests = 0;

function takeRateLimitSlot(req) {
  const now = Date.now();
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  for (const [caller, entry] of callers) {
    if (entry.resetAt <= now) callers.delete(caller);
  }

  const current = callers.get(key);
  const entry = current?.resetAt > now
    ? current
    : { count: 0, resetAt: now + 60_000 };
  if (entry.count >= env.workflowAgents.rateLimitPerMinute) {
    throw new AppError('E_AGENT_RATE_LIMITED', undefined, {
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    });
  }
  entry.count += 1;
  callers.set(key, entry);
}

/** 한 요청이 여러 유료 Job으로 증폭될 수 있어 호출량·동시 실행 수만 제한한다. */
export function workflowAgentGuard(req, res, next) {
  try {
    takeRateLimitSlot(req);
    if (activeRequests >= env.workflowAgents.maxConcurrent) {
      throw new AppError('E_AGENT_BUSY');
    }
    activeRequests += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  } catch (err) {
    next(err);
  }
}
