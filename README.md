# Portal do Desenvolvedor — SCI

Portal único de documentação para as APIs de produção da SCI (hoje: **Auth**
e **RH Net Social**), construído para crescer para dezenas de APIs sem que
o projeto vire uma bagunça de arquivos duplicados.

Renderiza com [Scalar](https://scalar.com) (`@scalar/api-reference`,
open-source), hospedado dentro de um app **Vue 3** — não pela via CDN da
v1 deste projeto. Isso é a resposta direta a "o Scalar é mais compatível
com Vue?": o `@scalar/api-reference` **é** escrito em Vue 3<sup>[1]</sup>
— usá-lo como componente Vue nativo (`<ApiReference :configuration="...">`)
em vez de um `<script>` de CDN é o caminho de maior compatibilidade e
controle que existe hoje, não uma escolha entre duas opções equivalentes.

> Este é o README de arquitetura. Para o passo a passo de adicionar uma
> API nova, veja [`docs/adicionando-uma-nova-api.md`](docs/adicionando-uma-nova-api.md).
> Para as decisões técnicas detalhadas (com as fontes oficiais do Scalar
> que embasam cada uma), veja [`docs/arquitetura.md`](docs/arquitetura.md).

---

## O que mudou em relação à v1

A v1 deste portal (Stoplight Elements → depois Scalar via CDN, hardcoded
para exatamente 2 APIs) tinha um problema estrutural para o objetivo de
"aguentar dezenas de APIs futuras da SCI": cada API nova significava editar
`redocly.yaml`, `fetch-api.js`, `portal.js` e o HTML em paralelo, à mão,
torcendo pra não esquecer nenhum. E tinha um bug conhecido: um header fixo
que não interagia com o Scalar, fazendo a sidebar entrar por baixo dele.

Nesta versão:

