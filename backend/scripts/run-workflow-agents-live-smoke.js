#!/usr/bin/env node
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error(`잘못된 인자입니다: ${key ?? ''}`);
    values[key.slice(2)] = value;
  }
  return values;
}

async function loadCompanyDocuments(directory) {
  const entries = (await fs.readdir(directory))
    .filter((name) => name.endsWith('_Extract.json'))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  if (entries.length === 0) throw new Error(`회사 Extract JSON을 찾지 못했습니다: ${directory}`);
  return Promise.all(entries.map(async (filename) => ({
    filename,
    data: JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8')),
  })));
}

function mimeTypeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  return ({
    '.pdf': 'application/pdf',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.hwp': 'application/x-hwp',
    '.hwpx': 'application/vnd.hancom.hwpx',
  })[extension] ?? 'application/octet-stream';
}

async function callEndpoint(baseUrl, endpoint, buffer, filename, mimeType) {
  const startedAt = Date.now();
  const boundary = `----sfb-live-${Date.now().toString(16)}`;
  const wireFilename = Buffer.from(filename, 'utf8').toString('latin1');
  const head = Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${wireFilename}"`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join('\r\n'), 'latin1');
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1');
  const requestBody = Buffer.concat([head, buffer, tail]);
  const target = new URL(endpoint, baseUrl);
  const { status, headers, raw } = await new Promise((resolve, reject) => {
    const request = http.request(target, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': requestBody.length,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        raw: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.setTimeout(env.workflowAgents.pollTimeoutMs + 60_000, () => {
      request.destroy(new Error('로컬 API 응답 제한 시간을 초과했습니다.'));
    });
    request.on('error', reject);
    request.end(requestBody);
  });
  if (status < 200 || status >= 300) {
    throw new Error(`${endpoint} 실패 (${status}): ${raw.slice(0, 500)}`);
  }
  const contentType = headers['content-type'] ?? '';
  return {
    value: contentType.includes('application/json') ? JSON.parse(raw) : raw.trim(),
    status,
    elapsedMs: Date.now() - startedAt,
  };
}

