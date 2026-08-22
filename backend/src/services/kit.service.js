import { cell, chipCell } from '../config/kitCells.js';
import { KIT_PAGES, KIT_PRIMARY_ACTION, KIT_SECONDARY_ACTION } from '../config/kitPages.js';

/**
 * 판정 출력 → 응찰 준비(Bid Kit) 탭 봉투.
 *
 * 🔴 계약은 바깥 구조다 — tabs[].{id,title,kind,columns,rows|items|metric|banner|note}.
 *    프론트는 tab id 로 분기하지 않고 kitPages 의 배치대로 그린다. 문장도 여기서 만든다.
 * 🔴 있는 것만 그린다. 아직 안 돌린 판정의 탭은 내지 않는다 — 빈 표 대신 「아직 없음」이 화면의 몫이다.
 * 🔴 색은 값을 아는 쪽(여기)이 정한다 — kitCells 의 tone 어휘(ok/warn/danger/muted/proviso)로.
 */

const str = (v) => (v === null || v === undefined ? '' : String(v));
const dash = (v) => (str(v).trim() ? str(v).trim() : '-');
const num = (v) => Number(v) || 0;
const mm = (v) => (Math.round(num(v) * 10) / 10).toFixed(1);

const STATUS_TONE = { '준비됨': 'ok', '보완 필요': 'warn', '미확인': 'muted' };

export function buildKit({ announcement, eligibility, plan, submission, caseId } = {}) {
  const audit = submission?.audit;
  const builders = {
    submitfiles: () => announcement && submitfilesTab(announcement, audit),
    compliance: () => announcement && complianceTab(announcement),
    wbs: () => plan?.wbs && wbsTab(plan.wbs),
    criticalpath: () => plan?.criticalPath && criticalpathTab(plan.criticalPath),
    cost: () => plan?.criticalPath && costTab(plan.criticalPath),
    constraints: () => announcement && constraintsTab(announcement, audit),
    checklist: () => audit && checklistTab(audit),
    rework: () => audit && reworkTab(audit),
    phrases: () => audit && phrasesTab(audit),
  };

  // kitPages 의 배치 순서대로, 입력이 있는 탭만
  const tabs = KIT_PAGES
    .flatMap((p) => p.tabs.map((t) => t.id))
    .map((id) => builders[id]?.())
    .filter(Boolean);

  const kit = { tabs, kitPages: KIT_PAGES, kitPrimaryAction: KIT_PRIMARY_ACTION, kitSecondaryAction: KIT_SECONDARY_ACTION };
  if (eligibility) kit.verdict = verdictOf(eligibility);
  if (caseId && plan?.wbs) {
    // 🔴 조견표(compliance)는 웹 체크리스트라 파일이 없다. WBS·임계경로만 xlsx
    kit.downloads = ['wbs', 'criticalpath']
      .filter((id) => tabs.some((t) => t.id === id))
      .map((id) => ({ id, label: id === 'wbs' ? 'WBS.xlsx' : '임계경로.xlsx', url: `/api/cases/${caseId}/files/${id}.xlsx` }));
  }
  return kit;
}

// ── verdict (화면③④ 상단) ─────────────────────────────────────────────────
function verdictOf(e) {
  const checks = Array.isArray(e.checks) ? e.checks : [];
  return {
    badge: 'eligible',
    excluded: e.verdict === '제외',
    unverified: num(e.unverified_count),
    decision: 'pending',
    headline: str(e.headline),
    reasons: checks.map((c) => ({
      text: `${str(c.label)} — ${str(c.status)}`,
      page: num(c.announcement_page),
      docId: str(c.company_source_document),
      confidence: c.status === '[확인필요]' ? 'unknown' : num(c.announcement_page) > 0 ? 'high' : 'low',
    })),
  };
}

// ── 화면⑥ 파일제출 ───────────────────────────────────────────────────────
function submitfilesTab(ann, audit) {
  const docs = Array.isArray(audit?.documents) ? audit.documents : [];
  const sameDoc = (a, b) => {
    const x = str(a).replace(/\s+/g, ''); const y = str(b).replace(/\s+/g, '');
    return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x));
  };
  const items = (Array.isArray(ann.submission_requirements) ? ann.submission_requirements : [])
    .filter((s) => s.submission_stage === 'BID')
    .map((s) => {
      const matched = docs.find((d) => sameDoc(d.name, s.name));
      const done = Boolean(matched?.matched_file);
      return {
        title: str(s.name),
        filename: done ? str(matched.matched_file) : '업로드 되지 않음',
        state: done ? 'done' : 'missing',
        label: done ? str(matched.status) : '업로드',
      };
    });
  const done = items.filter((i) => i.state === 'done').length;
  return {
    id: 'submitfiles', title: '필요한 서류', kind: 'docs', items,
    summary: audit
      ? `제출 서류 ${items.length}건 · 검사에서 ${done}건이 올린 파일과 연결됐습니다.`
      : '제출 서류 적격 판단은 아직 연결되지 않았습니다 — 제출 검사를 돌리면 상태가 채워집니다.',
  };
}

