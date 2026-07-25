import Stripe from "stripe";

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
  verifyWebhook(payload: string, signature: string): Promise<unknown>;
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

export class StripeProvider implements PaymentProvider {
  name = "stripe";
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: "2025-02-24" as any });
  }

  setWebhookSecret(secret: string): void {
    (this.stripe as any).webhookSecret = secret;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      line_items: [{ price_data: { currency: params.currency, product_data: { name: params.description || "Purchase" }, unit_amount: params.amount * 100 }, quantity: 1 }],
      mode: "payment",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer: params.customerId,
      metadata: params.metadata,
    });
    return { id: session.id, url: session.url || undefined, amount: params.amount, currency: params.currency, status: session.status || "pending", provider: "stripe" };
  }

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amount * 100, currency: params.currency, metadata: params.metadata, description: params.description,
    });
    return { id: intent.id, clientSecret: intent.client_secret || undefined, amount: params.amount, currency: params.currency, status: intent.status, provider: "stripe" };
  }

  async verifyWebhook(payload: string, signature: string): Promise<unknown> {
    const secret = (this.stripe as any).webhookSecret || "";
    if (!secret) throw new Error("Stripe webhook secret not configured");
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  async createCustomer(email: string, name: string): Promise<string> {
    const customer = await this.stripe.customers.create({ email, name });
    return customer.id;
  }

  async createSubscription(customerId: string, priceId: string): Promise<{ id: string; status: string }> {
    const sub = await this.stripe.subscriptions.create({ customer: customerId, items: [{ price: priceId }] });
    return { id: sub.id, status: sub.status };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }
}

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

  async verifyWebhook(provider: string, payload: string, signature: string): Promise<unknown> {
    return this.getProvider(provider).verifyWebhook(payload, signature);
  }

  async createCustomer(email: string, name: string, provider?: string): Promise<string> {
    return this.getProvider(provider).createCustomer(email, name);
  }

  async createSubscription(customerId: string, priceId: string, provider?: string): Promise<{ id: string; status: string }> {
    return this.getProvider(provider).createSubscription(customerId, priceId);
  }
}
