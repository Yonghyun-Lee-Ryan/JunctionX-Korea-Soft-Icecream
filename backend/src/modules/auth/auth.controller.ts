import type { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env.js';
import { errors } from '../../shared/errors/app-error.js';
import { sendData } from '../../shared/http/response.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';
import * as authService from './auth.service.js';

function sessionContext(request: Request): authService.SessionContext {
  const userAgent = request.get('user-agent')?.slice(0, 512);
  const ipAddress = request.ip?.slice(0, 45);
  return { ...(userAgent ? { userAgent } : {}), ...(ipAddress ? { ipAddress } : {}) };
}
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_TTL_SECONDS * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}
function getRefreshToken(request: Request): string {
  if (env.AUTH_REFRESH_TRANSPORT === 'cookie') {
    const token = (request.cookies as Record<string, unknown> | undefined)?.[
      env.AUTH_REFRESH_COOKIE_NAME
    ];
    if (typeof token === 'string' && token) return token;
  } else {
    const token = (request.body as { refreshToken?: unknown }).refreshToken;
    if (typeof token === 'string' && token) return token;
  }
  throw errors.unauthorized('Refresh Token이 필요합니다.');
}
function sendTokenPair(
  response: Response,
  pair: Awaited<ReturnType<typeof authService.login>>,
  status: number,
): void {
  const { refreshToken, ...body } = pair;
  if (env.AUTH_REFRESH_TRANSPORT === 'cookie') {
    response.cookie(env.AUTH_REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    sendData(response, body, status);
  } else {
    sendData(response, { ...body, refreshToken }, status);
  }
}
function clearRefreshCookie(response: Response): void {
  const options = refreshCookieOptions();
  delete options.maxAge;
  response.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, options);
}

export async function register(request: Request, response: Response): Promise<void> {
  sendTokenPair(
    response,
    await authService.register(request.body as RegisterInput, sessionContext(request)),
    201,
  );
}
export async function login(request: Request, response: Response): Promise<void> {
  sendTokenPair(
    response,
    await authService.login(request.body as LoginInput, sessionContext(request)),
    200,
  );
}
export async function refresh(request: Request, response: Response): Promise<void> {
  sendTokenPair(
    response,
    await authService.refresh(getRefreshToken(request), sessionContext(request)),
    200,
  );
}
export async function logout(request: Request, response: Response): Promise<void> {
  await authService.logout(getRefreshToken(request));
  if (env.AUTH_REFRESH_TRANSPORT === 'cookie') clearRefreshCookie(response);
  sendData(response, null);
}
export async function logoutAll(request: Request, response: Response): Promise<void> {
  const userId = request.auth?.userId;
  if (!userId) throw errors.unauthorized();
  const revokedSessions = await authService.logoutAll(userId);
  if (env.AUTH_REFRESH_TRANSPORT === 'cookie') clearRefreshCookie(response);
  sendData(response, { revokedSessions });
}
