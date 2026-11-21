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

## Atualização observada em 20/11/2026 — commits `77922c4` e `a7c8345`

- `/var/www/csdk-staging` está no commit `a7c8345` da branch `feature/csdk-production-waves`. Oito migrations estão aplicadas em `csdk_db`; `prisma migrate deploy` aplicou `20261121120000_certificate_tenant_class_employee_unique` após confirmar zero certificados e zero duplicatas na chave empresa/turma/colaborador.
- `npm run lint` e `npm run build` passaram no clone da VPS. O build ainda avisa sobre `__dirname` no Vite e um bundle JavaScript acima de 500 kB.
- Passaram os smoke tests de certificados/provas, configuração do tenant, operações, autenticação/recuperação, equipe/convites, pedidos, webhook e contrato Mercado Pago. No fluxo PowerPoint, o teste verificou upload com tokens, bloqueio de outro tenant, emissão com assinaturas obrigatórias, troca de versão sem alterar o certificado já emitido, fallback de PPTX preenchido e remoção do arquivo temporário.
- Os testes de emissão confirmaram: tentativa aprovada obrigatória; assinatura digital exigida conforme a configuração congelada da empresa; impressão com papéis configurados; QR `csdk_cert`; validação pública sem CPF/imagem de assinatura; bloqueio de leitura/impressão entre empresas; e emissão idempotente com unicidade por tenant/turma/colaborador.
- Os testes de pagamento usam chamadas e dados simulados. Nenhuma cobrança real, assinatura de comprador ou e-mail real foi emitido.
- Após a limpeza, `empresas`, `usuarios`, `pedidos`, `assinaturas`, `faturas`, `pagamento_eventos`, `colaboradores`, `contratos_obras`, `treinamentos_empresa`, `turmas_aplicacoes`, `provas_tentativas`, `assinaturas_digitais` e `certificados` ficaram com zero registros. A pasta de modelos PowerPoint também ficou sem arquivos de teste. Permanecem cinco planos e nenhuma oferta comercial ativa.
- `dk-solucoes.service` foi verificado ativo e `csdk-staging.service` inativo. Não foi criado ou iniciado serviço CSDK, nem alterados Apache, DNS, Wix, `dkfacilita.com` ou o banco `dk_db`.
- `CSDK_PUBLIC_COMMERCE_ENABLED` continua `false` por padrão e não há ofertas ativas; a compra pública segue indisponível.
- O painel PostgreSQL já inclui operações de colaboradores, obras, treinamentos, turmas e provas, além de assinaturas digitais, emissão, impressão e validação pública de certificados. A configuração e as evidências usadas ficam em snapshots do certificado.
- O modelo PowerPoint próprio é carregado por empresa como adicional, fica versionado e privado, e permite substituir caixas de texto por dados, logo, QR e assinaturas nos espaços marcados. Certificados antigos mantêm a versão e o hash do arquivo usado. O VPS não tem LibreOffice instalado; portanto, o smoke test confirmou download do PPTX preenchido, mas a conversão automática para PDF ainda não foi homologada.
- Permanecem fora desta etapa: análise automática/assistida do layout de PowerPoint sem marcadores, prévia visual e aprovação do mapeamento, importação em massa, dossiês/listas/cartas de anuência equivalentes ao CertificaNR, notificações do dono, cobrança real Mercado Pago, oferta comercial, e-mail de ativação e recuperação real, backups/restauração ensaiados, ambiente HTTPS público e critérios para troca do domínio.

## Atualização observada em 20/11/2026 — modelos visuais por empresa

