import type { Response as SupertestResponse } from 'supertest';
import supertest from 'supertest';

import { app, createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { disconnectDatabase } from '../../src/infrastructure/database/disconnect.js';
import { cleanTestDatabase } from '../helpers/database.js';

const password = 'Hackathon!2026';

interface TokenTransport {
  cookie?: string;
  token?: string;
}

function bodyOf(response: SupertestResponse): Record<string, any> {
  return response.body as Record<string, any>;
}

function cookieFrom(response: SupertestResponse): string | undefined {
  const value = response.headers['set-cookie'] as string[] | string | undefined;
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(';', 1)[0];
}

function refreshTransport(response: SupertestResponse): TokenTransport {
  if (env.AUTH_REFRESH_TRANSPORT === 'cookie') {
    const cookie = cookieFrom(response);
    if (!cookie) throw new Error('Expected a refresh cookie.');
    return { cookie };
  }
  const token = bodyOf(response).data?.refreshToken as string | undefined;
  if (!token) throw new Error('Expected a refresh token in the response body.');
  return { token };
}

function postWithRefresh(path: string, transport: TokenTransport) {
  const request = supertest(app).post(path);
  if (transport.cookie) return request.set('Cookie', transport.cookie).send({});
  return request.send({ refreshToken: transport.token });
}

async function register(email = 'hacker@example.com'): Promise<SupertestResponse> {
  return supertest(app)
    .post('/api/v1/auth/register')
    .send({ email, password, displayName: 'Hacker' });
}

function expectNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('passwordHash');
  expect(serialized).not.toContain('tokenHash');
}

beforeEach(async () => {
  await cleanTestDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('health', () => {
  it('returns live without consulting the database', async () => {
    const response = await supertest(
      createApp({ checkDatabase: async () => Promise.reject(new Error('down')) }),
    )
      .get('/health/live')
      .expect(200);
    expect(response.body).toEqual({ data: { status: 'alive' } });
  });

  it('returns ready when PostgreSQL answers SELECT 1', async () => {
    await supertest(app)
      .get('/health/ready')
      .expect(200, { data: { status: 'ready' } });
  });

  it('returns 503 without connection details when PostgreSQL is unavailable', async () => {
    const response = await supertest(
      createApp({ checkDatabase: async () => Promise.reject(new Error('postgresql://secret')) }),
    )
      .get('/health/ready')
      .expect(503);
    expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('postgresql://');
  });
});

describe('authentication', () => {
  it('registers a normalized user and never exposes hashes', async () => {
    const response = await supertest(app)
      .post('/api/v1/auth/register')
      .send({ email: '  Hacker@Example.COM ', password, displayName: '  Ryan  ' })
      .expect(201);
    expect(bodyOf(response).data.user).toMatchObject({
      email: 'hacker@example.com',
      displayName: 'Ryan',
      role: 'USER',
    });
    expect(bodyOf(response).data.accessToken).toEqual(expect.any(String));
    expectNoSecrets(response.body);
  });

  it('rejects invalid email and weak password with the validation envelope', async () => {
    for (const input of [
      { email: 'bad-email', password },
      { email: 'valid@example.com', password: 'weak' },
    ]) {
      const response = await supertest(app).post('/api/v1/auth/register').send(input).expect(400);
      expect(bodyOf(response).error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: '요청이 올바르지 않습니다.',
      });
      expect(bodyOf(response).error.details).toEqual(expect.any(Array));
    }
  });

  it('maps a normalized duplicate email to 409', async () => {
    await register('Duplicate@Example.com');
    const response = await register('duplicate@example.com');
    expect(response.status).toBe(409);
    expect(bodyOf(response).error.code).toBe('CONFLICT');
  });

  it('logs in with valid credentials and rejects a bad password', async () => {
    await register();
    const login = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'HACKER@example.com', password })
      .expect(200);
    expect(bodyOf(login).data.accessToken).toEqual(expect.any(String));
    expectNoSecrets(login.body);

    await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hacker@example.com', password: 'incorrect-password' })
      .expect(401);
  });

  it('protects users/me and returns only the public user for valid access', async () => {
    await supertest(app).get('/api/v1/users/me').expect(401);
    await supertest(app)
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer malformed')
      .expect(401);

    const registration = await register();
    const accessToken = bodyOf(registration).data.accessToken as string;
    const response = await supertest(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(bodyOf(response).data.email).toBe('hacker@example.com');
    expectNoSecrets(response.body);
  });

  it('rotates refresh tokens and rejects reuse of the previous token', async () => {
    const registration = await register();
    const original = refreshTransport(registration);
    const rotatedResponse = await postWithRefresh('/api/v1/auth/refresh', original).expect(200);
    const rotated = refreshTransport(rotatedResponse);
    expect(bodyOf(rotatedResponse).data.accessToken).toEqual(expect.any(String));
    expectNoSecrets(rotatedResponse.body);

    await postWithRefresh('/api/v1/auth/refresh', original).expect(401);
    await postWithRefresh('/api/v1/auth/refresh', rotated).expect(200);
  });

  it('allows only one of two concurrent refresh attempts', async () => {
    const registration = await register();
    const original = refreshTransport(registration);
    const results = await Promise.all([
      postWithRefresh('/api/v1/auth/refresh', original),
      postWithRefresh('/api/v1/auth/refresh', original),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 401]);
  });

  it('revokes the current session on logout', async () => {
    const registration = await register();
    const transport = refreshTransport(registration);
    await postWithRefresh('/api/v1/auth/logout', transport).expect(200, { data: null });
    await postWithRefresh('/api/v1/auth/refresh', transport).expect(401);
  });

  it('revokes every active session on logout-all', async () => {
    await register();
    const firstLogin = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hacker@example.com', password })
      .expect(200);
    const secondLogin = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hacker@example.com', password })
      .expect(200);

    const accessToken = bodyOf(firstLogin).data.accessToken as string;
    await supertest(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await postWithRefresh('/api/v1/auth/refresh', refreshTransport(firstLogin)).expect(401);
    await postWithRefresh('/api/v1/auth/refresh', refreshTransport(secondLogin)).expect(401);
  });
});

describe('OpenAPI and common HTTP behavior', () => {
  it('publishes every required path and the bearer scheme', async () => {
    const response = await supertest(app).get('/openapi.json').expect(200);
    const document = bodyOf(response);
    for (const path of [
      '/health/live',
      '/health/ready',
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/auth/logout-all',
      '/api/v1/users/me',
    ]) {
      expect(document.paths).toHaveProperty(path);
    }
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('uses the common 404 envelope and matching request IDs', async () => {
    const response = await supertest(app)
      .get('/does-not-exist')
      .set('X-Request-Id', 'test-request-id')
      .expect(404);
    expect(response.headers['x-request-id']).toBe('test-request-id');
    expect(bodyOf(response).error).toMatchObject({
      code: 'NOT_FOUND',
      requestId: 'test-request-id',
      details: [],
    });
  });
});
