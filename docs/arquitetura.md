# Arquitetura — decisões técnicas

Este documento detalha as decisões de arquitetura tomadas na reescrita do
portal (v1 → v2), o porquê de cada uma, e o que foi de fato testado neste
ambiente versus o que ainda depende de QA num navegador real.

## 1. Por que Vue 3 nativo, e não o `<script>` de CDN

O pacote `@scalar/api-reference` — o mesmo publicado no npm e usado pela
build de CDN — é escrito em Vue 3. A própria página de integração com
React do Scalar afirma isso diretamente ("The API Reference package is
written in Vue"), e o pacote `@scalar/api-reference-react` existe
justamente como um wrapper client-side em cima dele para quem não usa
Vue.

Ou seja: a pergunta "o Scalar é mais compatível com Vue?" tem uma resposta
categórica — ele **é** Vue. Cada camada que se soma entre "escrever
`<ApiReference :configuration="...">` num componente Vue" e "carregar um
bundle padronizado via `<script src="cdn...">` e chamar
`Scalar.createApiReference(...)` numa API imperativa" é uma camada a
menos de controle: menos acesso a reatividade nativa (o `configuration`
pode ser um `computed`, como é feito aqui para plugar o `customFetch`),
menos previsibilidade de versão (CDN aponta pra `latest` por padrão), e
um SSR/hidratação mais difícil se um dia o portal precisar disso.

Trade-off honesto: a build de CDN é mais simples para quem não quer
nenhum passo de build. Como este projeto já tinha um pipeline Node
(Redocly) e Node 20+ como pré-requisito, adicionar Vite não introduz uma
dependência nova de categoria — só troca "servir HTML estático" por
"servir o output de um build", o que GitHub Pages faz igualmente bem.

## 2. `customFetch` em vez de monkey-patch de `window.fetch`

A v1 sobrescrevia `window.fetch` globalmente, na esperança de capturar só
a resposta do login. Isso tem dois problemas: (a) intercepta *qualquer*
fetch da página, não só os do Scalar, e (b) se o Scalar internamente
trocar sua estratégia de rede (ex.: adotar `XMLHttpRequest` em algum
caminho, ou rodar em um Web Worker), o monkey-patch para de funcionar
silenciosamente.

A configuração do Scalar aceita `customFetch`: uma função usada tanto
para carregar o OpenAPI quanto para as chamadas de "Test Request" do
cliente embutido — ou seja, o hook *pretendido* para observar/adaptar
requisições. `src/composables/useTokenCapture.js` usa exatamente isso.

## 3. `pm.globals` como o mecanismo de token compartilhado

Confirmado na documentação de Environments do Scalar API Client: variáveis
setadas com `pm.globals.set(...)` são "workspace-wide" — visíveis em
qualquer documento aberto, ao contrário de `pm.environment`, que é por
documento. Isso é exatamente o que a arquitetura de "auth usada por
dezenas de APIs futuras" precisa: gravar o token **uma vez**, no login da
API `auth`, e cada API nova só precisa referenciá-lo via
`{{sci_auth_token}}` no próprio campo de autenticação — sem nenhuma
lógica adicional por API.

A documentação de Authentication do Scalar API Client confirma, em
seguida, que **todo** campo de autenticação aceita variáveis com a
sintaxe `{{ variavel }}`. As duas peças (gravar em `pm.globals`, ler via
`{{}}`) são individualmente confirmadas na documentação atual — não achei
um exemplo oficial único combinando as duas coisas através de dois
*documentos diferentes* dentro do mesmo `sources[]`, especificamente. É
por isso que a arquitetura mantém uma segunda camada garantida (o banner,
via `customFetch`) — se a combinação não se comportar exatamente como
esperado em algum caso de borda, a experiência degrada para "copiar e
colar", não para "quebrado silenciosamente".

## 4. Header integrado — de `--scalar-custom-header-height` para o slot `sidebar-start`

Esta decisão passou por duas versões.

**Primeira tentativa (v2.0):** um header próprio, fora do componente
`<ApiReference>`, com `position: sticky` e a CSS var oficial do Scalar
para esse cenário — `--scalar-custom-header-height`, do exemplo oficial
deles de "Custom Header" (CodePen, `scalarorg/pen/VwOXqam`). Tecnicamente
correto (resolvia a sobreposição original do header com a sidebar), mas
na prática, usando de verdade, ainda dava problema: o header "sumia" ao
rolar e não se comportava como parte da mesma página — porque, apesar de
não sobrepor mais, ainda eram **dois sistemas de layout independentes**
(o nosso, fora do Scalar; o do Scalar, com seu próprio scroll interno)
coexistindo. Resolver a sobreposição não resolve a sensação de "duas
coisas coladas".

**Versão atual:** `<ApiReference>` expõe slots Vue tipados e oficiais —
confirmado direto em `node_modules/@scalar/api-reference/dist/components/ApiReference.vue.d.ts`
(a fonte mais confiável possível: é a própria versão instalada, não
uma versão da documentação que pode ter mudado): `sidebar-start`,
`sidebar-end`, `content-start`, `content-end`, `footer`,
`editor-placeholder`. `src/components/SidebarBrand.vue` (logo + título)
entra pelo slot `sidebar-start` — ou seja, passa a fazer parte da própria
árvore de componentes e do próprio contexto de scroll do Scalar. Não tem
mais dois sistemas de layout: só o do Scalar, com nosso conteúdo dentro
dele.

Pra a busca nativa da sidebar (que já vem com `position: sticky; top:
var(--scalar-sidebar-sticky-offset, 0)` — confirmado no CSS do próprio
pacote, `node_modules/@scalar/api-reference/dist/style.css`) se ajustar
corretamente abaixo do nosso bloco, `SidebarBrand.vue` mede a própria
altura via `ResizeObserver` (mesma técnica da tentativa anterior, ainda
válida) e publica em `--scalar-sidebar-sticky-offset` — a variável irmã
de `--scalar-custom-header-height`, só que escopada para dentro da
sidebar em vez do documento inteiro.

O bloco também usa as próprias CSS vars de sidebar do Scalar
(`--scalar-sidebar-background-1`, `--scalar-sidebar-border-color`,
`--scalar-sidebar-color-1`, `--scalar-sidebar-color-2`, todas
confirmadas em `node_modules/@scalar/themes/dist/style.css`) com
fallback para as cores da marca SCI — então se o tema mudar (claro/escuro,
ou um novo `theme` no preset), o bloco acompanha automaticamente em vez
de ficar com uma cor fixa que destoa.

**Atualização — ordem visual:** por padrão, o Scalar sempre renderiza o
conteúdo de `sidebar-start` DEPOIS do seletor de documentos e da busca —
ordem fixa no template deles, não configurável por prop. Como confirmado
direto no componente de baixo nível
(`node_modules/@scalar/components/dist/components/ScalarSidebar/ScalarSidebar.vue.script.js`),
o `<aside>` real da sidebar é um único flex container
(`flex flex-col`) e todos esses itens são filhos diretos dele, sem
nenhuma div extra entre eles — então `order: -1` em `.sidebar-brand`
(dentro do CSS *scoped* do próprio componente) reordena visualmente o
bloco pra antes dos dois, sem tocar em nada do Scalar nem precisar de
CSS global.

Isso tem um efeito colateral que precisou de correção: a variável
`--scalar-sidebar-sticky-offset` (decisão anterior) não é usada pela
busca, e sim pelos cabeçalhos de grupo *sticky* dentro da própria árvore
de navegação (confirmado em `ScalarSidebarNestedItems.vue.script.js`) —
e o valor certo pra ela é a altura de **tudo** que fica fixo acima da
lista rolável (marca + seletor + busca, nessa ordem visual), não só da
marca. `src/composables/useSidebarStickyOffset.js` mede isso encontrando
o primeiro filho com a classe `.custom-scroll` (o contêiner rolável da
árvore, confirmado no mesmo arquivo) e somando a altura de tudo que vem
antes dele — com fallback pra medir só o próprio bloco se essa classe
não for encontrada. Essa lógica foi extraída pra um `.js` puro
(em vez de ficar dentro do `<script setup>` do `.vue`) justamente para
poder ser testada com `node --test` sem precisar compilar um SFC — ver
`test/sidebar-sticky-offset.test.js`.

**Trade-off aceito:** em telas estreitas, o Scalar usa um
`MobileHeader.vue` próprio (barra compacta + menu hambúrguer) em vez da
sidebar persistente — nosso bloco de marca fica dentro do menu que abre
por esse hambúrguer, não visível de cara no topo em mobile. Dado que este
portal é documentação técnica para integração (uso majoritariamente
desktop), esse trade-off foi aceito conscientemente em vez de construir
uma segunda barra mobile própria — que reintroduziria exatamente o
problema desta decisão (dois sistemas de layout de novo, um só para telas
estreitas).

## 5. Callouts: `> [!WARNING]`, não `<!-- theme: warning -->`

A documentação de Markdown Support do Scalar confirma que o parser é
GitHub-Flavored Markdown (GFM), incluindo os 5 tipos de alert do GitHub:
`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`, todos na forma
`> [!TIPO]`. A sintaxe `<!-- theme: warning -->` usada nos overviews da
v1 é de uma ferramenta de documentação diferente (não é uma sintaxe
Scalar confirmada em nenhuma fonte oficial atual) — foi substituída em
todos os `overview.md` desta versão.

## 6. Manifesto único (`apis.manifest.js`) em vez de config espalhada

Redocly, o script de fetch, a config do Scalar e o `.env.example` da v1
listavam cada API de forma independente — 4 lugares para manter em
sincronia manualmente a cada API nova, num projeto que precisa aguentar
"dezenas". `apis.manifest.js` é a única fonte de verdade; tudo o resto
deriva dele:

- `redocly.generated.yaml` é **gerado** (nunca editado à mão) por
  `scripts/generate-redocly-config.js`, porque o Redocly CLI não tem como
  "importar lógica" de um `.yaml` estático — a geração é a ponte entre o
  manifesto (JS) e o formato que o Redocly entende (YAML).
- `scripts/fetch-api.js`, `scripts/build-openapi.js` e
  `src/config/scalar.config.js` fazem `apis.map(...)` sobre o manifesto
  em vez de listar cada API.
- `scripts/verify-manifest.js` e `scripts/verify-shared-token.js` correm
  automaticamente antes de cada build, para transformar "esqueci de
  plugar o token compartilhado numa API nova" de um bug silencioso em
  produção para um erro de build com uma mensagem específica.

## 7. `app.use(createHead())` antes do `mount()` — bug real encontrado em produção

Depois da primeira entrega, rodar o portal de verdade no navegador expôs
um erro que nenhum dos testes até então pegava:

```
Uncaught Error: useHead() was called without provide context,
ensure you call it through the setup() function.
```

Causa: `<ApiReference>` chama `useSeoMeta()` internamente (para aplicar
o `metaData` da configuration — título, meta tags), e isso — como
qualquer composable do `@unhead/vue` — exige que o app hospedeiro tenha
registrado o plugin do unhead (`app.use(createHead())`) **antes** do
`mount()`. `src/main.js` fazia só `createApp(App).mount('#app')`, sem
esse registro. A build de CDN da v1 não tinha esse problema porque o
helper `createApiReference(...)` (a API "standalone" do Scalar, pensada
para quem NÃO está montando `<ApiReference>` dentro do próprio app Vue)
provavelmente registra isso internamente — um detalhe que só aparece
quando se usa o componente Vue nativo diretamente, como esta versão faz
de propósito (ver decisão 1).

Correção, seguindo a documentação atual do `@unhead/vue`
([npmjs.com/package/@unhead/vue](https://www.npmjs.com/package/@unhead/vue)):

```js
// src/main.js
import { createHead } from '@unhead/vue/client'; // subpath /client, não o pacote raiz

const app = createApp(App);
const head = createHead();
app.use(head);
app.mount('#app');
```

`@unhead/vue` também foi promovido de dependência transitiva (só
existia via `@scalar/api-reference`) para dependência explícita do
projeto, na mesma faixa de versão que o Scalar já usa internamente
(`^2.1.4`) — checado com `npm ls @unhead/vue` que isso resulta numa
única cópia instalada (deduplicada pelo npm), não duas instâncias
diferentes do módulo. Isso importa porque o `provide`/`inject` do Vue é
por referência: se o app e o Scalar acabassem usando duas cópias físicas
diferentes de `@unhead/vue` (um "dual package hazard"), o `app.use()`
não seria "visto" pelo `injectHead()` interno do Scalar mesmo com o
código certo — o mesmo sintoma, por um motivo diferente e mais difícil de
diagnosticar.

**Por que isso não apareceu no `vite build` nem nos testes originais:**
o erro só acontece em **runtime**, no momento em que o Vue chama a
função `setup()` do componente — não é um erro de compilação/tipos, e os
38 testes da entrega original validavam o pipeline de conteúdo (Redocly)
e a lógica pura dos scripts, não o comportamento de montagem do app Vue
em si. `test/head-setup.test.js` fecha esse buraco: monta um componente
mínimo com `@happy-dom/global-registrator` (DOM real em Node, via o
registrador oficial do happy-dom — só copiar `window`/`document` não
bastava, o Vue também precisa de globals como `SVGElement` para decidir
o namespace do elemento raiz) e prova, com um teste "sanity" ao lado, que
o erro original volta a acontecer sem o fix — ou seja, o teste
realmente cobre esta regressão específica, não só "o app monta sem
erro" de forma genérica.

## 8. Configuration global adotada de um teste local

Depois de rodar o portal localmente, veio uma configuration completa do
Scalar (vista pelo `showDeveloperTools`, que expõe um painel de debug)
que incluía campos que este projeto ainda não usava explicitamente —
`theme: 'fastify'`, `showToolbar`, `showDeveloperTools`,
`operationTitleSource`, `telemetry`, `externalUrls`, entre outros.

Cada campo foi conferido contra o schema Zod real da versão instalada
(`node_modules/@scalar/types/dist/api-reference/*.d.ts`) antes de entrar
em `src/config/scalar.config.js` — não copiado às cegas. Essa checagem
pegou uma sutileza: o objeto tinha `title: "RH Net Social"`, `slug:
"rhnetsocial"`, `default: false` e `authentication` com o token. Esses 4
campos existem no schema, inclusive no nível global — mas os valores que
vieram eram os valores **resolvidos** para o documento que estava aberto
no momento (RH Net Social), não configuration global de verdade. Colar
isso no nível global fixaria toda API — inclusive a Auth — com o
título/slug/auth de uma API específica. Esses 4 campos continuam vindo,
corretamente, de `buildScalarSources()` (um por API, a partir do
manifesto) — `test/scalar-config.test.js` tem um teste dedicado
garantindo que eles não vazam para o nível global de novo no futuro.

Sobre `theme: 'fastify'` especificamente: é um preset de paleta baseado
na identidade visual da Fastify, que define seu próprio
`--scalar-color-accent: #2f8555` (verde). Isso não conflita com o navy
da SCI porque o CSS desse preset é injetado dentro de uma `@layer`
(confirmado em `node_modules/@scalar/themes/dist/index.js` — a função que
monta o CSS do tema aceita um parâmetro `layer` e envolve o resultado em
`@layer ${layer} { ... }` quando ele é passado). Por regra do CSS Cascade
Layers, qualquer estilo **fora** de `@layer` sempre vence um estilo
**dentro** de uma, não importa especificidade ou ordem — e o override de
accent em `src/style.css` não usa `@layer`. Então o accent da SCI
continua vencendo, e o restante da paleta do fastify (fundos, texto
secundário) é o que efetivamente aparece.

Sobre `telemetry: true` e `externalUrls`: a telemetria envia dados
anônimos de uso do visualizador de docs para os servidores da própria
Scalar (não é sobre os dados de negócio das APIs documentadas —
CPF/dados de RH nunca passam por aí, isso é só sobre como a interface do
Scalar é usada). `externalUrls` são os endereços padrão dos serviços
hospedados pela Scalar (dashboard, registry, proxy de CORS, API) — deixar
isso explícito no código, em vez de deixar implícito no default, foi uma
escolha consciente para que o time visse exatamente pra onde esses dados
vão, num único lugar.

## O que foi testado de verdade neste ambiente

Diferente da v1 (cujo README listava quase tudo como "não testei, sandbox
sem acesso ao CDN do Scalar"), este ambiente tinha acesso ao registro do
npm — o que permitiu instalar as dependências reais e rodar o pipeline
completo:

1. **`npm install`** — as 317 dependências reais (Vite, Vue 3, `@scalar/api-reference`
   1.62.x, `@redocly/cli` 2.39.x) foram instaladas e resolvidas sem
   conflito.
2. **Pipeline Redocly ponta a ponta** — com fixtures em `test/fixtures/`
   simulando specs brutos de produção (incluindo uma rota
   `/api/admin/...` para validar o filtro de blacklist, e uma tag
   `Feriado` com a descrição incorreta original do backend, para validar
   a correção), `scripts/build-openapi.js` rodou o Redocly real
   (`lint` + `bundle`) e produziu bundles finais corretos — servers
   injetados, overview aplicado, `x-post-response` presente e correto no
   login, tag `Feriado` corrigida. Isso agora é um teste automatizado
   permanente (`test/pipeline.integration.test.js`), não uma checagem
   manual pontual.
3. **`vite build` real** — compilou o app Vue completo (App.vue,
   PortalHeader.vue, TokenBanner.vue, os composables, importando
   `@scalar/api-reference` de verdade) sem erros, gerando `dist/` com
   `index.html`, os assets e os bundles de `public/openapi/` copiados
   corretamente.
4. **`vite preview` servido e checado via `curl`** — confirmando que
   `index.html`, `assets/sci-logo.png` (sem hash, servido no caminho
   absoluto esperado) e `openapi/auth.json` respondem `200`, e que o
   conteúdo do bundle final é o esperado (`x-post-response` presente).
5. **41 testes automatizados** (`npm test`, `node:test`) cobrindo a
   lógica pura de todo script do pipeline e do composable de captura de
   token, além de um teste que monta um componente Vue de verdade (DOM
   real via `@happy-dom/global-registrator`) para cobrir a classe de bug
   descrita na decisão 7 acima — erros que só acontecem em runtime, na
   função `setup()`, que `vite build` não pega. Ver README, seção
   "Testes automatizados", para a lista completa.

## O que ainda depende de QA num navegador real

Ser honesto sobre os limites do que dá pra confirmar sem um navegador de
verdade continua importante, mesmo com bem mais coisa testada que na v1:

- **Aparência final** — cores, espaçamento, responsividade em dispositivo
  real. O `ResizeObserver` do header e o CSS var do Scalar foram
  validados por leitura de código e documentação oficial, não por
  screenshot.
- **Preenchimento automático do token em tempo real** — a leitura de
  `pm.globals` pelo campo de autenticação de outro documento, dentro da
  interface renderizada do Scalar, é uma interação de UI que só um
  navegador real exercita. O banner (camada 2) é a garantia caso isso não
  se comporte exatamente como esperado.
- **Link cruzado por hash** (`window.location.hash = slug` no botão "Ir
  para →") — é o mecanismo documentado para trocar de documento num
  `sources[]` com roteamento hash-based (o padrão para hospedagem
  estática como GitHub Pages), mas o comportamento exato de scroll/foco
  ao trocar de aba não foi observado visualmente.
- **OAuth2 / fluxos de autenticação mais complexos** — o projeto hoje só
  lida com Bearer token via login customizado. Se uma API futura da SCI
  usar OAuth2, o Scalar tem suporte nativo a isso (fluxos completos,
  incluindo PKCE), mas não foi exercitado aqui.

O objetivo de listar isso não é "cobrir a base" — é dar ao time de QA um
roteiro específico do que checar primeiro, em vez de testar o portal
inteiro do zero sem direção.
