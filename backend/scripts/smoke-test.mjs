#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const email = `smoke-${Date.now()}@example.com`;
const password = 'SmokeTest!2026';

function cookieFrom(response) {
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  return setCookie?.split(';', 1)[0];
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { response, body };
}

function expectStatus(result, status, label) {
  if (result.response.status !== status) {
    throw new Error(`${label}: expected ${status}, received ${result.response.status}`);
  }
  console.log(`✓ ${label} (${status})`);
}

function jsonRequest(body, extraHeaders = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

const live = await request('/health/live');
expectStatus(live, 200, 'live health');

const ready = await request('/health/ready');
expectStatus(ready, 200, 'ready health');

const openapi = await request('/openapi.json');
expectStatus(openapi, 200, 'OpenAPI document');

const registration = await request(
  '/api/v1/auth/register',
  jsonRequest({ email, password, displayName: 'Smoke Runner' }),
);
expectStatus(registration, 201, 'register');

const login = await request('/api/v1/auth/login', jsonRequest({ email, password }));
expectStatus(login, 200, 'login');

const accessToken = login.body?.data?.accessToken;
let refreshToken = login.body?.data?.refreshToken;
let refreshCookie = cookieFrom(login.response);
if (!accessToken || (!refreshToken && !refreshCookie)) {
  throw new Error('login response did not contain the expected token transport');
}

const me = await request('/api/v1/users/me', {
  headers: { authorization: `Bearer ${accessToken}` },
});
expectStatus(me, 200, 'users/me');

const originalRefreshToken = refreshToken;
const originalRefreshCookie = refreshCookie;
const refreshOptions = refreshCookie
  ? jsonRequest({}, { cookie: refreshCookie })
  : jsonRequest({ refreshToken });
const rotated = await request('/api/v1/auth/refresh', refreshOptions);
expectStatus(rotated, 200, 'refresh rotation');

refreshToken = rotated.body?.data?.refreshToken;
refreshCookie = cookieFrom(rotated.response);

const replayOptions = originalRefreshCookie
  ? jsonRequest({}, { cookie: originalRefreshCookie })
  : jsonRequest({ refreshToken: originalRefreshToken });
const replay = await request('/api/v1/auth/refresh', replayOptions);
expectStatus(replay, 401, 'rotated token reuse rejection');

const logoutOptions = refreshCookie
  ? jsonRequest({}, { cookie: refreshCookie })
  : jsonRequest({ refreshToken });
const logout = await request('/api/v1/auth/logout', logoutOptions);
expectStatus(logout, 200, 'logout');

const logoutReplay = await request('/api/v1/auth/refresh', logoutOptions);
expectStatus(logoutReplay, 401, 'logged-out token rejection');

console.log(`Smoke test passed against ${baseUrl}.`);