// ── 화면⑦ 요구사항 체크리스트 ──────────────────────────────────────────────
function complianceTab(ann) {
  const reqs = Array.isArray(ann.requirements) ? ann.requirements : [];
  const rows = reqs.map((r) => {
    const note = str(r.note_clause).trim();
    return [
      str(r.requirement_id),
      str(r.requirement_category),
      str(r.requirement_name),
      note ? cell(note, 'proviso') : '-',
      `${num(r.source_page)}p`,
    ];
  });
  const declared = num(ann.requirement_count);
  const warnings = declared && declared !== rows.length
    ? [cell(`총괄표 ${declared}건 · 추출 ${rows.length}건 — 검산 불일치`, 'warn')]
    : [];
  return {
    id: 'compliance', title: '요구사항 체크리스트', kind: 'checklist',
    columns: ['요구사항 ID', '분류', '명칭', '단서', '근거 페이지'],
    columnAlign: ['left', 'left', 'left', 'left', 'right'],
    rows,
    warnings,
    summary: `${rows.length}건 · 웹에서 한 행씩 체크합니다 — xlsx 없음`,
  };
}

// ── 화면⑧ WBS ─────────────────────────────────────────────────────────────
function wbsTab(wbs) {
  const packages = Array.isArray(wbs.work_packages) ? wbs.work_packages : [];
  const rows = packages.map((p) => [
    str(p.wbs_id),
    str(p.name),
    str(p.deliverable),
    (Array.isArray(p.predecessors) && p.predecessors.length) ? p.predecessors.map(str).join('·') : '-',
    str(p.duration).trim() || '미 명시',
    (Array.isArray(p.effort_mm) ? p.effort_mm : []).map((e) => `${str(e.grade)} ${num(e.mm)}`).join('・'),
    (Array.isArray(p.requirement_refs) ? p.requirement_refs : []).map(str).join('·'),
    String(num(p.source_page)),
  ]);
  const unspecified = rows.filter((r) => r[4] === '미 명시').length;
  const warnings = [`기간 명시 ${rows.length - unspecified}건 / 미 명시 ${unspecified}건`];
  const unlinked = Array.isArray(wbs.validation?.unlinked_requirement_ids) ? wbs.validation.unlinked_requirement_ids : [];
  if (unlinked.length) warnings.push(cell(`요구사항 미연결 ${unlinked.length}건: ${unlinked.join(', ')}`, 'warn'));
  const unknown = Array.isArray(wbs.validation?.unknown_requirement_refs) ? wbs.validation.unknown_requirement_refs : [];
  if (unknown.length) warnings.push(cell(`공고에 없는 요구사항 ID ${unknown.length}건: ${unknown.join(', ')}`, 'danger'));
  return {
    id: 'wbs', title: 'WBS', kind: 'table',
    columns: ['ID', '작업 패키지', '산출물', '선행', '기간', 'M/M', '근거요구', 'P'],
    columnAlign: ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right'],
    rows,
    warnings,
    summary: '기간은 문서를 참고해주세요. 없으면 「미 명시」로 표기합니다. - M/M은 추천값입니다.',
  };
}

// ── 화면⑧ 임계경로 ────────────────────────────────────────────────────────
function criticalpathTab(cp) {
  const path = Array.isArray(cp.critical_path) ? cp.critical_path : [];
  return {
    id: 'criticalpath', title: '임계경로', kind: 'table',
    columns: ['작업', '남은 일'],
    columnAlign: ['left', 'right'],
    rows: path.map((c) => [str(c.item), cell(str(c.due_label) || '[확인필요]', str(c.severity) || 'default')]),
    warnings: ['리드타임은 공고가 명시한 처리기간만 반영했습니다 — 없으면 [확인필요]'],
  };
}

