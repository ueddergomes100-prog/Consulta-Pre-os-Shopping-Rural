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
terminal. O catálogo usa `GET /api/catalog/products`, limita cada consulta a 20
itens e nunca acessa o banco diretamente pelo navegador.

A tela inicial mostra os 20 produtos mais consultados. Buscas que identificam
um único produto alimentam um ranking local em `data/catalog-popularity.json`.
Esse arquivo não é versionado e o banco do Uniplus continua somente leitura.

### Acesso publico ao catalogo

Para publicar somente o catalogo, gere o frontend e suba o servidor publico:

```bash
npm run build:frontend
npm run start:catalog-public
```

Esse processo serve `http://localhost:3010/catalogo` e expõe apenas:

- `GET /api/catalog/products`
- `POST /api/catalog/products/:codigo/view`

As rotas administrativas da integracao e credenciais continuam fora da
superficie publica. Para acesso de fora da loja, a recomendacao e apontar um
Cloudflare Tunnel para `http://localhost:3010`, sem abrir portas no roteador.

## Estrutura do Projeto
- `src/server.js`: Ponto de entrada da API.
- `src/catalog-public-server.js`: Servidor publico restrito ao catalogo.
- `src/database/uniplus.js`: Conexão somente leitura com o ERP.
- `src/controllers/ProductController.js`: Lógica de consulta de produtos.
