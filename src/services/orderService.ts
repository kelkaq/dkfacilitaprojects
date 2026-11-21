export interface PublicOffer {
  planoSlug: string;
  planoNome: string;
  ciclo: 'MENSAL' | 'SEMESTRAL' | 'ANUAL';
  modoInicio: 'TRIAL' | 'IMEDIATO';
  trialDias: number;
  totalCentavos: number;
  limiteUsuarios: number;
  limiteColaboradores: number;
}

export async function fetchPublicOffers(signal?: AbortSignal): Promise<PublicOffer[]> {
  const response = await fetch('/api/public/offers', {
    signal,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Ofertas indisponíveis no momento.');
  const body = await response.json() as { offers?: PublicOffer[] };
  return (body.offers ?? []).filter((offer) =>
    typeof offer.planoSlug === 'string' && typeof offer.planoNome === 'string' &&
    ['MENSAL', 'SEMESTRAL', 'ANUAL'].includes(offer.ciclo) &&
    ['TRIAL', 'IMEDIATO'].includes(offer.modoInicio) && Number.isInteger(offer.totalCentavos) && offer.totalCentavos > 0
  );
}