- A branch de homologação foi atualizada até `4b9387e`; `npm ci`, geração do cliente Prisma, `npm run lint` e `npm run build` passaram. O primeiro build foi impedido por uma pasta `dist` antiga pertencente a root; após ajustar somente a propriedade da pasta `dist`, o build passou.
- O adicional Modelo Próprio agora segue o mecanismo visual do CertificaNR: upload PPTX, conversão dos dois primeiros slides para PNG de fundo, editor de posição para campos/textos/assinaturas/QR, prévia em PDF e emissão via Chromium headless. O desenho importado fica como fundo, e os dados variáveis são configurados no editor. Não há decomposição automática dos vetores/textos internos do PPTX.
- `libreoffice-impress`, `poppler-utils` e Google Chrome estável foram instalados para a homologação. O pacote Chromium padrão instala Snap, que não pode ser iniciado por `dkapp`; `CSDK_CHROMIUM_PATH` usa `/usr/bin/google-chrome`. Os caminhos dos conversores estão em `/etc/dk/csdk/database.env`, protegido com modo `600`.
- `/var/www/csdk-staging/storage` permite travessia sem listagem; `certificate_layouts` e `pptx_templates` estão privados (`750`) e pertencem a `dkapp`. Foi aprovado smoke test sintético de isolamento/layout/escape HTML e geração PDF pelo Chrome (34.447 bytes). Nenhum PPTX de cliente foi usado. O teste ainda não exercitou uma importação de PPTX ponta a ponta nem a tela autenticada no navegador.
- O serviço público, Apache, DNS, Wix, `dkfacilita.com`, `dk_db` e `dk-solucoes.service` permaneceram intactos. CSDK segue em homologação e `csdk-staging.service` permanece inativo. `storage/certificate_layouts` precisa entrar no procedimento de backup/restauração junto com o banco.

## Atualização observada em 21/11/2026 — suíte ampla e serviço de staging

- Commits seguintes: `0c919ae`, `1fe4f6d` e `42238a1`. O script do backend foi corrigido para iniciar via `tsx`; o comando anterior `node server.ts` falhava com sintaxe TypeScript não suportada no modo strip-only do Node.
- Suíte de smoke test no `csdk_db` passou para autenticação/reset, convites/equipe, operações de tenant, configurações/logo, comunicados, pedidos e webhooks. O teste de certificado atualizado importou um PPTX sintético de dois slides, buscou as imagens isoladas, gerou prévia PDF, ativou layout, emitiu e reimprimiu certificado PDF da versão original e verificou tenant diferente. Os registros de teste são removidos pelos próprios scripts.
- `/etc/systemd/system/csdk-staging.service` foi criado e está ativo em `127.0.0.1:3010` via Apache ainda não configurado para esse host; o teste local retornou HTTP 200. `dk-solucoes.service` também segue ativo. Nenhum vhost/domínio público foi trocado.
- `csdk_db` está com nove migrations em dia, cinco planos, zero ofertas ativas, zero empresas/certificados após limpeza. `CSDK_PUBLIC_COMMERCE_ENABLED` permanece ausente/desativado. Não foram configurados token/segredo real do Mercado Pago, Resend/e-mail, URL HTTPS pública ou webhook de produção. Logo, compra e primeiro acesso reais continuam não homologados; não abrir vendas ainda.
- Corrigidas permissões privadas em staging: `storage` com travessia sem listagem; `certificate_layouts`, `pptx_templates` e `tenant-logos` privados e graváveis por `dkapp`.
- Ainda pendem credenciais/validação real dos provedores, teste de compra TEST do início ao fim, HTTPS/host de staging, ativação e configuração comercial revisada, teste ensaiado de backup/restauração dos arquivos e DB, e aceite final de publicação. O site existente continua preservado.

## Atualização adicional em 21/11/2026

- O servidor agora aceita `HOST`; `csdk-staging.service` foi atualizado para `HOST=127.0.0.1` e a escuta foi confirmada somente no loopback. A rota raiz local retorna HTTP 200. O serviço não tem virtual host/DNS próprio e não é o site público.
- Foi feito ensaio de recuperação do PostgreSQL: `pg_dump` em formato custom, `pg_restore` em banco temporário separado e comparação de 33 tabelas do schema público; passou. Também foi arquivado e restaurado um arquivo sintético de modelo próprio, com conteúdo verificado. O banco/arquivos temporários de ensaio foram removidos.
- Tentamos descobrir as credenciais existentes. A DK Soluções tem credenciais Mercado Pago `APP_USR` de produção, sem segredo de webhook visível/configurado; não foram copiadas nem usadas. O painel do Mercado Pago não estava conectado ao navegador desta sessão. O ambiente CSDK continua sem credenciais de teste MP ou credenciais Resend/remetente.
- `npm audit --omit=dev` reporta nove avisos de alta severidade: dependências Firebase/gRPC, Prisma e `xlsx`. A correção automática exige upgrade major do Prisma/Firebase e o `xlsx` não tem correção publicada no advisory observado. `xlsx` está usado para exportação de planilhas no navegador; não foi removido nesta rodada para não retirar funcionalidade sem substituto verificado. Fazer avaliação/upgrade separado antes de produção.
- Portanto checkout com cartão/Pix real, mensagens de primeiro acesso/reset reais, host HTTPS de staging, credenciais comerciais, abertura de oferta, risco das dependências e publicação permanecem bloqueios de venda. Sem esses passos, a homologação técnica não equivale a 100% comercial.

