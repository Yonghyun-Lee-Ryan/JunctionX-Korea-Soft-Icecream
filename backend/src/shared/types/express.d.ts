import type { UserRole } from '../security/jwt.service.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: UserRole };
      requestId: string;
    }
  }
}

export {};
