import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFilename } from '../src/services/g2b.service.js';

test('content-disposition percent-encoded UTF-8을 푼다', () => {
  const cd = "attachment; filename=\"%EC%A0%9C%EC%95%88%EC%9A%94%EC%B2%AD%EC%84%9C.hwp\"";
  assert.equal(decodeFilename(cd, 'x.bin'), '제안요청서.hwp');
});

test('RFC 5987 filename* 형식도 푼다', () => {
  const cd = "attachment; filename=\"a.hwp\"; filename*=UTF-8''%EA%B3%B5%EA%B3%A0%EB%AC%B8.hwp";
  assert.equal(decodeFilename(cd, 'x.bin'), '공고문.hwp');
});

test('헤더가 없으면 fallback', () => {
  assert.equal(decodeFilename(null, 'fallback.bin'), 'fallback.bin');
});
