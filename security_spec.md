# Security Specification — DK Facilita / Certifica Software - DK (Phase 0 TDD)

## 1. Data Invariants

1. **Global Catalog Write Lock**: Collections `planos`, `adicionais`, `nrs_globais`, and `modelos_certificado_globais` are publicly readable (required by the commercial site and client apps) and writable ONLY by verified Super Admins (`isSuperAdmin()`).
2. **Strict Multi-Tenant Isolation (`empresa_id`)**: Every operational record under `/empresas/{empresaId}` and its subcollections (`membros`, `assinaturas`, `faturas`, `contratos_obras`, `colaboradores`, `assinaturas_digitais`, `treinamentos_empresa`, `banco_questoes`, `turmas_aplicacoes`, `provas_tentativas`, `certificados`, `cartas_anuencia`) is strictly gated by tenant membership (`isTenantMember(empresaId)`) or Super Admin.
3. **No Self-Escalation**: Authenticated users cannot write to `/admins/{uid}`, cannot grant themselves `SUPER_ADMIN`, and cannot alter another tenant's `empresaId` or `ownerUid`.
4. **PII Isolation**: User profiles and company financial emails/WhatsApp numbers cannot be read by non-member users or via blanket `allow list: if isSignedIn()`.
5. **Immutable Certificate Snapshots**: Public validation records at `/certificados_publicos/{codigoQr}` only expose non-sensitive verification metadata (masked CPF) and can only be created/revoked by authorized members of the issuing `empresaId` or Super Admin.
6. **Path ID Hardening & Volumetric Bounds**: All document IDs are validated via `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars) on single-document operations, and all string/array fields have explicit `.size()` ceilings.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Unauthenticated Write to Global Plan**: Anonymous client attempts `setDoc('/planos/plano_essencial', { precoMensalCentavos: 0 })`.
2. **Non-Admin User Modifying Global NR Catalog**: Verified non-admin user attempts `updateDoc('/nrs_globais/nr_35', { titulo: 'Hacked' })`.
3. **Self-Promotion to Super Admin**: Authenticated user attempts `setDoc('/admins/' + uid, { active: true })`.
4. **Shadow Field Injection on Plan Creation**: Super Admin attempts to create a plan with an undeclared ghost field `isHacked: true`.
5. **Cross-Tenant Company Read (PII Leak)**: User A (member of `emp_1`) attempts `getDoc('/empresas/emp_2')`.
6. **Blanket Tenant Scraping (`allow list`)**: Non-admin user attempts `getDocs('/empresas')` without being `ownerUid`.
7. **Owner Spoofing on Tenant Creation**: User A attempts `setDoc('/empresas/emp_new', { ownerUid: 'user_B', ... })`.
8. **Immutable Field Tampering**: Tenant owner attempts to change `ownerUid` or `createdAt` during an update on `/empresas/{empresaId}`.
9. **Path Variable ID Poisoning**: Attacker attempts `setDoc('/logs_acesso_analytics/' + 'a'.repeat(500), ...)`.
10. **Value Poisoning on Allowed Update Field**: Attacker sends a 10KB string or boolean inside `razaoSocial` during an allowed update.
11. **Unverified Email Admin Spoof**: Token with admin email string but `email_verified == false` attempts to write to `/planos`.
12. **Orphaned Public Certificate Forgery**: Non-member user attempts to create `/certificados_publicos/FAKE-QR-001` referencing `empresaId: 'emp_1'`.
