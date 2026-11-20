# Implantação do Certifica Software - DK

Estado verificado em 20/11/2026. A situação concreta da VPS está em [ACTUAL_VPS_STATE.md](./ACTUAL_VPS_STATE.md). Este projeto ainda não está pronto para substituir o serviço público de `dkfacilita.com`.

## Ambientes existentes

- Site atual: Apache encaminha `dkfacilita.com` para `dk-solucoes.service`, em `/var/www/dk-solucoes`, com banco `dk_db`.
- CSDK isolado: `/var/www/csdk-staging`, branch `feature/csdk-production-waves`, banco `csdk_db` e usuário `csdk_app`.
- Segredo do banco CSDK: `/etc/dk/csdk/database.env`, somente no servidor. Não copiar para o Git.
- Backup anterior à troca: `/root/csdk-predeploy-20261120`.

## Atualização segura da homologação

Executar como administrador da VPS, depois de revisar o commit que será instalado:

```bash
sudo -u dkapp git -C /var/www/csdk-staging pull --ff-only
cd /var/www/csdk-staging
sudo -u dkapp npm ci
sudo -u dkapp npx prisma generate
. /etc/dk/csdk/database.env
sudo -u dkapp env DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
sudo -u dkapp env DATABASE_URL="$DATABASE_URL" npx prisma migrate status
sudo -u dkapp npm run lint
sudo -u dkapp npm run build
```

Esses comandos atualizam apenas a homologação. Não alteram Apache, domínio, DNS ou o serviço atual. Testes de integração usam `csdk_db` e devem remover seus próprios registros temporários.

## Critérios antes da publicação

1. Login, convite, recuperação de senha e limite de usuários ligados às telas e ao PostgreSQL.
2. Checkout com preço calculado no servidor; tokenização do cartão Mercado Pago; trial de sete dias; Pix imediato; cancelamento, webhooks e conciliação testados em TEST e depois em PRODUCTION.
3. Turmas, provas, assinaturas, modelos próprios e emissão centralizados no servidor. Rotas que montam documentos apenas com dados enviados pelo navegador permanecem fechadas.
4. Teste de isolamento entre pelo menos duas empresas fictícias distintas, incluindo um titular CPF e outro CNPJ.
5. Backup e restauração do CSDK testados, procedimento de retorno do site atual documentado, monitoramento e alertas configurados.

Depois dos critérios, criar serviço systemd CSDK próprio, ambiente protegido em `/etc/dk/csdk/`, configurar Apache para o novo serviço, executar teste público de compra e primeiro acesso e monitorar. Nunca apontar o domínio para a pasta de homologação apenas porque o build passou.

## Integração financeira atual

O provedor escolhido é Mercado Pago. Rotas Asaas devolvem 410. A oferta TEST de homologação está inativa; o webhook Mercado Pago apenas registra notificações verificadas e ainda não ativa contas. O checkout antigo continua dependente de Firebase e Asaas, por isso não deve ser anunciado como compra funcional.
