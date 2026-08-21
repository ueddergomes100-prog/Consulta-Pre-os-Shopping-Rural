import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { 
  Search, 
  RefreshCw, 
  Package, 
  CheckCircle, 
  AlertCircle, 
  Filter,
  UploadCloud,
  ChevronRight,
  Loader2,
  XCircle,
  X,
  ImagePlus,
  Clipboard,
  ShieldCheck
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';
const API_ORIGIN = API_BASE.replace('/api', '');

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erro fatal no painel:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#F4F7FE] flex items-center justify-center p-8 font-sans text-slate-700">
          <div className="max-w-xl w-full bg-white border border-rose-100 rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-rose-50 p-3 rounded-xl">
                <AlertCircle className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800">O painel encontrou um erro</h1>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Atualize a pagina para tentar novamente</p>
              </div>
            </div>
            <pre className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-rose-600 overflow-auto whitespace-pre-wrap">
              {this.state.error.message || String(this.state.error)}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all"
            >
              Atualizar painel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const resizingColumnRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState([115, 280, 260, 220, 155, 85, 115, 145, 145, 110, 95]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ total: 0, marked: 0, synced: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [savingNuvemShopPriceIds, setSavingNuvemShopPriceIds] = useState(new Set());
  const [savingPromotionIds, setSavingPromotionIds] = useState(new Set());
  const [savingDescriptionIds, setSavingDescriptionIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [skuSearchTerm, setSkuSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [notification, setNotification] = useState(null);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [uploadingImageIds, setUploadingImageIds] = useState(new Set());
  const [previewProduct, setPreviewProduct] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodResult, statsResult] = await Promise.allSettled([
        axios.get(`${API_BASE}/erp/products`),
        axios.get(`${API_BASE}/integration/stats`)
      ]);

      if (prodResult.status === 'rejected') {
        throw prodResult.reason;
      }

      const prodRes = prodResult.value;
      const statsRes = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const productData = Array.isArray(prodRes.data.data) ? prodRes.data.data : [];
      
      setProducts(productData);
      if (statsRes) {
        setStats({
          total: Number(statsRes.data.total || 0),
          marked: Number(statsRes.data.marked || 0),
          synced: Number(statsRes.data.synced || 0),
          errors: Number(statsRes.data.errors || 0)
        });
      } else {
        showToast('Produtos carregados, mas as estatisticas nao responderam', 'error');
      }
      
      const uniqueCats = [...new Set(productData.map(p => p.nome_categoria))].filter(Boolean);
      setCategories(uniqueCats);
    } catch (error) {
      showToast(error.response?.data?.error || "Erro ao carregar dados do servidor", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const buildProductPayload = (product) => ({
    uniplus_product_id: product.id_produto,
    sku: product.sku,
    nome: product.nome_produto,
    preco: product.preco,
    estoque: product.estoque,
    categoria: product.nome_categoria
  });

  const formatMoneyInput = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const number = parseFloat(value);
    if (!Number.isFinite(number)) return '';
    return number.toFixed(2).replace('.', ',');
  };

  const parseMoneyInput = (value) => {
    const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
    if (!normalized) return null;
    const number = parseFloat(normalized);
    return Number.isFinite(number) ? number : NaN;
  };

  const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const getImageSrc = (product, slot = 1) => {
    const publicUrl = slot === 2 ? product.image2_public_url : product.image_public_url;
    const updatedAt = slot === 2 ? product.image2_enriched_at : product.enriched_at;
    if (!publicUrl) return '';
    const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : '';
    return `${API_ORIGIN}${publicUrl}${version}`;
  };

  const getClipboardImage = (clipboardData) => {
    const items = Array.from(clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    return imageItem?.getAsFile() || null;
  };

  const handlePasteImage = async (product, event, slot = 1) => {
    event.preventDefault();
    event.stopPropagation();

    const file = getClipboardImage(event.clipboardData);
    if (!file) {
      showToast('Copie uma imagem primeiro e cole aqui com Ctrl+V', 'error');
      return;
    }

    if (uploadingImageIds.has(product.id_produto)) return;

    setUploadingImageIds(prev => new Set(prev).add(product.id_produto));
    setProducts(prev => prev.map(p =>
      p.id_produto === product.id_produto
        ? { ...p, enrichment_status: 'preparing', enrichment_error: null }
        : p
    ));

    try {
      const response = await axios.post(`${API_BASE}/integration/image`, file, {
        params: {
          ...buildProductPayload(product),
          slot
        },
        headers: { 'Content-Type': file.type || 'image/png' }
      });
      const prepared = response.data.data;

      setProducts(prev => prev.map(p =>
        p.id_produto === product.id_produto
          ? {
              ...p,
              generated_description: prepared.generated_description,
              image_source_url: prepared.image_source_url,
              image_public_url: prepared.image_public_url,
              image2_source_url: prepared.image2_source_url,
              image2_public_url: prepared.image2_public_url,
              image2_enriched_at: prepared.image2_enriched_at,
              enrichment_status: prepared.enrichment_status,
              enrichment_error: prepared.enrichment_error,
              enriched_at: prepared.enriched_at
            }
          : p
      ));

      showToast(`${slot === 2 ? 'Segunda imagem' : 'Imagem'} colada, fundo tratado e foto salva em 1280x1280!`);
    } catch (error) {
      const message = error.response?.data?.details || error.response?.data?.error || 'Falha ao processar imagem colada';
      setProducts(prev => prev.map(p =>
        p.id_produto === product.id_produto
          ? { ...p, enrichment_status: 'error', enrichment_error: message }
          : p
      ));
      showToast(message, 'error');
    } finally {
      setUploadingImageIds(prev => {
        const next = new Set(prev);
        next.delete(product.id_produto);
        return next;
      });
    }
  };

  const handleToggleSync = async (product) => {
    try {
      const newState = !product.is_marked;

      // Update local UI immediately for snappiness
      setProducts(prev => prev.map(p => 
        p.id_produto === product.id_produto 
          ? { 
              ...p, 
              is_marked: newState, 
              is_synced: newState ? p.is_synced : false,
              sync_status: newState ? p.sync_status : 'not_synced',
              error_message: newState ? p.error_message : null
            } 
          : p
      ));

      await axios.post(`${API_BASE}/integration/toggle`, {
        ...buildProductPayload(product),
        send_to_site: newState
      });
      
      // Refresh stats in background
      const statsRes = await axios.get(`${API_BASE}/integration/stats`);
      setStats(statsRes.data);
      
      showToast(newState ? "Produto marcado para envio!" : "Produto removido da fila");
    } catch (error) {
      showToast(error.response?.data?.error || "Falha ao salvar marcacao", "error");
      fetchData(); // Rollback on error
    }
  };

  const handleRunSync = async () => {
    setSyncing(true);
    try {
      const response = await axios.post(`${API_BASE}/integration/sync`);
      const { success, errors } = response.data.results;
      
      if (errors > 0) {
        showToast(`Sincronia finalizada: ${success} ok, ${errors} erros`, "error");
      } else {
        showToast(`Sucesso! ${success} produtos atualizados no site`);
      }
      fetchData();
    } catch (error) {
      showToast(error.response?.data?.error || "Erro critico no processo de sincronizacao", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePromotionSave = async (product, rawValue) => {
    const promotionalPrice = parseMoneyInput(rawValue);
    const normalPrice = product.nuvemshop_price === null || product.nuvemshop_price === undefined
      ? parseFloat(product.preco || 0)
      : parseFloat(product.nuvemshop_price);
    const currentPromotion = product.promotional_price === null || product.promotional_price === undefined
      ? null
      : parseFloat(product.promotional_price);

    if (Number.isNaN(promotionalPrice)) {
      showToast('Preco promocional invalido', 'error');
      fetchData();
      return;
    }

    if (promotionalPrice !== null && promotionalPrice >= normalPrice) {
      showToast('Promocional precisa ser menor que o preco normal', 'error');
      fetchData();
      return;
    }

    if ((promotionalPrice || null) === (currentPromotion || null)) return;

    setSavingPromotionIds(prev => new Set(prev).add(product.id_produto));
    setProducts(prev => prev.map(p =>
      p.id_produto === product.id_produto
        ? { ...p, promotional_price: promotionalPrice, sync_status: p.is_marked ? 'pending' : p.sync_status }
        : p
    ));

    try {
      await axios.post(`${API_BASE}/integration/promotional-price`, {
        ...buildProductPayload(product),
        promotional_price: promotionalPrice
      });
      showToast(promotionalPrice ? 'Preco promocional salvo' : 'Preco promocional removido');
    } catch (error) {
      showToast(error.response?.data?.error || 'Falha ao salvar promocional', 'error');
      fetchData();
    } finally {
      setSavingPromotionIds(prev => {
        const next = new Set(prev);
        next.delete(product.id_produto);
        return next;
      });
    }
  };

  const handleNuvemShopPriceSave = async (product, rawValue) => {
    const nuvemShopPrice = parseMoneyInput(rawValue);
    const currentPrice = product.nuvemshop_price === null || product.nuvemshop_price === undefined
      ? null
      : parseFloat(product.nuvemshop_price);
    const promotionalPrice = product.promotional_price === null || product.promotional_price === undefined
      ? null
      : parseFloat(product.promotional_price);
    const effectivePrice = nuvemShopPrice ?? parseFloat(product.preco || 0);

    if (Number.isNaN(nuvemShopPrice)) {
      showToast('Preco NuvemShop invalido', 'error');
      fetchData();
      return;
    }

    if (nuvemShopPrice !== null && nuvemShopPrice <= 0) {
      showToast('Preco NuvemShop precisa ser maior que zero', 'error');
      fetchData();
      return;
    }

    if (promotionalPrice !== null && promotionalPrice >= effectivePrice) {
      showToast('Preco NuvemShop precisa ser maior que o promocional atual', 'error');
      fetchData();
      return;
    }

    if ((nuvemShopPrice || null) === (currentPrice || null)) return;

    setSavingNuvemShopPriceIds(prev => new Set(prev).add(product.id_produto));
    setProducts(prev => prev.map(p =>
      p.id_produto === product.id_produto
        ? { ...p, nuvemshop_price: nuvemShopPrice, sync_status: p.is_marked ? 'pending' : p.sync_status }
        : p
    ));

    try {
      await axios.post(`${API_BASE}/integration/nuvemshop-price`, {
        ...buildProductPayload(product),
        nuvemshop_price: nuvemShopPrice
      });
      showToast(nuvemShopPrice ? 'Preco NuvemShop salvo' : 'Preco NuvemShop removido');
    } catch (error) {
      showToast(error.response?.data?.error || 'Falha ao salvar preco NuvemShop', 'error');
      fetchData();
    } finally {
      setSavingNuvemShopPriceIds(prev => {
        const next = new Set(prev);
        next.delete(product.id_produto);
        return next;
      });
    }
  };

  const handleNuvemShopDescriptionSave = async (product, rawValue) => {
    const manualDescription = String(rawValue || '').trim();
    const currentDescription = String(product.nuvemshop_description || '').trim();

    if (manualDescription === currentDescription) return;

    setSavingDescriptionIds(prev => new Set(prev).add(product.id_produto));
    setProducts(prev => prev.map(p =>
      p.id_produto === product.id_produto
        ? {
            ...p,
            nuvemshop_description: manualDescription || null,
            sync_status: p.is_marked ? 'pending' : p.sync_status
          }
        : p
    ));

    try {
      await axios.post(`${API_BASE}/integration/nuvemshop-description`, {
        ...buildProductPayload(product),
        nuvemshop_description: manualDescription
      });
      showToast(manualDescription ? 'Descricao NuvemShop salva' : 'Descricao NuvemShop removida');
    } catch (error) {
      showToast(error.response?.data?.error || 'Falha ao salvar descricao NuvemShop', 'error');
      fetchData();
    } finally {
      setSavingDescriptionIds(prev => {
        const next = new Set(prev);
        next.delete(product.id_produto);
        return next;
      });
    }
  };

  const startColumnResize = (index, event) => {
    event.preventDefault();
    event.stopPropagation();

    resizingColumnRef.current = {
      index,
      startX: event.clientX,
      startWidth: columnWidths[index]
    };
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const response = await axios.post(`${API_BASE}/integration/reconcile`);
      const { checked, linked, deletedOnSite, removedFromSite, pendingCreate, synced, errors } = response.data.results;

      if (errors > 0) {
        showToast(`Validacao finalizada com ${errors} erro(s). Conferidos: ${checked}`, 'error');
      } else {
        showToast(`Validado: ${linked} vinculados, ${deletedOnSite} apagados la, ${removedFromSite} removidos daqui, ${pendingCreate} pendentes, ${synced} atualizados`);
      }

      fetchData();
    } catch (error) {
      showToast(error.response?.data?.error || 'Erro ao validar NuvemShop', 'error');
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    const handleMouseMove = (event) => {
      const state = resizingColumnRef.current;
      if (!state) return;

      const delta = event.clientX - state.startX;
      setColumnWidths(prev => prev.map((width, index) => (
        index === state.index ? Math.max(90, state.startWidth + delta) : width
      )));
    };

    const handleMouseUp = () => {
      resizingColumnRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);
  const syncColumnWidth = columnWidths[10];

  const renderHeader = (label, index, extraClass = '', stickyRight = null) => (
    <th
      className={`${stickyRight === null ? 'relative' : 'sticky z-20'} px-2 py-3 border-r border-slate-200 bg-slate-50 whitespace-nowrap select-none ${extraClass}`}
      style={stickyRight === null ? undefined : { right: `${stickyRight}px` }}
    >
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Redimensionar coluna ${label}`}
        onMouseDown={(event) => startColumnResize(index, event)}
        className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-indigo-300/60 active:bg-indigo-400/80 transition-colors"
      />
    </th>
  );

  const erroredProducts = products.filter(p => p.sync_status === 'error');

  const formatErrorMessage = (msg) => {
    if (!msg) return 'Erro desconhecido';
    
    try {
      // Se a mensagem contiver um objeto JSON de erro da NuvemShop
      if (msg.includes('{')) {
        const jsonStart = msg.indexOf('{');
        const jsonStr = msg.substring(jsonStart);
        const errObj = JSON.parse(jsonStr);
        
        const detailedMsg = errObj.description || errObj.message || msg;
        
        // Mapear erros comuns da NuvemShop para mensagens amigáveis
        if (detailedMsg.includes('The SKU has already been taken')) {
          return 'SKU duplicado: Este SKU já está cadastrado em outro produto na NuvemShop.';
        }
        if (detailedMsg.includes('invalid_token') || detailedMsg.includes('Invalid credentials')) {
          return 'Credenciais inválidas: Verifique as chaves da NuvemShop no arquivo .env.';
        }
        return detailedMsg;
      }
    } catch (error) {
      console.warn('Falha ao formatar erro da NuvemShop:', error.message);
      // Fallback caso falhe ao analisar como JSON
    }
    
    return msg;
  };

  const normalizedSearch = normalizeText(searchTerm);
  const normalizedSkuSearch = normalizeText(skuSearchTerm);

  const filteredProducts = products.filter(p => {
    const productName = normalizeText(p.nome_produto);
    const nuvemshopDescription = normalizeText(p.nuvemshop_description);
    const sku = normalizeText(p.sku);
    const matchesSku = !normalizedSkuSearch || sku.includes(normalizedSkuSearch);
    const matchesSearch = !normalizedSearch
      || productName.includes(normalizedSearch)
      || nuvemshopDescription.includes(normalizedSearch)
      || sku.includes(normalizedSearch);
    const matchesCategory = !!normalizedSearch || !!normalizedSkuSearch || filterCategory === '' || p.nome_categoria === filterCategory;
    return matchesSku && matchesSearch && matchesCategory;
  }).sort((a, b) => {
    // Se houver termo de busca, prioriza relevância do match
    if (normalizedSkuSearch || normalizedSearch) {
      const term = normalizedSkuSearch || normalizedSearch;
      const skuA = normalizeText(a.sku);
      const skuB = normalizeText(b.sku);
      const nameA = normalizeText(a.nome_produto);
      const nameB = normalizeText(b.nome_produto);

      // 1. Match exato de SKU
      const exactSkuA = skuA === term;
      const exactSkuB = skuB === term;
      if (exactSkuA && !exactSkuB) return -1;
      if (!exactSkuA && exactSkuB) return 1;

      // 2. SKU começa com o termo
      const startsSkuA = skuA.startsWith(term);
      const startsSkuB = skuB.startsWith(term);
      if (startsSkuA && !startsSkuB) return -1;
      if (!startsSkuA && startsSkuB) return 1;

      // 3. Nome começa com o termo
      const startsNameA = nameA.startsWith(term);
      const startsNameB = nameB.startsWith(term);
      if (startsNameA && startsNameB) {
        const stockA = parseFloat(a.estoque || 0);
        const stockB = parseFloat(b.estoque || 0);
        if (stockA !== stockB) return stockB - stockA;
      }
      if (startsNameA && !startsNameB) return -1;
      if (!startsNameA && startsNameB) return 1;

      // 4. SKU contém o termo
      const includesSkuA = skuA.includes(term);
      const includesSkuB = skuB.includes(term);
      if (includesSkuA && !includesSkuB) return -1;
      if (!includesSkuA && includesSkuB) return 1;

      // 5. Nome contém o termo (e não começa com ele)
      const includesNameA = nameA.includes(term);
      const includesNameB = nameB.includes(term);
      if (includesNameA && includesNameB) {
        const stockA = parseFloat(a.estoque || 0);
        const stockB = parseFloat(b.estoque || 0);
        if (stockA !== stockB) return stockB - stockA;
      }
      if (includesNameA && !includesNameB) return -1;
      if (!includesNameA && includesNameB) return 1;
    }

    // Ordenação padrão (quando não há busca ou empatou na relevância)
    // Prioridade 1: Sincronizados (No Site)
    if (a.is_synced && !b.is_synced) return -1;
    if (!a.is_synced && b.is_synced) return 1;
    
    // Prioridade 2: Marcados para envio
    if (a.is_marked && !b.is_marked) return -1;
    if (!a.is_marked && b.is_marked) return 1;

    return 0;
  });

  return (
    <div className="notranslate min-h-screen bg-[#F4F7FE] flex flex-col font-sans text-slate-700" translate="no">
      {/* Custom Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      {previewProduct && (
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200"
          onClick={() => setPreviewProduct(null)}
        >
          <div 
            className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-800 truncate">{previewProduct.nome_produto}</h3>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">SKU {previewProduct.sku}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProduct(null)}
                className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-100 p-6 flex items-center justify-center min-h-[60vh]">
              <img
                src={getImageSrc(previewProduct)}
                alt={previewProduct.nome_produto}
                className="max-w-full max-h-[70vh] object-contain bg-white rounded-2xl shadow-xl border border-slate-200"
              />
            </div>
            {previewProduct.generated_description && (
              <div className="px-6 py-4 border-t border-slate-100 text-sm text-slate-600 max-h-32 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: previewProduct.generated_description }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-indigo-200 shadow-xl">
            <RefreshCw className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">UNIPLUS <span className="text-indigo-600">CONNECT</span></h1>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Dashboard de Integração</p>
          </div>
        </div>
        
        <div className="flex gap-4">
          {erroredProducts.length > 0 && (
            <button 
              onClick={() => setIsErrorModalOpen(true)}
              className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 px-4 py-2.5 rounded-xl transition-all font-bold border border-rose-200 shadow-sm active:scale-95 animate-pulse"
              style={{ animationDuration: '3s' }}
            >
              <AlertCircle className="w-4 h-4" />
              Exibir itens com erros
              <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-black ml-1">
                {erroredProducts.length}
              </span>
            </button>
          )}
          <button 
            onClick={fetchData}
            disabled={loading || syncing || reconciling}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-xl transition-all text-slate-600 font-bold border border-slate-200 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar ERP
          </button>
          <button
            onClick={handleReconcile}
            disabled={loading || syncing || reconciling}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-xl transition-all text-slate-600 font-bold border border-slate-200 shadow-sm"
          >
            {reconciling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
            {reconciling ? 'Validando...' : 'Validar NuvemShop'}
          </button>
          <button 
            onClick={handleRunSync}
            disabled={loading || syncing || reconciling || stats.marked === 0}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl transition-all shadow-indigo-200 shadow-xl active:scale-95 font-bold"
          >
            {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            {syncing ? 'Sincronizando...' : 'Enviar para NuvemShop'}
          </button>
        </div>
      </header>

      <main className="p-8 max-w-[1600px] mx-auto w-full flex-grow">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <StatCard title="Total no ERP" value={products.length} subtitle="Produtos Ativos" icon={<Package className="text-indigo-500" />} color="indigo" />
          <StatCard title="Fila de Envio" value={stats.marked} subtitle="Aguardando Sync" icon={<Filter className="text-amber-500" />} color="amber" />
          <StatCard title="Sincronizados" value={stats.synced} subtitle="Já na NuvemShop" icon={<CheckCircle className="text-emerald-500" />} color="emerald" />
          <StatCard 
            title="Erros" 
            value={stats.errors} 
            subtitle="Requer Atenção" 
            icon={<AlertCircle className="text-rose-500" />} 
            color="rose" 
            onClick={stats.errors > 0 ? () => setIsErrorModalOpen(true) : null}
          />
        </div>

        {/* Modal de Erros de Sincronização */}
        {isErrorModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] max-w-3xl w-full border border-slate-200 shadow-2xl p-8 flex flex-col relative max-h-[85vh] animate-in zoom-in-95 duration-200">
              {/* Botão de Fechar */}
              <button 
                onClick={() => setIsErrorModalOpen(false)}
                className="absolute top-6 right-6 p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Cabeçalho */}
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-rose-500 p-3.5 rounded-2xl text-white shadow-lg shadow-rose-100 animate-bounce" style={{ animationDuration: '3s' }}>
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Erros de Sincronização Ativos</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Os {erroredProducts.length} itens abaixo falharam ao sincronizar com o site
                  </p>
                </div>
              </div>

              {/* Instruções */}
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl mb-6 text-xs text-rose-800 font-bold leading-relaxed">
                👉 Clique no <span className="font-extrabold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">SKU</span> de um produto para filtrá-lo na tabela principal, permitindo localizá-lo e editá-lo.
              </div>

              {/* Lista com scroll */}
              <div className="flex-grow overflow-y-auto divide-y divide-slate-100 pr-2 max-h-[50vh]">
                {erroredProducts.map(p => (
                  <div key={p.id_produto} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          onClick={() => {
                            setSearchTerm(p.sku);
                            setIsErrorModalOpen(false);
                          }}
                          className="font-black text-xs text-rose-600 bg-rose-100 hover:bg-rose-200 transition-all px-2.5 py-1 rounded-lg uppercase tracking-tight shadow-sm border border-rose-100 active:scale-95"
                          title="Clique para filtrar esta SKU na tabela principal"
                        >
                          SKU {p.sku}
                        </button>
                        <span className="font-extrabold text-slate-800 text-sm">{p.nome_produto}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Categoria: {p.nome_categoria || 'Geral'} | ID ERP: #{p.id_produto}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 text-rose-600 px-4 py-2.5 rounded-xl text-xs font-semibold max-w-full md:max-w-[60%] overflow-x-auto shadow-inner select-all leading-normal whitespace-pre-wrap">
                      {formatErrorMessage(p.error_message)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rodapé */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setIsErrorModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold px-6 py-2.5 rounded-xl transition-all"
                >
                  Fechar
                </button>
                <button
                  onClick={() => {
                    setIsErrorModalOpen(false);
                    handleRunSync();
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sincronizar Tudo Novamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_260px] gap-4 shadow-sm items-center">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Pesquisar por nome/descricao do produto..."
              className="w-full pl-12 pr-12 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">SKU</span>
            <input
              type="text"
              placeholder="SKU Uniplus"
              className="w-full pl-12 pr-10 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 font-medium"
              value={skuSearchTerm}
              onChange={(e) => setSkuSearchTerm(e.target.value)}
            />
            {skuSearchTerm && (
              <button
                type="button"
                onClick={() => setSkuSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
                title="Limpar SKU"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative w-full">
             <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
             <select 
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none font-medium cursor-pointer"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">Todas Categorias</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/50">
          <div className="overflow-x-auto overscroll-x-contain">
            <table
              className="table-fixed text-left border-collapse select-text"
              style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
            >
              <colgroup>
                {columnWidths.map((width, index) => (
                  <col key={index} style={{ width: `${width}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[11px] uppercase tracking-[0.15em] font-black">
                  {renderHeader('SKU', 0)}
                  {renderHeader('Produto', 1)}
                  {renderHeader('Descricao NuvemShop', 2)}
                  {renderHeader('Fotos', 3)}
                  {renderHeader('Categoria', 4)}
                  {renderHeader('Estoque', 5)}
                  {renderHeader('Preco ERP', 6)}
                  {renderHeader('Preco NuvemShop', 7)}
                  {renderHeader('Promo', 8)}
                  {renderHeader('Status', 9, 'text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]', syncColumnWidth)}
                  {renderHeader('Sincronizar?', 10, 'text-center', 0)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="11" className="px-8 py-24 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          <RefreshCw className="w-12 h-12 animate-spin text-indigo-500 opacity-20" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                          </div>
                        </div>
                        <span className="text-slate-400 font-bold tracking-tight">Carregando dados do Uniplus...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-8 py-24 text-center">
                      <div className="text-slate-300 flex flex-col items-center gap-2">
                        <Search className="w-10 h-10 opacity-20" />
                        <span className="font-bold">Nenhum resultado para sua busca.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.slice(0, 50).map(p => (
                    <tr 
                      key={p.id_produto} 
                      className={`group transition-all duration-300 hover:bg-slate-50/80 ${p.is_marked ? 'bg-indigo-50/30' : ''}`}
                    >
                      <td className="px-2 py-3 align-middle whitespace-nowrap border-r border-slate-100">
                        <div className="flex flex-col">
                          <span className="font-black text-xs text-indigo-600 bg-indigo-50 w-fit px-2 py-0.5 rounded-md mb-1 uppercase tracking-tighter">SKU {p.sku}</span>
                          <span className="text-[10px] text-slate-300 font-bold uppercase">ID #{p.id_produto}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle border-r border-slate-100">
                        <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors whitespace-normal break-words leading-snug">{p.nome_produto}</div>
                      </td>
                      <td className="px-2 py-3 align-middle border-r border-slate-100">
                        <div className="flex items-start gap-2">
                          <textarea
                            key={`${p.id_produto}-${p.nuvemshop_description ?? ''}`}
                            defaultValue={p.nuvemshop_description || ''}
                            rows={2}
                            onBlur={(event) => handleNuvemShopDescriptionSave(p, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                              if (event.key === 'Escape') {
                                event.currentTarget.value = p.nuvemshop_description || '';
                                event.currentTarget.blur();
                              }
                            }}
                            disabled={savingDescriptionIds.has(p.id_produto)}
                            placeholder={p.nome_produto}
                            className="w-full min-h-14 resize-none rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                            title="Texto usado como nome na NuvemShop. Vazio usa o nome vindo do Uniplus."
                          />
                          {savingDescriptionIds.has(p.id_produto) && <Loader2 className="mt-2 w-3.5 h-3.5 animate-spin text-indigo-500 shrink-0" />}
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle whitespace-nowrap border-r border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (p.image_public_url) setPreviewProduct(p);
                              }}
                              disabled={!p.image_public_url}
                              className="w-14 h-14 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-indigo-400 enabled:hover:ring-offset-2 transition-all"
                              title={p.image_public_url ? 'Clique para ampliar a foto principal' : 'Sem foto principal'}
                            >
                              {p.image_public_url ? (
                                <img
                                  src={getImageSrc(p)}
                                  alt={p.nome_produto}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <ImagePlus className="w-5 h-5 text-slate-300" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (p.image2_public_url) {
                                  setPreviewProduct({
                                    ...p,
                                    image_public_url: p.image2_public_url,
                                    enriched_at: p.image2_enriched_at
                                  });
                                }
                              }}
                              disabled={!p.image2_public_url}
                              className="w-14 h-10 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-indigo-400 enabled:hover:ring-offset-2 transition-all"
                              title={p.image2_public_url ? 'Clique para ampliar a segunda foto' : 'Sem segunda foto'}
                            >
                              {p.image2_public_url ? (
                                <img
                                  src={getImageSrc(p, 2)}
                                  alt={`${p.nome_produto} segunda imagem`}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <span className="text-[10px] font-black text-slate-300">2</span>
                              )}
                            </button>
                          </div>
                          <div className="flex flex-col gap-1">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                event.currentTarget.focus();
                              }}
                              onPaste={(event) => handlePasteImage(p, event)}
                              onKeyDown={(event) => event.stopPropagation()}
                              className="flex items-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black uppercase tracking-tight text-indigo-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                              title="Clique aqui, copie uma imagem e cole com Ctrl+V"
                            >
                              {uploadingImageIds.has(p.id_produto) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clipboard className="w-3.5 h-3.5" />}
                              {uploadingImageIds.has(p.id_produto) ? 'Tratando...' : 'Colar imagem'}
                            </div>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                event.currentTarget.focus();
                              }}
                              onPaste={(event) => handlePasteImage(p, event, 2)}
                              onKeyDown={(event) => event.stopPropagation()}
                              className="flex items-center gap-2 rounded-xl border border-dashed border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] font-black uppercase tracking-tight text-cyan-700 outline-none transition-all focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-200"
                              title="Clique aqui, copie uma imagem e cole com Ctrl+V para salvar como segunda foto"
                            >
                              {uploadingImageIds.has(p.id_produto) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clipboard className="w-3.5 h-3.5" />}
                              {uploadingImageIds.has(p.id_produto) ? 'Tratando...' : 'Colar 2a imagem'}
                            </div>
                            <span className={`text-[10px] font-bold uppercase ${
                              p.enrichment_status === 'ready' ? 'text-emerald-600' :
                              p.enrichment_status === 'error' ? 'text-rose-500' :
                              p.enrichment_status === 'preparing' ? 'text-amber-500' :
                              'text-slate-300'
                            }`}>
                              {p.enrichment_status === 'ready' ? 'Foto + descricao ok' :
                               p.enrichment_status === 'error' ? 'Falha na preparacao' :
                               p.enrichment_status === 'preparing' ? 'Preparando...' :
                               'Pendente'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle border-r border-slate-100">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-normal break-words inline-block">{p.nome_categoria || 'Geral'}</span>
                      </td>
                      <td className="px-2 py-3 align-middle whitespace-nowrap border-r border-slate-100">
                        <div className={`flex items-center gap-2 font-black ${parseFloat(p.estoque) <= 0 ? 'text-rose-500' : 'text-slate-700'}`}>
                          {parseFloat(p.estoque).toFixed(0)}
                          <span className="text-[10px] font-bold text-slate-300">un</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle font-black text-slate-800 whitespace-nowrap border-r border-slate-100">
                        R$ {parseFloat(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-3 align-middle whitespace-nowrap border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-indigo-600">R$</span>
                          <input
                            key={`${p.id_produto}-${p.nuvemshop_price ?? ''}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={formatMoneyInput(p.nuvemshop_price)}
                            onBlur={(event) => handleNuvemShopPriceSave(p, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') {
                                event.currentTarget.value = formatMoneyInput(p.nuvemshop_price);
                                event.currentTarget.blur();
                              }
                            }}
                            disabled={savingNuvemShopPriceIds.has(p.id_produto)}
                            placeholder={formatMoneyInput(p.preco)}
                            className="w-24 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-xs font-black text-indigo-700 outline-none transition-all placeholder:text-indigo-300 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                            title="Preco normal enviado para a NuvemShop. Vazio usa o preco do Uniplus."
                          />
                          {savingNuvemShopPriceIds.has(p.id_produto) && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />}
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle whitespace-nowrap border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-emerald-600">R$</span>
                          <input
                            key={`${p.id_produto}-${p.promotional_price ?? ''}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={formatMoneyInput(p.promotional_price)}
                            onBlur={(event) => handlePromotionSave(p, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                              if (event.key === 'Escape') {
                                event.currentTarget.value = formatMoneyInput(p.promotional_price);
                                event.currentTarget.blur();
                              }
                            }}
                            disabled={savingPromotionIds.has(p.id_produto)}
                            placeholder="Sem promo"
                            className="w-24 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-xs font-black text-emerald-700 outline-none transition-all placeholder:text-emerald-300 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                            title="Preco promocional menor que o preco normal. Deixe vazio para remover."
                          />
                          {savingPromotionIds.has(p.id_produto) && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />}
                        </div>
                      </td>
                      <td
                        className={`sticky z-10 px-2 py-3 align-middle text-center whitespace-nowrap border-r border-slate-100 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] ${
                          p.is_marked ? 'bg-indigo-50' : 'bg-white group-hover:bg-slate-50'
                        }`}
                        style={{ right: `${syncColumnWidth}px` }}
                      >
                        {p.is_synced ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase">
                            <CheckCircle className="w-3 h-3" /> No Site
                          </div>
                        ) : p.sync_status === 'error' ? (
                          <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase" title={p.error_message}>
                            <AlertCircle className="w-3 h-3" /> Erro
                          </div>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-200 mx-auto"></div>
                        )}
                      </td>
                      <td
                        className={`sticky right-0 z-10 px-2 py-3 align-middle text-center whitespace-nowrap ${
                          p.is_marked ? 'bg-indigo-50' : 'bg-white group-hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleSync(p)}
                          className={`w-7 h-7 mx-auto rounded-lg border-2 transition-all flex items-center justify-center ${
                            p.is_marked 
                              ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-200' 
                              : 'border-slate-300 hover:border-indigo-400 bg-white'
                          }`}
                          title={p.is_marked ? 'Remover da sincronizacao' : 'Marcar para sincronizar'}
                        >
                          {p.is_marked && <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50/50 px-8 py-4 border-t border-slate-100 text-[11px] font-bold text-slate-400 flex justify-between items-center uppercase tracking-widest">
            <span>Visualizando {Math.min(filteredProducts.length, 50)} de {filteredProducts.length} itens encontrados</span>
            <div className="flex items-center gap-2 text-indigo-600">
              Próxima página <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, color, onClick }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-600 shadow-indigo-100",
    amber: "bg-amber-50 text-amber-600 shadow-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 shadow-emerald-100",
    rose: "bg-rose-50 text-rose-600 shadow-rose-100",
  };

  const isClickable = !!onClick;

  return (
    <div 
      onClick={onClick}
      className={`bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-5 transition-all group ${
        isClickable ? 'cursor-pointer hover:translate-y-[-4px] hover:border-slate-200 active:scale-[0.99]' : 'hover:translate-y-[-4px]'
      }`}
    >
      <div className={`p-4 rounded-2xl transition-transform group-hover:scale-110 ${colors[color]}`}>
        {React.cloneElement(icon, { className: "w-7 h-7" })}
      </div>
      <div className="flex-grow">
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 mb-0.5">{title}</div>
        <div className="text-3xl font-black text-slate-800 tabular-nums flex items-baseline justify-between">
          {value}
          {isClickable && (
            <span className="text-[10px] text-rose-500 font-extrabold group-hover:underline uppercase tracking-wider animate-pulse">Ver tudo →</span>
          )}
        </div>
        <div className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
