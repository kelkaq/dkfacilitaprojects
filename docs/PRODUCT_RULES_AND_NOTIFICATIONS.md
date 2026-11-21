# Regras do produto CSDK e notificações internas

## Regra central: cada cliente é um ambiente próprio

O Certifica Software - DK (CSDK) é o produto da DK Facilita. O CertificaNR da ALFA é uma referência de fluxos e qualidade documental, não uma configuração obrigatória nem uma fonte de dados para novos clientes. Nenhuma identidade, texto, assinatura, arte, cargo, modelo ou regra particular da ALFA deve ser aplicada automaticamente a outra empresa.

Cada contratante possui seu próprio conjunto de usuários, obras, colaboradores, treinamentos, questões, turmas, provas, evidências, assinaturas, documentos, modelos de certificado e configurações. O catálogo inicial e os modelos padrão da plataforma são opções para adoção e personalização. Um certificado emitido guarda o modelo, a configuração de assinaturas e as evidências usados naquela emissão, sem mudar quando a empresa altera suas preferências.

As assinaturas exigidas são configuradas por empresa e treinamento ou modelo. Papéis possíveis incluem colaborador, instrutor/TST, responsável técnico e representante da empresa, com obrigatoriedade, ordem, forma digital ou física e autorização do signatário definidas explicitamente. A emissão valida a configuração efetiva daquele treinamento; nenhum conjunto fixo de signatários é herdado da ALFA.

## Acesso dos usuários

Uma vaga do plano corresponde a uma pessoa com conta individual e vínculo ativo com a empresa. Participantes de prova pública e pessoas que consultam QR Code não ocupam vaga. É preciso implementar convite, aceite, entrada por e-mail/senha ou provedor externo, recuperação de senha por link de uso único, encerramento de sessões após recuperação, troca assistida de e-mail, desativação e trilha de auditoria. As permissões e o limite de vagas devem ser verificados no servidor em cada operação.

## Central de comunicados da DK Facilita

O painel do dono terá uma área para criar, revisar, agendar, enviar, acompanhar e cancelar comunicados. Cada mensagem terá título, texto, categoria, prioridade, autor, período de exibição, link opcional, destino e estado (rascunho, agendada, ativa, encerrada, cancelada). Um aviso sobre mudança de NR pode incluir a fonte e a data de vigência; o texto é informado pelo administrador, sem atualização automática do catálogo de treinamentos do cliente.

O destinatário pode ser: todos os usuários ativos do CSDK, administradores das empresas, perfis específicos, empresas selecionadas ou um usuário selecionado. A seleção é resolvida no servidor a partir dos vínculos ativos. Cada destinatário recebe estado próprio: entregue, visualizada, lida, dispensada e, quando aplicável, confirmação obrigatória. Leitura de uma pessoa não marca a mensagem como lida para os demais.

O administrador escolhe envio imediato ou horário agendado, fuso horário, início e fim de exibição. A repetição pode ser nenhuma, diária, semanal ou mensal, com horário, data final ou número máximo de ocorrências. O sistema registra cada ocorrência e cada entrega, evita duplicatas por destinatário e ocorrência e permite pausar ou cancelar futuras ocorrências. Um comunicado já entregue permanece no histórico mesmo após cancelamento.

No painel do cliente, um sino com contador de não lidas abre a caixa de notificações. Uma mensagem prioritária pode aparecer como pop-up na primeira abertura após a entrega; o usuário pode dispensá-la ou confirmar leitura conforme a configuração. O histórico continua disponível no sino. Avisos críticos podem exigir confirmação, mas não devem impedir tarefas essenciais sem uma regra explícita para esse tipo de bloqueio.

Notificação interna no aplicativo é o primeiro canal. Push do navegador, e-mail e WhatsApp são canais adicionais, sujeitos a consentimento, permissões do dispositivo, configuração do plano e registro de falhas. Fechar a aba não deve causar perda da mensagem: ela continua na caixa interna e aparece no próximo acesso. O painel do dono mostra público selecionado, quantidade entregue, lida, confirmada e falhas, sem expor dados de outra empresa ao contratante.

## Critérios de aceite

1. Um comunicado global enviado pelo dono aparece para usuários ativos de duas empresas de teste; cada leitura é independente.
2. Um comunicado restrito a uma empresa ou perfil não aparece para os demais.
3. Uma mensagem agendada aparece no horário e fuso configurados; repetição e cancelamento não geram entregas duplicadas.
4. O sino, o pop-up e o histórico funcionam em computador e celular e sobrevivem a logout e novo login.
5. Só o dono ou administradores autorizados da DK Facilita podem criar comunicados globais. Um cliente não altera a mensagem nem o estado de leitura de outra pessoa.
6. Um cliente novo inicia sem dados ou modelos da ALFA. Seus documentos usam apenas sua configuração e a versão aprovada do modelo escolhido.

## Estado do código em 20/11/2026

O projeto possui `notificacoes_admin`, voltada a eventos recebidos pelo dono da plataforma. Ainda não há central de comunicados do dono para usuários dos contratantes, caixa individual com sino, agendamento, repetição ou registro de entregas. Essas funções exigem modelos de dados, processamento no servidor, permissões, API e telas específicas. O trabalho de implementação deve preservar o layout existente e validar os fluxos com várias empresas.

## Pendências adicionais da revisão do produto

### P0 — condição para operação comercial

