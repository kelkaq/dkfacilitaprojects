# Arquitetura do Ecossistema DK Facilita — Certifica Software - DK

## 1. Topologia de Domínios e Serviços

| Superfície | Domínio de Produção | Responsabilidade |
| :--- | :--- | :--- |
| **Site Institucional & Checkout** | `dkfacilita.com` | Vitrine multi-produto DK Facilita, planos Mensal/Semestral/Anual, loja de adicionais, onboarding automático (Trial 7 dias ou pagamento imediato). |
| **SaaS Cliente Multiempresa** | `certifica.dkfacilita.com` | Operação isolada por `empresa_id`: Dashboard, NRs (Norma Pai → Variações → Linhas), Turmas/Provas mobile, Certificados PDF/QR, Dossiê e Meu Plano. |
| **Painel Super Admin** | `admin.dkfacilita.com` | MRR, empresas (Ativas/Trial/Suspensas), acessos, presença online em tempo real (heartbeat), feature flags, modelos próprios e catálogo global. |
| **Backend API REST** | `api.dkfacilita.com` | Node.js + Express + Prisma + PostgreSQL, autenticação JWT multiempresa, webhooks Asaas, motor de emissão imutável e validação pública QR. |

## 2. Estrutura do Repositório (Monorepo Unificado)

```text
/
├── prisma/
│   ├── schema.prisma                         # Modelagem completa PostgreSQL (19 tabelas + 11 enums)
│   ├── migrations/
│   │   └── 20261119000000_init/migration.sql # DDL inicial pronto para produção
│   └── seed.ts                               # Seed idempotente (Planos, Adicionais, NRs e Modelos)
├── src/
│   ├── data/globalCatalogSeed.ts             # Fonte única do catálogo global oficial
│   ├── lib/firebase.ts                       # Conexão real ao banco provisionado + tratamento de erros
│   ├── services/catalogService.ts            # Leituras reais e seed idempotente no banco ativo
│   ├── components/                           # Componentes compartilhados (ErrorBoundary, UI)
│   └── App.tsx                               # Console Arquitetural & Explorador Real da Fase 1
├── firestore.rules                           # Regras de segurança multiempresa auditadas e validadas
├── firebase-blueprint.json                   # Representação intermediária de entidades e coleções
└── security_spec.md                          # Matriz de invariantes e testes adversariais
```

## 3. Fases de Entrega

- **FASE 1 (Concluída)**: Estrutura do Monorepo, Schema Prisma completo, Migration SQL, Regras de Segurança Multiempresa e Seed real (4 Planos, 6 Adicionais, 10 NRs com 19 variações e 101 linhas de conteúdo programático, 4 Modelos Gratuitos neutros).
- **FASE 2 (Próxima)**: Backend API completo (`server.ts` / rotas `/api/*`, Auth multiempresa, Middleware de Plano/Trial/Inadimplência, Webhooks Asaas, Analytics/Heartbeat, CRUDs e Motor de Certificados).
- **FASE 3**: Site Institucional **DK Facilita** (`dkfacilita.com`) + Checkout/Trial automático com Assistente de Primeiro Acesso.
- **FASE 4**: Frontend completo do **Certifica Software - DK** (Dashboard, NRs em linhas com prévia ao vivo do verso, Turmas & Provas em 4 abas, Prova Mobile com assinatura no dedo, Certificado PDF + QR Code, Dossiê, Central de Vencimentos e Meu Plano).
- **FASE 5**: Painel **Super Admin** (`admin.dkfacilita.com`) + Scripts de Deploy (PM2 + Nginx/Apache) para VPS Ubuntu.
