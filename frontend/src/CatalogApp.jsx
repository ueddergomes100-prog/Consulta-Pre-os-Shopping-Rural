import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  CheckCircle2,
  CircleOff,
  LoaderCircle,
  PackageOpen,
  Pill,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tags,
  X,
} from 'lucide-react';
import './CatalogApp.css';

const LOW_STOCK_LIMIT = 5;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const stockFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function getStockStatus(stockValue) {
  const stock = Number(stockValue || 0);

  if (stock <= 0) {
    return { key: 'out', label: 'Sem estoque', icon: CircleOff };
  }

  if (stock <= LOW_STOCK_LIMIT) {
    return { key: 'low', label: 'Estoque baixo', icon: AlertTriangle };
  }

  return { key: 'available', label: 'Disponível', icon: CheckCircle2 };
}

function getEffectivePrice(product) {
  const price = Number(product.preco || 0);
  const promotionalPrice = Number(product.promotional_price || 0);

  return promotionalPrice > 0 ? promotionalPrice : price;
}

function hasPromotion(product) {
  return Number(product.promotional_price || 0) > 0;
}

function Brand() {
  return (
    <div className="catalog-brand" aria-label="Produtos Shopping Rural">
      <img
        className="catalog-brand__logo"
        src="/shopping-rural.png"
        alt="Logo Shopping Rural"
        width="72"
        height="63"
      />
      <span className="catalog-brand__name">
        <strong>Produtos</strong>
        <span>Shopping Rural</span>
      </span>
    </div>
  );
}

function EmptyState({ type, query, onRetry }) {
  const config = {
    idle: {
      icon: Search,
      title: 'Encontre um produto',
      text: 'Digite o código ou o nome para consultar preço e estoque.',
    },
    empty: {
      icon: PackageOpen,
      title: 'Nenhum produto encontrado',
      text: `Não encontramos resultados para “${query}”. Confira a busca e tente novamente.`,
    },
    error: {
      icon: AlertTriangle,
      title: 'Não foi possível carregar os produtos',
      text: 'Verifique a conexão e tente novamente em alguns instantes.',
    },
  }[type];
  const Icon = config.icon;

  return (
    <section className={`catalog-empty catalog-empty--${type}`} aria-live="polite">
      <span className="catalog-empty__icon" aria-hidden="true">
        <Icon size={28} />
      </span>
      <h2>{config.title}</h2>
      <p>{config.text}</p>
      {type === 'error' && (
        <button className="catalog-button catalog-button--primary" type="button" onClick={onRetry}>
          <RefreshCw size={17} />
          Tentar novamente
        </button>
      )}
    </section>
  );
}

function ProductTableRow({ product }) {
  const status = getStockStatus(product.estoque);
  const StatusIcon = status.icon;
  const description = product.descricao?.trim();
  const group = product.grupo_categoria?.trim();
  const subgroup = product.subgrupo_categoria?.trim() || product.nome_categoria?.trim();

  return (
    <tr className="catalog-product-row">
      <td data-label="Código">
        <span className="catalog-code">{product.codigo}</span>
      </td>
      <td data-label="Produto" className="catalog-product-main">
        <strong>{product.nome}</strong>
        {(group || subgroup) && (
          <span className="catalog-group">
            {group || 'Sem grupo'}
            {subgroup && subgroup !== group ? <small>{subgroup}</small> : null}
          </span>
        )}
        <span className={description ? '' : 'catalog-description--empty'}>
          {description || 'Sem descrição cadastrada'}
        </span>
      </td>
      <td data-label="Preço">
        <span className="catalog-price">
          {hasPromotion(product) && (
            <small>{currencyFormatter.format(Number(product.preco || 0))}</small>
          )}
          <strong>{currencyFormatter.format(getEffectivePrice(product))}</strong>
          {hasPromotion(product) && <em>Promoção do site</em>}
        </span>
      </td>
      <td data-label="Estoque" className="catalog-stock-cell">
        <span className={`catalog-stock catalog-stock--${status.key}`}>
          <StatusIcon size={15} />
          <span>
            <strong>{stockFormatter.format(Number(product.estoque || 0))} un.</strong>
            <small>{status.label}</small>
          </span>
        </span>
      </td>
    </tr>
  );
}

