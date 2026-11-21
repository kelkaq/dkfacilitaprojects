# Mercado Pago TEST — requisito de vendedor de teste

## Diagnóstico

A homologação anterior usou o Access Token `TEST-` da conta principal DK Soluções para criar o plano e a assinatura. As instruções oficiais do Mercado Pago para **assinaturas com plano associado** mandam criar uma conta vendedora de teste, criar uma aplicação ao entrar como esse vendedor, tokenizar com a chave pública dessa aplicação e criar plano/assinatura usando o Access Token `APP_USR` da aplicação do vendedor de teste. O comprador também precisa ser uma conta de teste do mesmo país. A configuração existente já tem um comprador de teste e um ID de vendedor de teste, mas não tem as credenciais da aplicação desse vendedor.

O ID configurado foi conferido no endpoint `/users/{id}`: é uma conta `TEST` do site MLB. A checagem de `/users/me` mostrou que os tokens atuais pertencem à conta principal; nenhum dado secreto foi registrado neste documento.

Referência oficial: [dúvidas sobre como testar a integração](https://www.mercadopago.com.br/developers/pt/news/2023/11/16/Questions-on-how-to-test-your-integration--) e [criação de assinatura associada a plano](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-associated-plan).

## Ação necessária na conta

1. No painel Mercado Pago Developers, abrir a aplicação DK Soluções, entrar em **Contas de Teste** e consultar os dados do vendedor de teste já configurado. Não criar outra conta se esse vendedor continuar disponível.
2. Entrar na conta do vendedor de teste, abrir **Suas integrações** e criar uma aplicação de teste para a CSDK.
3. Copiar a Public Key e o Access Token em **Credenciais de produção** dessa aplicação do vendedor de teste. Embora o token use `APP_USR`, a conta emissora é de teste; não usar credenciais da conta principal DK Soluções.
4. Configurar as notificações de assinatura dessa aplicação e obter a chave secreta do webhook. O callback de staging será informado depois de preparado no VPS.
5. Gravar os valores diretamente no VPS em `/etc/dk/csdk/mp-test-seller.env`, com proprietário root e permissão `600`. Não enviar chaves pelo chat, e-mail ou Git. O arquivo deve conter:

```dotenv
MERCADO_PAGO_TEST_ACCESS_TOKEN=APP_USR-...
MERCADO_PAGO_TEST_PUBLIC_KEY=APP_USR-...
MERCADO_PAGO_TEST_SELLER_ID=...
MERCADO_PAGO_TEST_WEBHOOK_SECRET=...
```

Quando o arquivo estiver salvo, o script de homologação validará via `/users/me` que o Access Token pertence ao ID configurado e que vendedor e comprador são contas TEST do site MLB, antes de criar um plano.

## Como retomar

Depois da configuração segura, sincronizar o arquivo como variável do serviço **apenas de staging**, criar um plano TEST novo sob o vendedor TEST, vincular a oferta inativa do `csdk_db` a esse plano, rodar o ensaio de cartão/tokenização/assinatura, simular o webhook assinado, confirmar cancelamento pelo provedor e remover os dados temporários. O checkout TEST aceita o `sandbox_init_point` ou o `init_point` retornado pelo vendedor de teste. Produção e ofertas públicas permanecem fechadas.