// ── 화면⑧ M/M 예상 원가 ───────────────────────────────────────────────────
function costTab(cp) {
  const cost = cp.cost_estimate ?? {};
  const byGrade = Array.isArray(cost.by_grade) ? cost.by_grade : [];
  const refs = Array.isArray(cost.references) ? cost.references : [];
  return {
    id: 'cost', title: 'M/M 예상 원가 (추천)', kind: 'metric',
    metric: {
      value: mm(cost.total_mm),
      unit: 'M/M',
      caption: byGrade.map((g) => `${str(g.grade)} ${mm(g.mm)}`).join('・'),
      note: `금액 환산 - ${str(cost.amount_note).trim() || '단가 미입력 · 회사 카드에 등급별 단가가 있을 때만'}`,
      evidence: refs.map((r) => `${str(r.label)}・공고 p${num(r.page)}`),
    },
    summary: '투찰가 아님',
  };
}

// ── 화면⑨ 제출 제약 배너 ─────────────────────────────────────────────────
function constraintsTab(ann, audit) {
  const src = audit?.submission_constraints ?? {};
  const pick = (auditKey, annKey) => str(src[auditKey]).trim() || str(ann[annKey]).trim();
  const method = pick('method', 'constraint_method');
  const deadline = pick('deadline', 'constraint_deadline');
  const copies = pick('proposal_copies', 'constraint_proposal_copies');
  const pageLimit = pick('page_limit', 'constraint_page_limit');
  const sealed = pick('price_proposal_sealed', 'constraint_price_sealed');
  const page = num(src.source_page) || num(ann.constraint_source_page);
  return {
    id: 'constraints', title: '제출 제약', kind: 'banner',
    banner: {
      label: '제출 제약',
      text: [method, deadline && `마감 ${deadline}`, copies && `제안서 ${copies}부`, pageLimit, sealed].filter(Boolean).join('・') || '제출 제약을 공고에서 읽지 못했습니다',
      evidence: page ? `공고문 p${page}` : '',
    },
  };
}

// ── 화면⑨ 제출 서류 표 ───────────────────────────────────────────────────
function checklistTab(audit) {
  const docs = Array.isArray(audit.documents) ? audit.documents : [];
  return {
    id: 'checklist', title: '제출 서류', kind: 'table',
    columns: ['서류', '부수', '유효기간', '상태', '보완요청・리드타임', 'P'],
    columnAlign: ['left', 'right', 'left', 'left', 'left', 'right'],
    rows: docs.map((d) => [
      str(d.name),
      dash(d.copies),
      dash(d.validity),
      chipCell(str(d.status) || '미확인', STATUS_TONE[str(d.status)] ?? 'muted'),
      [str(d.rework_note).trim(), str(d.lead_time).trim()].filter(Boolean).join(' · ') || '-',
      String(num(d.source_page)),
    ]),
    summary: `${docs.length}건 · 준비됨 ${num(audit.summary?.ready_count)} · 보완 필요 ${num(audit.summary?.rework_count)} · 미확인 ${num(audit.summary?.unverified_count)}`,
  };
}

// ── 화면⑨ 보완요청 ──────────────────────────────────────────────────────
function reworkTab(audit) {
  const reqs = Array.isArray(audit.rework_requests) ? audit.rework_requests : [];
  return {
    id: 'rework', title: `보완요청 ${reqs.length}건`, kind: 'tasks',
    items: reqs.map((r) => ({
      title: str(r.document),
      chip: { text: '보완 필요', tone: 'warn' },
      detail: str(r.reason),
      action: { label: str(r.action).trim() || '보완 자료 올리기', kind: 'upload' },
    })),
    summary: '사람이 검토한 뒤 보완 자료를 올리면 다시 검사합니다.',
  };
}

// ── 화면⑨ 금지 표현 ─────────────────────────────────────────────────────
function phrasesTab(audit) {
  const fe = audit.forbidden_expressions ?? {};
  const items = Array.isArray(fe.items) ? fe.items : [];
  const absent = items.length === 0 && str(fe.rule_note).includes('미제출');
  if (absent) {
    return {
      id: 'phrases', title: '금지 표현 검사', kind: 'note',
      note: { body: '제안서 원고가 없어 금지 표현을 검사하지 못했습니다. 원고를 올리면 다시 검사합니다.', emphasis: '미제출', evidence: '' },
    };
  }
  const count = items.length;
  const rulePage = num(items.find((i) => num(i.rule_source_page) > 0)?.rule_source_page);
  return {
    id: 'phrases', title: '금지 표현 검사', kind: 'note',
    note: {
      body: `제안서 원고에서 「가능하다」・「고려할 수 있다」 류 ${count}곳 - 평가에서 불가능한 것으로 간주되는 표현입니다.`,
      emphasis: `${count}곳`,
      evidence: rulePage ? `RFP p${rulePage}` : str(fe.rule_note),
      items: items.map((i) => ({ expression: str(i.expression), sentence: str(i.sentence), page: num(i.proposal_page) })),
    },
  };
}