## Atualização de e-mail transacional — 21/11/2026

- A configuração de e-mail da DK Soluções não estava no `.env`; encontrei uma integração BREVO ativa no cofre criptografado do PostgreSQL, usando `/etc/dk/integration-vault.key`. A rotina `refreshIntegrations()` foi executada como `dkapp` e os três valores ativos (provedor, remetente e chave) foram migrados diretamente para `/etc/dk/csdk/database.env`, sem passar por saída de terminal/Git. O arquivo CSDK continua `600 root:root`.
- CSDK agora envia primeiro acesso, reset e convites via BREVO ou Resend. Teste local do adaptador passou. A API BREVO autenticou a chave e confirmou o remetente configurado como ativo; nenhum e-mail de teste foi enviado.
- O staging reiniciou e responde HTTP 200; `dk-solucoes.service` permaneceu ativo. Auth, convite e webhook smoke tests passaram após a mudança.
- A URL canônica escolhida pelo proprietário é `https://dkfacilita.com`; esse valor foi configurado em `APP_URL` no ambiente privado do CSDK. O domínio ainda atende o site/serviço anterior e o CSDK está isolado no loopback; a troca pública para o CSDK e o envio de mensagens com esses links devem ocorrer juntos, após validar o release público. O staging segue sem vhost próprio.

## Atualização de publicação do domínio — 21/11/2026

- `https://dkfacilita.com` e `https://www.dkfacilita.com` agora passam pelo Apache para o CSDK em `127.0.0.1:3020`, servido por `csdk.service` em `/var/www/csdk-production`. O certificado HTTPS existente foi validado e está vigente até 12/01/2027.
- A produção usa cópia isolada do banco `csdk_prod_db`, com as migrations e dados-base do ambiente CSDK; staging segue em `csdk_db`/`csdk-staging.service`. A conta `SUPER_ADMIN` já está preparada. Segredos de produção estão em `/etc/dk/csdk/production.env` (`600`, fora do repositório); o JWT de produção é próprio.
- O serviço antigo `dk-solucoes.service`, o banco `dk_db` e os arquivos/releases anteriores foram preservados e continuam ativos para retorno. Antes do corte foram guardados dumps PostgreSQL de `dk_db` e `csdk_db`, configurações Apache/systemd e inventário dos virtual hosts em `/root/csdk-cutover-20261121T145855Z` (`700`). O retorno do domínio consiste em restaurar `dkfacilita.conf` dessa cópia, validar com `apache2ctl configtest` e recarregar o Apache.
- Verificações após o corte: `apache2ctl configtest` passou; raiz HTTPS, `/acesso` e `/api/health` responderam HTTP 200; certificado validou sem erro TLS; `dk-solucoes.service`, `csdk-staging.service` e `csdk.service` estão ativos. `/api/public/offers` retorna 503 porque a vitrine/checkout permanece desabilitada.
- `CSDK_PUBLIC_COMMERCE_ENABLED=false`; não há oferta comercial ativa no ambiente público. O domínio publica o sistema CSDK, mas isso não representa liberação de vendas/assinaturas.

## Retomada de homologação Mercado Pago — 21/11/2026

