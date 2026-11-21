# Implantação do Certifica Software - DK

Estado verificado em 21/11/2026, código da vitrine no commit `29dd76c`. A situação concreta da VPS está em [ACTUAL_VPS_STATE.md](./ACTUAL_VPS_STATE.md). O CSDK já atende `dkfacilita.com`; checkout e ofertas públicas seguem desligados até a homologação financeira e operacional ser concluída.

## Ambientes existentes

- Aplicação pública CSDK: Apache encaminha `dkfacilita.com` para `csdk.service`, em `/var/www/csdk-production`, banco `csdk_prod_db`.
- Serviço anterior preservado para retorno: `dk-solucoes.service`, `/var/www/dk-solucoes`, banco `dk_db`.
- CSDK isolado para homologação: `/var/www/csdk-staging`, branch `feature/csdk-production-waves`, banco `csdk_db` e usuário `csdk_app`.
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

O serviço de homologação roda exclusivamente em `127.0.0.1:3010` atrás de eventual proxy configurado à parte. O serviço público deve usar seu próprio unit, `HOST=127.0.0.1`, porta local distinta e um virtual host HTTPS explicitamente validado.

O editor de modelos próprios usa o mesmo fluxo visual do CertificaNR: o PowerPoint da empresa é renderizado como fundo, os campos variáveis são posicionados num editor por tenant, e o certificado final é montado em HTML/CSS e impresso em PDF por Chromium headless. Na VPS, a importação precisa de `libreoffice-impress` e `poppler-utils`; a prévia e a emissão precisam do Google Chrome estável. O pacote Chromium do Ubuntu instala um snap que não pode ser iniciado pelo usuário `dkapp`, por isso o caminho configurado é `/usr/bin/google-chrome`. Configure também `CSDK_LIBREOFFICE_PATH` e `CSDK_PDFTOPPM_PATH` no ambiente protegido do CSDK. O desenho do PPTX fica preservado como fundo rasterizado; os campos de dados são configurados por cima, sem prometer edição automática dos vetores do arquivo.

Para preparar uma VPS nova, instale os componentes do sistema antes de iniciar o serviço:

```bash
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y libreoffice-impress poppler-utils
wget -O /tmp/google-chrome-stable.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/google-chrome-stable.deb
```

Cada versão ativa guarda, em diretório privado da empresa, as páginas PNG, os hashes e o layout JSON. A reimpressão usa a versão imutável registrada no certificado. Inclua `storage/certificate_layouts` nos backups/restaurações do banco; sem esses arquivos as versões antigas não podem ser reimpressas.

Esses comandos atualizam apenas a homologação. Não alteram Apache, domínio, DNS ou o serviço atual. Testes de integração usam `csdk_db` e devem remover seus próprios registros temporários.

## Critérios antes da publicação

1. Login, convite, recuperação de senha e limite de usuários ligados às telas e ao PostgreSQL.
2. Checkout com preço calculado no servidor; assinatura e trial de sete dias com cartão hospedado Mercado Pago; cancelamento, webhooks e conciliação testados em TEST. Pix e dois cartões são meios ainda não implementados para a assinatura recorrente e não devem ser anunciados.
3. Turmas, provas, assinaturas, modelos próprios e emissão centralizados no servidor. Rotas que montam documentos apenas com dados enviados pelo navegador permanecem fechadas.
4. Teste de isolamento entre pelo menos duas empresas fictícias distintas, incluindo um titular CPF e outro CNPJ.
5. Backup e restauração do CSDK testados, procedimento de retorno do site atual documentado, monitoramento e alertas configurados.

Depois dos critérios, criar serviço systemd CSDK próprio, ambiente protegido em `/etc/dk/csdk/`, configurar Apache para o novo serviço, executar teste público de compra e primeiro acesso e monitorar. Nunca apontar o domínio para a pasta de homologação apenas porque o build passou.

## Integração financeira atual

O provedor escolhido é Mercado Pago. Rotas Asaas devolvem 410. O checkout cria pedido e assinatura hospedada por cartão; o webhook busca a assinatura/fatura no provedor, valida estado, titular, referência/plano, moeda e valor, e só então cria a conta ou atualiza a cobrança. Os testes simulados cobrem contratos, preço, trial, recorrência, cancelamento e idempotência; eles não substituem o teste ponta a ponta de comprador TEST. O checkout Pix e pagamento com dois cartões não estão disponíveis para assinatura recorrente. O checkout antigo Firebase/Asaas não está ligado à API nova.

`CSDK_PUBLIC_COMMERCE_ENABLED` vem como `false` no exemplo de ambiente e bloqueia listagem de ofertas, criação de pedidos e checkout. Mantenha-o desativado até o painel operacional PostgreSQL, e-mail de primeiro acesso, preços, ofertas e ciclo de compra estarem homologados.

O painel Super Admin sincroniza os planos editados no catálogo com o catálogo PostgreSQL consumido pelo checkout. Em “Ofertas & Cobrança”, o dono prepara ofertas para o ambiente de pagamento atual; elas nascem inativas e só podem ser ativadas depois que o preço e o período forem conferidos contra o plano hospedado no Mercado Pago. Desativar uma oferta impede novas compras sem apagar o histórico de pedidos. Isso não substitui a homologação de uma compra de ponta a ponta.

As páginas novas de conta estão isoladas em `/acesso`, `/resetar-senha`, `/aceitar-convite` e `/minha-conta`. Para testá-las num host HTTPS de homologação, configurar `APP_URL` com a origem exata e `CSDK_COOKIE_AUTH=1` no ambiente protegido. O painel operacional `/app` ainda é legado.
