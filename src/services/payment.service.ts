// Payment gateway abstraction — allows plugging different payment providers
// behind a common interface without touching business logic.

export interface PaymentIntent {
  id: string;
  clientSecret?: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
}

export interface CheckoutSession {
  id: string;
  url?: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
}

export interface PaymentProvider {
  name: string;
  createCheckout(params: CheckoutParams): Promise<CheckoutSession>;
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntent>;
  verifyWebhook(payload: unknown, signature: string): Promise<unknown>;
  createCustomer(email: string, name: string): Promise<string>;
  createSubscription(customerId: string, priceId: string): Promise<{ id: string; status: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export interface CheckoutParams {
  amount: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  description?: string;
}

export interface PaymentIntentParams {
  amount: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, string>;
  description?: string;
}

// ─── Stripe Provider ───
export class StripeProvider implements PaymentProvider {
  name = "stripe";
  private stripe: any; // Stripe instance

  constructor(secretKey: string) {
    // In production: new Stripe(secretKey)
    this.stripe = { _key: secretKey };
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
    // In production:
    // const session = await this.stripe.checkout.sessions.create({ ... });
    return {
      id: `cs_${crypto.randomUUID()}`,
      url: `https://checkout.stripe.com/pay/${crypto.randomUUID()}`,
      amount: params.amount,
      currency: params.currency,
      status: "pending",
      provider: "stripe",
    };
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntent> {
    return {
      id: `pi_${crypto.randomUUID()}`,
      clientSecret: `${crypto.randomUUID()}_secret_${crypto.randomUUID()}`,
      amount: params.amount,
      currency: params.currency,
      status: "requires_payment_method",
      provider: "stripe",
    };
  }

  async verifyWebhook(payload: unknown, signature: string): Promise<unknown> {
    // In production: stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    return payload;
  }

  async createCustomer(email: string, name: string): Promise<string> {
    return `cus_${crypto.randomUUID()}`;
  }

  async createSubscription(customerId: string, priceId: string): Promise<{ id: string; status: string }> {
    return { id: `sub_${crypto.randomUUID()}`, status: "active" };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // In production: stripe.subscriptions.cancel(subscriptionId)
  }
}

// ─── Provider Registry ───
export class PaymentGateway {
  private providers: Map<string, PaymentProvider> = new Map();
  private defaultProvider: string;

  constructor(defaultProvider = "stripe") {
    this.defaultProvider = defaultProvider;
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name?: string): PaymentProvider {
    const providerName = name || this.defaultProvider;
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Payment provider "${providerName}" not registered`);
    return provider;
  }

  async createCheckout(params: CheckoutParams & { provider?: string }): Promise<CheckoutSession> {
    return this.getProvider(params.provider).createCheckout(params);
  }

  async createPaymentIntent(params: PaymentIntentParams & { provider?: string }): Promise<PaymentIntent> {
    return this.getProvider(params.provider).createPaymentIntent(params);
  }

  async verifyWebhook(provider: string, payload: unknown, signature: string): Promise<unknown> {
    return this.getProvider(provider).verifyWebhook(payload, signature);
  }

  async createCustomer(email: string, name: string, provider?: string): Promise<string> {
    return this.getProvider(provider).createCustomer(email, name);
  }

  async createSubscription(customerId: string, priceId: string, provider?: string): Promise<{ id: string; status: string }> {
    return this.getProvider(provider).createSubscription(customerId, priceId);
  }
}