- Foram localizadas no ambiente privado da DK Soluções credenciais Mercado Pago TEST e produção e migradas para os arquivos CSDK protegidos. Ambas autenticaram na API. A configuração de produção permanece desativada para checkout público.
- A primeira tentativa de checkout TEST mostrou que o Mercado Pago rejeita a criação de uma assinatura pendente sem plano com `free_trial`. O código local foi ajustado para consultar o plano recorrente de sete dias vinculado à oferta e devolver seu checkout hospedado. O webhook agora pode associar o retorno do plano ao único pedido pendente que corresponda ao e-mail e à oferta; pedidos abertos repetidos pelo mesmo titular são reutilizados.
- Validações locais: `npm run lint`, `npm run build` e o contrato simulado do Mercado Pago passaram. Ainda falta executar os smoke tests no banco isolado da VPS com esta versão e concluir a homologação ponta a ponta com um comprador TEST. A versão corrigida ainda não foi declarada homologada.
- O checkout de assinatura aceita cartão pelo fluxo hospedado do Mercado Pago. Pix recorrente e pagamento dividido em dois cartões não estão implementados nem homologados; não anunciar esses meios até definir integração compatível.
- A produção e o staging continuam com `CSDK_PUBLIC_COMMERCE_ENABLED=false`; nenhuma compra ou cobrança real foi iniciada.
- O health check agora distingue credenciais Mercado Pago TEST/PRODUCTION configuradas e informa separadamente se a compra pública está habilitada; isso indica configuração, não homologação financeira ponta a ponta.

## Entrega incremental de checkout e conteúdo — 21/11/2026

- Código em `/var/www/csdk-staging` e `/var/www/csdk-production` atualizado pelo commit `6af6c13`; a cópia anterior da produção está preservada em `/root/csdk-cutover-20261121T145855Z/csdk-production-before-6af6c13.tar.gz` (`600`). O banco de produção continua com as nove migrations aplicadas.
- Validado no `csdk_db`: login e recuperação; equipe e convites; limites e isolamento entre empresas; configuração da empresa; provas; importação/edição de modelo PowerPoint e PDF; notificações; preço e idempotência do pedido; webhooks e conciliação; cancelamento do trial apenas pelo administrador. `npm run lint`, `npm run build` e a suíte de smoke tests passaram.
- Com a credencial TEST real, o plano de sete dias foi consultado e o checkout hospedado foi retornado pelo fluxo do CSDK. O pedido de teste foi removido e a oferta ficou inativa novamente; nenhum pagamento ou e-mail foi enviado.
- A seção de planos da página inicial passou a usar uma chamada comercial editável no Super Admin em “Site & Campanhas”. O teste pode ser cancelado na área “Minha conta”; a confirmação do Mercado Pago encerra a assinatura de teste.
- Produção responde com HTTPS válido e health `MERCADO_PAGO_PRODUCTION_CONFIGURED`, `publicCommerceEnabled=false`; `/api/public/offers` retorna 503. Nenhuma oferta ou pagamento de produção foi ativado.
- Pendências que ainda impedem declarar 100% comercial: o checkout com comprador TEST ainda precisa ser concluído ponta a ponta com um meio de pagamento de teste e webhook recebido; o Mercado Pago ainda precisa ser conferido para garantir que o webhook de produção aponta ao CSDK; os planos/ofertas do PostgreSQL ainda não têm uma tela no Super Admin para criar e ativar os preços usados pelo checkout; Pix e divisão entre dois cartões precisam de integração e homologação específicas antes de serem anunciados. Não abrir o checkout público enquanto essas etapas estiverem pendentes.

## Atualização de catálogo e ofertas — 21/11/2026

