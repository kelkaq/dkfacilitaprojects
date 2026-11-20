type HttpFetch = typeof fetch;

export interface MercadoPagoSubscription {
  id: string;
  status: string;
  external_reference?: string;
  preapproval_plan_id?: string;
  card_id?: string | number | null;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string; free_trial?: { frequency: number; frequency_type: string } };
}

export interface MercadoPagoPlan {
  id: string;
  status: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string; free_trial?: { frequency: number; frequency_type: string } };
}

export class MercadoPagoSubscriptions {
  constructor(private readonly accessToken: string, private readonly http: HttpFetch = fetch) {
    if (!/^(TEST-|APP_USR-)/.test(accessToken)) throw new Error('Credencial Mercado Pago inválida.');
  }

  private async request<T>(path: string, method: 'GET' | 'POST', body?: object): Promise<T> {
    const response = await this.http(`https://api.mercadopago.com${path}`, {
      method,
      signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Mercado Pago retornou ${response.status}.`);
    return await response.json() as T;
  }

  createTrialPlan(input: { reason: string; cycleMonths: 1 | 6 | 12; amountCentavos: number; backUrl: string }): Promise<MercadoPagoPlan> {
    if (!Number.isInteger(input.amountCentavos) || input.amountCentavos < 100 ||
        !/^https:\/\//.test(input.backUrl) || input.reason.trim().length < 3) {
      throw new Error('Dados do plano inválidos.');
    }
    return this.request<MercadoPagoPlan>('/preapproval_plan', 'POST', {
      reason: input.reason,
      auto_recurring: {
        frequency: input.cycleMonths,
        frequency_type: 'months',
        transaction_amount: input.amountCentavos / 100,
        currency_id: 'BRL',
        free_trial: { frequency: 7, frequency_type: 'days' },
      },
      back_url: input.backUrl,
    });
  }

  createSubscription(input: {
    planId: string; payerEmail: string; cardTokenId: string;
    externalReference: string; backUrl: string;
  }): Promise<MercadoPagoSubscription> {
    if (!input.planId || !input.cardTokenId || !input.externalReference ||
        !/^https:\/\//.test(input.backUrl) || !input.payerEmail.includes('@')) {
      throw new Error('Dados da assinatura inválidos.');
    }
    return this.request<MercadoPagoSubscription>('/preapproval', 'POST', {
      preapproval_plan_id: input.planId,
      payer_email: input.payerEmail,
      card_token_id: input.cardTokenId,
      external_reference: input.externalReference,
      back_url: input.backUrl,
      status: 'authorized',
    });
  }

  getSubscription(id: string): Promise<MercadoPagoSubscription> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('ID de assinatura inválido.');
    return this.request<MercadoPagoSubscription>(`/preapproval/${encodeURIComponent(id)}`, 'GET');
  }
}
