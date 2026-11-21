import crypto from 'node:crypto';
import { getPrisma } from '../server/lib/prisma.ts';
import { hashPassword } from '../server/lib/security.ts';

const email = process.env.CSDK_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.CSDK_SUPER_ADMIN_NAME?.trim() || 'Administrador da plataforma';
if (!email || !email.includes('@')) throw new Error('Defina CSDK_SUPER_ADMIN_EMAIL no ambiente antes de criar o usuário inicial.');
const db = getPrisma();
try {
  const existing = await db.usuario.findUnique({ where: { email } });
  if (existing) {
    if (existing.perfil !== 'SUPER_ADMIN' || existing.empresaId !== null || !existing.ativo) {
      throw new Error('O e-mail já está cadastrado com outro perfil, tenant ou estado. Nenhuma alteração foi feita.');
    }
    console.log('Usuário SUPER_ADMIN já está preparado.');
  } else {
    await db.usuario.create({ data: {
      nome: name.slice(0, 120), email, perfil: 'SUPER_ADMIN', ativo: true,
      senhaHash: hashPassword(crypto.randomBytes(48).toString('hex')),
    } });
    console.log('Usuário SUPER_ADMIN inicial criado com senha aleatória não divulgada. A entrada continua protegida pelo login Firebase verificado.');
  }
} finally {
  await db.$disconnect();
}
