## Sobre esta API

A **API Auth** é o serviço de autenticação central da SCI. Ela gera e renova o token JWT usado por **todas as outras APIs deste portal**.

> [!TIP]
> Você só precisa autenticar uma vez — depois de gerar o token aqui, ele já fica disponível automaticamente nas outras abas deste portal, sem copiar e colar nada.

Se é sua primeira vez aqui, siga nessa ordem:

1. [Consiga suas duas credenciais](#auth/description/1-antes-de-começar-duas-credenciais) — seção logo abaixo.
2. [Gere o token](#2-como-gerar-o-token-jwt-aqui-no-portal) — passo a passo aqui no portal.
3. [Explore a RH Net Social](#rhnetsocial) — o token já vai estar disponível lá.

---

## 1. Antes de começar: duas credenciais

Para gerar o token, você precisa de **duas credenciais diferentes**, que juntas funcionam como um usuário e uma senha:

| Credencial | O que identifica | Onde conseguir |
| :--- | :--- | :--- |
| **Token de parceiro** | O sistema parceiro (a integração em si) | Contrato de parceria com a SCI |
| **Token de cliente** | O cliente/empresa sendo integrado | SCI WEB, pelo próprio cliente |

> [!IMPORTANT]
> Essas duas credenciais **não são o token JWT** — são o que você usa **para gerar** o token JWT, no passo seguinte.

### 🤝 Como obter o token de parceiro

Gerado pela SCI depois da formalização de um contrato de parceria. Preencha o **Cadastro de Parceiro Integrador** no [site da SCI](https://visual.sci10.com.br/sistemas-de-gestao/) para solicitar o seu.

### 👤 Como obter o token de cliente

Gerado dentro do **SCI WEB** (o sistema do próprio cliente), por um usuário já logado lá:

1. Com a sessão aberta no SCI WEB, clique no seu nome, no canto superior direito.
2. Clique em **"Gerar token API"**.
3. Na tela **"Token de Integração SCI WEB"**, clique em **"Criar novo token"**.
4. Dê um nome ao token (opcional — só para identificá-lo depois, se você tiver mais de um) e clique em **"Continuar"**.

> [!WARNING]
> O token de cliente aparece **uma única vez** — copie e guarde num local seguro antes de fechar a tela. Depois, só gerando um novo.

---

## 2. Como gerar o token JWT aqui no portal

Com as duas credenciais em mãos:

1. Abra a operação de login (`POST /api/v1/auth/credencial/login`), na lista à esquerda.
2. No painel de **Authentication**, selecione a opção **"Gerar JWT"**.
3. Preencha:
   - **Username:** o token de parceiro
   - **Password:** o token de cliente
4. Clique em **Send**.

Se as credenciais estiverem corretas, a resposta vem com `201` e um campo `token` — esse é o seu JWT.

> [!TIP]
> Não precisa copiar esse token para nenhum lugar — assim que a chamada é feita, ele já fica disponível automaticamente nas outras APIs deste portal.

---

## 3. "Gerar JWT" x "Atualizar JWT"
### Para que serve cada um

No painel de Authentication, você vai ver duas opções disponíveis: **"Gerar JWT"** e **"Atualizar JWT"**. São coisas diferentes, para momentos diferentes:

| | Gerar JWT | Atualizar JWT |
| :--- | :--- | :--- |
| **Quando usar** | No primeiro login, ou depois que o token expirar | Enquanto o token atual ainda é válido |
| **O que envia** | Token de parceiro + token de cliente | O próprio token JWT atual |
| **Endpoint** | `POST /api/v1/auth/credencial/login` | `POST /api/v1/auth/refresh` |

**Se você só está explorando a documentação, "Gerar JWT" resolve tudo** — suas credenciais ficam salvas no navegador, então gerar de novo é só clicar em **Send** outra vez, sempre que precisar. "Atualizar JWT" existe principalmente para quem está **implementando a integração de verdade**: evita reenviar usuário e senha a cada chamada, usando só o token atual para conseguir um novo.

> [!NOTE]
> O token tem um tempo de validade — veja o campo `validade` (em segundos) na resposta. Depois de expirado, gere um token novo com "Gerar JWT".

---

## 4. Perfis de permissão

O que o token pode fazer nas demais APIs depende de **quem gerou o token de cliente**:

- **Cliente/Empresa** — gerado por um usuário responsável da própria empresa.
- **Administrador/Contabilidade** — gerado por um administrador do sistema, ou pelo escritório de contabilidade.

O detalhe de **o que cada perfil pode fazer, recurso por recurso**, está na aba de cada API específica — veja [RH Net Social](#rhnetsocial).

---

## 5. Perguntas comuns

**Preciso gerar o token de novo em cada API que eu for usar?**
Não. Gere uma vez aqui, na Auth — o token já fica disponível automaticamente nas outras APIs deste portal.

**"Gerar JWT" ou "Atualizar JWT" — qual eu uso?**
"Gerar JWT" na primeira vez, ou depois que o token expirar. "Atualizar JWT" enquanto o token atual ainda for válido — mais relevante para quem está integrando o próprio código do que para explorar a documentação (veja a [tabela acima](#3-gerar-jwt-x-atualizar-jwt-para-que-serve-cada-um)).

**Perdi o token de cliente antes de copiar. E agora?**
Não tem como recuperar — ele só aparece uma vez, no momento em que é gerado. Gere um novo pelo SCI WEB, com o [mesmo passo a passo](#como-obter-o-token-de-cliente) desta página.

**Esqueci de copiar o token JWT gerado aqui no portal.**
Sem problema — diferente do token de cliente, esse pode ser gerado de novo a qualquer momento. Suas credenciais de parceiro/cliente continuam salvas; é só clicar em **Send** de novo em "Gerar JWT".
