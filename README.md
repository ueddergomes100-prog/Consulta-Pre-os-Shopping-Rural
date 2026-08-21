# Integração UNIPLUS <-> NuvemShop

API de integração para sincronização de estoque, preço e produtos.

## Como rodar o projeto

1. **Configuração**:
   Edite o arquivo `.env` na raiz do projeto com as credenciais do seu banco de dados PostgreSQL local.

2. **Instalação**:
   ```bash
   npm install
   ```

3. **Execução**:
   ```bash
   npm run dev
   ```

4. **Teste da Etapa 1**:
   Acesse no navegador: `http://localhost:3000/api/erp/products` para listar os produtos do ERP.

## Catálogo para vendedores

Com a API e o frontend em execução, acesse `http://localhost:5174/catalogo`.
Se a porta 5174 já estiver ocupada, o Vite informará a próxima porta livre no
terminal. O catálogo usa somente o endpoint paginado de leitura
`GET /api/catalog/products` e nunca acessa o banco diretamente pelo navegador.

## Estrutura do Projeto
- `src/server.js`: Ponto de entrada da API.
- `src/database/uniplus.js`: Conexão somente leitura com o ERP.
- `src/controllers/ProductController.js`: Lógica de consulta de produtos.