function ProductCard({ product }) {
  const status = getStockStatus(product.estoque);
  const StatusIcon = status.icon;
  const description = product.descricao?.trim();
  const group = product.grupo_categoria?.trim();
  const subgroup = product.subgrupo_categoria?.trim() || product.nome_categoria?.trim();

  return (
    <article className="catalog-product-card">
      <div className="catalog-product-card__top">
        <span className="catalog-code">Cód. {product.codigo}</span>
        <span className={`catalog-stock catalog-stock--${status.key}`}>
          <StatusIcon size={14} />
          {status.label}
        </span>
      </div>
      <h2>{product.nome}</h2>
      {(group || subgroup) && (
        <span className="catalog-group">
          {group || 'Sem grupo'}
          {subgroup && subgroup !== group ? <small>{subgroup}</small> : null}
        </span>
      )}
      <p className={description ? '' : 'catalog-description--empty'}>
        {description || 'Sem descrição cadastrada'}
      </p>
      <div className="catalog-product-card__bottom">
        <span className="catalog-price">
          {hasPromotion(product) && (
            <small>{currencyFormatter.format(Number(product.preco || 0))}</small>
          )}
          <strong>{currencyFormatter.format(getEffectivePrice(product))}</strong>
          {hasPromotion(product) && <em>Promoção do site</em>}
        </span>
        <span className="catalog-product-card__quantity">
          <small>Estoque</small>
          <strong>{stockFormatter.format(Number(product.estoque || 0))} un.</strong>
        </span>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="catalog-loading" aria-live="polite" aria-label="Carregando produtos">
      <LoaderCircle size={25} className="catalog-spin" />
      <span>Consultando produtos...</span>
    </div>
  );
}

