## Sobre esta API

A **API Auth** é o serviço de segurança central da SCI. Ela autentica requisições via credenciais de parceiros e clientes para gerar e renovar tokens JWT, garantindo acesso seguro aos endpoints das demais APIs do portal.

> [!TIP]
> Uma vez logado aqui, o token é reaproveitado automaticamente em todas as outras APIs deste portal (hoje, **RH Net Social**) — você não precisa copiar e colar nada. Veja o aviso que aparece após o login, ou a seção "Como o token é compartilhado" no README do projeto.

---

## Como autenticar

Para gerar o token, envie duas credenciais via **HTTP Basic Auth** no endpoint de login:

| Campo do Basic Auth | Credencial |
| :--- | :--- |
| Username | Token de parceiro |
| Password | Token de cliente |

### 🤝 1. Como obter o token de parceiro

Gerado pela SCI após a formalização de um contrato de parceria. Para solicitar, preencha o **Cadastro de Parceiro Integrador** no [site da SCI](https://visual.sci10.com.br/sistemas-de-gestao/).

---

### 🔑 2. Como obter o token de cliente

Gerado dentro do **SCI WEB** (sistema exclusivo para clientes SCI), por um usuário já autenticado:

1. Com a sessão aberta no SCI WEB, clique no seu nome no canto superior direito e depois em **"Gerar token API"**.
2. A tela **"Token de Integração SCI WEB"** explica a finalidade do token e quais módulos o utilizam. Clique em **"Criar novo token"**.
3. Dê um nome opcional ao token, para identificá-lo depois na lista, e clique em **"Continuar"**.

> [!WARNING]
> **Guarde o token em local seguro.** Ele é exibido **uma única vez**. Depois de fechar essa tela, não é mais possível visualizá-lo novamente — só é possível gerar um novo.

---

## Perfis de Permissão

O token de cliente pode ser gerado por dois tipos de usuário do SCI WEB diferentes, e isso muda o que o JWT resultante tem permissão para fazer nas demais APIs:

- **Cliente/Empresa:** token gerado por um usuário responsável da empresa.
- **Administrador/Contabilidade:** token gerado por um usuário administrador do sistema ou pelo escritório de contabilidade.

*(As tabelas de permissão por endpoint, para cada perfil, estão na aba de cada API específica — por exemplo, **RH Net Social**.)*
