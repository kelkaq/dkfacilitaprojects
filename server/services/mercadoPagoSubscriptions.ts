type HttpFetch = typeof fetch;

export interface MercadoPagoSubscription {
  id: string;
  status: string;
  external_reference?: string;
  preapproval_plan_id?: string;
  payer_email?: string;
  card_id?: string | number | null;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string; free_trial?: { frequency: number; frequency_type: string } };
}

export interface MercadoPagoPlan {
  id: string;
  status: string;
  init_point?: string;
  sandbox_init_point?: string;
  auto_recurring?: { frequency?: number; frequency_type?: string; transaction_amount?: number; currency_id?: string; free_trial?: { frequency: number; frequency_type: string } };
}

export interface MercadoPagoAuthorizedPayment {
  id: string | number;
  preapproval_id?: string;
  external_reference?: string;
  transaction_amount?: string | number;
  currency_id?: string;
  debit_date?: string;
  status?: string;
  payment?: { id?: string | number; status?: string; status_detail?: string };
}

export class MercadoPagoSubscriptions {
  constructor(private readonly accessToken: string, private readonly http: HttpFetch = fetch) {
    if (!/^(TEST-|APP_USR-)/.test(accessToken)) throw new Error('Credencial Mercado Pago inválida.');
  }

  private async request<T>(path: string, method: 'GET' | 'POST' | 'PUT', body?: object): Promise<T> {
    const response = await this.http(`https://api.mercadopago.com${path}`, {
      method,
      signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Mercado Pago retornou ${response.status}.`);
    return await response.json() as T;
  }

  createPlan(input: { reason: string; cycleMonths: 1 | 6 | 12; amountCentavos: number; trialDays: 0 | 7; backUrl: string }): Promise<MercadoPagoPlan> {
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
        ...(input.trialDays ? { free_trial: { frequency: input.trialDays, frequency_type: 'days' } } : {}),
      },
      back_url: input.backUrl,
    });
  }

  createTrialPlan(input: { reason: string; cycleMonths: 1 | 6 | 12; amountCentavos: number; backUrl: string }): Promise<MercadoPagoPlan> {
    return this.createPlan({ ...input, trialDays: 7 });
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

  createHostedSubscription(input: {
    reason: string; payerEmail: string; externalReference: string;
    cycleMonths: 1 | 6 | 12; amountCentavos: number; trialDays: 0; backUrl: string;
  }): Promise<MercadoPagoSubscription> {
    if (input.reason.trim().length < 3 || !input.payerEmail.includes('@') ||
        !input.externalReference || !Number.isInteger(input.amountCentavos) || input.amountCentavos < 100 ||
        !/^https:\/\//.test(input.backUrl)) throw new Error('Dados da assinatura hospedada inválidos.');
    return this.request<MercadoPagoSubscription>('/preapproval', 'POST', {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      auto_recurring: {
        frequency: input.cycleMonths,
        frequency_type: 'months',
        transaction_amount: input.amountCentavos / 100,
        currency_id: 'BRL',
        ...(input.trialDays ? { free_trial: { frequency: input.trialDays, frequency_type: 'days' } } : {}),
      },
      back_url: input.backUrl,
      status: 'pending',
    });
  }

  getSubscription(id: string): Promise<MercadoPagoSubscription> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('ID de assinatura inválido.');
    return this.request<MercadoPagoSubscription>(`/preapproval/${encodeURIComponent(id)}`, 'GET');
  }

  getPlan(id: string): Promise<MercadoPagoPlan> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('ID de plano inválido.');
    return this.request<MercadoPagoPlan>(`/preapproval_plan/${encodeURIComponent(id)}`, 'GET');
  }

  async findByOrder(input: { payerEmail: string; externalReference: string; planId?: string }): Promise<MercadoPagoSubscription[]> {
    if (!input.payerEmail.includes('@') || !input.externalReference) throw new Error('Busca de assinatura inválida.');
    const found: MercadoPagoSubscription[] = [];
    for (let offset = 0; offset < 100; offset += 20) {
      const params = new URLSearchParams({ payer_email: input.payerEmail, limit: '20', offset: String(offset) });
      if (input.planId) params.set('preapproval_plan_id', input.planId);
      const page = await this.request<{ paging?: { total?: number }; results?: MercadoPagoSubscription[] }>(
        `/preapproval/search?${params.toString()}`, 'GET');
      const results = page.results ?? [];
      found.push(...results.filter((item) => item.external_reference === input.externalReference &&
        (!input.planId || item.preapproval_plan_id === input.planId)));
      if (results.length < 20 || offset + 20 >= (page.paging?.total ?? 0)) break;
    }
    return found;
  }

  async findByPayerAndPlan(input: { payerEmail: string; planId: string }): Promise<MercadoPagoSubscription[]> {
    if (!input.payerEmail.includes('@') || !/^[a-zA-Z0-9_-]{8,128}$/.test(input.planId)) {
      throw new Error('Busca de assinatura inválida.');
    }
    const found: MercadoPagoSubscription[] = [];
    for (let offset = 0; offset < 100; offset += 20) {
      const params = new URLSearchParams({ payer_email: input.payerEmail, preapproval_plan_id: input.planId, limit: '20', offset: String(offset) });
      const page = await this.request<{ paging?: { total?: number }; results?: MercadoPagoSubscription[] }>(
        `/preapproval/search?${params.toString()}`, 'GET');
      const results = page.results ?? [];
      found.push(...results.filter((item) => item.preapproval_plan_id === input.planId));
      if (results.length < 20 || offset + 20 >= (page.paging?.total ?? 0)) break;
    }
    return found;
  }

  cancelSubscription(id: string): Promise<MercadoPagoSubscription> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('ID de assinatura inválido.');
    return this.request<MercadoPagoSubscription>(`/preapproval/${encodeURIComponent(id)}`, 'PUT', { status: 'cancelled' });
  }

  getAuthorizedPayment(id: string): Promise<MercadoPagoAuthorizedPayment> {
    if (!/^\d{1,32}$/.test(id)) throw new Error('ID de fatura inválido.');
    return this.request<MercadoPagoAuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`, 'GET');
  }
}