| | v1 | v2 (esta) |
|---|---|---|
| Renderer | Scalar via CDN (`<script>`) | Scalar como componente **Vue 3 nativo** |
| Adicionar API nova | Editar 4+ arquivos à mão | Editar **1 array** em `apis.manifest.js` |
| Compartilhamento de token | Funcionava só para RH Net Social, hardcoded | Automático para **qualquer** API do manifesto |
| Bug do header/sidebar | Presente (posicionamento manual) | Corrigido com o mecanismo oficial do Scalar |
| Pipeline testado | "Não testei num navegador real" (README da v1) | 49 testes automatizados, incluindo o pipeline Redocly rodando de verdade — ver [Testes](#testes-automatizados) |
| Callouts no overview | `<!-- theme: warning -->` (sintaxe não confirmada) | `> [!WARNING]` — sintaxe GFM que o Scalar documenta oficialmente<sup>[2]</sup> |

---

## Arquitetura em 1 minuto

```
apis.manifest.js  ←── FONTE ÚNICA DA VERDADE (quais APIs existem)
       │
       ├─→ scripts/fetch-api.js          → baixa + filtra cada spec bruto
       ├─→ scripts/generate-redocly-config.js → gera redocly.generated.yaml
       ├─→ scripts/build-openapi.js      → lint + bundle (Redocly) → public/openapi/*.json
       └─→ src/config/scalar.config.js   → monta `sources[]` do Scalar, já
                                            com o token compartilhado plugado
                                            em cada API que precisa dele
```

O pipeline de **conteúdo** (Redocly: fetch → lint → bundle, com os
decorators de overview/tags/descrições/exemplos) e o de **apresentação**
(Vite + Vue + Scalar) são desacoplados por um contrato simples: arquivos
JSON estáticos em `public/openapi/*.json`. Isso significa que trocar o
renderer no futuro (se um dia o Scalar não servir mais) não exige tocar
no pipeline de curadoria de conteúdo, e vice-versa.

---

## Como o token é compartilhado entre as APIs

Este é o requisito mais importante do pedido original: a Auth é usada por
**todas** as APIs futuras, e isso precisa ficar óbvio para quem usa o
portal — não só funcionar por baixo dos panos.

**Mecanismo (3 peças, todas documentadas oficialmente pelo Scalar):**

1. O login da API `auth` tem um `x-post-response` (formato Postman,
   configurado em `src/decorators/auth/descriptions.yaml`) que roda
   `pm.globals.set('sci_auth_token', token)` depois de um "Test Request"
   bem-sucedido. `pm.globals` é uma variável **global do workspace** — ao
   contrário de `pm.environment`, ela é visível em **qualquer documento**
   aberto no mesmo portal, não só na Auth<sup>[3]</sup>.
2. O campo de autenticação de cada API consumidora (`src/config/scalar.config.js`,
   gerado a partir do manifesto) é pré-preenchido com `{{sci_auth_token}}`
   — a sintaxe de variável do Scalar, que todo campo de autenticação aceita
   e resolve em tempo de requisição<sup>[4]</sup>.
3. **Banner visível (garantia).** Independente do item 1 funcionar
   perfeitamente em toda situação, um `customFetch` (hook oficial do
   Scalar, usado tanto para carregar specs quanto para as chamadas de
   "Test Request"<sup>[5]</sup>) observa a resposta do login e mostra um
   banner com **Copiar token** e um botão **Ir para →** para cada API que
   consome o token — a lista desses botões vem do manifesto, então uma
   API nova aparece ali sem precisar tocar em nenhum componente.

**Por que isso escala para dezenas de APIs sem código extra:** como
`pm.globals` é global (não por documento), uma API nova só precisa
declarar, no manifesto, qual `securityScheme` deve receber o token —
`src/config/scalar.config.js` já resolve a autenticação sozinho. Nenhuma
API nova precisa saber como o token foi gerado.

`scripts/verify-shared-token.js` roda automaticamente antes de cada build
e falha se a API de auth parar de gravar a variável esperada, ou se
alguma outra API tentar gravar a mesma variável (duas fontes de verdade
concorrentes) — ver `test/verify-shared-token.test.js` para os casos
cobertos.

> **O que ainda depende de QA manual:** as três peças acima são
> individualmente confirmadas na documentação atual do Scalar, e o
> pipeline de geração do OpenAPI final (com `x-post-response` e os
> demais decorators aplicados) foi testado de ponta a ponta com o Redocly
> real — ver [Testes](#testes-automatizados). O que não foi possível
> testar neste ambiente é a combinação rodando num **navegador real**
> contra o Scalar renderizado (preenchimento automático do campo de auth
> a partir de `pm.globals` em tempo real). Se isso não funcionar
> exatamente como esperado em algum caso de borda, o banner (peça 3)
> garante que a experiência não fica pior que "copiar e colar
> manualmente".

---

## Header 100% integrado (não é mais um elemento separado)

Na v1, o header ficava com `position: sticky` por cima do conteúdo, mas o
Scalar não tinha como saber que aquele espaço existia — a sidebar entrava
por baixo do header ao rolar. A v2.0 corrigiu isso com a CSS var oficial
do Scalar pra esse cenário (`--scalar-custom-header-height`), mas na
prática, usando de verdade, o header ainda "sumia" ao rolar — porque
mesmo sem sobrepor, ainda eram dois sistemas de layout independentes
coexistindo (o nosso, por fora; o do Scalar, com scroll próprio).

A versão atual não usa mais um header separado. `src/components/SidebarBrand.vue`
(logo + título) entra pelo slot Vue oficial e tipado `sidebar-start` do
`<ApiReference>`<sup>[10]</sup> — ou seja, passa a fazer parte da própria
árvore de componentes e do próprio scroll do Scalar, não de um segundo
sistema de layout por cima. A busca nativa da sidebar (que já usa
`position: sticky` internamente) se ajusta sozinha porque
`SidebarBrand.vue` publica a própria altura em
`--scalar-sidebar-sticky-offset` — a variável irmã da anterior, só que
escopada para dentro da sidebar. Detalhes completos, incluindo o
trade-off em telas estreitas, em
[`docs/arquitetura.md`](docs/arquitetura.md), decisão 4.

---

## Pré-requisitos

- Node.js **20+**
- npm

## Rodando localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# preencha AUTH_SOURCE_URL e RHNETSOCIAL_SOURCE_URL com as URLs de produção

# 3. Baixar, lintar e empacotar as APIs
npm run build:openapi

# 4. Subir o portal em modo desenvolvimento
npm run dev
```

## Comandos disponíveis

```bash
npm run manifest:verify   # Valida apis.manifest.js (id/slug únicos, token plugado, etc.)
npm run env:example       # Regenera .env.example a partir do manifesto
npm run api:new -- <id> "<Título>" [securityScheme]   # Scaffold de uma API nova

npm run api:fetch         # Baixa os specs brutos de produção + filtro de segurança (blacklist)
npm run build:openapi     # manifest:verify + api:fetch + lint + bundle (Redocly) → public/openapi/
npm run check:openapi     # Confere se os bundles/assets existem antes de subir o portal

npm run dev               # check:openapi + vite (modo desenvolvimento)
npm run build              # build:openapi + vite build → dist/
npm run preview           # check:openapi + vite preview (serve dist/ localmente)

npm test                  # 49 testes automatizados (unitários + integração Redocly real)
```

## Como adicionar uma API nova

Resumo (passo a passo completo em
[`docs/adicionando-uma-nova-api.md`](docs/adicionando-uma-nova-api.md)):

```bash
npm run api:new -- folha-pagamento "Folha de Pagamento" bearerAuth
```

Isso cria `src/decorators/folha-pagamento/` com os 4 arquivos no formato
esperado, e imprime no terminal o bloco pronto para colar em
`apis.manifest.js`. Depois de colar e preencher os `TODO`s:

```bash
npm run manifest:verify   # confere se ficou tudo certo
npm run env:example       # atualiza .env.example com as novas variáveis
```

Nenhum outro arquivo precisa ser tocado — `fetch-api.js`,
`generate-redocly-config.js`, `build-openapi.js` e `scalar.config.js`
leem o manifesto e se ajustam sozinhos.

## Testes automatizados

```bash
npm test
```

49 testes (`node:test`, com `@happy-dom/global-registrator` como única
dependência de teste extra — necessária só para o teste que monta um
componente Vue de verdade), cobrindo:

- **`apis.manifest.js`** — validação estrutural (ids/slugs únicos,
  exatamente 1 auth provider, exatamente 1 default, toda API não-auth
  precisa declarar `securityScheme`).
- **`scripts/fetch-api.js`** — o filtro de blacklist de rotas internas.
- **`src/plugins/business-plugin.js`** — extração da chave estável
  `MÉTODO /caminho` a partir do JSON Pointer do Redocly.
- **`scripts/verify-shared-token.js`** — detecção de `pm.globals.set` no
  script de post-response, incluindo os casos de confusão (nome parecido,
  `pm.environment` em vez de `pm.globals`).
- **`src/composables/useTokenCapture.js`** — reconhecimento da requisição
  de login e extração do token da resposta.
- **`src/config/scalar.config.js`** — trava os valores da configuration
  global adotada (tema, sidebar, telemetria etc.) e confirma que os 4
  campos por-documento (`title`/`slug`/`default`/`authentication`) não
  vazam para o nível global — ver README, seção "Header 100% integrado",
  e `docs/arquitetura.md`, decisão 8.
- **`src/composables/useSidebarStickyOffset.js`** — com DOM real
  (`@happy-dom/global-registrator`), monta uma estrutura de sidebar
  fake (marca + seletor + busca + `.custom-scroll` + rodapé) e confirma
  que a altura somada inclui só os itens fixos acima da lista rolável,
  na ordem certa, com os casos de fallback (sem `.custom-scroll`,
  elemento órfão, `null`).
- **`test/head-setup.test.js`** — monta um componente Vue de verdade
  (com `@happy-dom/global-registrator`, DOM real em Node) para confirmar
  que `app.use(createHead())` antes do `mount()` resolve o erro
  `useHead() was called without provide context` que o `<ApiReference>`
  lança se esse plugin não estiver registrado — bug real encontrado em
  produção, não pego pelo `vite build` (que só valida compilação, não
  comportamento em runtime). Inclui um teste "sanity" que prova que,
  sem o fix, o mesmo erro reaparece — ou seja, o teste realmente cobre
  a regressão.
- **`test/pipeline.integration.test.js`** — roda o **Redocly real**
  (não mockado) contra fixtures em `test/fixtures/`, e confere que o
  bundle final tem: servers injetados, overview aplicado, `x-post-response`
  no login com a variável certa, e a tag `Feriado` com a descrição
  corrigida (era "criação, edição e exclusão" no backend; via API é
  somente leitura).

Além disso, `npm run build` foi executado de ponta a ponta neste ambiente
(fixtures → Redocly real → `vite build` real → servido via `vite preview`
e checado com `curl`) — ver `docs/arquitetura.md` para o relato completo.

## Publicação (CI/CD)

O deploy **não é automático**. Alguém do time de QA precisa:

1. Ir em **Actions → Publicar Portal de Documentação → Run workflow**.
2. Preencher o motivo da publicação.
3. Aprovar o gate de deploy (configurado em `Settings → Environments →
   github-pages → Required reviewers`).

### Secrets necessários no GitHub

Gerados automaticamente por `npm run env:example` a partir do manifesto —
rode esse comando sempre que adicionar uma API para conferir a lista
atualizada. Hoje:

| Secret | Valor hoje |
|---|---|
| `AUTH_SOURCE_URL` | `https://api-auth.sci.com.br/docs?api-docs.json` |
| `RHNETSOCIAL_SOURCE_URL` | `https://api2.rhnetsocial.com.br/docs?api-docs.json` |
| `AUTH_AUTH_TOKEN` | (endpoint público hoje — deixar vazio) |
| `RHNETSOCIAL_AUTH_TOKEN` | (endpoint público hoje — deixar vazio) |

## Como funciona a curadoria de conteúdo

| Camada | Onde mexer | O que faz |
|---|---|---|
| Filtro primário (recomendado) | tag `x-internal: true` no Swagger de origem | Remove o node inteiro via decorator nativo `remove-x-internal` |
| Filtro de segurança (fallback) | `scripts/fetch-api.js` → `BLACKLIST_PATTERNS` | Remove por padrão de path — vale para todas as APIs do manifesto |
| Servers (base URL) | `apis.manifest.js` → `serverUrl` | Injeta a URL base de produção quando o spec de origem não declara `servers` |
| Overview da API | `src/decorators/<id>/overview.md` | Substitui `info.description` — sintaxe: alerts GFM (`> [!WARNING]` etc.) |
| **Descrições de tag** | `src/decorators/<id>/tags.yaml` | Substitui a descrição de cada grupo — aparece como conteúdo visível no Scalar, é aqui que mora o detalhe de permissão por recurso |
| Descrições de operação | `src/decorators/<id>/descriptions.yaml` | Sobrescreve `summary`/`description` por endpoint, e o `x-post-response` do login (só na API auth) |
| Exemplos | `src/decorators/<id>/examples.json` | Injeta `example` em request/responses por endpoint — **sempre dados sintéticos** |

### Chave dos arquivos de decorators

`operationId`s gerados automaticamente pelo backend (Laravel/swagger-php
hoje; potencialmente outro stack em uma API futura) costumam vir como
hash e podem mudar a cada nova geração do Swagger. Por isso
`descriptions.yaml`/`examples.json` são chaveados por **`"MÉTODO
/caminho"`** (ex.: `"POST /api/v1/auth/credencial/login"`), que é
estável. `tags.yaml` é chaveado pelo **nome exato da tag** (`tags[].name`),
mais estável ainda por não ser hash.

> **Nunca cole dados reais** em `examples.json`, mesmo "anonimizados" —
> use dados sintéticos/fictícios. Isso é ainda mais crítico em APIs de
> RH: payloads de admissão trafegam CPF, dados bancários e endereço —
> dados pessoais sensíveis pela LGPD.

## Estrutura de pastas

```text
sci-developer-portal/
├── apis.manifest.js                    # FONTE ÚNICA DA VERDADE das APIs
├── redocly.base.yaml                   # Regras de lint + plugins (parte estática)
├── vite.config.js
├── index.html                          # Entry point do Vite
├── .github/workflows/deploy-docs.yml   # CI/CD com gate de aprovação manual
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── style.css
│   ├── components/
│   │   ├── SidebarBrand.vue            # Marca dentro do slot sidebar-start do Scalar
│   │   └── TokenBanner.vue             # Banner de token, lista de APIs dinâmica
│   ├── composables/
│   │   └── useTokenCapture.js          # customFetch: observa o login, expõe o token
│   ├── config/
│   │   └── scalar.config.js            # Monta sources[] a partir do manifesto
│   ├── plugins/
│   │   └── business-plugin.js          # Decorators Redocly (overview, tags, etc.)
│   ├── decorators/
│   │   ├── auth/{overview.md,tags.yaml,descriptions.yaml,examples.json}
│   │   └── rhnetsocial/{overview.md,tags.yaml,descriptions.yaml,examples.json}
│   └── base/                           # Baixado em runtime (git-ignored)
├── scripts/
│   ├── verify-manifest.js
│   ├── print-env-example.js
│   ├── new-api.js                      # Scaffold de API nova
│   ├── fetch-api.js
│   ├── generate-redocly-config.js
│   ├── build-openapi.js                # lint + bundle → public/openapi/
│   ├── check-openapi.js
│   └── verify-shared-token.js
├── public/
│   ├── assets/sci-logo.png
│   └── openapi/                        # Gerado pelo pipeline (git-ignored)
├── test/                               # 49 testes — ver seção "Testes automatizados"
└── docs/
    ├── arquitetura.md                  # Decisões técnicas + fontes oficiais do Scalar
    └── adicionando-uma-nova-api.md     # Passo a passo completo
```

---

## Fontes oficiais consultadas (Scalar)

1. `@scalar/api-reference` é o pacote Vue 3 oficial — [scalar.com/products/api-references/integrations/react](https://scalar.com/products/api-references/integrations/react) ("The API Reference package is written in Vue"), confirmado também no [npm](https://www.npmjs.com/package/@scalar/api-reference).
2. Markdown suportado (alerts GFM) — [scalar.com/products/docs/components/markdown-support](https://scalar.com/products/docs/components/markdown-support).
3. `pm.globals` como variável de workspace, compartilhada entre documentos — [scalar.com/products/api-client/environments](https://scalar.com/products/api-client/environments).
4. Templating `{{variável}}` em qualquer campo de autenticação — [scalar.com/products/api-client/authentication](https://scalar.com/products/api-client/authentication).
5. `customFetch` na configuração do Scalar — [scalar.com/products/api-references/configuration](https://scalar.com/products/api-references/configuration).
6. `--scalar-custom-header-height` — exemplo oficial "Scalar Custom Header Example": [codepen.io/scalarorg/pen/VwOXqam](https://codepen.io/scalarorg/pen/VwOXqam).
7. `x-post-response` / Postman-compatible scripts — [scalar.com/products/api-client/testing](https://scalar.com/products/api-client/testing).
8. Roteamento por hash em multi-source, e `onDocumentSelect` como callback só de observação (não de controle) — [scalar.com/products/api-references/configuration](https://scalar.com/products/api-references/configuration) e exemplo de integração ASP.NET Core.
9. `createHead()` do subpath `/client`, registrado via `app.use()` antes do `mount()` — [npmjs.com/package/@unhead/vue](https://www.npmjs.com/package/@unhead/vue).
10. Slots `sidebar-start`/`sidebar-end`/`content-start`/`content-end`/`footer`/`editor-placeholder` do componente `<ApiReference>`, e a CSS var `--scalar-sidebar-sticky-offset` — confirmados diretamente no pacote instalado (`node_modules/@scalar/api-reference`), não em documentação externa; ver `docs/arquitetura.md`, decisão 4.
11. Schema de `configuration` (incluindo os presets de `theme` e o comportamento de `@layer` no CSS de tema) — confirmado diretamente em `node_modules/@scalar/types` e `node_modules/@scalar/themes` da versão instalada; ver `docs/arquitetura.md`, decisão 8.
