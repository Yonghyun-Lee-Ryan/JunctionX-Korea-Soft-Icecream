import { ERROR_CODES } from './codes.js';

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} [message] 기본 문장을 덮어쓸 때만. 🔴 사람이 읽는 완성문이어야 한다
   * @param {object} [detail] 로그용. 응답에는 담지 않는다
   */
  constructor(code, message, detail) {
    const spec = ERROR_CODES[code] ?? ERROR_CODES.E_INTERNAL;
    super(message ?? spec.message);
    this.name = 'AppError';
    this.code = ERROR_CODES[code] ? code : 'E_INTERNAL';
    this.status = spec.status;
    this.detail = detail;
  }

  /** 봉투의 error 칸 모양 그대로 */
  toEnvelope() {
    return { code: this.code, message: this.message };
  }
}