export default function CatalogApp() {
  const isMedicineCatalog = window.location.pathname === '/catalogo/medicamentos';
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [popularCount, setPopularCount] = useState(0);
  const [sortBy, setSortBy] = useState('name');
  const [stockFilter, setStockFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [subgroupFilter, setSubgroupFilter] = useState('all');
  const [promoOnly, setPromoOnly] = useState(false);
  const [status, setStatus] = useState('loading');
  const [retryToken, setRetryToken] = useState(0);
  const inputRef = useRef(null);
  const lastRecordedSearchRef = useRef(null);

  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery === debouncedQuery) return undefined;

    const timer = window.setTimeout(() => {
      setStatus('loading');
      setDebouncedQuery(nextQuery);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    const controller = new AbortController();

    axios.get(isMedicineCatalog ? '/api/catalog/medicamentos' : '/api/catalog/products', {
      params: { search: debouncedQuery },
      signal: controller.signal,
    }).then(({ data }) => {
      const productData = Array.isArray(data.data) ? data.data : [];
      setProducts(productData);
      setTotal(Number(data.total || 0));
      setPopularCount(Number(data.popularCount || 0));
      setStatus(data.data?.length ? 'success' : 'empty');

      const normalizedQuery = debouncedQuery
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const exactCodeMatch = productData.find((product) =>
        String(product.codigo || '').toLowerCase() === normalizedQuery
      );
      const viewedProduct = Number(data.total) === 1 ? productData[0] : exactCodeMatch;
      const recordKey = viewedProduct ? `${normalizedQuery}:${viewedProduct.codigo}` : null;

      if (debouncedQuery && viewedProduct && lastRecordedSearchRef.current !== recordKey) {
        lastRecordedSearchRef.current = recordKey;
        axios.post(`/api/catalog/products/${encodeURIComponent(viewedProduct.codigo)}/view`).catch(() => {});
      } else if (!viewedProduct) {
        lastRecordedSearchRef.current = null;
      }
    }).catch((error) => {
      if (error.code !== 'ERR_CANCELED') {
        setProducts([]);
        setTotal(0);
        setPopularCount(0);
        setStatus('error');
      }
    });

    return () => controller.abort();
  }, [debouncedQuery, retryToken, isMedicineCatalog]);

  const clearSearch = () => {
    setStatus('loading');
    setQuery('');
    setDebouncedQuery('');
    inputRef.current?.focus();
  };

  const retrySearch = () => {
    setStatus('loading');
    setRetryToken((value) => value + 1);
  };

  const resetFilters = () => {
    setGroupFilter('all');
    setSubgroupFilter('all');
    setStockFilter('all');
    setPromoOnly(false);
    setSortBy('name');
  };
  const hasFilters = groupFilter !== 'all' || subgroupFilter !== 'all' || stockFilter !== 'all' || promoOnly;

  const visibleProducts = useMemo(() => {
    const nextProducts = isMedicineCatalog ? products.filter((product) => {
      const stock = Number(product.estoque || 0);
      const productGroup = product.grupo_categoria?.trim() || 'Sem grupo';
      const productSubgroup = product.subgrupo_categoria?.trim() || product.nome_categoria?.trim() || 'Sem subgrupo';
      const matchesStock = stockFilter === 'all'
        || (stockFilter === 'available' && stock > LOW_STOCK_LIMIT)
        || (stockFilter === 'low' && stock > 0 && stock <= LOW_STOCK_LIMIT)
        || (stockFilter === 'out' && stock <= 0);
      const matchesPromotion = !promoOnly || hasPromotion(product);
      const matchesGroup = groupFilter === 'all' || productGroup === groupFilter;
      const matchesSubgroup = subgroupFilter === 'all' || productSubgroup === subgroupFilter;

      return matchesStock && matchesPromotion && matchesGroup && matchesSubgroup;
    }) : [...products];

    if (!isMedicineCatalog) {
      return nextProducts;
    }

    return nextProducts.sort((firstProduct, secondProduct) => {
      const firstPrice = getEffectivePrice(firstProduct);
      const secondPrice = getEffectivePrice(secondProduct);
      const firstStock = Number(firstProduct.estoque || 0);
      const secondStock = Number(secondProduct.estoque || 0);

      if (sortBy === 'price-asc') return firstPrice - secondPrice;
      if (sortBy === 'price-desc') return secondPrice - firstPrice;
      if (sortBy === 'stock-asc') return firstStock - secondStock;
      if (sortBy === 'stock-desc') return secondStock - firstStock;

      return String(firstProduct.nome || '').localeCompare(String(secondProduct.nome || ''), 'pt-BR');
    });
  }, [groupFilter, isMedicineCatalog, products, promoOnly, sortBy, stockFilter, subgroupFilter]);

  const groupOptions = useMemo(() => {
    const groups = new Set(products.map((product) => product.grupo_categoria?.trim() || 'Sem grupo'));
    return [...groups].sort((firstGroup, secondGroup) => firstGroup.localeCompare(secondGroup, 'pt-BR'));
  }, [products]);

  const subgroupOptions = useMemo(() => {
    const subgroups = products
      .filter((product) => {
        const productGroup = product.grupo_categoria?.trim() || 'Sem grupo';
        return groupFilter === 'all' || productGroup === groupFilter;
      })
      .map((product) => product.subgrupo_categoria?.trim() || product.nome_categoria?.trim() || 'Sem subgrupo');

    return [...new Set(subgroups)].sort((firstSubgroup, secondSubgroup) =>
      firstSubgroup.localeCompare(secondSubgroup, 'pt-BR')
    );
  }, [groupFilter, products]);

  const medicineStats = useMemo(() => {
    const availableCount = products.filter((product) => Number(product.estoque || 0) > 0).length;
    const promotionCount = products.filter(hasPromotion).length;

    return {
      total: products.length,
      availableCount,
      promotionCount,
      groupCount: groupOptions.length
    };
  }, [groupOptions.length, products]);

  return (
    <div className={`catalog-shell ${isMedicineCatalog ? 'catalog-shell--erp' : ''}`}>
      <header className="catalog-header">
        <div className="catalog-container catalog-header__inner">
          <Brand />
          <nav className="catalog-nav" aria-label="Catálogos">
            <a href="/catalogo" aria-current={!isMedicineCatalog ? 'page' : undefined}>Todos os produtos</a>
            <a href="/catalogo/medicamentos" aria-current={isMedicineCatalog ? 'page' : undefined}><Pill size={16} /> Medicamentos</a>
          </nav>
        </div>
      </header>

      <main className="catalog-container catalog-main">
        <section className="catalog-intro" aria-labelledby="catalog-title">
          <p className="catalog-eyebrow">Shopping Rural / Consulta de produtos</p>
          <h1 id="catalog-title">
            {isMedicineCatalog ? 'Medicamentos' : 'Consulte preço e estoque em segundos.'}
          </h1>
          <p>
            {isMedicineCatalog
              ? 'Encontre o produto certo. Compare preços e confira a disponibilidade.'
              : 'Veja os produtos mais pesquisados ou procure pelo código e nome.'}
          </p>
        </section>

        <section className="catalog-search" aria-label="Pesquisa de produtos">
          <label htmlFor="catalog-query">Qual produto você procura?</label>
          <div className="catalog-search__field">
            <Search size={23} aria-hidden="true" />
            <input
              ref={inputRef}
              id="catalog-query"
              type="search"
              autoComplete="off"
              placeholder={isMedicineCatalog ? 'Busque por código, nome ou combine termos com +' : 'Digite o início do nome ou use: ração+gourmet+20kg'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby="catalog-search-hint"
            />
            {query && (
              <button type="button" onClick={clearSearch} aria-label="Limpar pesquisa" title="Limpar pesquisa">
                <X size={20} />
              </button>
            )}
          </div>
          <span id="catalog-search-hint">Digite o início do nome ou código. Use + entre termos para exigir todos no nome.</span>
        </section>

        {isMedicineCatalog && (
          <section className="catalog-medicine-summary" aria-label="Resumo de medicamentos">
            <div>
              <PackageOpen size={20} aria-hidden="true" />
              <strong>{status === 'success' ? medicineStats.total.toLocaleString('pt-BR') : '—'}</strong>
              <span>Itens encontrados</span>
            </div>
            <div>
              <CheckCircle2 size={20} aria-hidden="true" />
              <strong>{status === 'success' ? medicineStats.availableCount.toLocaleString('pt-BR') : '—'}</strong>
              <span>Com estoque</span>
            </div>
            <div>
              <Tags size={20} aria-hidden="true" />
              <strong>{status === 'success' ? medicineStats.promotionCount.toLocaleString('pt-BR') : '—'}</strong>
              <span>Promoções do site</span>
            </div>
            <div>
              <Boxes size={20} aria-hidden="true" />
              <strong>{status === 'success' ? medicineStats.groupCount.toLocaleString('pt-BR') : '—'}</strong>
              <span>Grupos</span>
            </div>
          </section>
        )}

        {isMedicineCatalog && (
          <section className="catalog-toolbar" aria-label="Filtros de medicamentos">
            <div className="catalog-toolbar__heading">
              <strong><SlidersHorizontal size={17} /> Refine sua consulta</strong>
              <button className="catalog-reset" type="button" onClick={resetFilters} disabled={!hasFilters && sortBy === 'name'}><X size={14} /> Limpar filtros</button>
            </div>
            <div className="catalog-toolbar__group catalog-toolbar__group--wide">
              <span>
                <Boxes size={16} />
                Grupo
              </span>
              <select
                aria-label="Grupo"
                value={groupFilter}
                onChange={(event) => {
                  setGroupFilter(event.target.value);
                  setSubgroupFilter('all');
                }}
              >
                <option value="all">Todos</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>

            <div className="catalog-toolbar__group catalog-toolbar__group--wide">
              <span>
                <Boxes size={16} />
                Subgrupo
              </span>
              <select aria-label="Subgrupo" value={subgroupFilter} onChange={(event) => setSubgroupFilter(event.target.value)}>
                <option value="all">Todos</option>
                {subgroupOptions.map((subgroup) => (
                  <option key={subgroup} value={subgroup}>{subgroup}</option>
                ))}
              </select>
            </div>

            <div className="catalog-toolbar__group">
              <span>
                <ArrowDownUp size={16} />
                Ordenar
              </span>
              <select aria-label="Ordenar" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="name">Nome A-Z</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
                <option value="stock-desc">Maior estoque</option>
                <option value="stock-asc">Menor estoque</option>
              </select>
            </div>

            <div className="catalog-toolbar__group">
              <span>
                <SlidersHorizontal size={16} />
                Estoque
              </span>
              <select aria-label="Estoque" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
                <option value="all">Todos</option>
                <option value="available">Acima de 5 unidades</option>
                <option value="low">Estoque baixo</option>
                <option value="out">Sem estoque</option>
              </select>
            </div>

            <label className="catalog-promo-filter">
              <input
                type="checkbox"
                checked={promoOnly}
                onChange={(event) => setPromoOnly(event.target.checked)}
              />
              <Tags size={16} />
              Promoções do site
            </label>
            <p className="catalog-promo-note">Ofertas cadastradas na integração com a loja online. Podem diferir das promoções do Uniplus.</p>
          </section>
        )}

        {status === 'success' && (
          <section className="catalog-results" aria-busy="false">
            <div className="catalog-results__heading">
              <div>
                <h2>
                  {isMedicineCatalog
                    ? 'Produtos encontrados'
                    : (debouncedQuery ? 'Resultados' : '20 produtos mais pesquisados')}
                </h2>
                <p aria-live="polite">
                  {isMedicineCatalog
                    ? (debouncedQuery
                        ? `Mostrando ${visibleProducts.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} medicamentos encontrados`
                        : `${visibleProducts.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} medicamentos na tela`)
                    : debouncedQuery
                    ? (total === 1
                        ? '1 produto encontrado'
                        : `Mostrando até 20 de ${total.toLocaleString('pt-BR')} produtos encontrados`)
                    : (popularCount
                        ? 'Ranking baseado nas consultas dos vendedores'
                        : 'Ranking em formação · as consultas atualizarão esta lista')}
                </p>
              </div>
              <div className="catalog-legend" aria-label="Legenda de estoque">
                <span><i className="is-available" />Disponível</span>
                <span><i className="is-low" />Baixo</span>
                <span><i className="is-out" />Sem estoque</span>
              </div>
            </div>

            {visibleProducts.length ? (
              <>
                <div className="catalog-table-wrap">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Produto e descrição</th>
                        <th scope="col">Preço</th>
                        <th scope="col">Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => <ProductTableRow key={product.codigo} product={product} />)}
                    </tbody>
                  </table>
                </div>

                <div className="catalog-mobile-list">
                  {visibleProducts.map((product) => <ProductCard key={product.codigo} product={product} />)}
                </div>
              </>
            ) : (
              <section className="catalog-empty catalog-empty--filters" aria-live="polite">
                <span className="catalog-empty__icon" aria-hidden="true">
                  <PackageOpen size={28} />
                </span>
                <h2>Nenhum medicamento nesse filtro</h2>
                <p>Ajuste grupo, subgrupo, estoque ou promoção para ampliar a consulta.</p>
                <button type="button" className="catalog-button" onClick={resetFilters}>Limpar filtros</button>
              </section>
            )}

          </section>
        )}

        {status === 'loading' && <LoadingState />}
        {status === 'empty' && <EmptyState type="empty" query={debouncedQuery} />}
        {status === 'error' && <EmptyState type="error" onRetry={retrySearch} />}
      </main>

      <footer className="catalog-footer">
        <div className="catalog-container">
          <Brand />
          <p>Informações atualizadas diretamente pelo sistema da loja.</p>
        </div>
      </footer>
    </div>
  );
}