async function writeJson(outputDir, filename, value) {
  await fs.writeFile(path.join(outputDir, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function recordCall(summary, endpoint, run) {
  try {
    const result = await run();
    summary.calls.push({ endpoint, status: result.status, elapsedMs: result.elapsedMs });
    return result;
  } catch (err) {
    summary.calls.push({ endpoint, status: 'failed', error: err?.message ?? String(err) });
    console.error(`[${endpoint}] ${err?.message ?? err}`);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const announcementInput = args['announcement-file'] ?? args['announcement-pdf'];
  if (!announcementInput && !args['document-info']) {
    throw new Error('사용법: npm run test:agents:live -- (--announcement-file <FILE> | --document-info <JSON>) [--company-dir <DIR>] [--output-dir <DIR>] [--skip-wps true] [--skip-company true] [--skip-submission true]');
  }
  if (!env.workflowAgents.apiKey) throw new Error('backend/.env의 UPSTAGE_AGENT_API_KEY가 비어 있습니다.');

  const announcementFile = announcementInput ? path.resolve(announcementInput) : null;
  const savedDocumentInfo = args['document-info'] ? path.resolve(args['document-info']) : null;
  const companyDir = path.resolve(
    args['company-dir'] ?? path.join(REPO_ROOT, 'plan', 'Solar_for_Bid', '06_데모입력'),
  );
  const outputDir = args['output-dir']
    ? path.resolve(args['output-dir'])
    : await fs.mkdtemp('/private/tmp/sfb-workflow-live-');
  await fs.mkdir(outputDir, { recursive: true });

  const server = createApp().listen(0, '127.0.0.1');
  server.requestTimeout = env.workflowAgents.pollTimeoutMs + 30_000;
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const summary = { outputDir, calls: [] };

  try {
    let announcement;
    if (savedDocumentInfo) {
      announcement = { value: JSON.parse(await fs.readFile(savedDocumentInfo, 'utf8')) };
      await writeJson(outputDir, '01-announcement.json', announcement.value);
      console.log(`[1/4] 기존 Announcement 결과 재사용: ${savedDocumentInfo}`);
    } else {
      console.log('[1/4] Announcement 실호출 시작');
      announcement = await callEndpoint(
        baseUrl,
        '/api/agents/announcement-decomposition',
        await fs.readFile(announcementFile),
        path.basename(announcementFile),
        mimeTypeFor(announcementFile),
      );
      await writeJson(outputDir, '01-announcement.json', announcement.value);
      summary.calls.push({ endpoint: 'announcement-decomposition', ...announcement, value: undefined });
      console.log(`[1/4] 완료 (${announcement.elapsedMs}ms)`);
    }

    const companyDocuments = await loadCompanyDocuments(companyDir);
    const documentInfo = Buffer.from(JSON.stringify(announcement.value), 'utf8');

    console.log('[2/4] WPS CP Decomposer 실호출 시작');
    const wps = args['skip-wps'] === 'true'
      ? null
      : await recordCall(summary, 'wps-cp-decomposer', () => callEndpoint(
        baseUrl,
        '/api/agents/wps-cp-decomposer',
        documentInfo,
        'document-info.json',
        'application/json',
      ));
    if (wps) {
      await writeJson(outputDir, '02-wps-cp.json', wps.value);
      console.log(`[2/4] 완료 (${wps.elapsedMs}ms)`);
    } else if (args['skip-wps'] === 'true') {
      console.log('[2/4] 이전 WPS 실호출 결과를 사용해 생략');
    }

    const companyAndDocumentInfo = Buffer.from([
      'COMPANY_DATA',
      JSON.stringify({ company_documents: companyDocuments }),
      'DOCUMENT_INFO',
      JSON.stringify(announcement.value),
    ].join('\n\n'), 'utf8');

    console.log('[3/4] Company Bid Fit 실호출 시작');
    const company = args['skip-company'] === 'true'
      ? null
      : await recordCall(summary, 'company-bid-fit', async () => {
        const result = await callEndpoint(
          baseUrl,
          '/api/agents/company-bid-fit',
          companyAndDocumentInfo,
          'company-and-document-info.txt',
          'text/plain',
        );
        if (result.value !== 'GO' && result.value !== 'NO-GO') {
          throw new Error(`Company 결과가 GO/NO-GO가 아닙니다: ${result.value}`);
        }
        return result;
      });
    if (company) {
      await fs.writeFile(path.join(outputDir, '03-company-bid-fit.txt'), `${company.value}\n`, 'utf8');
      console.log(`[3/4] 완료 (${company.elapsedMs}ms): ${company.value}`);
    } else if (args['skip-company'] === 'true') {
      console.log('[3/4] 이전 Company 실호출 결과를 사용해 생략');
    }

    const submissionInput = Buffer.from(JSON.stringify({
      company_documents: companyDocuments,
      document_info: announcement.value,
    }), 'utf8');

    console.log('[4/4] Submission Package Compliance 실호출 시작');
    const submission = args['skip-submission'] === 'true'
      ? null
      : await recordCall(summary, 'submission-compliance', () => callEndpoint(
        baseUrl,
        '/api/agents/submission-compliance',
        submissionInput,
        'submission-input.json',
        'application/json',
      ));
    if (submission) {
      await writeJson(outputDir, '04-submission-compliance.json', submission.value);
      console.log(`[4/4] 완료 (${submission.elapsedMs}ms)`);
    } else if (args['skip-submission'] === 'true') {
      console.log('[4/4] 이전 Submission 실호출 결과를 사용해 생략');
    }

    await writeJson(outputDir, 'summary.json', summary);
    console.log(`실호출 결과 저장: ${outputDir}`);
    if (summary.calls.some((call) => call.status === 'failed')) {
      throw new Error('하나 이상의 Workflow Agent 실호출이 실패했습니다. summary.json을 확인하세요.');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exitCode = 1;
});
