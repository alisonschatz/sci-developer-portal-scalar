## Sobre esta API

Esta é a API de integração de negócios da SCI, desenvolvida para conectar e automatizar o fluxo de dados de recursos humanos do sistema **RH Net Social**.

Por meio dela, sistemas parceiros podem realizar a admissão digital de funcionários e autônomos, gerenciar lançamentos e configurações de banco de horas, consultar sindicatos, atualizar dados de dependentes, além de consumir tabelas e cadastros auxiliares fundamentais para a operação de departamento pessoal.

---

## Pré-requisito: autenticação

> [!WARNING]
> **Autenticação obrigatória.** Toda operação desta API exige um token JWT válido no header `Authorization: Bearer <token>`.
> O token é obtido na aba **"Autenticação"** deste mesmo portal, no endpoint `POST /api/v1/auth/credencial/login`.
> Sem isso, todas as chamadas abaixo retornam `401 Unauthorized`.

> [!TIP]
> Se você acabou de fazer login na aba **Autenticação**, o token já foi preenchido automaticamente aqui — confira o painel de autenticação no topo desta página antes de copiar o token manualmente.

---

## Perfis de Permissão

O nível de acesso e o escopo das operações de cada chamada são definidos pelo perfil do token gerado na autenticação:

- **Cliente/Empresa:** Ações realizadas pelo usuário responsável da empresa.
- **Administrador/Contabilidade:** Ações realizadas pelo administrador do sistema ou pelo escritório de contabilidade.

*(Para detalhes de geração dos respectivos tokens, consulte a aba **Autenticação**.)*

> [!CAUTION]
> **Exclusões não estão disponíveis via API.** Por questões de segurança e integridade das regras de negócio, nenhuma operação de exclusão está disponível através desta API, para nenhum perfil.
> Caso seja necessário remover algum dado, a ação deve ser feita diretamente pela interface web do sistema **RH Net Social**.

---

## Permissões por Recurso

Para facilitar a integração, os endpoints de consulta, cadastro e edição estão estruturados abaixo por domínio de dados. *(A descrição de cada grupo, na aba correspondente da sidebar, detalha isso também — ver observação no fim desta seção.)*

### 👥 Funcionários e Dependentes
Operações de admissão preliminar, completa e envio de documentos/dependentes associados.

| Endpoint | Consulta | Cadastro / Edição |
| :--- | :---: | :---: |
| `/api/v1/funcionario/preliminar` | Permitido | Permitido |
| `/api/v1/funcionario/completa` | Permitido | Permitido |
| `/api/v1/documento/funcionario/{tipo_documento}` | Permitido | Permitido |
| `/api/v1/arquivos/funcionario` | Permitido | Permitido |
| `/api/v1/dependente` | Permitido | Permitido |
| `/api/v1/dependente/documento` | Permitido | Permitido |

---

### 🚚 Autônomos
Gestão de trabalhadores autônomos e prestação de serviços.

| Endpoint | Consulta | Cadastro / Edição |
| :--- | :---: | :---: |
| `/api/v1/autonomo/autonomos` | Permitido | Permitido |
| `/api/v1/autonomo/servicos` | Permitido | Permitido |
| `/api/v1/autonomo/tiposervicos` | Permitido | Indisponível via API |

---

### ⏱️ Banco de Horas
Configurações de regras e lançamento de horas.

| Endpoint | Consulta | Cadastro / Edição |
| :--- | :---: | :---: |
| `/api/v1/bancohoras/configuracao` | Permitido | Indisponível via API |
| `/api/v1/bancoHoras/lancamento` | Permitido | Permitido |

---

### 📁 Tabelas e Cadastros Auxiliares
Consultas de tabelas base necessárias para preenchimento de cadastros principais.

> [!NOTE]
> Por serem tabelas de referência global do sistema, estes endpoints operam **exclusivamente em modo de leitura (GET)**.

| Endpoint | Consulta | Cadastro / Edição |
| :--- | :--- | :--- |
| `/api/v1/agencia` | Permitido | Indisponível via API |
| `/api/v1/bancos` | Permitido | Indisponível via API |
| `/api/v1/centrocustos` | Permitido | Indisponível via API |
| `/api/v1/departamentos` | Permitido | Indisponível via API |
| `/api/v1/feriados` | Permitido | Indisponível via API |
| `/api/v1/funcao` | Permitido | Indisponível via API |
| `/api/v1/quadrohorarios` | Permitido | Indisponível via API |
| `/api/v1/sindicato` | Permitido | Indisponível via API |
| `/api/v1/sindicato/estabilidade` | Permitido | Indisponível via API |

---

## Permissões de Liberação de Cadastros

Este conjunto de endpoints destina-se ao fluxo de aprovação e efetivação de registros enviados preliminarmente, permitindo a validação das informações antes do processamento final.

No momento atual, o fluxo de liberação está disponível via API para ambos os perfis nos endpoints listados a seguir:

| Grupo / Endpoint | Liberação |
| :--- | :---: |
| **🔑 FLUXOS DE LIBERAÇÃO** | |
| `/api/v1/liberacao/preliminar` | Permitido |
| `/api/v1/liberacao/completa` | Permitido |
| `/api/v1/liberacao/autonomo/servico` | Permitido |
| `/api/v1/liberacao/dependente` | Permitido |
