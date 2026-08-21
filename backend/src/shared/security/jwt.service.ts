import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { errors } from '../errors/app-error.js';

export type UserRole = 'USER' | 'ADMIN';
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  exp: number;
}

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const accessPayloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(['USER', 'ADMIN']),
  type: z.literal('access'),
});
const refreshPayloadSchema = z.object({
  sub: z.uuid(),
  jti: z.uuid(),
  type: z.literal('refresh'),
  exp: z.number().int(),
});

export function signAccessToken(userId: string, role: UserRole): Promise<string> {
  return new SignJWT({ role, type: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export function signRefreshToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_REFRESH_TTL_SECONDS}s`)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    return accessPayloadSchema.parse(payload);
  } catch {
    throw errors.unauthorized('Access Token이 유효하지 않습니다.');
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    return refreshPayloadSchema.parse(payload);
  } catch {
    throw errors.unauthorized('Refresh Token이 유효하지 않습니다.');
  }
}
