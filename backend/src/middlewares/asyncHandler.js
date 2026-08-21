/** async 라우트 핸들러의 reject를 express 에러 파이프로 보낸다 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
