import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  authResponseSchema,
  loginSchema,
  refreshTokenBodySchema,
  registerSchema,
  userResponseSchema,
} from '../../modules/auth/auth.schema.js';
import { healthResponseSchema } from '../../modules/health/health.schema.js';

const registry = new OpenAPIRegistry();
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
const errorSchema = registry.register(
  'ErrorResponse',
  z.object({
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string().openapi({ example: '요청이 올바르지 않습니다.' }),
      details: z.array(z.unknown()),
      requestId: z.string().openapi({ example: '1e37a42d-fbb1-41f4-b4de-734d7df9dcf9' }),
    }),
  }),
);
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorSchema } },
});
const authEnvelope = z.object({ data: authResponseSchema });
const userEnvelope = z.object({ data: userResponseSchema });
const healthEnvelope = z.object({ data: healthResponseSchema });

registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  responses: {
    200: {
      description: '프로세스 생존',
      content: { 'application/json': { schema: healthEnvelope } },
    },
  },
});
registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  responses: {
    200: {
      description: 'DB 연결 준비 완료',
      content: { 'application/json': { schema: healthEnvelope } },
    },
    503: errorResponse('DB 연결 준비 실패'),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: registerSchema } } } },
  responses: {
    201: {
      description: '회원가입 성공',
      content: { 'application/json': { schema: authEnvelope } },
    },
    400: errorResponse('요청 검증 실패'),
    409: errorResponse('이메일 중복'),
    429: errorResponse('요청 횟수 제한'),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: {
    200: { description: '로그인 성공', content: { 'application/json': { schema: authEnvelope } } },
    400: errorResponse('요청 검증 실패'),
    401: errorResponse('인증 실패'),
    429: errorResponse('요청 횟수 제한'),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  description: '설정에 따라 HttpOnly cookie 또는 body의 Refresh Token을 회전합니다.',
  request: {
    body: { required: false, content: { 'application/json': { schema: refreshTokenBodySchema } } },
  },
  responses: {
    200: {
      description: '토큰 회전 성공',
      content: { 'application/json': { schema: authEnvelope } },
    },
    400: errorResponse('요청 검증 실패'),
    401: errorResponse('인증 실패'),
    429: errorResponse('요청 횟수 제한'),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  request: {
    body: { required: false, content: { 'application/json': { schema: refreshTokenBodySchema } } },
  },
  responses: {
    200: {
      description: '현재 세션 폐기',
      content: { 'application/json': { schema: z.object({ data: z.null() }) } },
    },
    401: errorResponse('인증 실패'),
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout-all',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: '모든 활성 세션 폐기',
      content: {
        'application/json': {
          schema: z.object({ data: z.object({ revokedSessions: z.number().int().nonnegative() }) }),
        },
      },
    },
    401: errorResponse('인증 실패'),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/users/me',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '현재 사용자', content: { 'application/json': { schema: userEnvelope } } },
    401: errorResponse('인증 실패'),
  },
});

export const openApiDocument = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'JunctionX Korea Backend API',
    version: '1.0.0',
    description: '해커톤 백엔드 스타터',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
});
