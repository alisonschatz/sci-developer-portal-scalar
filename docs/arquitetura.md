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
pode ser um `computed`, como é feito aqui para resolver
`import.meta.env.BASE_URL`), menos previsibilidade de versão (CDN aponta
pra `latest` por padrão), e um SSR/hidratação mais difícil se um dia o
portal precisar disso.

Trade-off honesto: a build de CDN é mais simples para quem não quer
nenhum passo de build. Como este projeto já tinha um pipeline Node
(Redocly) e Node 20+ como pré-requisito, adicionar Vite não introduz uma
dependência nova de categoria — só troca "servir HTML estático" por
"servir o output de um build", o que GitHub Pages faz igualmente bem.

## 2. `customFetch` em vez de monkey-patch de `window.fetch` (histórico — removido na decisão 10)

*Esta decisão não está mais implementada no código — ver decisão 10. Fica
registrada porque o raciocínio ainda é válido caso um mecanismo parecido
volte a ser necessário no futuro.*

A v1 sobrescrevia `window.fetch` globalmente, na esperança de capturar só
a resposta do login. Isso tem dois problemas: (a) intercepta *qualquer*
fetch da página, não só os do Scalar, e (b) se o Scalar internamente
trocar sua estratégia de rede (ex.: adotar `XMLHttpRequest` em algum
caminho, ou rodar em um Web Worker), o monkey-patch para de funcionar
silenciosamente.

A configuração do Scalar aceita `customFetch`: uma função usada tanto
para carregar o OpenAPI quanto para as chamadas de "Test Request" do
cliente embutido — ou seja, o hook *pretendido* para observar/adaptar
requisições, caso o banner (ou algo parecido) volte a ser necessário.

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
*documentos diferentes* dentro do mesmo `sources[]`, especificamente.
Até a decisão 10, a arquitetura mantinha uma segunda camada garantida (um
banner) para esse caso de borda; ela foi removida — ver decisão 10 para
o porquê e o trade-off aceito.

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

## 9. Teste de integração apagando bundles reais em produção — bug real no CI

Depois do deploy pela primeira vez via GitHub Actions, o site carregou
(header, sidebar, busca — tudo certo), mas `openapi/auth.json` e
`openapi/rhnetsocial.json` voltavam `404`, e o Scalar mostrava "Document
could not be loaded" no lugar da documentação.

O log do Actions mostrou exatamente onde: o passo "Baixar + lintar +
empacotar as APIs" rodava com sucesso, gerando os bundles reais em
`public/openapi/*.json` — mas o passo seguinte, "Rodar testes
automatizados" (`npm test`), fazia `test/pipeline.integration.test.js`
sobrescrever `src/base/openapi-*.json` com as fixtures e, no `after()`,
apagar **todo** arquivo `.json` dentro de `public/openapi/` como
"limpeza" — destruindo os bundles reais recém-gerados, antes do `vite
build` rodar. O artefato final do Pages tinha só o `.gitkeep`.

Isso é um problema clássico de isolamento de teste: o teste escrevia e
limpava um diretório que também é usado pelo pipeline de produção
(`public/openapi/`), presumindo que só ele mexeria ali. Em
desenvolvimento local isso nunca aparecia, porque ninguém roda
`npm run build:openapi` seguido de `npm test` na mesma sessão sem querer
— mas no CI, com `build:openapi` e `npm test` no mesmo job, na mesma
pasta, essa suposição quebrou.

**Correção em três camadas:**

1. **Causa raiz:** `test/pipeline.integration.test.js` agora faz backup
   em memória de qualquer conteúdo que já exista nos caminhos que vai
   sobrescrever (`src/base/openapi-*.json`,
   `public/openapi/{auth,rhnetsocial}.json`) antes de rodar, e restaura
   exatamente esse conteúdo no `after()` — nunca mais um "apaga tudo
   .json da pasta". Isso deixa o teste seguro **independente da ordem**
   em que os scripts rodam, no CI ou localmente.
2. **Isolamento entre testes:** a primeira versão desta correção pôs a
   regressão dedicada num arquivo separado
   (`test/pipeline-integration-safety.test.js`), que rodava o teste
   acima como subprocesso. Rodando a suíte completa, essa separação
   reproduziu uma variante do MESMO bug: `node --test` roda arquivos de
   teste diferentes em paralelo, e o arquivo separado sobrescrevia os
   caminhos gerenciados com conteúdo fake sem fazer backup do que
   houvesse ali — o mesmo erro que o teste existia para prevenir,
   cometido nele mesmo. A correção final consolidou tudo num único
   arquivo (`describe('proteção contra apagar conteúdo real
   pré-existente', ...)`, no fim de `test/pipeline.integration.test.js`),
   chamando as mesmas funções de backup/build/restore diretamente, no
   mesmo processo — sem subprocess, sem um segundo arquivo mexendo nos
   mesmos caminhos, sem risco de concorrência entre arquivos.
3. **Defesa em profundidade:** o workflow (`.github/workflows/deploy-docs.yml`)
   agora roda `npm test` **antes** de `npm run build:openapi` — os testes
   usam fixtures, não precisam de rede, então rodar antes falha mais
   rápido em problema de código E evita completamente o cenário que
   causou o bug (mesmo que a correção da camada 1 já torne isso seguro
   por si só).