- Definir um banco de produção único e ligar todas as telas a ele. O schema Prisma existe, mas os fluxos atuais usam Firestore; a implantação descrita para PostgreSQL não corresponde à aplicação executada.
- Garantir isolamento por empresa também em arquivos, documentos, tarefas agendadas, links públicos e auditoria. Testar acesso cruzado com duas empresas e perfis distintos.
- Implementar autenticação, recuperação de conta, convite e limite de usuários no servidor. Proteger o painel do dono por identidade e permissão verificadas no servidor, não por comparação com um e-mail fixo na tela.
- Processar preços, cobrança, confirmação, renovação, atraso, estorno e cancelamento no servidor. Clientes não podem alterar direitos do plano ou marcar faturas como pagas.
- Processar identificação, participação, PIN, prazo, respostas, nota e tentativa de prova no servidor. Gabarito e PIN não devem ser enviados no documento público da turma.
- Bloquear emissão sem evidência e sem as assinaturas exigidas pela configuração daquele cliente. Emitir documento e validação pública em operação consistente, com número único, versão e hash do arquivo final.
- Fazer o QR Code abrir a validação correspondente e guardar a versão do documento emitido. Links de dossiê devem expirar no servidor.
- Criar armazenamento durável, cópias de segurança e restauração testada para PDFs, PowerPoints, fotos e assinaturas, além do banco. Definir retenção e exportação de dados do cliente.

### P1 — paridade operacional e serviço ao cliente

- Implementar modelos próprios por empresa e, quando necessário, por treinamento: upload, análise das formas do PowerPoint, mapeamento assistido dos campos, prévia com dados fictícios, aprovação, versionamento e conversão PDF. O upload atual com substituição de tags não equivale ao trabalho feito para a ALFA.
- Completar participação persistida por turma, importação em massa de colaboradores, listas de presença, comprovantes, dossiês, relatórios e emissão em lote segundo uma matriz de paridade com o CertificaNR publicado.
- Configurar por cliente os tipos de capacitação, regras de presença, avaliação, nota, tentativas, prazo, assinaturas e fluxo de aprovação. A configuração efetiva precisa ser congelada por aplicação e documento.
- Implantar notificações internas do dono aos clientes e avisos operacionais da própria empresa, com públicos, agendamento, histórico e preferências distintas. Definir quais avisos são informativos e quais exigem confirmação.
- Completar alertas de vencimento realmente enviados, canais contratados, preferências e registro de entrega. Textos comerciais devem refletir apenas funções disponíveis.
- Criar suporte operacional: painel de saúde, fila de falhas, auditoria de ações administrativas, atendimento ao cliente e procedimento de correção ou revogação de documentos.

### P2 — lançamento e qualidade

- Homologar site, login, painel do dono e painel do cliente em celular e desktop com dados de teste; conferir acessibilidade, estados vazios, erros, impressão e arquivos finais.
- Revisar marca e textos para remover pressupostos da ALFA e afirmações técnicas que ainda não foram verificadas. O catálogo de NRs deve permitir atualização controlada sem alterar históricos dos clientes.
- Corrigir instalação, build e guia de deploy; preparar ambiente de teste na VPS, migrações, observabilidade, cópia anterior e procedimento de retorno antes de substituir o site atual.
- Definir termos comerciais, política de privacidade, papéis de tratamento dos dados, canais de suporte, ciclo de cobrança e procedimento de saída do cliente com exportação dos dados.

## Compra e primeiro acesso — decisão de produto

O comprador pode ser pessoa jurídica com CNPJ ou profissional autônomo com CPF. O cadastro deve pedir primeiro o tipo de titular (empresa ou pessoa física) e adaptar nomes de campos, documento fiscal, responsável pela conta e dados de cobrança. CPF e CNPJ precisam de máscara durante a digitação e validação dos dígitos verificadores; no banco, guardar valor normalizado e tipo de documento separados. O contrato e a cobrança pertencem ao titular informado. Uma pessoa física também recebe um ambiente isolado e pode convidar usuários até o limite do plano.

O checkout deve funcionar como uma compra clara: seleção de plano, ciclo, adicionais e teste; identificação do titular e do comprador; resumo de preço, vencimento e condições; criação do pedido; pagamento pelo provedor; confirmação assíncrona; ativação da assinatura; envio de mensagem de boas-vindas e convite de primeiro acesso. O e-mail de cobrança pode ser diferente do e-mail do administrador da conta. A compra não deve exigir que o usuário já esteja autenticado com Google.

Para teste grátis, registrar a conta em estado TRIAL, verificar o e-mail do administrador e conduzi-lo ao primeiro acesso. Para compra imediata, manter pedido e ambiente em AGUARDANDO_PAGAMENTO até confirmação confiável do provedor; a tela de sucesso deve distinguir pedido criado, pagamento pendente e conta ativa. Quando o comprador volta depois de fechar o navegador, o pedido e a conta continuam recuperáveis por e-mail e link seguro. Não coletar uma senha que depois não será usada. Se houver senha, a criação e a recuperação devem pertencer ao serviço de identidade real; a senha nunca é enviada por e-mail. A mensagem de boas-vindas contém link de ativação de uso único e instruções simples.

Depois da ativação, o assistente de primeiro acesso confirma dados do titular, endereço, logo, cor, prefixo, modelo inicial, responsáveis e política de assinaturas. Esses dados podem ser alterados depois, respeitando permissões e sem modificar documentos históricos. Para autônomo, o assistente não pode exigir CNPJ ou razão social. Máscaras de documento e telefone devem ser consistentes no checkout, painel, comprovantes e administração.

### Achados atuais que motivam a mudança

- O formulário atual exige razão social e CNPJ, não oferece CPF e não aplica máscara automática ao documento ou WhatsApp.
- O primeiro acesso exibe CNPJ em campo somente leitura e usa UF `RJ` como valor inicial quando não houver UF da conta, o que pode preencher incorretamente outro cliente.
- O checkout pede senha, mas apenas calcula um hash descartado; o login efetivo é por Google.
- O checkout cria a conta em TRIAL inclusive quando o comprador escolhe contratação imediata, antes de concluir o pagamento. A tela oferece confirmação manual do pagamento pelo próprio comprador.
- Não há jornada completa de pedido, confirmação, boas-vindas, ativação de conta e retomada após abandonar ou fechar a página de pagamento.

