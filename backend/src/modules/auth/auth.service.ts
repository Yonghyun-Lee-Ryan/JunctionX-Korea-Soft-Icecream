import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import type { Prisma, Role, User } from '../../generated/prisma/client.js';
import { prisma } from '../../infrastructure/database/client.js';
import { errors } from '../../shared/errors/app-error.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/security/jwt.service.js';
import { hashPassword, verifyPassword } from '../../shared/security/password.service.js';
import { hashToken, tokenHashesMatch } from '../../shared/security/token-hash.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}
interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}
type DatabaseClient = Prisma.TransactionClient;

const publicUserSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function createTokenPair(
  database: DatabaseClient,
  user: User,
  context: SessionContext,
): Promise<TokenPair> {
  const jti = randomUUID();
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, user.role),
    signRefreshToken(user.id, jti),
  ]);
  await database.refreshSession.create({
    data: {
      jti,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    },
  });
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    user: toPublicUser(user),
  };
}

export async function register(input: RegisterInput, context: SessionContext): Promise<TokenPair> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        email,
        passwordHash,
        ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      },
    });
    return createTokenPair(transaction, user, context);
  });
}

export async function login(input: LoginInput, context: SessionContext): Promise<TokenPair> {
  const user = await prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw errors.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  return prisma.$transaction((transaction) => createTokenPair(transaction, user, context));
}

export async function refresh(refreshToken: string, context: SessionContext): Promise<TokenPair> {
  const payload = await verifyRefreshToken(refreshToken);
  const presentedHash = hashToken(refreshToken);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const session = await transaction.refreshSession.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !tokenHashesMatch(session.tokenHash, presentedHash)
    ) {
      throw errors.unauthorized('Refresh Token 세션이 유효하지 않습니다.');
    }
    const revoked = await transaction.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) throw errors.unauthorized('이미 사용된 Refresh Token입니다.');
    return createTokenPair(transaction, session.user, context);
  });
}

export async function logout(refreshToken: string): Promise<void> {
  const payload = await verifyRefreshToken(refreshToken);
  const presentedHash = hashToken(refreshToken);
  const session = await prisma.refreshSession.findUnique({ where: { jti: payload.jti } });
  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !tokenHashesMatch(session.tokenHash, presentedHash)
  ) {
    throw errors.unauthorized('Refresh Token 세션이 유효하지 않습니다.');
  }
  const result = await prisma.refreshSession.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) throw errors.unauthorized('이미 로그아웃된 세션입니다.');
}

export async function logoutAll(userId: string): Promise<number> {
  const result = await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function getUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw errors.notFound('사용자를 찾을 수 없습니다.');
  return user;
}
