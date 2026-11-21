import crypto from 'node:crypto';

type FirebaseClaims = {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
};

type FirebaseJwk = { kid?: string; [key: string]: unknown };
let cachedKeys: FirebaseJwk[] = [];
let keysExpireAt = 0;

async function findFirebaseKey(kid: string): Promise<FirebaseJwk | null> {
  const now = Date.now();
  if (!cachedKeys.length || now >= keysExpireAt) {
    const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Não foi possível validar a identidade Firebase.');
    const body = await response.json() as { keys?: FirebaseJwk[] };
    cachedKeys = Array.isArray(body.keys) ? body.keys : [];
    const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1] ?? 3600);
    keysExpireAt = now + Math.max(60, Math.min(maxAge, 24 * 60 * 60)) * 1000;
  }
  let key = cachedKeys.find((candidate) => candidate.kid === kid);
  if (!key) {
    keysExpireAt = 0;
    const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Não foi possível validar a identidade Firebase.');
    const body = await response.json() as { keys?: FirebaseJwk[] };
    cachedKeys = Array.isArray(body.keys) ? body.keys : [];
    keysExpireAt = Date.now() + 60 * 60 * 1000;
    key = cachedKeys.find((candidate) => candidate.kid === kid);
  }
  return key ?? null;
}

export async function verifyFirebaseIdToken(token: string): Promise<FirebaseClaims | null> {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId || token.length > 12_000) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;
    const jwk = await findFirebaseKey(header.kid);
    if (!jwk) return null;
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const validSignature = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      key,
      Buffer.from(encodedSignature, 'base64url'),
    );
    if (!validSignature) return null;
    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8')) as FirebaseClaims;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      !claims.sub || claims.sub.length > 128 || !claims.email || claims.email.length > 160 ||
      claims.email_verified !== true || !claims.exp || claims.exp <= now ||
      !claims.iat || claims.iat > now + 300 || !claims.auth_time || claims.auth_time > now + 300
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