## Carrinho, teste com cartão e contratação

O checkout terá etapas visíveis: 01 Carrinho, 02 Dados do titular e administrador, 03 Pagamento, 04 Confirmação e primeiro acesso. O carrinho contém uma assinatura principal com plano e ciclo, adicionais opcionais, quantidades quando aplicável, cupom, resumo de preço de hoje, preço e data da próxima cobrança. Alterar plano, ciclo ou adicional recalcula o pedido no servidor. O pedido guarda uma versão dos preços e condições aceitos pelo comprador.

O teste de sete dias exige um cartão válido cadastrado antes da ativação. O cliente vê antes de confirmar: o que está liberado no teste, limites de usuários/colaboradores/obras, adicionais incluídos ou não, valor do primeiro ciclo, data e horário da primeira cobrança, regra de cancelamento e canal para cancelar. Se cancelar antes da data informada, a cobrança futura deve ser interrompida e o cancelamento deve gerar confirmação no painel e por e-mail. O sistema registra aceite dessas condições. A política de produto para o trial precisa definir se ele replica o plano escolhido ou oferece um pacote único, se adicionais pagos participam do teste, se há limite de uma avaliação por titular e o que acontece com documentos ao término.

Para contratação imediata, oferecer cartão único e Pix. O pedido só é ativado após confirmação confiável. O usuário pediu também pagamento com dois cartões: essa modalidade precisa de validação específica com o provedor e definição de como dividir o primeiro pagamento e as renovações. Não apresentar a opção no checkout até existir processamento, conciliação, reembolso e tratamento de falha de um dos dois pagamentos. Pix não satisfaz o requisito de cartão obrigatório do teste; pode ser alternativa para compra imediata conforme a política comercial.

Cupons têm código, tipo (valor ou percentual), validade, limite de uso, público elegível, planos/ciclos/adicionais permitidos, regra de cumulatividade, uso no primeiro ciclo ou recorrente e tratamento no teste. O servidor valida elegibilidade e calcula o total, registra o resgate e impede reutilização indevida. O preço exibido ao cliente deve coincidir com o valor enviado ao provedor e com a fatura.

O estado do pedido deve distinguir carrinho, aguardando dados, aguardando cartão, aguardando pagamento, trial ativo, assinatura ativa, pagamento recusado, cancelado e expirado. Eventos do provedor são processados com idempotência; fechamento da aba, repetição do webhook ou pagamento parcial não podem criar duas contas, duas cobranças nem liberar plano indevidamente. O painel do cliente terá área clara para ver próxima cobrança, cartão mascarado, trocar cartão, cancelar renovação e baixar comprovantes.

### Estado atual do código

O checkout atual usa um formulário único com resumo lateral, sem carrinho persistido nem cupom. O trial é liberado sem cartão. A cobrança usa uma chamada de pagamento avulso; não há assinatura recorrente operacional, pagamento com dois cartões ou política de conversão do trial. A ausência de chave do provedor aciona um modo simulado que não pode chegar à produção.

## Achados adicionais da revisão profunda — 20/11/2026

- Bloqueio financeiro: `firestore.rules` permite ao titular alterar status, plano, valor, adicionais e identificador de cobrança da própria empresa; permite criar faturas e marcá-las como pagas. Direitos e fatos financeiros devem ser escritos apenas por serviço confiável após evento verificado do provedor.
- Bloqueio de identidade: `/api/auth/session-token` assina JWT para `userId`, `email`, `perfil` e `empresaId` enviados no corpo, sem comprovar identidade. `/api/tenant/evaluate-access` avalia estado enviado pelo cliente. Substituir por identidade e vínculo consultados no servidor.
- Bloqueio de membros: `isTenantMember` verifica a existência do documento, mas não `ativo`, nem perfil por operação. Desativação e papéis não impedem acesso efetivo. Validar vínculo ativo e autorização por ação.
- Bloqueio do trial: cadastro e status da empresa são criados pelo navegador, sem cartão, controle por CPF/CNPJ ou cota confiável. A criação e elegibilidade devem ser transacionais no servidor.
- Bloqueio da prova: `pinHash` contém o PIN em texto no documento público; nota e status são calculados no navegador e aceitos nas tentativas públicas. Mover PIN, limite de tentativas, correção e registro de resultado para o servidor.
- Bloqueio da emissão: membro pode gravar certificado e validação pública diretamente; regras de formato não comprovam presença, aprovação, assinaturas, pagamento, cota ou número único. Centralizar emissão consistente no servidor.
- Carta de Anuência: o modal gera declaração de autorização mesmo sem carta vinculada. Exigir criação e aprovação expressas por responsável; caso contrário, não oferecer o documento.
- Horários fictícios: modal e telas de provas/dossiês substituem horários ausentes por 17:00, 08:00, 16:45 ou 08:00 às 17:00. Capturar horários reais ou indicar ausência.
- Métricas: MRR usa status e preços atuais até para meses passados; não representa histórico contratual nem recebimentos. Recalcular a partir de contratos e faturas versionados.
- Analytics: heartbeat aceita escrita sem autenticação e o painel varre toda a coleção sem retenção visível. Registrar/agregar no servidor com limites e retenção.
- Tokens: turma, dossiê e QR usam `Math.random`; PIN tem quatro dígitos. Usar gerador criptográfico, unicidade, prazo, revogação e limite de tentativas.
- Onboarding: copia só cinco NRs e usa múltiplas escritas independentes; falhas podem deixar conta incompleta. Tornar idempotente e recuperável.
- PPTX: upload e render aceitam `empresaId` do corpo sem autenticação/autorização por empresa. Proteger rotas e gerir armazenamento e versões.

