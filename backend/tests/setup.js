// 🔴 테스트는 개발 DB(data/solar-for-bid.sqlite)를 건드리지 않는다.
//    실측 1: 테스트의 clearStudioResults() 가 개발 DB 의 Studio 결과 캐시(실제 크레딧으로 산 것)를 지웠다.
//    실측 2: node --test 는 파일마다 프로세스를 띄워 **동시에** 돌린다 — 한 파일의 clearStudioResults() 가 다른 파일의
//            「캐시에서 재사용」 검증을 가렸다. 그래서 파일(프로세스)마다 임시 DB 를 따로 쓴다.
//    env.js 는 process.env 를 .env 보다 먼저 본다.
import os from 'node:os';
import path from 'node:path';
process.env.DATABASE_FILE = process.env.DATABASE_FILE_TEST ?? path.join(os.tmpdir(), `solar-for-bid-test-${process.pid}.sqlite`);