Junto: `engines.node` (package.json) e `node-version` (workflow) foram
corrigidos de `20` para `22` — o log do mesmo Actions run mostrou
`npm warn EBADENGINE` para praticamente todo pacote `@scalar/*`
(`agent-chat`, `api-client`, `api-reference`, `components`, `sidebar`,
`themes`, `workspace-store`, entre outros), todos já exigindo
`node >= 22`. Não estava quebrando nada ainda (só warnings), mas era
questão de tempo.

## 10. Remoção do banner de token

O banner ("Token gerado com sucesso" + botões "Copiar" / "Ir para →")
existia como uma segunda camada de garantia, via `customFetch`, para o
caso de o preenchimento automático (`pm.globals` + `{{variável}}`) não
funcionar por algum motivo. Foi removido a pedido explícito, depois de
confirmar — com o `auth.json` real — que a causa mais provável de o
preenchimento automático não estar funcionando entre documentos não era
o mecanismo em si, e sim **nomes de security scheme incorretos** (ver
decisão 11): o banner mascarava esse sintoma ao dar uma confirmação
visual de "token capturado", mesmo quando esse token nunca chegava a
preencher o campo de autenticação de outra API por causa do nome errado.

**Trade-off aceito, explicitamente:** sem o banner, se o preenchimento
automático parar de funcionar numa versão futura do Scalar (ou numa API
nova com um scheme configurado errado), não há mais nenhum aviso na
tela — a pessoa só percebe ao tentar uma chamada e receber `401`. Isso
foi julgado aceitável porque (a) a causa raiz mais provável de falha
(nome de scheme errado) agora tem uma checagem documentada no README
para conferir antes de publicar uma API nova, e (b) `persistAuth: true`
e os campos de autenticação continuam editáveis manualmente a qualquer
momento — o pior caso volta a ser "preencher à mão", não "impossível de
usar".

Arquivos removidos: `src/components/TokenBanner.vue`,
`src/composables/useTokenCapture.js`, `test/token-capture.test.js`.
`App.vue` voltou a ser só `<ApiReference>` com o slot `sidebar-start`.

## 11. Nomes reais dos security schemes, e `securitySchemes` (plural)

O `auth.json` real (fornecido pelo usuário) revelou que os nomes de
security scheme assumidos no manifesto estavam errados — não
"basicAuth"/"bearerAuth" genéricos, e sim **"Gerar JWT"** (Basic, no
login) e **"Atualizar JWT"** (Bearer, no refresh), com espaço no nome.
Isso importa porque o Scalar só aplica um valor de autenticação
pré-configurado no security scheme cujo **nome bate exatamente** com
`components.securitySchemes` do spec de origem — um nome errado não dá
erro nenhum, só silenciosamente nunca preenche nada. Esse é o suspeito
mais provável para "a geração e persistência de token para as demais
páginas não está funcionando": o nome assumido para a RH Net Social
(`'bearerAuth'`) nunca foi conferido contra o spec real dela, ao
contrário da Auth agora.

A Auth também revelou uma necessidade nova: ela tem **dois** security
schemes relevantes, com comportamentos diferentes — "Gerar JWT" (as
credenciais que geram o token; nada para pré-preencher) e "Atualizar
JWT" (precisa do token atual para renovar; pré-preenchido com
`{{sci_auth_token}}`). O campo `securityScheme` (singular) do manifesto,
usado por toda API consumidora simples, não tinha como expressar "dois
schemes, cada um com seu próprio prefill". `apis.manifest.js` ganhou um
campo irmão, `securitySchemes` (plural, array), para esse caso — e
`buildScalarSources()` em `src/config/scalar.config.js` monta
`preferredSecurityScheme` como array quando mais de um scheme é marcado
`preferred: true`, confirmado como uma relação "OU" no schema real do
Scalar (`node_modules/@scalar/types/dist/api-reference/authentication-configuration.d.ts`).

Uma API futura só precisa do campo plural se tiver mais de um scheme
relevante — o caso comum (um scheme Bearer só) continua usando o campo
`securityScheme` singular, sem nenhuma mudança.

## 12. Limpeza de conteúdo personalizado (descriptions/tags/examples)

A pedido explícito, `descriptions.yaml`, `tags.yaml` e `examples.json`
das duas APIs foram esvaziados de volta ao formato "recém-escaneado"
(o mesmo que `scripts/new-api.js` gera para uma API nova) — incluindo a
correção da tag "Feriado" da RH Net Social (a descrição original do
backend, "criação, edição e exclusão", volta a aparecer, mesmo sendo
potencialmente enganosa: esse recurso é só leitura via API). Esse
conteúdo é "engenharia de escrita voltada ao cliente" — texto que
descreve permissões e exemplos de negócio para quem está integrando —
e ainda não estava pronto; falar diferente do time até lá seria pior do
que deixar o texto genérico do backend por enquanto.

**O que NÃO foi removido, de propósito:** os `postResponseScript` das
duas operações da Auth (login e refresh), em `descriptions.yaml`. Não é
texto de marketing — é o mecanismo funcional que grava o token
compartilhado em `pm.globals`. Removê-lo quebraria o compartilhamento de
token entre as APIs, que é a funcionalidade central do portal.