Ordem: (1) bloquear identidade e escrita financeira inseguras; (2) escolher banco de produção e construir API multiempresa com permissões; (3) corrigir provas, emissão e documentos; (4) concluir checkout, trial e cobrança; (5) modelos próprios, notificações e operação; (6) homologar clientes fictícios distintos antes do domínio público.

## Execução das quatro ondas — estado em 20/11/2026

O trabalho está na branch `feature/csdk-production-waves`. A primeira correção removeu o pin incompatível de `esbuild`, gerou `package-lock.json` e passou em `npm run lint` e `npm run build`. A rota `/api/auth/session-token`, que antes assinava identidade enviada pelo cliente, agora retorna 410; um teste HTTP local confirmou o bloqueio. O checkout deixou de solicitar esse token e de afirmar que havia sessão JWT administrativa.

A VPS Locaweb foi acessada por SSH e inspecionada. `dkfacilita.com` aponta para um sistema separado em `/var/www/dk-solucoes`, servido por Apache; seu PostgreSQL usa o banco `dk_db`. Essa aplicação não foi modificada. Foi clonado o repositório GitHub do CSDK em `/var/www/csdk-staging` no commit `fdb146e`, sem iniciar serviço nem alterar DNS/Apache. As correções locais ainda não estão nesse clone. O CSDK ainda não foi implantado nem apontado para o domínio. Deve usar banco e ambiente de homologação próprios para não interromper o serviço existente.

As ondas não estão concluídas: serviços do CSDK ainda usam Firebase/Firestore; não existe autenticação PostgreSQL operacional, checkout real com cartão, emissão transacional nem homologação de dois tenants. Não remover Firebase antes de migrar e testar todos os consumidores. Não anunciar o produto como pronto até os testes completos de cada onda e a validação de produção.

Continuação: as dependências Prisma foram adicionadas, o schema passou a distinguir PF/PJ por `tipoDocumento` e `documento` único, com tabelas de convite, recuperação e auditoria. `prisma validate` e `prisma generate` passaram. Na VPS foi criado o banco isolado `csdk_db` e credencial própria em arquivo protegido em `/etc/dk/csdk/database.env`. O serviço e banco atuais permanecem em operação. Backup anterior à troca: `/root/csdk-predeploy-20261120`.

A migration inicial original não correspondia ao schema Prisma (UUID versus TEXT). Como `csdk_db` era novo e continha zero empresas, foi reconstruída a migration inicial a partir do schema, recriado somente `csdk_db` e aplicado `prisma migrate deploy`; `prisma migrate status` confirmou banco atualizado. Foi iniciada uma API de login PostgreSQL com verificação de senha e sessão revogável; ainda faltam onboarding pela API, convites, recuperação, limite de tentativas, migração das telas e testes de integração. Nenhuma rota pública foi apontada para essa API.

Na VPS, o teste `scripts/auth-smoke-test.ts` passou com contas temporárias removidas ao final: token arbitrário rejeitado, senha errada rejeitada, login válido, mídia CMS bloqueada para cliente, upload PPTX de outra empresa bloqueado, membro inativo bloqueado e token invalidado após logout global. `npm run lint` e `npm run build` passaram também em `/var/www/csdk-staging`. Isso valida apenas a base da identidade; os demais fluxos continuam sem homologação. Não há credenciais Mercado Pago ou SMTP configuradas para o CSDK; cobrança e e-mails de ativação/recuperação dependem dessas integrações.

### Decisão atualizada: Mercado Pago

O proprietário escolheu Mercado Pago como provedor financeiro. Toda referência anterior a Asaas é legado do código e do plano inicial, não uma decisão vigente. O checkout não deve enviar número completo de cartão ou CVV ao backend CSDK; utilizar tokenização do Mercado Pago e criar assinatura com `card_token_id`. O teste de 7 dias deve ser configurado no plano/assinatura e só ativado depois de confirmar no servidor que a assinatura e o cartão foram aceitos pelo provedor. Pix atende à compra imediata, com ativação após confirmação verificada. Eventos de assinatura e cobrança recorrente precisam de webhook validado, consulta ao recurso no provedor e processamento idempotente. Até existirem credenciais de teste e produção da conta DK e homologação completa, não cobrar nem ativar trial comercial.

O schema passou a ter `Pedido` com estado e snapshot de preço, `UsoTrial` único por documento e `PagamentoEvento` para deduplicação de notificações. É apenas a base de dados; checkout e webhook ainda não utilizam essas tabelas. As colunas legadas `asaas*` permanecem para migração e não devem ser usadas em novos fluxos. Falta configurar e validar o plano gratuito de 7 dias no Mercado Pago e a tokenização do cartão no checkout.

Foi adicionado `POST /api/public/orders` para criar carrinho com CPF/CNPJ validado pelos dígitos verificadores, preço calculado do catálogo no servidor e chave de idempotência. O pedido permanece `CARRINHO`: a rota não ativa trial, não cobra e não concede acesso. Teste de integração com PostgreSQL isolado deve confirmar preço, reuso de chave, conflito e ausência de ativação. A interface atual ainda não consome essa rota.

O webhook `POST /webhooks/mercado-pago` verifica HMAC `x-signature` com `data.id`, `x-request-id` e janela de cinco minutos, e grava o ID do evento de forma única no PostgreSQL. Ele ainda não reconcilia a assinatura/pagamento no Mercado Pago e não ativa contas. Foi identificado que `/etc/dk/dk-solucoes.env` contém credenciais Mercado Pago e que a credencial principal autentica em `/users/me`; nenhuma chave foi copiada para o repositório. É necessário homologar especificamente Assinaturas com plano, período gratuito, cartão tokenizado, Pix e webhooks antes de usar credenciais produtivas no CSDK.

