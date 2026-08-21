export interface CreateCheckoutInput {
  orderId: string;
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}
export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
}
export interface VerifiedWebhook {
  eventId: string;
  type: string;
  payload: unknown;
}
export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyWebhook(rawBody: Buffer, signature: string): Promise<VerifiedWebhook>;
}