Essa limpeza expôs um acoplamento frágil em dois testes de
`test/pipeline.integration.test.js`: eles verificavam o **texto real**
de `tags.yaml` (a correção da tag "Feriado"), então quebraram assim que
o texto mudou — mesmo o *mecanismo* que eles deveriam testar continuando
correto. Foram reescritos para testar o mecanismo com uma sobrescrita
temporária de `tags.yaml`, feita e desfeita dentro do próprio teste (com
o mesmo padrão de backup/restore já usado em outros lugares do arquivo),
em vez de depender do conteúdo real do projeto — que agora muda por
fora, no trabalho de escrita, sem relação com o código.

**Continuação (depois das decisões 13–19):** com o comportamento de
autenticação todo funcionando e estável, `src/decorators/auth/overview.md`
recebeu uma reescrita completa como conteúdo de UX writing — diferente
de `tags.yaml`/`descriptions.yaml`/`examples.json` (ainda genéricos,
aguardando a "engenharia de escrita" mencionada acima), o overview é o
primeiro contato de qualquer parceiro com o portal, então valeu escrever
por completo desde já: as duas credenciais (parceiro/cliente) e onde
conseguir cada uma, o passo a passo de gerar o token dentro do próprio
portal, a diferença entre "Gerar JWT" e "Atualizar JWT" explicada em
linguagem de usuário (não a mecânica interna — isso fica nas decisões
13–19 deste documento), os perfis de permissão, e uma seção de
perguntas comuns antecipando as dúvidas mais prováveis. Usa os alertas
GFM confirmados na decisão 5 (`[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`,
`[!NOTE]`) com propósito — não em todo parágrafo — e evita expor
qualquer detalhe de implementação (a pessoa lendo não precisa saber que
existe uma "ponte" de token nem um "guard" de storage; só precisa saber
que funciona).

## 13. `preferredSecurityScheme`: só um por vez para schemes de operações diferentes

A configuration inicial marcava **os dois** schemes da Auth
("Gerar JWT" e "Atualizar JWT") como `preferred: true` simultaneamente,
resultando em `preferredSecurityScheme: ['Gerar JWT', 'Atualizar JWT']`
— um array, que a Scalar documenta como uma relação **"OU"**
(`node_modules/@scalar/types/dist/api-reference/authentication-configuration.d.ts`):
"o usuário pode alternar entre estes". Isso faz sentido quando uma
MESMA operação aceita esquemas alternativos — não é o caso aqui:
"Gerar JWT" (Basic) é usado exclusivamente pelo login, "Atualizar JWT"
(Bearer) exclusivamente pelo refresh. Não existe uma chamada onde as
duas sejam alternativas cabíveis; marcar as duas como preferidas ao
mesmo tempo não tinha um significado coerente na Scalar, e é bem
provável que tenha contribuído para o preenchimento automático não se
comportar como esperado.

Correção: só "Gerar JWT" (o ponto de entrada — é o que se usa para
logar pela primeira vez) é `preferred: true`. "Atualizar JWT" continua
com `prefill` configurado (`token: '{{sci_auth_token}}'`), mas **sem**
estar em `preferredSecurityScheme` — o exemplo oficial do schema
(`preferredSecurityScheme: 'apiKeyHeader', securitySchemes: { apiKeyHeader: {...},
httpBearer: {...}, httpBasic: {...} }`) já mostra isso: `securitySchemes`
(o mapa de prefill) e `preferredSecurityScheme` (o que abre selecionado
por padrão) são **independentes** — dá para fornecer prefill para vários
schemes tendo só um marcado como preferido. Como o próprio endpoint de
refresh declara "Atualizar JWT" como seu security requirement, o Scalar
deve usá-lo automaticamente ao abrir essa operação específica,
independente do que está marcado como "preferido" no nível do
documento.

