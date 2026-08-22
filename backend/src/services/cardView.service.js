import { parseJson } from '../db/index.js';
import * as companyRepo from '../repositories/company.repo.js';
import { AppError } from '../errors/AppError.js';
import { DOC_TYPE_MAP } from '../config/docTypes.js';

/**
 * 저장된 회사 카드를 **화면이 그대로 그릴 수 있는 모양**으로 조립한다.
 *
 * 🔴 계약은 바깥 구조다 — stats[] · sections[] · rows[]. 프론트는 라벨로 분기하지 않는다.
 * 🔴 **값을 지어내지 않는다.** 서류에서 못 읽은 것은 `status:"unverified"`로 두고
 *    `unverified` 섹션에 「직접 입력」 자리를 만든다. 0으로 채우지 않는다.
 * 🔴 문장은 서버가 만든다. 프론트가 한국어를 짓지 않는다(WBS 규율).
 */

const FINANCIAL_HINTS = ['은행', '보험', '증권', '카드', '금융', '캐피탈', '저축은행', '금고', '공제회'];

/** 원 단위 정수를 사람이 읽는 한국어 금액으로. 🔴 반올림해서 값을 바꾸지 않는다 */
export function koMoney(v) {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  const neg = n < 0;
  let x = Math.abs(n);
  const parts = [];
  const units = [[100000000, '억'], [10000, '만']];
  for (const [size, name] of units) {
    const q = Math.floor(x / size);
    if (q > 0) { parts.push(`${q.toLocaleString('ko-KR')}${name}`); x -= q * size; }
  }
  if (x > 0 || parts.length === 0) parts.push(x.toLocaleString('ko-KR'));
  return `${neg ? '-' : ''}${parts.join(' ')}원`;
}