O proprietário confirmou que os dados atuais do Firebase do CSDK são apenas testes e podem ser reiniciados. Assim, não haverá importação de cadastros de teste; o ambiente comercial começa vazio por empresa. A remoção do Firebase do código continua condicionada à migração das telas/serviços para a API PostgreSQL, sem trazer dados da ALFA.

Foi criado um adaptador de Assinaturas Mercado Pago que usa `preapproval_plan` para sete dias grátis e `preapproval` com `card_token_id`; teste de contrato local passou. Em 20/11/2026, a credencial `TEST-` já existente na VPS criou um plano de homologação de R$ 10,00 mensais com `free_trial` de sete dias em BRL. O ID ficou somente em `/etc/dk/csdk/mp-test-plan.json` (permissão 600), fora do Git. Esse teste não criou assinatura nem realizou cobrança. Falta tokenizar cartão em MercadoPago.js/CardForm, criar uma assinatura de teste com comprador de teste, receber e reconciliar webhook e só então liberar conta.

O schema agora tem `PlanoOferta` para vincular plano/ciclo/preço do CSDK ao plano de assinaturas do Mercado Pago, separando ambiente TEST de PRODUCTION. A oferta de homologação é mantida inativa no catálogo comercial. Ainda falta versionar ofertas comerciais reais e conferir preço/estado na confirmação da assinatura.

Atualização posterior: `GET /api/public/offers` lista somente ofertas ativas do ambiente de pagamento configurado e cujo preço coincide com o catálogo. `POST /api/public/orders` exige modo TRIAL ou IMEDIATO, oferta ativa do mesmo ambiente e valor exato; grava a oferta e as condições no pedido. Se não houver ambiente configurado ou houver divergência de preço, a compra é bloqueada. O trial verifica uso anterior por CPF/CNPJ. Ainda não há ativação nem cobrança por essas rotas. A oferta TEST interna segue inativa.

As rotas antigas que geravam certificado, comprovante, dossiê, carta, lista e pacote a partir de payload arbitrário do navegador agora retornam 410. A emissão deverá ler turmas, provas, assinaturas e certificados persistidos e autorizados antes de gerar qualquer documento. A rota de avaliação de acesso baseada no estado informado pelo cliente e a rota pública de hash de senha também foram fechadas.

O backend de recuperação de senha dispõe de pedido de link por e-mail e confirmação de token de uso único, com expiração de 30 minutos, senha de pelo menos 12 caracteres e revogação de sessões após a troca. O envio foi preparado para Resend, mas não será configurado no CSDK público até o login e a página de redefinição usarem PostgreSQL. Não há e-mail real enviado pela homologação até aqui.

A API de usuários da empresa agora lista membros e convites pendentes, reserva vaga do plano ao convidar, exige assinatura ativa e envia convite de 48 horas. O aceite cria usuário somente no mesmo tenant, com senha própria; a cota é conferida novamente na transação. Esta base ainda não está ligada ao painel Firebase nem dispõe de tela de aceite, revogação/reativação de membros ou participação da mesma pessoa em mais de uma empresa. Convites reais permanecem indisponíveis enquanto o CSDK não tiver remetente e interface de primeiro acesso ativos.

O login PostgreSQL agora limita dez tentativas inválidas por par IP/e-mail a cada quinze minutos. A proteção atual fica em memória de um processo; antes de escalar horizontalmente, mover a contagem para armazenamento compartilhado e incluir proteção de borda. Na VPS, o Apache deverá encaminhar o IP real somente a partir do proxy local confiável.

`GET /api/tenant/access` agora deriva bloqueio e limites da empresa, assinatura, plano e contagens reais no PostgreSQL usando a empresa da sessão autenticada. A rota antiga, que aceitava estado de plano arbitrário do navegador, segue fechada. Esta consulta ainda não substituiu os guards da interface e das operações legadas do Firebase.

O administrador da empresa pode revogar convite pendente e ativar/desativar membro por API. A desativação incrementa a versão de sessão e invalida o token anterior. O próprio administrador não pode desativar a si mesmo, e reativação confere novamente status da conta e limite do plano. Ainda falta ligar esses comandos às telas.

Foram criadas páginas separadas em `/acesso`, `/resetar-senha`, `/aceitar-convite` e `/minha-conta` para homologar login por e-mail, recuperação, aceite de convite e administração da equipe com API PostgreSQL. Elas não substituem ainda o painel operacional legado em `/app`. O login navegador pode usar cookie HttpOnly/Secure/SameSite Strict quando `CSDK_COOKIE_AUTH=1` e a origem corresponde a `APP_URL`; mutações autenticadas por cookie exigem a mesma origem. O backend mantém Bearer para clientes e testes. Visual do login conferido em capturas local desktop e largura de celular; fluxo interativo com conta real ainda depende de ambiente HTTPS CSDK separado.

Atualização do checkout e conciliação: o pedido exige titular, responsável e WhatsApp, e `POST /api/public/orders/:id/checkout` cria assinatura hospedada no Mercado Pago em estado pendente, sem enviar cartão ao CSDK. Repetição da chamada recupera a assinatura por referência externa e não cria outra. O link do provedor só é aceito em domínio Mercado Pago. Webhook `subscription_preapproval` busca o estado atual; somente assinatura `authorized`, preço/moeda/referência conferidos e, no trial, cartão presente + sete dias confirmados, criam empresa, administrador, assinatura e uso único do trial. O administrador recebe link temporário de primeiro acesso quando Resend estiver configurado. Webhook `subscription_authorized_payment` busca a fatura recorrente, valida assinatura, valor e BRL e atualiza fatura/assinatura/empresa; pagamento aprovado converte trial em ativo, falha bloqueia como inadimplente. Cancelamento/suspensão pela assinatura atualiza o acesso. Essas rotas passaram a processar notificações de maneira deduplicada.

