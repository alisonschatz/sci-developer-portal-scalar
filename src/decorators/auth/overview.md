## 1. Visão geral da API

A **API Auth** é o serviço central de autenticação da SCI. Ela é responsável por gerar e renovar o token JWT utilizado por **todas as demais APIs disponíveis neste portal**.

> [!TIP]
> **Autenticação única no Portal:** Após gerar o token nesta API, a sua sessão fica ativa e o token é aplicado automaticamente em todas as outras abas. Não é necessário copiar e colar credenciais ao navegar entre os endpoints.

<br />

### 🚀 Fluxo de integração

Para começar a consumir as APIs da SCI, siga esta ordem recomendada:

1. **Obtenha as credenciais:** Veja como adquirir o Token de Parceiro e o Token de Cliente na seção [Credenciais de acesso](#2-credenciais-de-acesso).
2. **Gere o token JWT:** Autentique sua sessão de testes na seção [Autenticação no portal](#3-autenticação-no-portal).
3. **Explore as APIs:** Navegue pelas demais abas do portal para testar os endpoints de negócio desejados.

---

<br />

## 2. Credenciais de acesso

Para gerar o token de acesso, você precisará de **duas credenciais distintas**. Elas funcionam de forma combinada como um par de autenticação (usuário e senha de integração):

<br />

| Credencial | Detalhes e Utilização |
| :--- | :--- |
| **Token de Parceiro** | Identifica a aplicação parceira. Disponibilizado via contrato técnico com a SCI. |
| **Token de Cliente** | Identifica a empresa/cliente. Gerado diretamente pelo cliente no sistema SCI WEB. |

> [!IMPORTANT]
> O Token de Parceiro e o Token de Cliente **não são o token JWT**. Eles são as credenciais necessárias para **solicitar** o token JWT.

<br />

### 🏢 Obtenção do Token de Parceiro

O Token de Parceiro é fornecido pela equipe de integrações da SCI após a formalização da parceria. 

Caso a sua empresa ainda não possua esta credencial, solicite através da página de [Cadastro de Parceiro Integrador](https://visual.sci10.com.br/sistemas-de-gestao/).

<br />

### 🔑 Obtenção do Token de Cliente

Esta credencial deve ser gerada pelo administrador da empresa dentro do sistema **SCI WEB**:

1. Acesse o **SCI WEB** com uma conta de usuário ativa.
2. Clique no nome do usuário no canto superior direito.
3. Selecione a opção **"Gerar token API"**.
4. Na tela *Token de Integração SCI WEB*, clique em **"Criar novo token"**.
5. Atribua um nome identificador (ex: *Integração RH*) e clique em **"Continuar"**.

> [!WARNING]
> O Token de Cliente é exibido **uma única vez** no momento da criação. Guarde-o em um local seguro. Em caso de perda, será necessário revogá-lo e gerar um novo.

---

<br />

## 3. Autenticação no portal

Com as duas credenciais em mãos, você pode autenticar a sua sessão diretamente no portal:

1. Selecione a operação de login (`POST /api/v1/auth/credencial/login`) no menu lateral.
2. No painel **Authentication**, selecione o método **"Gerar JWT"**.
3. Preencha os campos com suas credenciais:
   * **Username:** insira o seu **Token de Parceiro**
   * **Password:** insira o seu **Token de Cliente**
4. Clique em **Send**.

Se as credenciais estiverem corretas, a API retornará o status `201 Created` contendo o campo `token`.

> [!TIP]
> Você não precisa copiar o token. O portal salva este token em cache e o injeta automaticamente nos cabeçalhos das requisições em todas as outras APIs.

---

<br />

## 4. Gerenciamento do token JWT

A API Auth disponibiliza dois fluxos distintos para a gestão do token JWT. Escolha a operação adequada para cada etapa da sua integração:

<br />

### ⚡ Fluxo: Gerar JWT

* **Endpoint:** `POST /api/v1/auth/credencial/login`
* **Objetivo:** Iniciar uma nova sessão de acesso.
* **Dados necessários:** Token de Parceiro + Token de Cliente.
* **Quando utilizar:** No primeiro acesso ou quando o token anterior já estiver completamente expirado.

> [!TIP]
> **Uso no Portal:** Esta é a opção padrão para autenticar seus testes na documentação.

<br />

### 🔄 Fluxo: Atualizar JWT

* **Endpoint:** `POST /api/v1/auth/refresh`
* **Objetivo:** Renovar o tempo de validade do token atual sem retransmitir credenciais sensíveis.
* **Dados necessários:** Token JWT atual (ainda válido).
* **Quando utilizar:** Em rotinas automatizadas via código (background jobs), renovando o acesso antes que o token atual expire.

> [!NOTE]
> **Recomendado para Produção:** Evite trafegar o Token de Parceiro e Cliente em chamadas recorrentes. Prefira renovar o acesso via endpoint de refresh.

---

<br />

## 5. Perfis de permissão

O escopo de ações do token JWT nas demais APIs é determinado pelo **perfil do usuário** que gerou o Token de Cliente no SCI WEB:

<br />

| Perfil de Acesso | Escopo de Permissão |
| :--- | :--- |
| **Cliente** | Restrito à visualização e manipulação de dados da própria empresa. |
| **Administrador** | Permite gerenciar múltiplos clientes ou acessar rotas administrativas. |

> [!NOTE]
> As permissões específicas por recurso (como leitura ou escrita) são detalhadas na documentação individual de cada endpoint.

---

<br />

## 6. Perguntas frequentes

<br />

<details>
<summary><b>Preciso gerar um token diferente para cada API do portal?</b></summary>

> [!NOTE]
> **Resposta:** Não. O token gerado na API Auth é único e compartilhado automaticamente entre todas as APIs do portal.

</details>

<details>
<summary><b>Qual método devo usar na minha aplicação: Gerar JWT ou Atualizar JWT?</b></summary>

> [!TIP]
> **Resposta:**
> * **Primeiro acesso (or token expirado):** Use **Gerar JWT** enviando o Token de Parceiro e Token de Cliente.
> * **Renovação contínua em produção:** Use **Atualizar JWT** para renovar a validade periodicamente antes que o token atual expire.

</details>

<details>
<summary><b>Perdi o Token de Cliente. Como recuperar?</b></summary>

> [!WARNING]
> **Resposta:** Por razões de segurança, essa chave é exibida uma única vez e não pode ser recuperada. Acesse o **SCI WEB**, revogue o token antigo e gere uma nova credencial.

</details>

<details>
<summary><b>O que fazer se o token expirar durante meus testes no portal?</b></summary>

> [!TIP]
> **Resposta:** Você não precisa digitar suas credenciais novamente. Acesse a rota de login (`POST /api/v1/auth/credencial/login`) no menu lateral e clique em **Send** para renovar a sessão do portal.

</details>