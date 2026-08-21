import '../../infrastructure/openapi/zod.js';
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .email()
  .openapi({ example: 'hacker@example.com' });
export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(72, '비밀번호는 72자 이하여야 합니다.')
  .openapi({ example: 'Hackathon!2026' });
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(100).optional().openapi({ example: 'Ryan' }),
  })
  .openapi('RegisterRequest');
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(72) })
  .openapi('LoginRequest');
export const refreshTokenBodySchema = z
  .object({
    refreshToken: z.string().min(1).optional().openapi({ example: 'eyJhbGciOiJIUzI1NiJ9...' }),
  })
  .openapi('RefreshTokenRequest');
export const userResponseSchema = z
  .object({
    id: z.uuid().openapi({ example: 'b6efe0f3-590f-43a6-b768-51cb4d2bb05e' }),
    email: z.email().openapi({ example: 'hacker@example.com' }),
    displayName: z.string().nullable().openapi({ example: 'Ryan' }),
    role: z.enum(['USER', 'ADMIN']).openapi({ example: 'USER' }),
    createdAt: z.iso.datetime().openapi({ example: '2026-08-21T12:00:00.000Z' }),
    updatedAt: z.iso.datetime().openapi({ example: '2026-08-21T12:00:00.000Z' }),
  })
  .openapi('User');
export const authResponseSchema = z
  .object({
    accessToken: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiJ9...' }),
    refreshToken: z.string().optional().openapi({ example: 'eyJhbGciOiJIUzI1NiJ9...' }),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().positive().openapi({ example: 900 }),
    user: userResponseSchema,
  })
  .openapi('AuthResponse');

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