Ainda pendem o cadastro público de ofertas reais; compra por Pix; cupons/adicionais; cancelamento pelo painel do cliente; pagamento com dois cartões; e-mail de primeiro acesso no servidor CSDK; cobrança/retorno real do Mercado Pago em TEST; webhook público; tratamento de estornos/chargebacks; e trilha administrativa de suporte e conciliação. Portanto não publicar checkout ou trocar domínio nesta etapa.

Referências oficiais consultadas: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post ; https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management ; https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks ; https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix .

Interface ligada às rotas: o checkout agora lê somente ofertas ativas de `GET /api/public/offers`, coleta titular PF/PJ, administrador, e-mail e WhatsApp, e redireciona para o checkout hospedado do Mercado Pago. O retorno consulta somente `GET /api/public/orders/:id/status`, sem expor e-mail ou outros dados pessoais. O navegador não coleta cartão e não cria empresa no Firebase nesse fluxo. O site mostra preços, disponibilidade e dados dos planos a partir do PostgreSQL; descrições/preços de adicionais ainda vêm do catálogo Firebase e não são enviados à cobrança. `CSDK_PUBLIC_COMMERCE_ENABLED=false` impede listar oferta, criar pedido ou iniciar checkout, mesmo que alguma oferta esteja ativa.

Pendências atualizadas: cadastrar ofertas comerciais reais; sincronizar catálogo Firebase/PostgreSQL; cupons e adicionais; Pix e pagamento com dois cartões; cancelamento dentro do painel; configurar e testar e-mail de primeiro acesso; testar transação e webhook públicos em TEST; tratar pagamentos recusados, estornos e chargebacks; e disponibilizar ferramentas administrativas de suporte e conciliação. O checkout usa cartão hospedado e não deve ser publicado até essas etapas e a validação de ofertas/preços.

## Estado após integração de certificados PostgreSQL — 20/11/2026

No commit `77922c4`, o CSDK ganhou um fluxo operacional de emissão independente do emissor Firebase legado:

- A prova congela no início os papéis configurados pela empresa, cada um como digital ou físico, com nome e obrigatoriedade. A assinatura do colaborador só é solicitada durante a prova quando existe papel digital obrigatório.
- O administrador pode cadastrar assinaturas PNG de instrutor, responsável técnico, representante da empresa ou papel personalizado. A API exige responsável ativo da mesma empresa para papéis vinculados a usuário.
- O painel lista provas aprovadas e permite emitir somente após aprovação. Assinaturas digitais obrigatórias ausentes bloqueiam emissão; papel físico gera campo para assinatura em papel.
- Cada certificado grava snapshots da empresa, participante, conteúdo e assinaturas. A emissão é idempotente e única por empresa/turma/colaborador; o certificado pode ser impresso e seu QR abre validação pública sem CPF ou imagem de assinatura.
- Smoke test no `csdk_db` verificou isolamento entre duas empresas, bloqueio sem assinatura obrigatória, emissão repetida sem duplicar, conteúdo impresso e consulta pública limitada. Todos os registros de teste foram removidos.
- A verificação continua sendo uma imagem de assinatura armazenada, e não uma assinatura digital ICP-Brasil ou certificado criptográfico. O projeto deve descrever a função como coleta/representação de assinatura, sem alegar assinatura eletrônica qualificada.

No commit `a7c8345`, o adicional de modelo próprio também passou a integrar essa emissão:

- Cada empresa pode enviar um PPTX quando o adicional `modelo_proprio` estiver ativo. O servidor confirma a estrutura, conta slides, detecta marcadores suportados e guarda uma cópia versionada em pasta privada da empresa com SHA-256.
- O cliente coloca marcadores nas caixas de texto do seu PowerPoint. Os marcadores de texto recebem dados do certificado; `{{LOGO}}`, `{{QRCODE}}`, `{{ASSINATURA_ALUNO}}`, `{{ASSINATURA_INSTRUTOR}}`, `{{ASSINATURA_RT}}` e `{{ASSINATURA_1}}` a `{{ASSINATURA_6}}` podem trocar a própria caixa por uma imagem, mantendo tamanho e posição do desenho original. O upload exige participante, treinamento e QR; a emissão exige marcador para cada assinatura obrigatória.
- O snapshot do certificado aponta para a versão e o hash do modelo usados. Um novo upload ou retorno ao modelo padrão só muda certificados futuros; os arquivos antigos continuam guardados para impressão de documentos existentes.
- O smoke test gerou um PPTX de teste, subiu a versão 1, emitiu, subiu a versão 2, imprimiu o documento antigo e verificou que ele ainda usou a versão 1. Também tentou carregar o mesmo modelo por outra empresa e recebeu bloqueio.
- **Limite observado no VPS:** LibreOffice não está instalado. O render validado retornou um `.pptx` já preenchido como fallback; ainda falta instalar e testar o conversor para PDF em ambiente isolado, com arquivo PowerPoint válido e inspeção visual de saída.
- O motor substitui os marcadores que o cliente insere; ele ainda não reorganiza automaticamente um arquivo sem marcadores nem reconhece toda a tipografia, paleta, linhas e elementos sem mapeamento. Não anunciar “reconhecimento automático de qualquer modelo” antes de criar o fluxo assistido de mapeamento e provar com modelos reais de clientes diferentes.

## Pendências comerciais e operacionais que permanecem

