import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleOff,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import './CatalogApp.css';

const PAGE_SIZE = 20;
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

  return (
    <tr className="catalog-product-row">
      <td data-label="Código">
        <span className="catalog-code">{product.codigo}</span>
      </td>
      <td data-label="Produto" className="catalog-product-main">
        <strong>{product.nome}</strong>
        <span className={description ? '' : 'catalog-description--empty'}>
          {description || 'Sem descrição cadastrada'}
        </span>
      </td>
      <td data-label="Preço" className="catalog-price">
        {currencyFormatter.format(Number(product.preco || 0))}
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
      <p className={description ? '' : 'catalog-description--empty'}>
        {description || 'Sem descrição cadastrada'}
      </p>
      <div className="catalog-product-card__bottom">
        <span className="catalog-price">{currencyFormatter.format(Number(product.preco || 0))}</span>
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

function Pagination({ page, totalPages, onChange }) {
  const pages = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav className="catalog-pagination" aria-label="Paginação dos resultados">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Página anterior"
      >
        <ArrowLeft size={17} />
        <span>Anterior</span>
      </button>
      <div className="catalog-pagination__pages">
        {pages.map((pageNumber) => (
          <button
            type="button"
            key={pageNumber}
            onClick={() => onChange(pageNumber)}
            className={pageNumber === page ? 'is-active' : ''}
            aria-label={`Página ${pageNumber}`}
            aria-current={pageNumber === page ? 'page' : undefined}
          >
            {pageNumber}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Próxima página"
      >
        <span>Próxima</span>
        <ArrowRight size={17} />
      </button>
    </nav>
  );
}

export default function CatalogApp() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('loading');
  const [retryToken, setRetryToken] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery === debouncedQuery) return undefined;

    const timer = window.setTimeout(() => {
      setStatus('loading');
      setDebouncedQuery(nextQuery);
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    const controller = new AbortController();

    axios.get('/api/catalog/products', {
      params: { search: debouncedQuery, page, pageSize: PAGE_SIZE },
      signal: controller.signal,
    }).then(({ data }) => {
      setProducts(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.totalPages || 0));
      setStatus(data.data?.length ? 'success' : 'empty');
    }).catch((error) => {
      if (error.code !== 'ERR_CANCELED') {
        setProducts([]);
        setTotal(0);
        setTotalPages(0);
        setStatus('error');
      }
    });

    return () => controller.abort();
  }, [debouncedQuery, page, retryToken]);

  const clearSearch = () => {
    setStatus('loading');
    setQuery('');
    setDebouncedQuery('');
    setPage(1);
    inputRef.current?.focus();
  };

  const changePage = (nextPage) => {
    setStatus('loading');
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const retrySearch = () => {
    setStatus('loading');
    setRetryToken((value) => value + 1);
  };

  return (
    <div className="catalog-shell">
      <header className="catalog-header">
        <div className="catalog-container catalog-header__inner">
          <Brand />
          <span className="catalog-header__tag">Consulta rápida</span>
        </div>
      </header>

      <main className="catalog-container catalog-main">
        <section className="catalog-intro" aria-labelledby="catalog-title">
          <p className="catalog-eyebrow">Catálogo de produtos</p>
          <h1 id="catalog-title">Consulte preço e estoque em segundos.</h1>
          <p>Veja a lista alfabética ou pesquise pelo código e nome do produto.</p>
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
              placeholder="Digite o início do nome ou use: ração+gourmet+20kg"
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

        {status === 'success' && (
          <section className="catalog-results" aria-busy="false">
            <div className="catalog-results__heading">
              <div>
                <h2>{debouncedQuery ? 'Resultados' : 'Produtos em ordem alfabética'}</h2>
                <p aria-live="polite">
                  {debouncedQuery
                    ? (total === 1 ? '1 produto encontrado' : `${total.toLocaleString('pt-BR')} produtos encontrados`)
                    : `${total.toLocaleString('pt-BR')} produtos cadastrados · 20 por página`}
                </p>
              </div>
              <div className="catalog-legend" aria-label="Legenda de estoque">
                <span><i className="is-available" />Disponível</span>
                <span><i className="is-low" />Baixo</span>
                <span><i className="is-out" />Sem estoque</span>
              </div>
            </div>

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
                  {products.map((product) => <ProductTableRow key={product.codigo} product={product} />)}
                </tbody>
              </table>
            </div>

            <div className="catalog-mobile-list">
              {products.map((product) => <ProductCard key={product.codigo} product={product} />)}
            </div>

            <div className="catalog-results__footer">
              <p>Página {page} de {totalPages}</p>
              <Pagination page={page} totalPages={totalPages} onChange={changePage} />
            </div>
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
