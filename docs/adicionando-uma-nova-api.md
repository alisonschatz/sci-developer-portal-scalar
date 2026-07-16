# Como adicionar uma API nova

Este guia parte do princípio de que a API já existe em produção e expõe um
spec OpenAPI (Swagger) válido em algum endpoint de docs.

## 1. Rodar o scaffold

```bash
npm run api:new -- <id> "<Título>" [securityScheme]
```

- `<id>`: identificador estável, kebab-case (ex.: `folha-pagamento`). Vira
  o nome da pasta em `src/decorators/`, o slug padrão no Scalar, e a chave
  usada em todos os scripts do pipeline.
- `"<Título>"`: nome exibido no seletor de documentos do Scalar (ex.:
  `"Folha de Pagamento"`).
- `[securityScheme]`: opcional. Se você já sabe o nome do security scheme
  (em `components.securitySchemes` no spec de origem) que deve receber o
  token compartilhado, passe aqui. Se não souber ainda, deixe em branco —
  o scaffold gera um `TODO` no lugar certo.

Exemplo:

```bash
npm run api:new -- folha-pagamento "Folha de Pagamento" bearerAuth
```

Isso cria:

```
src/decorators/folha-pagamento/
├── overview.md          # Esqueleto com o alerta de autenticação padrão
├── tags.yaml             # Vazio, com o formato esperado comentado
├── descriptions.yaml     # Vazio, com o formato esperado comentado
└── examples.json         # Esqueleto com o aviso de "sempre dados sintéticos"
```

E imprime no terminal um bloco pronto para colar em `apis.manifest.js`.

## 2. Colar o bloco no manifesto

Abra `apis.manifest.js` e cole o bloco impresso pelo passo 1 dentro do
array `apis`, substituindo os `TODO`:

```js
{
  id: 'folha-pagamento',
  title: 'Folha de Pagamento',
  slug: 'folha-pagamento',
  isAuthProvider: false,
  sourceUrlEnv: 'FOLHA_PAGAMENTO_SOURCE_URL',
  sourceTokenEnv: 'FOLHA_PAGAMENTO_AUTH_TOKEN',
  serverUrl: 'https://api-folha.sci.com.br',   // preencher com a URL real
  securityScheme: 'bearerAuth',                 // nome exato do scheme no spec de origem
  default: false,
},
```

> Por que colar manualmente em vez do script editar o arquivo sozinho?
> `apis.manifest.js` é código — vale a pena revisar antes de ativar uma
> API nova em produção (URL certa, security scheme certo). O scaffold já
> faz a parte mecânica (pastas, formato dos arquivos); a parte que exige
> julgamento humano fica manual, de propósito.

## 3. Validar

```bash
npm run manifest:verify
```

Isso confere: id/slug únicos, exatamente uma API `isAuthProvider`,
exatamente uma API `default`, e que toda API não-auth define
`securityScheme` (ou explicitamente `null`, se for uma API pública sem
autenticação — caso raro, mas previsto).

## 4. Atualizar as variáveis de ambiente

```bash
npm run env:example
```

Isso regenera `.env.example` com as novas variáveis
(`FOLHA_PAGAMENTO_SOURCE_URL` no exemplo acima). Preencha:

- No seu `.env` local, para desenvolvimento.
- Em **GitHub Secrets**, para o CI/CD (`Settings → Secrets and variables →
  Actions`) — mesmos nomes.

## 5. Preencher o conteúdo

Em `src/decorators/folha-pagamento/`:

- **`overview.md`** — o que a API faz, em 2–3 parágrafos, seguindo o
  padrão das outras APIs (seção "Pré-requisito: autenticação" já vem
  pronta). Use alerts GFM para destacar avisos: `> [!WARNING]`,
  `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!CAUTION]` — é a sintaxe
  que o Scalar realmente renderiza (ver `docs/arquitetura.md`).
- **`tags.yaml`** — descrição de cada grupo de endpoints, com o detalhe
  real de permissão por recurso. Só preencha as tags que precisam de uma
  descrição diferente da que já vem do backend.
- **`descriptions.yaml`** — resumo/descrição por endpoint específico, se
  o texto que vem do backend não for claro o suficiente.
- **`examples.json`** — exemplos sintéticos de request/response. Nunca
  dados reais, mesmo anonimizados.

## 6. Testar o pipeline localmente

```bash
npm run build:openapi   # fetch + lint + bundle da API nova (e das demais)
npm run dev              # abre o portal com a API nova já disponível
```

Confira na sidebar do Scalar se a API nova aparece, se a autenticação
mostra o token preenchido automaticamente depois de logar na aba
Autenticação, e se o banner de token (depois do login) agora lista a API
nova como um dos botões "Ir para →".

## 7. Publicar

Siga o processo normal descrito no README, seção "Publicação (CI/CD)" —
nada muda aqui: o workflow lê o manifesto sozinho.