1. **Cobrança e lançamento:** criar ofertas comerciais em TEST e depois PRODUCTION; homologar comprador de teste, cartão, período grátis, webhooks e cancelamento no painel; revisar Pix, cupons, adicionais e cartões múltiplos; configurar e validar e-mail de ativação/recuperação. O checkout fica bloqueado por padrão e não deve ser divulgado.
2. **Modelos e paridade de certificado:** testar conversão LibreOffice para PDF e revisar visualmente frente/verso e fontes em arquivos PowerPoint reais; adicionar prévia antes de ativar o modelo e mapeamento assistido para clientes que não inserem marcadores. O fluxo atual preenche marcadores explícitos e preserva sua posição, mas não reconhece automaticamente todo desenho arbitrário. O catálogo de adicionais/compra também precisa vender e conceder o direito de modelo próprio no PostgreSQL.
3. **Operação do treinamento:** completar importação em massa, presença, dossiês, relatórios, cartas de anuência, emissão em lote, revogação e exportação. Validar vencimento e retenção dos certificados e evidências.
4. **Notificações:** implementar a central do dono descrita acima, sino/caixa por usuário, destinatários por tenant/perfil, agendamento, recorrência, confirmação e histórico. O recurso ainda não está disponível.
5. **Preparação técnica de produção:** testar backup e restauração do banco e arquivos; colocar CSDK em ambiente HTTPS isolado com serviço próprio; revisar proxy/cookies, observabilidade, arquivos persistentes, acessibilidade e visual em desktop/celular; documentar rollback. O `dk-solucoes.service`, Apache, Wix, DNS, `dkfacilita.com` e `dk_db` permanecem intocados.
6. **Catálogo e governança:** manter dados novos de cada cliente separados; versionar catálogo e conteúdo sem alterar documentos emitidos; definir suporte operacional, política de correção/revogação, termos, privacidade, retenção e saída/exportação do cliente.

**Resultado:** o staging tem agora o caminho básico PostgreSQL de turma → prova corrigida no servidor → certificado por empresa → impressão/QR público. Isso ainda não representa equivalência funcional completa com o CertificaNR nem liberação para comercialização ou troca do domínio.

## Verificação de continuidade — 21/11/2026

Estado confirmado nesta revisão:

- `csdk.service`, `csdk-staging.service` e `dk-solucoes.service` permanecem ativos. `https://dkfacilita.com` responde HTTP 200 com TLS válido; `/api/health` responde 200. O domínio e o serviço legado continuam preservados.
- A API de produção informa `publicCommerceEnabled=false`. `GET /api/public/offers` responde 503, impedindo pedidos e checkout enquanto a homologação comercial não estiver completa. `GET /api/admin/commerce` sem sessão responde 401.
- No banco isolado de staging, `prisma migrate status` confirmou as 9 migrations aplicadas. `npm run lint` e `npm run build` passaram; o build ainda alerta sobre bundle JavaScript acima de 500 kB e configuração Vite a atualizar.
- A bateria de staging passou em autenticação/recuperação, convites e usuários, configurações de tenant, operações/limites, provas e certificados, notificações, cancelamento de trial, webhook simulado, pedidos, template/PDF, contrato Mercado Pago e contrato de e-mail. Os registros criados pelos scripts são descartados ao final. O teste de autenticação precisou executar com `EMAIL_PROVIDER=RESEND` porque o ambiente de staging define outro provedor; isso foi isolamento do mock, não falha do produto.
- `npm audit --omit=dev` reportou 9 vulnerabilidades altas nas dependências instaladas, associadas a Firebase/Firestore e gRPC, Prisma e `xlsx`. O registry consultado não oferece correção direta para `xlsx`; a troca exige adaptar e validar as exportações de planilhas.

Pendências que impedem afirmar “100% pronto para vender”:

1. **Cobrança ponta a ponta ainda não homologada:** não houve assinatura real de teste com cartão, retorno comprovado do Mercado Pago, conciliação de renovação nem confirmação do cancelamento pelo comprador. A integração usa plano hospedado para trial; a referência oficial de criação do plano/assinatura não documenta `notification_url`, enquanto a documentação de Webhooks diz que assinaturas devem receber URL configurada durante a criação. Sem callback verificável, manter o checkout público fechado. Um comprador de teste foi criado no Mercado Pago e seus dados permanecem protegidos em arquivo 0600 no VPS; nenhuma credencial deve ser publicada ou copiada para o repositório.
2. **Métodos de pagamento e oferta:** não estão implementados/homologados Pix, dois cartões, cupons e adicionais no checkout. A assinatura recorrente atual usa cartão hospedado. Ainda não há ofertas comerciais reais ativadas para produção.
3. **Integração da aplicação:** grande parte da interface principal ainda autentica e grava por Firebase/Firestore; as rotas PostgreSQL de conta, operações e cobrança coexistem com serviços antigos. O usuário provisionado pelo fluxo novo precisa conseguir entrar na aplicação completa em PostgreSQL, sem depender da autenticação Firebase ou de regras que permitam ao navegador editar fatos financeiros. A migração ponta a ponta ainda não foi concluída.
4. **E-mail e acesso:** contratos de envio passaram com mock, mas faltam homologar e-mail real de primeiro acesso, convite e recuperação no CSDK de staging e confirmar entrega no domínio final.
5. **Modelos de certificado:** smoke test de layout/PDF passa em Chromium, mas ainda faltam casos reais de PowerPoint de empresas diferentes, teste visual de fidelidade frente/verso e o fluxo de mapeamento assistido para modelos sem marcadores. O motor atual substitui marcadores; não reconhece qualquer PowerPoint arbitrário automaticamente.
6. **Segurança e operação:** resolver ou mitigar as vulnerabilidades do audit; validar backup e restauração de banco e arquivos; revisar limites/rate limit e observabilidade; confirmar política e processo de estorno, chargeback, correção/revogação de certificados e suporte ao cliente.

Não tratar os testes de contrato ou o webhook simulado como transação de provedor. O endereço comercial serve a aplicação CSDK, mas a venda ao público continua bloqueada deliberadamente até os pontos acima serem demonstrados em staging e os preços/ofertas serem revisados.

## Retorno do checkout de trial — 21/11/2026