- Commit `74bad3d` sincroniza alterações de planos feitas pelo Super Admin com o catálogo PostgreSQL que alimenta o checkout. Remover um plano do catálogo público o desativa no banco de cobrança, preservando pedidos e assinaturas anteriores.
- O Super Admin agora tem “Ofertas & Cobrança”: cria ofertas recorrentes no ambiente Mercado Pago configurado, mantém ofertas novas inativas, confere preço/ciclo/teste contra o plano hospedado e permite ativar ou desativar a oferta para novas compras. A ativação de oferta não abre a vitrine pública; `CSDK_PUBLIC_COMMERCE_ENABLED` permanece `false`.
- Os textos da seção de planos da página inicial, inclusive o estado sem ofertas e o botão para clientes, têm valores comerciais padrão e são editáveis em “Site & Campanhas”. O aviso público “Checkout em preparação” foi removido.
- Verificados no staging após a nova versão: lint e build; smoke tests de autenticação, convites, isolamento/limites, configurações, provas e certificados, notificações, pedidos, webhook e cancelamento de trial; rota administrativa sem sessão responde `401`; teste com plano Mercado Pago TEST retorna link hospedado sem iniciar pagamento.
- A versão também está em produção. Backup da aplicação anterior ao commit está em `/root/csdk-cutover-20261121T145855Z/csdk-production-before-74bad3d.tar.gz` (`600`). HTTPS e API respondem `200`, a rota administrativa sem login retorna `401`, a rota pública de ofertas continua `503`, e `csdk.service`, `csdk-staging.service` e `dk-solucoes.service` permanecem ativos.
- Ainda não declarar venda 100% homologada: não foi concluída uma compra por comprador de teste com cartão e webhook recebido; a configuração do webhook de produção no painel Mercado Pago ainda precisa ser verificada. Pix e dois cartões continuam sem implementação/homologação para assinatura recorrente. Vendas públicas seguem bloqueadas até essas validações.

## Reconciliação do retorno do trial — 21/11/2026

- O código dos commits `fbca5e5` e `09b2282` foi atualizado no staging, validado com lint/build e smoke de pedido. O smoke simulou uma assinatura autorizada e confirmou o provisionamento idempotente de empresa, assinatura e uso de trial; todos os registros foram removidos ao final. `csdk-staging.service` permaneceu ativo e a health API respondeu `200`.
- A tela de retorno agora recupera o pedido salvo antes de sair para o checkout hospedado. Se o webhook ainda não processou, o status pode reconciliar a assinatura de trial pesquisando por pagador/plano e consultando o recurso completo do provedor. Isso é recuperação do retorno, não substitui webhook ou compra real.
- Uma sondagem isolada em Mercado Pago TEST tentou criar assinatura vinculada ao plano sem token de cartão; a API respondeu `400 card_token_id is required`, sem criar assinatura. Nenhum pagamento foi feito nessa tentativa. A documentação oficial confirma que `/preapproval/search` aceita `payer_email` e `preapproval_plan_id` como filtros.
- A produção e o domínio não foram atualizados nesta onda. `CSDK_PUBLIC_COMMERCE_ENABLED` continua desativado, ofertas públicas continuam indisponíveis e não foi usada credencial produtiva.
- Continuam pendentes a compra ponta a ponta com comprador/cartão TEST e webhook recebido, a confirmação de configuração de webhook da aplicação Mercado Pago em produção, e-mail real de primeiro acesso, cadastro/revisão de ofertas de produção, meios de pagamento adicionais, validação do ambiente PostgreSQL do cliente e do fluxo real de importação de modelos de PowerPoint de clientes distintos.

## Continuidade da compra e revisão de textos — 21/11/2026

- Os commits `b0b2b19` e `38a9ca5` foram atualizados no staging. O checkout foi revisado para usar mensagens comerciais claras sobre disponibilidade e extras não incluídos no valor, e a tela de retorno ganhou a opção de reabrir o pagamento do mesmo pedido quando ele continua pendente.
- `npm run lint`, `npm run build` e o smoke de pedido/reconciliação foram executados no staging; o serviço reiniciou, permaneceu ativo e a health API respondeu `200`. O checkout público em produção segue fechado (`/api/public/offers` = `503`); `csdk.service` e `dk-solucoes.service` seguem ativos. Nenhuma cobrança produtiva foi iniciada.
- A auditoria de dependências foi repetida: ainda existem 9 vulnerabilidades altas em `@grpc/grpc-js` via Firebase, dependências de Prisma 6 e `xlsx`; `xlsx` não tem correção disponível no registry e as outras recomendações automáticas exigem versões principais incompatíveis. A substituição/atualização exige migração e testes próprios, não uma atualização forçada em produção.

## Sincronização da versão validada na produção — 21/11/2026

