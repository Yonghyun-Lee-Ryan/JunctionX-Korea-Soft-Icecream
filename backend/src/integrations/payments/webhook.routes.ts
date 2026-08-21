import { Router, raw } from 'express';

// Provider-specific signed webhooks mount here before express.json().
export const paymentWebhookRouter = Router();
paymentWebhookRouter.use(raw({ type: 'application/json', limit: '1mb' }));
