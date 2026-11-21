export interface PublicOffer {
  planoSlug: string;
  planoNome: string;
  planoSubtitulo: string;
  planoDescricao: string;
  precoMensalCentavos: number;
  descontoSemestral: number;
  descontoAnual: number;
  ciclo: 'MENSAL' | 'SEMESTRAL' | 'ANUAL';
  modoInicio: 'TRIAL' | 'IMEDIATO';
  trialDias: number;
  totalCentavos: number;
  limiteUsuarios: number;
  limiteColaboradores: number;
  limiteObras: number;
  incluiCartaAnuencia: boolean;
  incluiDossieLink: boolean;
  incluiAlertasWpp: boolean;
  incluiDominioProprio: boolean;
  destaque: boolean;
  ordem: number;
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
    typeof offer.planoSubtitulo === 'string' && typeof offer.planoDescricao === 'string' &&
    ['MENSAL', 'SEMESTRAL', 'ANUAL'].includes(offer.ciclo) &&
    ['TRIAL', 'IMEDIATO'].includes(offer.modoInicio) && Number.isInteger(offer.totalCentavos) && offer.totalCentavos > 0
  );
}
