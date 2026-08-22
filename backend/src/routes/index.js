import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { casesRouter } from './cases.routes.js';
import { companiesRouter } from './companies.routes.js';
import { docsRouter } from './docs.routes.js';
import { judgeRouter } from './judge.routes.js';

export const router = Router();

// 🔴 라우트는 `/api/cases/` **복수형**으로 통일한다 (WBS 결정 12).
//    이미 커밋된 factsheet.demo.json의 downloads[].url이 복수형이고, 그쪽이 정본이다.
router.use('/', healthRouter);
router.use('/api', casesRouter);
router.use('/api', companiesRouter);
router.use('/api', docsRouter);
// 🔴 판정 층 — Studio Instruct 대신 Solar Chat API (backend/HANDOFF-solar-judgment.md)
router.use('/api', judgeRouter);
