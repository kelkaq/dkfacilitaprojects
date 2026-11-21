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
