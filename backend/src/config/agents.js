import { DOC_TYPES } from './docTypes.js';

const str = (k) => (process.env[k] ?? '').trim();

/**
 * 갈래별 Studio 에이전트.
 * 🔴 여기가 **에이전트 ID를 넣는 유일한 자리**다. 나머지 7종은 값이 오면 .env에 채우면 된다.
 *    ID가 없어도 서버는 뜨고, 그 갈래는 Information Extraction 경로로 처리된다.
 */
export function agentFor(docTypeKey) {
  const t = DOC_TYPES.find((d) => d.key === docTypeKey);
  if (!t) return null;
  const agentId = str(t.agentEnv);
  if (!agentId) return null;
  return { agentId, configId: str(`${t.agentEnv}_CONFIG`) || str('STUDIO_CONFIG_VERSION') || null };
}

export function agentCoverage() {
  return DOC_TYPES.map((t) => ({ key: t.key, label: t.label, env: t.agentEnv, configured: Boolean(str(t.agentEnv)) }));
}
