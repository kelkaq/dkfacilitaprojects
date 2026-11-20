import crypto from 'node:crypto';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET forte é obrigatório em produção.');
  return 'dk-facilita-dev-jwt-secret-alterar-em-producao';
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  perfil: 'SUPER_ADMIN' | 'ADMIN_EMPRESA' | 'RT' | 'INSTRUTOR_TST';
  empresaId: string | null;
  versaoSessao: number;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

export function signJwtToken(
  payload: Omit<AuthTokenPayload, 'exp'>,
  expiresInSeconds = 60 * 60 * 24 * 7
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const fullPayload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', jwtSecret())
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

export function verifyJwtToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac('sha256', jwtSecret())
        .update(`${header}.${body}`)
        .digest()
    );
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function sanitizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function maskCpf(cpf: string): string {
  const digits = sanitizeDigits(cpf);
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function generateSecureCode(prefix: string, bytes = 6): string {
  return `${prefix}-${crypto.randomBytes(bytes).toString('hex').toUpperCase()}`;
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
