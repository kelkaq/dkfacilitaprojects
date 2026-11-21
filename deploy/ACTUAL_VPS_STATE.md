# Estado observado da VPS Locaweb — CSDK

Atualizado em 20/11/2026. Este arquivo descreve o ambiente observado, não autoriza apontar o domínio antes dos critérios de aceite.

## Serviço público atual

- `dkfacilita.com` é servido por Apache com proxy para o serviço `dk-solucoes.service` em `/var/www/dk-solucoes` e releases em `/var/www/dk-releases`.
- O banco do serviço existente é `dk_db` em PostgreSQL 16.
- Backup anterior à troca: `/root/csdk-predeploy-20261120` contém dump de `dk_db`, aplicação e configuração; diretório protegido no servidor.
- O serviço existente permaneceu ativo durante a preparação do CSDK.

## Ambiente isolado do CSDK

- Repositório: `/var/www/csdk-staging`, branch `feature/csdk-production-waves`.
- Banco: `csdk_db`, usuário próprio `csdk_app`; segredo apenas em `/etc/dk/csdk/database.env` (permissão 600).
- Migrations aplicadas via `prisma migrate deploy`; verificar novamente com `prisma migrate status` após cada atualização.
- Plano Mercado Pago TEST de sete dias criado sem cobrança; ID protegido em `/etc/dk/csdk/mp-test-plan.json`. Oferta de homologação permanece inativa no catálogo.
- Não há serviço CSDK público, DNS ou VirtualHost apontando para esse diretório.

## Condição para troca do domínio

1. Login, recuperação, convite, limites de usuários e autorização por operação concluídos no PostgreSQL.
2. Checkout Mercado Pago TEST e depois PRODUCTION homologados com cartão tokenizado, Pix, cancelamento, webhook e conciliação.
3. Provas, emissão, assinaturas e modelos próprios operando sem dependência Firebase.
4. Testes com PF e PJ distintos, tentativa de acesso cruzado, emissão, revogação, documentos e notificações.
5. Backup/restauração do novo banco e arquivos testados; cópia do site atual e procedimento de retorno documentados.
6. Apenas então alterar Apache/systemd, executar smoke test público e monitorar erros.

Não inserir tokens, senhas, IDs de conta ou dados pessoais neste arquivo.

## Continuação verificada em 20/11/2026

- Staging atualizado até o commit `93ed193` na branch `feature/csdk-production-waves`; migrations Prisma aplicadas e `migrate status` confirmou schema atualizado.
- `npm run lint` e `npm run build` passaram no clone da VPS. Testes de pedido/checkout, webhook (trial, fatura, cancelamento e repetição), autenticação/recuperação e equipe/convites passaram no banco `csdk_db`.
- As rotas usam respostas Mercado Pago simuladas nos testes; nenhuma cobrança real ou assinatura de comprador foi criada. O checkout ainda depende de ofertas ativas no PostgreSQL e de variáveis/serviços CSDK configurados.
- Após limpeza dos smoke tests, `empresas`, `usuarios`, `pedidos` e `pagamento_eventos` ficaram vazios. Não foram criados registros de cliente.
- `dk-solucoes.service` permaneceu ativo. Não foi criado ou iniciado serviço CSDK, nem alterados Apache, DNS, Wix, `dkfacilita.com` ou o banco `dk_db`.