/** 억 단위 짧은 표기 (지표 타일용). 예: 612000000 → '6.12억' */
export function shortMoney(v) {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2).replace(/\.?0+$/, '')}억`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return n.toLocaleString('ko-KR');
}

const row = (label, value, source, { status = 'confirmed', action = null } = {}) => ({
  label,
  value: value ?? null,
  source: source ?? null,
  // confirmed | unverified | missing
  status: value == null || value === '' ? 'missing' : status,
  ...(action ? { action } : {}),
});

export function buildCardView(companyId) {
  const company = companyRepo.findCompany(companyId);
  if (!company) throw new AppError('E_COMPANY_NOT_FOUND');

  const docs = companyRepo.listCompanyDocuments(companyId);
  /** docTypeKey → { data, filename } */
  const byKey = {};
  for (const d of docs) {
    if (!d.docClass) continue;
    byKey[d.docClass] = { data: d.extracted ?? {}, filename: d.filename, confidence: d.confidence };
  }
  const get = (k) => byKey[k];
  const file = (k) => byKey[k]?.filename ?? null;
  const val = (k, ...keys) => {
    const data = byKey[k]?.data;
    if (!data) return null;
    for (const key of keys) {
      const v = data[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
  };

  // ── 실적 집계 ─────────────────────────────────────────
  const perf = get('performance')?.data ?? {};
  const subtotals = Array.isArray(perf.summary_table_category_subtotals) ? perf.summary_table_category_subtotals : [];
  const records = Array.isArray(perf.summary_table_service_performance_records) ? perf.summary_table_service_performance_records : [];
  const sub = (name) => subtotals.find((s) => String(s.subtotal_category_name ?? '').includes(name));

  const pmo = sub('PMO');
  const maxContract = records.reduce((m, r) => Math.max(m, Number(r.contract_amount) || 0), 0);

  // 🔴 「금융 PMO 0」은 세계에 대한 주장이 아니다 — **제출된 실적증명서 안에** 금융기관
  //    발주 건이 없다는 사실이다. 서류가 없으면 0이 아니라 미확인이다.
  const financialCount = records.length === 0
    ? null
    : records.filter((r) => FINANCIAL_HINTS.some((h) => String(r.ordering_organization ?? '').includes(h))).length;

  // ── 인력 ──────────────────────────────────────────────
  const staff = get('tech_staff')?.data ?? {};
  const grades = Array.isArray(staff.technical_grade_holding_status) ? staff.technical_grade_holding_status : [];
  const gradeText = grades.length
    ? grades.filter((g) => g.technical_grade && !String(g.technical_grade).includes('합계'))
        .map((g) => `${g.technical_grade} ${g.total_count}`).join('・')
    : null;
  const topGrades = grades.filter((g) => ['기술사', '특급'].includes(String(g.technical_grade)))
    .map((g) => `${g.technical_grade} ${g.total_count}명`).join('・') || null;

  // ── 재무 ──────────────────────────────────────────────
  const fin = get('financial')?.data ?? {};
  const years = Array.isArray(fin.recent_3_year_sales) ? fin.recent_3_year_sales : [];
  const latestYear = years
    .filter((y) => y.period_end_date && !/합계|소계|평균/.test(String(y.fiscal_year_label ?? '')))
    .sort((a, b) => String(a.period_end_date).localeCompare(String(b.period_end_date)))
    .at(-1);

  const rating = val('credit_rating', 'company_credit_rating');
  const ratingUntil = val('credit_rating', 'rating_valid_to_date');

  // ── 지표 타일 4 ───────────────────────────────────────
  const stats = [
    {
      id: 'pmo',
      label: '공공 정보화 PMO 실적',
      value: pmo ? `${pmo.subtotal_case_count}건` : null,
      sub: '최근 3년',
      status: pmo ? 'confirmed' : 'missing',
    },
    {
      id: 'max_contract',
      label: '최대 단일 계약',
      value: maxContract > 0 ? shortMoney(maxContract) : null,
      sub: '원',
      status: maxContract > 0 ? 'confirmed' : 'missing',
    },
    {
      id: 'staff',
      label: '기술인력',
      value: staff.total_personnel_count != null ? `${staff.total_personnel_count}명` : null,
      sub: topGrades,
      status: staff.total_personnel_count != null ? 'confirmed' : 'missing',
    },
    {
      id: 'credit',
      label: '신용 평가 등급',
      value: rating ?? null,
      sub: ratingUntil ? `~${ratingUntil}` : null,
      status: rating ? 'confirmed' : 'missing',
    },
  ];

  // ── 섹션 ──────────────────────────────────────────────
  // 🔴 열 배치는 서버가 정한다 — 프론트가 id로 분기하면 섹션이 늘 때마다 화면 코드가 바뀐다.
  //    좁은 화면에서는 프론트가 열을 접는다(column은 «희망 열»이지 강제가 아니다).
  const basic = {
    id: 'basic',
    column: 0,
    title: '기본・등록',
    rows: [
      row('사업자등록번호', val('biz_reg', '등록번호'), file('biz_reg')),
      row('설립', val('biz_reg', '개업연월일')?.toString().slice(0, 4)?.concat('년') ?? null, file('biz_reg')),
      row('소재지', val('biz_reg', '사업장소재지'), file('biz_reg')),
      row('기업규모', val('sme_cert', 'company_size_classification'), file('sme_cert')),
      row('감리법인',
        (val('biz_reg', '사업의종류') ?? []).some?.((x) => String(x?.종목 ?? '').includes('감리')) ? '등록' : null,
        file('biz_reg')),
      row('영향 평가기관',
        val('pia_designation', 'designation_date')
          ? `지정 (${String(val('pia_designation', 'designation_date')).slice(0, 7)})`
          : null,
        file('pia_designation')),
    ],
  };

  const performance = {
    id: 'performance',
    column: 1,
    title: '실적 (최근 3년)',
    chips: [
      ...(pmo ? [{ label: `공공 PMO ${pmo.subtotal_case_count}`, tone: 'success' }] : []),
      ...(financialCount === null
        ? [{ label: '금융 PMO 미확인', tone: 'neutral' }]
        : [{ label: `금융 PMO ${financialCount}`, tone: financialCount === 0 ? 'danger' : 'info' }]),
      ...subtotals
        .filter((s) => !String(s.subtotal_category_name).includes('PMO'))
        .map((s) => ({ label: `${s.subtotal_category_name} ${s.subtotal_case_count}`, tone: 'info' })),
    ],
    rows: [
      row('최대 단일 계약', maxContract > 0 ? koMoney(maxContract) : null, file('performance')),
      row('합계', perf.summary_table_total_amount ? koMoney(perf.summary_table_total_amount) : null, file('performance')),
      row('공동수급', null, '직접 입력', { status: 'unverified', action: 'manual' }),
    ],
  };

  const staffSection = {
    id: 'staff',
    column: 1,
    title: '인력',
    rows: [row('등급별', gradeText, file('tech_staff'))],
  };

  const finance = {
    id: 'finance',
    column: 2,
    title: '재무',
    rows: [
      row('직전연도 매출', latestYear ? koMoney(latestYear.sales_amount) : null, file('financial')),
      row('신용평가등급', rating ? [rating, ratingUntil].filter(Boolean).join('・') : null, file('credit_rating')),
    ],
  };

  // 🔴 서류에서 못 읽은 항목. 0으로 채우지 않고 「직접 입력」 자리를 만든다
  const manual = [
    row('자본금', null, null, { action: 'manual' }),
    row('부채비율', null, null, { action: 'manual' }),
  ];
  const unverified = {
    id: 'unverified',
    column: 2,
    title: `미확인 ${manual.length}건`,
    note: '서류에서 읽지 못하였습니다. 직접 입력하실 수 있습니다.',
    rows: manual,
  };

  return {
    companyId: company.id,
    name: company.name,
    bizNo: company.biz_no ?? null,
    savedAt: parseJson(company.card_json, {}).savedAt ?? company.updated_at,
    stats,
    sections: [basic, performance, staffSection, finance, unverified],
    documents: docs.map((d) => ({
      docTypeKey: d.docClass,
      label: DOC_TYPE_MAP[d.docClass]?.label ?? d.docClass,
      filename: d.filename,
      confidence: d.confidence ?? null,
    })),
  };
}

/** 🔴 저장된 회사가 있으면 첫 화면을 등록이 아니라 카드로 연다 */
export function findCurrentCompany() {
  return companyRepo.findLatestCompany();
}
