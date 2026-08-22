import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '../src/services/pdfText.service.js';
import { classifyByRules } from '../src/services/classify.service.js';
import { normalize } from '../src/config/docTypes.js';

const DEMO = path.resolve('../plan/Solar_for_Bid/06_데모입력');
const CASES = {
  biz_reg: '사업자등록증', sme_cert: '중소기업확인서', credit_rating: '신용평가등급확인서',
  pia_designation: '개인정보영향평가기관지정서', sw_business: '소프트웨어사업자신고확인서',
  performance: '실적증명서', financial: '재무제표', tech_staff: '기술인력보유현황',
};

test('normalize는 자간을 지운다 — 「사 업 자 등 록 증」이 그대로면 하나도 안 걸린다', () => {
  assert.equal(normalize('사 업 자 등 록 증'), '사업자등록증');
});

for (const [expected, base] of Object.entries(CASES)) {
  const file = path.join(DEMO, `${base}_다온피엠씨_가상.pdf`);
  test(`${base} → ${expected}`, { skip: !fs.existsSync(file) && '견본 PDF 없음' }, async () => {
    const { text } = await extractPdfText(fs.readFileSync(file));
    const r = classifyByRules(text);
    assert.equal(r.key, expected);
    assert.equal(r.confidence, 'high');
  });
}

test('PDF가 아니면 거부한다', async () => {
  await assert.rejects(() => extractPdfText(Buffer.from('not a pdf')), (e) => e.code === 'E_UNSUPPORTED_FILE');
});

test('빈 텍스트는 아무 갈래도 고르지 않는다 — 억지로 넣지 않는다', () => {
  const r = classifyByRules('상호 대표자 소재지');
  assert.equal(r.key, null);
  assert.equal(r.confidence, 'unknown');
});
