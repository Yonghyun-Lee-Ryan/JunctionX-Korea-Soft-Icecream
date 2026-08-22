// 🔴 테스트는 개발 DB(data/solar-for-bid.sqlite)를 건드리지 않는다.
//    실측: 테스트의 clearStudioResults() 가 개발 DB 의 Studio 결과 캐시(실제 크레딧으로 산 것)를 지워
//    다음 실호출이 6 job 을 전부 다시 돌렸다. env.js 는 process.env 를 .env 보다 먼저 본다.
process.env.DATABASE_FILE = process.env.DATABASE_FILE_TEST ?? './data/test.sqlite';