- O checkout hospedado do plano de trial usa um link genérico; o retorno do Mercado Pago pode não carregar o ID do pedido. O checkout agora guarda o pedido em `sessionStorage` antes do redirecionamento e a tela de retorno recupera esse ID quando a URL não traz `pedido`.
- Enquanto um pedido de trial aguarda cartão, a consulta de status pode procurar a assinatura no Mercado Pago por e-mail e plano. Só tenta provisionar após consultar a assinatura completa e confirmar e-mail, plano e status autorizado; o serviço de reconciliação continua validando preço, moeda, ciclo, teste de sete dias e uso único do documento. A resposta pública mantém apenas ID, estado e modalidade do pedido.
- Esse mecanismo é uma recuperação para o retorno do comprador; não substitui o webhook, nem comprova a entrega de e-mails ou uma transação real. O checkout público permanece fechado até a compra TEST ponta a ponta e o webhook serem demonstrados.

## Estado após correções e implantação — 21/11/2026

Esta seção substitui os estados antigos de auditoria e implantação descritos nas revisões anteriores deste arquivo.

- O código de produção foi atualizado até o commit `40b7014`, com cópia de segurança de `/var/www/csdk-production` em `/root/csdk-cutover-20261121T145855Z/csdk-production-before-40b7014.tar.gz`. O site `https://dkfacilita.com`, o endpoint `/api/health` e os três serviços (`csdk`, `csdk-staging` e `dk-solucoes`) responderam normalmente após a atualização. O Wix, DNS e serviço DK Soluções não foram substituídos.
- Em seguida, o build web do commit `3a6acae` foi produzido no staging e publicado em `/var/www/csdk-production/dist`, com cópia de retorno em `/root/csdk-production-dist-before-3a6acae.tar.gz` (permissão 600). O backend de produção continua no código do commit `40b7014`; a alteração `3a6acae` foi apenas no frontend e na documentação.
- A CSDK continua com o comércio público desligado: `CSDK_PUBLIC_COMMERCE_ENABLED=false`; a API pública de ofertas devolve 503. Não há checkout ou plano de venda exposto enquanto a homologação financeira não terminar.
- As nove migrations estão aplicadas no banco de staging. Lint, build, smoke tests funcionais, reconciliação simulada, renderização de PPTX/PDF e teste de exportação XLSX/CSV passaram. A auditoria completa das dependências informa zero vulnerabilidades após a remoção do pacote XLSX vulnerável e as atualizações de dependências.
- O e-mail transacional Brevo está configurado: a chave autenticou, o remetente está ativo e o domínio aparece autenticado/verificado no serviço. Isso confirma a configuração, mas ainda não comprova uma mensagem real de primeiro acesso recebida por um comprador.
- O fluxo de retorno do trial recupera o pedido, pode reconciliar uma assinatura autorizada consultando o Mercado Pago e mantém a ativação idempotente. Até aqui, os testes de webhook foram simulados; a compra completa com cartão de teste e a entrega pública de um webhook ainda não foram concluídas.
- A correção de XLSX substituiu `xlsx` por geração OOXML com JSZip e exportação CSV segura contra fórmulas; o teste de contrato confirma conteúdo, preservação de zeros à esquerda e ausência de células com fórmulas executáveis.
- O checkout informa a oferta, os dados do titular, o valor e o teste grátis com cartão no ambiente seguro do Mercado Pago. O texto da tela de pagamento foi ajustado para explicar preço, período gratuito e cancelamento em linguagem voltada ao comprador, sem expor detalhes internos do CSDK.
- As telas pesadas de cliente, administração, checkout e operação passaram a ser carregadas sob demanda. O pacote principal caiu de 1,59 MB para 839 KB (256 KB comprimidos); continua acima do limite de 500 KB do build, portanto a otimização de desempenho ainda é parcial.
- Após a publicação web, o Chrome headless confirmou resposta 200 e conteúdo renderizado na página inicial, no login PostgreSQL em `/acesso` e no checkout fechado em `/checkout`, sem erro JavaScript. A API de saúde respondeu 200; ofertas responderam 503 como esperado; painel administrativo e cancelamento sem sessão responderam 401.

### Itens ainda necessários antes de anunciar vendas

1. Fazer compra completa com comprador/cartão de teste do Mercado Pago, comprovar a autorização da assinatura do trial, retorno ao CSDK, provisionamento do acesso e cancelamento no provedor.
2. Validar o webhook público de assinatura em ambiente TEST, incluindo configuração no painel do Mercado Pago, entrega, repetição e eventos de renovação/falha/cancelamento. O endpoint local assinado valida a lógica, mas não comprova roteamento externo pelo Mercado Pago.
3. Enviar e receber e-mail real de primeiro acesso e recuperação em conta de teste controlada, validando expiração e uso único dos links.
4. Completar o acesso do cliente em todos os pontos de entrada do produto: a conta PostgreSQL usa `/acesso` e `/workspace`; as telas legadas de Firebase continuam coexistindo e exigem validação da navegação e da equivalência das funções principais com o CertificaNR.
5. Homologar arquivos PowerPoint reais de clientes diferentes e testar fidelidade de layout, assinaturas configuráveis, frente/verso e importação de modelos que não tenham marcadores conhecidos.
6. Ativar apenas ofertas reais aprovadas pelo proprietário e revisar preço, termos, política de cancelamento, privacidade, suporte, estorno e chargeback. Pix, dois cartões, cupons e adicionais não estão disponíveis no checkout recorrente atual.
7. Fazer exercício documentado de backup/restauração do banco e dos arquivos de modelos, revisar monitoramento e continuar reduzindo o pacote JavaScript principal de 839 KB; remover também o aviso de configuração futura do Vite.

Até os itens 1–4 serem comprovados em TEST e os itens 5–7 serem fechados para o escopo comercial escolhido, não declarar o sistema pronto para venda nem ativar a API pública de ofertas.
