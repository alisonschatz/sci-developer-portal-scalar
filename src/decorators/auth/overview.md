## 1. Sobre esta API

A **API Auth** é o serviço central de autenticação da SCI. Ela é responsável por gerar e renovar o token JWT utilizado por **todas as demais APIs disponíveis neste portal**.

> [!TIP]
> **Autenticação única:** Após gerar o token nesta API, a sua sessão fica ativa e o token é aplicado automaticamente em todas as outras abas do portal. Não é necessário copiar ou colar credenciais ao navegar entre endpoints.

### 🚀 Por onde começar

Para utilizar as APIs da SCI, siga este fluxo passo a passo:

1. [Obtenha suas duas credenciais de acesso](#auth/description/2-antes-de-começar-duas-credenciais)
2. [Gere o seu token JWT de teste no portal](#auth/description/3-como-gerar-o-token-jwt-aqui-no-portal)
3. Explore as APIs desejadas nas outras abas da documentação (o token gerado já estará ativo).

---

## 2. Antes de começar: duas credenciais

Para gerar o token de acesso, você precisará de **duas credenciais distintas**. Elas funcionam de forma combinada como se fossem o seu usuário e a sua senha de integração:

### 🔑 Visão geral das credenciais

| Credencial | Detalhes de acesso |
| :--- | :--- |
| **Token de Parceiro** | Identifica a aplicação parceira. Obtido via contrato com a SCI. |
| **Token de Cliente** | Identifica a empresa/cliente. Gerado pelo próprio cliente no SCI WEB. |

> [!IMPORTANT]
> O Token de Parceiro e o Token de Cliente **não são o token JWT**. Eles são os dados de entrada necessários para **solicitar e gerar** o token JWT.

### 🤝 Como obter o token de parceiro

O Token de Parceiro é disponibilizado pela equipe da SCI após a formalização da parceria técnica. Caso ainda não possua esse token, acesse a página de [Cadastro de Parceiro Integrador](https://visual.sci10.com.br/sistemas-de-gestao/) no site da SCI e faça a sua solicitação.

### 👤 Como obter o token de cliente

Este token deve ser gerado pelo responsável da empresa dentro do sistema **SCI WEB**:

1. Acesse o **SCI WEB** com uma conta de usuário ativa.
2. Clique no nome do usuário, localizado no canto superior direito da tela.
3. Selecione a opção **"Gerar token API"**.
4. Na tela **"Token de Integração SCI WEB"**, clique no botão **"Criar novo token"**.
5. Informe um nome identificador para o token (recomendado para facilitar a gestão caso possua múltiplas integrações) e clique em **"Continuar"**.

> [!WARNING]
> **Atenção:** O Token de Cliente é exibido **uma única vez** na tela de criação. Copie e armazene essa credencial em um local seguro. Caso perca esta chave, será necessário revogá-la e gerar um novo token.

---

## 3. Como gerar o token JWT aqui no portal

Com as duas credenciais em mãos, siga os passos abaixo para autenticar sua sessão diretamente na documentação:

1. Localize e selecione a operação de login (`POST /api/v1/auth/credencial/login`) no menu lateral esquerdo.
2. No painel **Authentication**, escolha o método **"Gerar JWT"**.
3. Preencha os campos obrigatórios:
   * **Username:** insira o seu **Token de Parceiro**
   * **Password:** insira o seu **Token de Cliente**
4. Clique no botão **Send**.

Se os dados informados estiverem corretos, a API retornará o status HTTP `201 Created` contendo o campo `token` no corpo da resposta.

> [!TIP]
> Você não precisa copiar o token gerado. O portal salva este token em cache local e o injeta automaticamente nos cabeçalhos das requisições de todas as outras APIs.

---

## 4. Comparativo de operações: "Gerar JWT" vs. "Atualizar JWT"

No painel de autenticação do portal e na estrutura da API, existem dois fluxos distintos para a gestão de tokens. Escolha a operação adequada para o seu cenário:

### 🔑 Operação: Gerar JWT

Fluxo utilizado para iniciar uma nova sessão de autenticação.

* **Endpoint:** `POST /api/v1/auth/credencial/login`
* **Entrada necessária:** Token de Parceiro + Token de Cliente
* **Resultado:** Cria um novo token JWT do zero
* **Quando utilizar:** No primeiro acesso ao sistema ou após a expiração completa do token anterior.

> [!TIP]
> **Recomendado para uso no Portal:** Utilize esta opção para testar os endpoints na documentação. Suas credenciais ficarão salvas no navegador, permitindo reautenticar clicando em **Send** a qualquer momento.

---

### 🔄 Operação: Atualizar JWT

Fluxo de renovação contínua de acesso sem reenvio de senhas.

* **Endpoint:** `POST /api/v1/auth/refresh`
* **Entrada necessária:** Token JWT atual (deve estar dentro da validade)
* **Resultado:** Substitui o token atual por um novo token válido com prazo renovado
* **Quando utilizar:** Durante a execução de sistemas automatizados, antes que o token atual expire.

> [!NOTE]
> **Recomendado para Código de Produção:** Esta abordagem evita trafegar credenciais sensíveis (Token de Parceiro e Cliente) em requisições recorrentes na sua aplicação.

---

## 5. Perfis de permissão

O escopo de ações que o token JWT pode executar nas demais APIs do portal é determinado pelo **tipo de conta do usuário** que criou o Token de Cliente no sistema SCI WEB:

| Perfil de acesso | Escopo e permissões |
| :--- | :--- |
| **Módulo Cliente** | Permite visualizar e manipular dados exclusivamente da própria empresa vinculada. |
| **Módulo Administrador** | Concede acesso estendido para gerenciar múltiplos clientes ou acessar rotas administrativas do escritório. |

> [!NOTE]
> O detalhamento das permissões específicas exigidas por cada rota (por exemplo, permissão de leitura ou escrita) pode ser consultado diretamente na documentação de cada API individual neste portal.

---

## 6. Perguntas frequentes

* **Preciso gerar um token diferente para cada API do portal?**  
  Não. O token gerado na API Auth é centralizado e vale para todas as demais APIs disponíveis neste portal.

* **Qual método devo escolher: "Gerar JWT" ou "Atualizar JWT"?**  
  Utilize **"Gerar JWT"** no primeiro acesso ou caso seu token já tenha expirado. Utilize **"Atualizar JWT"** na sua aplicação caso queira renovar o tempo de acesso antes que o token atual expire.

* **Perdi o Token de Cliente antes de salvar. Como recuperar?**  
  Não é possível recuperar um Token de Cliente já criado. Acesse o sistema SCI WEB, revogue o token antigo e gere um novo token seguindo o [passo a passo de geração](#auth/description/como-obter-o-token-de-cliente).

* **O que fazer se eu esquecer de copiar o Token JWT gerado no portal?**  
  Você pode gerar um novo token JWT a qualquer momento. Como as suas credenciais de parceiro e cliente permanecem salvas no painel de testes do portal, basta acessar o endpoint `POST /api/v1/auth/credencial/login` e clicar em **Send** novamente.