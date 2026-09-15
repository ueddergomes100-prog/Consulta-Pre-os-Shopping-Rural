# Promoções do catálogo

Os endpoints públicos `/api/catalog/products` e `/api/catalog/medicamentos`
consultam o banco Uniplus configurado em `ERP_DB_*`. Não consultam preços da
Nuvemshop nem importam o módulo de migrações do banco de integração.

## Origem e aplicação

- `promocao`: campanha habilitada, início, fim (ou contínua), dia da semana e
  horário. A consulta usa o fuso `America/Sao_Paulo`.
- `promocaoproduto`: vínculo por `idproduto`, com preço armazenado em
  `valorpromocao`. Não recalculamos descontos com base em um preço possivelmente
  diferente do que o ERP utilizou.
- `promocaofilial`: restringe as campanhas à filial do preço. A ausência de
  vínculos é tratada como campanha geral. Se o preço normal agrega mais de uma
  filial, a oferta pede conferência e não substitui o preço normal.
- `promocaoembalagem` + `embalagem`: ofertas apresentadas separadamente, com
  embalagem/fator, sem substituir o preço da unidade base.

O preço normal e o estoque mantêm as regras existentes (`MAX(preco)` de
`formacaoprecoproduto` e `SUM(quantidade)` de `saldoestoque`). Na base inspecionada,
os preços pertencem somente à filial 1.

`promotional_price` só recebe um preço positivo inferior ao normal quando a
campanha não tem restrições adicionais. `promotions` contém as ofertas vigentes
e suas condições, também usadas pelo filtro da tela. `promotion_source` é
`uniplus` quando existem ofertas.

Tabelas de preço específicas, clientes elegíveis, pagamento, quantidade,
limites, brindes e regras não interpretadas são sinalizados para conferência no
ERP. Campanhas concorrentes com preços distintos não são resolvidas por um
`MIN` arbitrário. A consulta atual cobre vínculos de produto e suas embalagens;
campanhas cadastradas exclusivamente por grupo, família, fornecedor ou kit
precisam de mapeamento próprio antes de serem aplicadas pelo catálogo.

## Atualização e falhas

Não há cache de promoções. Cada consulta lê o ERP; o frontend renova a consulta
a cada 60 segundos enquanto visível e ao retornar à página. Erros de consulta
retornam 503 e exibem o estado de erro, sem substituir os dados por promoções do
site nem manter preços antigos visíveis após uma falha.

## Validação

`node --test src/services/CatalogPromotionService.test.js`

Os testes usam fixtures isoladas em memória. A verificação no banco real é
somente de leitura, incluindo o produto 3439 (VETMAX PLUS) e campanhas expiradas.