**Isso NÃO resolve, sozinho, o problema mais profundo relatado pelo
usuário** — a variável `{{sci_auth_token}}` não estar sendo aplicada
visualmente no campo de "Atualizar JWT" mesmo depois do login. Essa
parte tem indícios fortes de ser uma limitação atual, em aberto, do
próprio Scalar — ver a issue
[scalar/scalar#7161](https://github.com/scalar/scalar/issues/7161)
("Map authentication config to the new store"), aberta pelo time deles
em outubro/2025, descrevendo exatamente esse sintoma: configuration de
authentication não sendo mapeada para o "novo store" interno do cliente
de API. Ainda sem confirmação de que a versão instalada (1.62.7) já
tem correção. Diagnóstico em andamento — próximo passo é isolar se
limpar o localStorage (estado de sessões de teste anteriores, salvas
antes desta correção) resolve, ou se é de fato a limitação upstream.

## 14. `useTokenBridge.js` — a variável nativa não persiste entre requisições

Depois da decisão 13, o usuário reportou (com evidência concreta:
gerava o token, entrava no refresh, e a variável "estava lá, mas sem
valor") que o preenchimento automático continuava falhando. Diagnóstico
em 3 passos, cada um eliminando uma hipótese:

1. **Não era o painel não mostrar o campo certo.** O campo já mostrava
   `{{sci_auth_token}}` corretamente — ou seja, a decisão 13 (prefill
   configurado) estava certa. O problema era outro.
2. **O script não roda.** Depois de "Send" no login, nenhuma seção
   "Tests" aparece no painel de resposta — o `pm.test(...)` dentro do
   `postResponseScript` nunca produz saída visível.
3. **Achado no código-fonte, não em documentação:** o motivo real está
   em `node_modules/@scalar/workspace-store/dist/request-example/variable-store/index.js`.
   A função `createVariablesStoreForRequest()` — o nome já entrega —
   cria um store de variáveis (incluindo o que seria `pm.globals`)
   **do zero, em memória, por requisição individual**. Mesmo que o
   script rode e chame `pm.globals.set(...)`, esse valor vive só
   dentro da execução daquela ÚNICA requisição — é descartado assim
   que ela termina, nunca persistindo para a PRÓXIMA chamada (login →
   refresh, ou login → RH Net Social). Isso é consistente com a issue
   #7161 (decisão 13): o "novo store" que substituiria isso por algo
   persistente parece não estar totalmente conectado nesta versão.

**Solução, sugerida pelo usuário e implementada:** em vez de depender do
Scalar resolver a variável internamente, interceptar a requisição de
saída via `customFetch` — o mesmo hook oficial já usado (e removido) na
decisão 2, mas com um propósito diferente e mais restrito. `src/composables/useTokenBridge.js`:

- Observa toda resposta vinda do server da API `auth` (login e refresh
  incluídos — sem hardcode de caminho, casa por prefixo de URL contra
  `serverUrl` do manifesto) e guarda o token em uma variável de módulo
  simples, em memória — não depende de `pm.globals`, `localStorage`,
  nem de nenhum mecanismo interno do Scalar.
- Antes de repassar QUALQUER requisição pro `fetch` de verdade, checa
  se o destino é uma API que consome o token compartilhado (derivado do
  manifesto: `securityScheme`/`securitySchemes` com prefill de `token`
  — nunca URL hardcoded) e se o header `Authorization` que o Scalar
  estava prestes a enviar está ausente, vazio, ou é literalmente o
  placeholder não resolvido — só nesses casos substitui pelo token
  capturado. Um valor real que a pessoa tenha digitado manualmente
  nunca é sobrescrito.

O campo de autenticação na tela continua mostrando `{{sci_auth_token}}`
como texto — isso é o comportamento esperado de templating (Postman
funciona igual: o campo mostra a referência, não o valor resolvido). O
que muda é que a requisição **enviada de verdade** carrega o token
correto, verificado com um teste que simula o fluxo completo
(`test/token-bridge.test.js`: login → captura → correção automática do
header numa chamada seguinte, com um `fetch` fake que não faz rede de
verdade).

**Por que não voltar pro banner:** o usuário foi explícito — queria
automático, não uma UI de confirmação manual. A ponte entrega isso: zero
elementos visuais, e resolve o problema na camada que realmente importa
(a requisição HTTP em si), não só a aparência do campo. O trade-off
aceito é o inverso do banner: se a ponte falhar silenciosamente por
algum motivo não previsto, não há nenhum aviso visual — mitigado por ela
ser pequena, pura em quase toda a lógica, e coberta por teste que
exercita o fluxo ponta a ponta.

### 14.1 — Primeira versão não funcionava: assinatura errada de `customFetch`

O usuário testou a v1 desta ponte e reportou exatamente o mesmo sintoma
de antes (`x-scalar-secret-token` vazio, refresh sem token). A causa,
desta vez encontrada direto no código-fonte do Scalar, não em
documentação nem em inferência:

`node_modules/@scalar/api-client/dist/v2/blocks/operation-block/helpers/send-request.js`:

```js
const response = isElectron()
  ? await customFetch(...requestPayload)
  : await customFetch(request ?? buildSafeBodyRequest(...requestPayload));
```

No navegador (não-Electron — o caso deste portal), `customFetch` é
chamado com **um único argumento**: um `Request` já pronto
(`buildSafeBodyRequest`, o fallback, também sempre retorna
`new Request(...)` — conferido em
`node_modules/@scalar/helpers/dist/http/can-method-have-body.js`). A
v1 da ponte assumia a assinatura `customFetch(url, init)`, então `init`
chegava sempre `undefined`. Pior: ao tentar corrigir o header, a v1
construía `{ headers: <só o Authorization> }` — passado como `init` para
`fetch(request, init)`, isso **substitui todos os headers da
requisição original** (Content-Type, Accept etc.), não só adiciona o
Authorization. Mesmo se a correção do token tivesse funcionado, a
requisição provavelmente quebraria de outro jeito, silenciosamente.

**Correção:** `readAuthorizationHeader()` e `buildPatchedRequest()`
agora tratam os dois formatos de chamada — Request único (o caso real)
e `(url, init)` de dois argumentos (Electron, ou uso direto). Quando o
`input` é um `Request`, a correção clona `input.headers` (preservando
tudo) e só sobrescreve o Authorization, via `new Request(input, {
headers })` — que preserva method/body/mode/credentials do original.
`test/token-bridge.test.js` tem um teste que reproduz o formato exato de
chamada do Scalar (`fakeFetch` recebendo só 1 argumento, verificado com
`arguments.length === 1`) e confirma que outros headers e o body
sobrevivem à correção.

Diferente da v1 (cujo README listava quase tudo como "não testei, sandbox
sem acesso ao CDN do Scalar"), este ambiente tinha acesso ao registro do
npm — o que permitiu instalar as dependências reais e rodar o pipeline
completo:

## 15. Seleção de scheme no nível do documento "vaza" pra toda operação — remover `preferred`

Depois da correção 14.1, o usuário testou a UX de seleção de scheme em
si (independente da ponte de token) e reportou que, tanto no login
quanto no refresh, os dois schemes ("Gerar JWT" e "Atualizar JWT")
ficavam disponíveis pra escolher manualmente — o que ele queria — mas
perguntou se dava pra cada operação **selecionar sozinha** o scheme
certo dela ao entrar, mantendo os dois visíveis.

Achado no código-fonte
(`node_modules/@scalar/workspace-store/dist/request-example/context/security/get-selected-security.js`),
a ordem de prioridade real de qual scheme mostrar para uma operação:

```
1. Seleção no nível da OPERAÇÃO (se houver)
2. Seleção no nível do DOCUMENTO (se houver)
3. preferredSecurityScheme da configuration
4. Primeiro security requirement da própria OPERAÇÃO (no OpenAPI)
5. Sem seleção
```

A decisão 13 marcava "Gerar JWT" como `preferred: true` — isso vira
`preferredSecurityScheme: 'Gerar JWT'` na configuration, prioridade 3.
Como prioridade 3 vem ANTES de prioridade 4 (o que a própria operação
declara), esse "preferido" se aplicava a **toda operação do documento**
que não tivesse uma seleção mais específica — inclusive o refresh, que
deveria usar "Atualizar JWT" (prioridade 4, o requirement que ELE
declara), não "Gerar JWT". Ou seja: a correção da decisão 13 (não
marcar os dois preferidos ao mesmo tempo, por serem operações
diferentes) resolveu um problema, mas criou outro — marcar QUALQUER UM
dos dois como preferido do documento inteiro "vaza" esse scheme pra
operações que deveriam usar o outro.

**Correção:** nenhum scheme do documento `auth` tem `preferred: true`.
Sem prioridade 3, cada operação cai naturalmente pra prioridade 4 — o
próprio requirement que ela declara no OpenAPI. Login mostra "Gerar
JWT" sozinho, refresh mostra "Atualizar JWT" sozinho, automaticamente,
sem seleção manual — e como o seletor de auth lista todos os schemes
definidos no documento independente de qual está "selecionado" no
momento, os dois continuam disponíveis pra trocar na mão, exatamente
como o usuário confirmou que já acontecia e queria manter.

`prefill` (o preenchimento de `{{sci_auth_token}}` em "Atualizar JWT")
continua funcionando igual — é independente de `preferred`, aplica
sempre que aquele scheme específico estiver ativo, seja por seleção
automática (prioridade 4) ou manual (prioridade 1).

## 16. `useTokenStorageSync.js` — grava o token direto na chave de auth do Scalar

Depois da decisão 15, o usuário testou de novo e ainda não funcionou —
e trouxe uma observação certeira, testando manualmente no DevTools:
editar a chave `scalar-reference-auth-<slug>` só tem efeito na
**próxima vez que o documento é ativado** (trocar de aba, ou recarregar
a página), nunca instantaneamente com a página já aberta. Confirmado no
código-fonte: `loadAuthFromStorage()` (`ApiReference.vue.script.js`) só
roda no momento em que `x-scalar-active-document` muda — não há nenhum
listener de `storage` nem releitura reativa enquanto o documento já
está ativo.

Isso implica uma consequência prática direta: gerar o token na Auth e
depois **trocar de aba pra RH Net Social** já deveria funcionar (é uma
ativação de documento nova) — o problema concentrado é só dentro da
MESMA aba (login → refresh, sem trocar de documento).

**Solução:** `src/composables/useTokenStorageSync.js` escreve o token
direto na MESMA chave e no MESMO formato que o Scalar usa pra persistir
autenticação — confirmado peça por peça no código-fonte:

- Chave: `scalar-reference-auth-<slug>` (`@scalar/helpers` +
  `@scalar/api-reference/dist/helpers/storage.js`).
- Formato: `secrets[nomeDoScheme] = { type: 'http', 'x-scalar-secret-token',
  'x-scalar-secret-username', 'x-scalar-secret-password' }`
  (`@scalar/workspace-store/dist/entities/auth/schema.js` — o mesmo
  shape serve pra Basic e Bearer, só usando os campos relevantes).

Cada alvo (auth → "Atualizar JWT"; cada API consumidora → o scheme
dela) é descoberto a partir do manifesto, do mesmo jeito que o resto do
projeto — nenhum slug ou nome de scheme hardcoded fora dele. A escrita
é sempre "ler o que já existe → só atualizar o `x-scalar-secret-token`
do scheme certo → gravar de volta" — nunca um `setItem` cego, pra não
apagar credenciais que a pessoa já tenha digitado (usuário/senha do
Basic) nem a seleção de scheme que já estivesse salva.

**O que este módulo deliberadamente NÃO faz:** mexer em `selected` (a
parte da chave que decide qual scheme está "escolhido"). O schema
revela que existe `selected.path`, uma seleção **por operação**
(chaveada por caminho+método) — teoricamente a peça que faltava pra
"cada operação seleciona sozinha o scheme certo" (decisão 15) funcionar
mesmo com uma seleção de documento salva por cima. Não implementado:
o formato exato da chave (caminho literal? normalizado? método em
que caixa?) não tem confirmação segura o bastante pra arriscar — errar
o formato não dá erro nenhum, só silenciosamente não aplica, o mesmo
tipo de falha silenciosa que já consumiu várias rodadas de diagnóstico
neste projeto. Fica documentado aqui como a via mais provável de
completar o que falta, se for retomado com acesso a um navegador real
pra confirmar o formato por engenharia reversa direta (inspecionar o
valor salvo depois de uma seleção manual por operação).

## 17. `selected.document` sempre com os dois schemes da Auth — decisão consciente de trade-off

Depois da decisão 16, veio uma pergunta direta: dá pra deixar o topo do
documento Auth (a visão sem nenhuma operação aberta — "Authentication",
`Auth Type`) já mostrando algo, em vez de "No authentication
selected"? E, se sim, dá pra ter isso **e** cada operação continuar
escolhendo sozinha o Required dela (decisão 15)?

Testado na prática, não só em teoria: escrever
`selected.document.selectedSchemes` com os dois schemes juntos (o
mesmo formato de duas entradas, `[{"Gerar JWT":[]},{"Atualizar
JWT":[]}]`) faz os dois aparecerem disponíveis pra alternar — mas
nenhuma operação volta a calcular sozinha qual é o Required dela (o
"vazamento" da decisão 13, de novo). Mais: um teste do usuário revelou
que a causa não é o *conteúdo* de `selected.document` — é a
**existência** do campo. Mesmo `selectedSchemes: []` (vazio — o estado
que sobra depois de selecionar e desselecionar um scheme no dropdown do
topo, um clique comum de quem está só explorando a tela) já é
suficiente pra desligar o cálculo automático por operação,
permanentemente, até a chave ser apagada.

Conclusão, sem meio-termo encontrado: **as duas coisas competem pelo
mesmo campo**. Documento mostrando algo pré-selecionado no topo exige
`selected.document` preenchido; cada operação escolhendo sozinha exige
`selected.document` ausente. Não existe uma forma de ter as duas ao
mesmo tempo com o que este projeto confirmou sobre o mecanismo interno
do Scalar.

**Decisão do usuário, feita cientes do trade-off:** priorizar o topo do
documento sempre mostrando os dois schemes disponíveis, aceitando que
cada operação (login, refresh) não escolhe mais sozinha — a pessoa
alterna manualmente entre "Gerar JWT" e "Atualizar JWT" ao entrar em
cada uma (já confirmado que o dropdown pra isso funciona bem).

`ensureAllMultiSchemeSelections()`, chamada em `src/main.js` antes do
`mount()`, garante isso de forma autocurativa: roda toda vez que a
página carrega, verifica se `selected.document` do documento `auth` tem
os dois schemes presentes (no formato de duas entradas — nunca um
requirement combinado, que seria AND, não OU) e, se não tiver — chave
apagada, vazia, ou com só um scheme por qualquer motivo — regenera do
zero. Só toca em `selected.document`; nunca em `secrets` (credenciais
já digitadas sobrevivem sempre) nem grava à toa quando já está correto
(evita reescrever a cada carregamento de página sem necessidade).

Genérico por construção: `getMultiSchemeDocuments()` deriva do
manifesto quais documentos têm mais de um security scheme — hoje só a
`auth`. Uma API futura com essa mesma necessidade seria coberta
automaticamente, sem código novo.

## 18. `getBearerTokenConsumerServers()` excluía a própria auth — refresh nunca tinha a requisição corrigida

Com o topo do documento e o preenchimento do storage já funcionando
bem (decisões 16 e 17), sobrou uma pergunta direta: "o Atualizar Token
usa ele [o `sci_auth_token`] certo?" — e a resposta, olhando o código
com atenção, era **não, não na camada que mais importa**.

`getBearerTokenConsumerServers()` (a lista de servers que a ponte de
`customFetch` corrige de verdade, em tempo real, na requisição que sai)
tinha `if (api.isAuthProvider) continue` logo no início — pulando a
própria Auth incondicionalmente. Fazia sentido pensando só em "Gerar
JWT" (Basic, nada pra corrigir), mas "Atualizar JWT" também pertence à
Auth, e esse scheme **precisa** do token atual como Bearer pra
funcionar. A exclusão deixava a chamada de refresh em si sem nenhuma
correção da ponte — só o preenchimento do campo via storage (decisão
16) cobria esse caso, e só aparece depois de trocar de documento ou
recarregar a página, não imediatamente ao clicar "Send".

**Correção:** removida a exclusão. A mesma checagem que já existia
(`hasBearerPrefill`, olhando se algum scheme da API tem `prefill.token`)
resolve os dois casos da Auth sozinha, sem precisar de nenhum caso
especial: "Gerar JWT" nunca entra na lista (não tem prefill de token),
"Atualizar JWT" entra (tem). E como `needsBearerPatch()` só corrige um
header ausente/vazio/placeholder — nunca um valor real — a chamada de
login (com Basic de verdade) continua garantidamente intocada mesmo com
o server da Auth agora na lista.

`test/token-bridge.test.js` ganhou um teste dedicado que dispara as
duas chamadas (login com Basic real, depois refresh com o placeholder)
pela mesma ponte e confirma: login não muda, refresh sai com
`Bearer <token capturado no login>`.

## 19. `installTokenStorageGuard()` — a escrita direta perdia uma corrida contra o autosave do Scalar

Depois da decisão 18 (a ponte corrigindo a própria chamada de refresh
em tempo real), veio o relato: "ao gerar o token, não tá gerando os
secrets do Atualizar no storage" — ou seja, mesmo com `syncTokenToStorage`
(decisão 16) escrevendo direto na chave certa, o valor não estava
sobrevivendo.

A explicação mais provável, sem poder confirmar num navegador real:
o próprio Scalar também escreve nessa mesma chave — `setAuth()`
(`node_modules/@scalar/api-reference/dist/plugins/persistence-plugin.js`),
debounced (~500ms), disparado sempre que o estado de auth muda em
memória (ex.: a pessoa digitando usuário/senha em "Gerar JWT"). Essa
escrita reflete só o que o Scalar sabe em memória — nunca o token que
gravamos por fora — então, se ela disparar DEPOIS da nossa (uma corrida
de tempo perfeitamente plausível: nosso `syncTokenToStorage` roda assim
que a resposta do login chega; o debounce do Scalar pode disparar
pouco depois), ela apaga o que escrevemos.

**Correção:** em vez de tentar acertar o timing (frágil, e impossível
de garantir sem controlar o código deles), `installTokenStorageGuard()`
intercepta o próprio `storage.setItem` — a mesma ideia do `customFetch`,
aplicada à escrita em vez da rede. Depois de QUALQUER gravação nas
chaves de auth relevantes — inclusive as do próprio Scalar — o token
capturado é reaplicado por cima, na hora, antes de devolver o
controle. Não importa quando o Scalar decide escrever: nosso reforço
sempre vem por último, porque intercepta a própria operação de escrita,
não um horário específico.

Detalhes de implementação que valem registrar:

- `mergeTokenIntoSerializedEntry()` é uma função pura (sem tocar em
  storage) que calcula o JSON final a partir de um valor já
  serializado — usada tanto pela escrita direta (`writeTokenToScheme`)
  quanto pelo guard. O guard não pode chamar `writeTokenToScheme`
  diretamente (que usa `storage.setItem`, agora o próprio
  `guardedSetItem`) — reentraria nele mesmo. Em vez disso, calcula o
  valor final com a função pura e grava direto com o `setItem`
  **original**, guardado numa closure antes de ser substituído.
- Instalar o guard duas vezes é seguro (idempotente, via uma flag
  `storage.__tokenBridgeGuardInstalled`) — importante porque
  `App.vue` roda uma vez por sessão do componente, mas evita
  double-wrapping caso algo remonte no futuro.
- Chaves fora do alvo (ex.: `colorMode`, preferências do Scalar sem
  relação com auth) nunca são tocadas pelo guard — só as chaves
  `scalar-reference-auth-<slug>` derivadas do manifesto.

Testado com um cenário que reproduz a corrida exata suspeitada: grava o
token, depois simula o Scalar escrevendo por cima (um `setItem` com o
JSON dele, sem o token) — e confirma que o token sobrevive, reaplicado,
E que o que o Scalar escreveu (usuário/senha do Basic) também sobrevive
junto.

### 19.1 — A flag de idempotência do guard vazava pro storage de verdade

A primeira versão do guard usava `storage.__tokenBridgeGuardInstalled = true`
como flag de "já instalei, não instala de novo". Funcionava certinho
no Storage falso dos testes (um objeto comum) — mas o usuário reportou
essa chave aparecendo no `localStorage` de verdade, no navegador.

Causa: `localStorage` não é um objeto JavaScript comum — é um "legacy
platform object" (termo da própria especificação WHATWG) onde
**qualquer atribuição de propriedade arbitrária vira uma entrada real
de storage**. `storage.foo = 'bar'` num navegador de verdade funciona
exatamente como `storage.setItem('foo', 'bar')`. E como o `localStorage`
sobrevive a recarregar a página (diferente da memória do JavaScript),
isso criava um bug pior que só "uma entrada solta": na próxima carga da
página, o código lia essa flag de uma sessão anterior, achava que o
guard já estava instalado, e **não instalava de novo** — mesmo o
`setItem` "guardado" daquela sessão anterior não existindo mais na
memória nova.

**Correção:** a flag de idempotência virou um `WeakSet` em memória
(`guardedStorages`, no escopo do módulo) — nunca toca em nenhuma chave
de storage, se reseta sozinho a cada carregamento de página (memória
nova = WeakSet novo), e `installTokenStorageGuard()` limpa a chave
solta de versões anteriores (`removeItem('__tokenBridgeGuardInstalled')`)
na primeira vez que roda, pra quem já tinha essa versão com bug.

## 20. Links âncora dentro do overview — o algoritmo de slug real, e por que emoji de número quebra

A pedido de deixar o overview "mais intuitivo" — com links clicáveis em vez de só texto referenciando "a seção abaixo" — foi preciso confirmar, antes de escrever qualquer link, como o Scalar gera o `id` de cada heading do markdown (sem isso, um link `[texto](#algo)` só funciona por sorte).

Achado no código-fonte, não em documentação: quem renderiza `info.description` (nosso `overview.md`) é `InfoDescription.vue` (`node_modules/@scalar/api-reference/dist/blocks/scalar-info-block/`), que usa um slugger de verdade — `node_modules/@scalar/helpers/dist/string/slugify.js`, não o slugify básico (`toLowerCase + replace espaço`) que vi antes em `ScalarMarkdown.vue.script.js` para outros contextos (como descrição de operação). O algoritmo real:

```js
const RE_NON_WORD = /[^\p{L}\p{M}\p{N}\s_-]/gu;
// minúsculo, remove tudo que não for letra/marca/número/espaço/hífen,
// espaços e underscores viram hífen, hífens nas pontas são cortados
```

Duas consequências práticas, verificadas rodando o algoritmo de verdade
(não só lendo):

1. **Emoji "normais" (🔑🚀👥❓) são removidos de forma limpa** — são categoria Unicode "Symbol", fora do que o regex preserva. Um heading `## 1. 🔑 Duas credenciais...` vira o slug `1-duas-credenciais-...`, sem nenhum resquício do emoji.
2. **Emoji de número em círculo (1️⃣2️⃣3️⃣) NÃO são removidos** — são sequências que incluem caracteres Unicode de categoria "Mark" (variation selector + combining enclosing keycap), que o regex trata como parte de "palavra" e preserva. Um heading com `1️⃣` no texto gera um slug com o emoji literal dentro (`1️⃣-teste-...`) — praticamente impossível de acertar escrevendo um link à mão, e frágil mesmo copiando/colando (não é óbvio visualmente que são 3 caracteres Unicode diferentes, não 1).

Por isso o overview usa **dígito comum + ponto + emoji simples** (`## 1. 🔑 Texto`) para os headings numerados, nunca emoji de teclado numérico. Cada link do arquivo foi conferido rodando o algoritmo real (não estimado) contra o texto exato de cada heading — inclusive um H3 sem prefixo numérico (`### 👤 Token de cliente` → `#token-de-cliente`, sem o "2-" que o H2 pai tem) e um heading que teve o texto encurtado no meio da escrita, o que muda o slug (`Gerar JWT × Atualizar JWT — qual usar` → `Gerar JWT × Atualizar JWT`, slug final sem o sufixo).

**O link cruzado pra RH Net Social** (`[RH Net Social](#rhnetsocial)`) usa o mesmo hash-based routing já confirmado nas decisões anteriores (o slug da API no manifesto) — clicar deveria trocar de documento, não só rolar a página. Isso não foi possível confirmar visualmente (sem navegador); é a mesma mecânica de `window.location.hash = slug` já usada e documentada, aplicada agora via link de markdown em vez de JS.

**Nota:** o texto passou por uma segunda rodada (tom mais completo de volta, depois de uma primeira tentativa mais enxuta demais) — os títulos mudaram de novo, então os slugs também. Cada link foi reconferido rodando o algoritmo de novo contra o texto final, não reaproveitado da rodada anterior — é fácil um heading mudar de texto e um link ficar apontando pro slug antigo, silenciosamente quebrado.

## O que foi testado de verdade neste ambiente

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
   SidebarBrand.vue, os composables, importando `@scalar/api-reference`
   de verdade) sem erros, gerando `dist/` com `index.html`, os assets e
   os bundles de `public/openapi/` copiados corretamente.
4. **`vite preview` servido e checado via `curl`** — confirmando que
   `index.html`, `assets/sci-logo.png` (sem hash, servido no caminho
   absoluto esperado) e `openapi/auth.json` respondem `200`, e que o
   conteúdo do bundle final é o esperado (`x-post-response` presente).
5. **84 testes automatizados** (`npm test`, `node:test`) cobrindo a
   lógica pura de todo script do pipeline, o composable de ponte de
   token (incluindo o fluxo completo login → captura → correção do
   header, com fetch fake), e um teste que monta um componente Vue de
   verdade (DOM real via `@happy-dom/global-registrator`) para cobrir a
   classe de bug descrita na decisão 7 — erros que só acontecem em
   runtime, na função `setup()`, que `vite build` não pega. Ver README,
   seção "Testes automatizados", para a lista completa.

## O que ainda depende de QA num navegador real

Ser honesto sobre os limites do que dá pra confirmar sem um navegador de
verdade continua importante, mesmo com bem mais coisa testada que na v1:

- **Aparência final** — cores, espaçamento, responsividade em dispositivo
  real. O `ResizeObserver` do header e o CSS var do Scalar foram
  validados por leitura de código e documentação oficial, não por
  screenshot.
- **`useTokenBridge.js` com tráfego de rede real** — o fluxo completo
  (login → captura → correção de header) foi testado com um `fetch`
  fake (`test/token-bridge.test.js`), não contra as APIs de produção de
  verdade nem dentro do Scalar renderizado num navegador real. A lógica
  de correspondência de URL, extração de token e decisão de quando
  corrigir o header é a mesma; o que não foi exercitado é a integração
  completa (Scalar realmente chamando nosso `customFetch` com o shape
  exato de `input`/`init` que ele usa por dentro).
- **Nome do security scheme da RH Net Social** — assumido como
  `'bearerAuth'` no manifesto, nunca confirmado contra o spec real dela
  (ao contrário da Auth, cujo `auth.json` real revelou nomes bem
  diferentes do que estava assumido: "Gerar JWT"/"Atualizar JWT"). Se o
  nome real for outro, `getBearerTokenConsumerServers()` ainda inclui o
  `serverUrl` certo (isso não depende do nome do scheme), mas o campo de
  autenticação na tela não vai mostrar o placeholder pré-preenchido —
  cosmético, já que a ponte de token corrige o header de qualquer jeito,
  mas vale corrigir para a experiência ficar coerente. Ver README,
  seção "Como o token é compartilhado entre as APIs", para como
  conferir.
- **OAuth2 / fluxos de autenticação mais complexos** — o projeto hoje só
  lida com Bearer token via login customizado. Se uma API futura da SCI
  usar OAuth2, o Scalar tem suporte nativo a isso (fluxos completos,
  incluindo PKCE), mas não foi exercitado aqui.

O objetivo de listar isso não é "cobrir a base" — é dar ao time de QA um
roteiro específico do que checar primeiro, em vez de testar o portal
inteiro do zero sem direção.