- O código validado no staging, até `c992ac6`, foi sincronizado para `/var/www/csdk-production`. Backup anterior salvo e validado em `/root/csdk-cutover-20261121T145855Z/csdk-production-before-38a9ca5.tar.gz` com modo `600`; `.env`, `node_modules` e `storage` foram preservados e não sobrescritos.
- O banco `csdk_prod_db` já estava com as 9 migrations em dia. `npm run lint` e `npm run build` passaram no diretório de produção; `csdk.service` reiniciou e permanece ativo. `https://dkfacilita.com/api/health` respondeu `200`, `/api/public/offers` continua `503` e `dk-solucoes.service` continua ativo.
- A implantação não abre vendas. A homologação de pagamento com comprador de teste e webhook recebido, a configuração da aplicação no painel Mercado Pago e o e-mail real de primeiro acesso ainda precisam ser concluídos antes de ativar a vitrine.

## Correção de dependências e planilhas — 21/11/2026

- O commit `5fd575d` foi sincronizado para staging e produção. `xlsx` foi removido por não haver importação com essa biblioteca; as duas exportações simples agora geram `.xlsx` a partir do JSZip já utilizado, e o CSV protege fórmulas iniciadas por `=`, `+`, `-` ou `@`. O lockfile Bun e o lockfile npm foram atualizados.
- `@grpc/grpc-js` ficou fixado em `1.13.6`, versão corrigida e compatível com a dependência Firebase atual. `npm audit --omit=dev` caiu de 8 para 4 vulnerabilidades altas; as quatro restantes vêm de `deepmerge-ts`/`effect` em Prisma 6 e requerem a migração testada para Prisma 7. Nenhuma atualização forçada foi aplicada.
- Passaram lint, build, contrato XLSX/CSV, contrato Mercado Pago e smoke de pedido com trial/reconciliação no staging. O banco de produção manteve as 9 migrations em dia. `dkfacilita.com` responde `200`, `/api/admin/commerce` sem sessão responde `401`, `/api/public/offers` segue `503`; os serviços CSDK, staging e DK Soluções permanecem ativos.
- Backup de produção anterior a esse deploy: `/root/csdk-cutover-20261121T145855Z/csdk-production-before-5fd575d.tar.gz` (`600`). As vendas públicas continuam fechadas até homologar uma compra TEST real, webhook e e-mail de primeiro acesso.

## Auditoria completa de dependências — 21/11/2026

- O commit `40b7014` acrescenta overrides testados para `deepmerge-ts` `8.0.2`, `effect` `3.22.5` e `image-size` `2.1.0`, mantendo `@grpc/grpc-js` `1.13.6` e removendo a dependência vulnerável `xlsx`. `npm audit` completo agora retorna zero vulnerabilidades.
- No staging foram atualizados os lockfiles e dependências, Prisma Client foi gerado e as nove migrations seguem em dia. Passaram lint/build e smoke de autenticação/recuperação, equipe/convites, avisos, operações multiempresa e limites, configuração/assinaturas do certificado, importação real de PPTX sintético com prévia e emissão PDF, pedido/trial/reconciliação idempotente, cancelamento, webhooks, exportação XLSX/CSV e renderização de template. Os dados de teste são limpos pelos scripts; os casos de e-mail usam mock.
- O teste de PPTX foi executado com `/usr/bin/google-chrome`, `/usr/bin/libreoffice` e `/usr/bin/pdftoppm`, que correspondem aos binários configurados no serviço. Após reiniciar, `csdk-staging.service` está ativo e a health API responde `200`.
- Os overrides são dependências transitivas de configuração e ferramentas de teste; lint, build e smoke das rotas que carregam Prisma 6 e `pptxgenjs` passaram com as versões corrigidas. O próximo deploy a produção deve repetir `npm ci`, gerar Prisma Client, lint/build, audit e health.

## Correção de texto da vitrine — 21/11/2026

