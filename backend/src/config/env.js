import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

// 🔴 `dotenv/config`는 **실행 위치(cwd)** 기준으로 .env를 찾는다.
//    레포 루트에서 `node backend/src/server.js`로 띄우면 조용히 아무것도 못 읽고,
//    그러면 에이전트 ID가 비어 모든 업로드가 E_AGENT_NOT_SET(503)으로 죽는다.
//    패키지 루트를 기준으로 읽는다. 이미 들어온 환경변수는 덮어쓰지 않는다(Docker 우선).
dotenv.config({ path: path.join(ROOT, '.env') });

const str = (key, fallback = '') => (process.env[key] ?? fallback).trim();
const int = (key, fallback) => {
  const raw = str(key);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
};
export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: int('PORT', 3000),
  corsOrigin: str('CORS_ORIGIN', '*'),

  databaseFile: path.resolve(ROOT, str('DATABASE_FILE', './data/solar-for-bid.sqlite')),

  studio: {
    apiKey: str('UPSTAGE_API_KEY'),
    agentId: str('STUDIO_AGENT_ID'),
    configVersion: str('STUDIO_CONFIG_VERSION'),
    baseUrl: str('STUDIO_BASE_URL', 'https://api.upstage.ai'),
    pollIntervalMs: int('STUDIO_POLL_INTERVAL_MS', 3000),
    pollTimeoutMs: int('STUDIO_POLL_TIMEOUT_MS', 300000),
  },

  g2b: {
    downloadUrl: str('G2B_DOWNLOAD_URL', 'https://www.g2b.go.kr/pn/pnp/pnpe/UntyAtchFile/downloadFile.do'),
    // 🔴 UA가 없으면 G2B가 HTTP 500을 준다. 빈 문자열로 두지 않는다
    userAgent: str('G2B_USER_AGENT', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'),
    maxFileSeq: int('G2B_MAX_FILE_SEQ', 30),
    serviceKey: str('DATA_GO_KR_SERVICE_KEY'),
    // 🔴 `/1230000/ad/...` 만 유효하다. 구 경로 `/1230000/...` 는 코드 12로 폐기됐다(실호출 확인)
    openApiBase: str('DATA_GO_KR_BASE', 'https://apis.data.go.kr/1230000/ad'),
    listWindowDays: int('G2B_LIST_WINDOW_DAYS', 14),
    listMaxRows: int('G2B_LIST_MAX_ROWS', 300),
  },

  demo: {
    liveFallbackMs: int('LIVE_FALLBACK_MS', 20000),
    caseId: str('DEMO_CASE_ID', 'R25BK00645031-000'),
  },
};

/**
 * 🔴 여기서 절대 throw 하지 않는다.
 * WBS X1의 DoD가 「환경변수가 비어 있어도 부팅」이다 — 키가 없으면 캐시 응답으로 떨어질 뿐,
 * 서버가 안 뜨면 프론트가 붙을 곳이 사라진다.
 */
export function envReport() {
  return {
    hasApiKey: Boolean(env.studio.apiKey),
    studioReady: Boolean(env.studio.apiKey),
    listSourceReady: Boolean(env.g2b.serviceKey),
    databaseFile: env.databaseFile,
  };
}
