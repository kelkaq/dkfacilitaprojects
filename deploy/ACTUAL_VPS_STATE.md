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