- Commit `29dd76c` troca a descrição técnica persistida no CMS da seção de preços por uma chamada comercial. O Super Admin continua editando os textos em “Site & Campanhas”; uma dica no campo orienta escrever benefícios para o cliente. Descrições antigas que falam de checkout ou de funções “em implantação” são substituídas visualmente pela chamada comercial.
- O build do commit passou no staging. O `dist` compilado foi publicado em `/var/www/csdk-production/dist`; a cópia anterior está em `/root/csdk-cutover-20261121T145855Z/csdk-dist-before-29dd76c.tar.gz` com permissão `600`. Nenhum banco, credencial, arquivo de tenant ou serviço DK Soluções foi alterado nesta publicação.
- Depois do deploy, `csdk.service`, `csdk-staging.service` e `dk-solucoes.service` estavam ativos; raiz HTTPS respondeu `200` com TLS válido, health respondeu `200`, `/api/admin/commerce` sem sessão respondeu `401` e `/api/public/offers` respondeu `503` porque as vendas continuam fechadas.

## Atualização web e validação de rotas — 21/11/2026

- O commit `3a6acae` foi integrado ao staging em `/var/www/csdk-staging`; `npm run build` passou. O build divide cliente, administração, operação, checkout e páginas públicas em módulos carregados sob demanda.
- Somente o diretório web `/var/www/csdk-staging/dist` foi sincronizado para `/var/www/csdk-production/dist`. Cópia anterior: `/root/csdk-production-dist-before-3a6acae.tar.gz`, permissão `600`. Backend, banco de dados, credenciais, arquivos persistentes de clientes, Wix, DNS e DK Soluções não foram alterados nesta publicação.
- `csdk.service` foi reiniciado. No Chrome headless, a página inicial, `/acesso` (login PostgreSQL) e `/checkout` (sem ofertas, pois a vitrine segue desligada) renderizaram sem erros JavaScript. HTTPS e `/api/health` responderam `200`; `/api/public/offers` respondeu `503`; chamadas sem sessão ao painel administrativo e ao cancelamento de trial responderam `401`.
- O pacote principal caiu de `1,59 MB` para `839 KB` (`256 KB` comprimidos), mas ainda gera aviso do limite de `500 KB`; o build também mantém aviso de configuração futura do Vite. O login de compradores PostgreSQL continua em `/acesso`; as telas legadas Firebase permanecem disponíveis em seus fluxos existentes.

## Atualização de homologação financeira — 21/11/2026

- O formulário seguro tokenizou o cartão de teste (HTTP 201). A criação da assinatura associada ao plano foi recusada pelo Mercado Pago com HTTP 400 (`Resource not found`). A tentativa de usar `X-scope: stage` no POST de assinatura foi recusada com HTTP 403 (`At least one policy returned UNAUTHORIZED`); esse cabeçalho foi removido do fluxo de plano associado.
- O plano TEST está ativo e declara sete dias gratuitos, mas não retorna `sandbox_init_point`. O `init_point` retornado abriu uma página de erro do Mercado Pago. O checkout TEST agora exige o link de sandbox e, se ausente, devolve erro controlado e libera o pedido para nova tentativa, sem redirecionar para a página inválida.
- O ensaio foi executado no banco de staging com e-mails externos desativados. Não sobraram pedidos, usuários, empresas ou registros de uso de teste; oferta e plano locais foram restaurados ao estado inativo.
- No commit `f3d3078`, lint, build, contrato Mercado Pago e smoke de pedidos passaram no VPS. Os serviços `csdk`, `csdk-staging` e `dk-solucoes` estão ativos. As APIs de saúde de staging e produção respondem HTTP 200; ofertas públicas respondem HTTP 503.
- Os arquivos de rota de pedidos e serviço Mercado Pago foram copiados para produção após backup em `/root/csdk-before-f3d3078-server.tar.gz` (modo 600). O comércio público permanece desligado pelo systemd e pelo ambiente: `CSDK_PUBLIC_COMMERCE_ENABLED=false`.

### Bloqueio atual para venda

A autorização de assinatura e o checkout hospedado TEST ainda não foram comprovados. O Mercado Pago precisa fornecer/permitir um fluxo TEST que aceite criar assinatura associada ao plano e disponibilize um link de sandbox utilizável. Até isso ocorrer, não ativar ofertas públicas nem considerar a cobrança de trial homologada. O recebimento real de e-mail de primeiro acesso também permanece pendente.
