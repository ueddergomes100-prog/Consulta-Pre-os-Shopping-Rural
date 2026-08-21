const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const MEDIA_ROOT = path.join(__dirname, '..', '..', 'data', 'media', 'products');

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const safeFilePart = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'produto';

const removeSearchNoise = (value) => cleanText(value)
  .replace(/\b(cod|codigo|ref|referencia|sku|un|und|pct|cx|kg|g|ml|lt)\b\.?/gi, ' ')
  .replace(/\b\d{4,}\b/g, ' ')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeSearchWeight = (value) => cleanText(value)
  .replace(/\b10[,.]1\s*kg\b/gi, '10kg')
  .replace(/\b10[,.]1kg\b/gi, '10kg');

const expandSearchAbbreviations = (value) => {
  const normalized = cleanText(value)
    .replace(/\bNEX\s*GARD\b/gi, 'NexGard')
    .replace(/\b(\d+)[,.]\d+\s*A\s*(\d+)\s*KG\b/gi, '$1-$2kg')
    .replace(/\b(\d+)\s*A\s*(\d+)\s*KG\b/gi, '$1-$2kg')
    .replace(/\bUNIDADE\b/gi, '')
    .replace(/\bC\/\s*(\d+)\s*UN\b/gi, '$1 unidades')
    .replace(/\b(\d+)\s*UN\b/gi, '$1 unidades')
    .replace(/\b(\d+)\s*X\s*(\d+)\s*CM\b/gi, '$1x$2cm')
    .replace(/\bAD\b/gi, 'Adultos')
    .replace(/\bRP\b/gi, 'Racas Pequenas')
    .replace(/\bRMG\b/gi, 'Racas Medias e Grandes')
    .replace(/\s*-\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const matchText = normalizeForMatch(normalized);
  if (
    matchText.includes('quatree') &&
    matchText.includes('dermasense') &&
    !/\b(cao|caes|cachorro|cachorros|gato|gatos)\b/.test(matchText)
  ) {
    return `${normalized} Caes`;
  }

  return normalized;
};

const normalizeManualSearchTerm = (value) => cleanText(value)
  .replace(/\bpetlov\b/gi, 'petlove')
  .replace(/\bpeltov\b/gi, 'petlove')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeForMatch = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_-]+/g, ' ')
  .replace(/(\d)[,.](\d)/g, '$1 $2')
  .toLowerCase();

const decodeHtml = (value) => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const normalizeUrlForBlock = (value) => {
  try {
    const parsed = new URL(String(value || ''));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(value || '').trim();
  }
};

class ProductEnrichmentService {
  buildSearchQuery(product) {
    return removeSearchNoise(product.image_search_term || product.nome_produto || product.last_name);
  }

  buildSearchQueries(product) {
    if (product.image_search_term) {
      const manualTerm = normalizeManualSearchTerm(product.image_search_term);
      const expandedManualTerm = expandSearchAbbreviations(normalizeSearchWeight(manualTerm));

      return [...new Set([manualTerm, expandedManualTerm].filter(Boolean))];
    }

    const rawName = normalizeSearchWeight(product.nome_produto || product.last_name);
    const expandedName = expandSearchAbbreviations(rawName);

    return [...new Set([expandedName, rawName].filter(Boolean))];
  }

  buildDescription(product) {
    const name = cleanText(product.nome_produto || product.last_name);
    const category = cleanText(product.nome_categoria || product.last_category);
    const sku = cleanText(product.sku);

    const categoryText = category ? ` da categoria ${category}` : '';
    const skuText = sku ? ` Codigo/SKU: ${sku}.` : '';

    return [
      `<p><strong>${name}</strong>${categoryText}, selecionado para venda online com informacoes integradas ao ERP Uniplus.</p>`,
      `<p>Produto indicado para clientes que buscam praticidade, qualidade e disponibilidade atualizada diretamente pela loja.</p>`,
      `<p>${skuText}</p>`
    ].join('');
  }

  async searchImage(product) {
    const queries = this.buildSearchQueries(product);

    for (const query of queries) {
      const googleImage = await this.searchGoogleImage(query);
      if (googleImage) return googleImage;
    }

    for (const query of queries) {
      const duckDuckGoImage = await this.searchDuckDuckGoImage(query);
      if (duckDuckGoImage) return duckDuckGoImage;
    }

    for (const query of queries) {
      const openverseImage = await this.searchOpenverseImage(query);
      if (openverseImage) return openverseImage;
    }

    throw new Error('Nenhuma imagem encontrada para este produto');
  }

  async searchGoogleImage(query) {
    const apiKey = process.env.GOOGLE_IMAGE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_IMAGE_SEARCH_CX;

    if (!apiKey || !cx || !query) return null;

    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx,
          q: query,
          searchType: 'image',
          imgSize: 'large',
          safe: 'active',
          num: 5
        },
        timeout: 12000
      });

      const items = response.data?.items || [];
      const candidates = items.map((item) => ({
        url: item.link,
        context: [item.title, item.snippet, item.displayLink, item.image?.contextLink, item.link].filter(Boolean).join(' ')
      }));

      return this.pickBestCandidate(query, candidates)?.url || null;
    } catch (error) {
      console.warn('Falha na busca de imagem pelo Google:', error.response?.data?.error?.message || error.message);
      return null;
    }
  }

  async searchDuckDuckGoImage(query) {
    if (!query) return null;

    try {
      const tokenPage = await axios.get('https://duckduckgo.com/', {
        params: { q: query },
        timeout: 12000,
        headers: {
          'User-Agent': process.env.NUVEMSHOP_USER_AGENT || 'Mozilla/5.0'
        }
      });

      const token = tokenPage.data.match(/vqd=["']?([^&"']+)/)?.[1];
      if (!token) return null;

      const response = await axios.get('https://duckduckgo.com/i.js', {
        params: {
          l: 'br-pt',
          o: 'json',
          q: query,
          vqd: token,
          f: ',,,',
          p: '1'
        },
        timeout: 12000,
        headers: {
          'User-Agent': process.env.NUVEMSHOP_USER_AGENT || 'Mozilla/5.0',
          Referer: 'https://duckduckgo.com/'
        }
      });

      const results = response.data?.results || [];
      const candidates = results.map((item) => ({
        url: item.image,
        context: [item.title, item.url, item.source, item.image].filter(Boolean).join(' ')
      }));

      return this.pickBestCandidate(query, candidates)?.url || null;
    } catch (error) {
      console.warn('Falha na busca de imagem pelo DuckDuckGo:', error.response?.status || error.message);
      return null;
    }
  }

  async searchOpenverseImage(query) {
    if (!query) return null;

    try {
      const response = await axios.get('https://api.openverse.engineering/v1/images/', {
        params: {
          q: query,
          mature: false,
          page_size: 20
        },
        timeout: 12000,
        headers: {
          'User-Agent': process.env.NUVEMSHOP_USER_AGENT || 'UniplusConnect/1.0'
        }
      });

      const results = response.data?.results || [];
      const candidates = results.map((item) => ({
        url: item.url,
        context: [item.title, item.creator, item.source, item.foreign_landing_url, item.url].filter(Boolean).join(' ')
      }));

      return this.pickBestCandidate(query, candidates)?.url || null;
    } catch (error) {
      console.warn('Falha na busca de imagem pelo Openverse:', error.response?.status || error.message);
      return null;
    }
  }

  async findDownloadableImage(product) {
    const queries = this.buildSearchQueries(product);
    const candidates = [];

    for (const query of queries) {
      candidates.push(await this.searchGoogleImage(query));
      candidates.push(...await this.searchProductPageImages(query));
      candidates.push(await this.searchDuckDuckGoImage(query));
      candidates.push(await this.searchOpenverseImage(query));
    }

    return candidates.filter(Boolean);
  }

  async searchProductPageImages(query) {
    if (!query) return [];

    try {
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        timeout: 12000,
        headers: {
          'User-Agent': process.env.NUVEMSHOP_USER_AGENT || 'Mozilla/5.0'
        }
      });

      const resultLinks = [...response.data.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
        .slice(0, 8)
        .map((match) => ({
          url: this.decodeDuckDuckGoRedirect(decodeHtml(match[1])),
          title: decodeHtml(match[2].replace(/<[^>]+>/g, ' '))
        }))
        .filter((item) => item.url && item.url.startsWith('http'));

      const candidates = [];
      for (const result of resultLinks) {
        const pageImages = await this.extractPageImages(result.url, result.title);
        candidates.push(...pageImages.map((image) => ({
          url: image,
          context: `${result.title} ${result.url} ${image}`
        })));
      }

      return candidates
        .map((candidate, index) => ({ ...candidate, score: this.scoreCandidate(query, candidate), index }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((candidate) => candidate.url);
    } catch (error) {
      console.warn('Falha na busca de paginas do produto:', error.response?.status || error.message);
      return [];
    }
  }

  decodeDuckDuckGoRedirect(url) {
    try {
      const fullUrl = url.startsWith('//') ? `https:${url}` : url;
      const parsed = new URL(fullUrl);
      const target = parsed.searchParams.get('uddg');
      return target ? decodeURIComponent(target) : fullUrl;
    } catch {
      return null;
    }
  }

  async extractPageImages(pageUrl, title) {
    try {
      const response = await axios.get(pageUrl, {
        timeout: 12000,
        maxContentLength: 2 * 1024 * 1024,
        headers: {
          'User-Agent': process.env.NUVEMSHOP_USER_AGENT || 'Mozilla/5.0'
        }
      });

      const html = response.data;
      const metaImages = [
        ...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/gi),
        ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi)
      ].map((match) => this.resolveUrl(decodeHtml(match[1]), pageUrl));

      return [...new Set(metaImages)]
        .filter((image) => image && !image.includes('.svg'));
    } catch (error) {
      console.warn('Falha ao ler pagina do produto:', pageUrl, error.response?.status || error.message);
      return [];
    }
  }

  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return null;
    }
  }

  getForbiddenTerms(query) {
    const normalized = normalizeForMatch(query);
    const groups = [
      ['castrado', 'castrados', 'castrada', 'castradas', 'sterilised', 'sterilized'],
      ['filhote', 'filhotes', 'puppy', 'kitten'],
      ['senior', 'idoso', 'idosos'],
      ['light', 'obeso', 'obesos'],
      ['dermasense', 'derma sense'],
      ['gourmet'],
      ['supreme']
    ];

    return groups
      .filter((group) => !group.some((term) => normalized.includes(term)))
      .flat();
  }

  getRequiredTerms(query) {
    const normalized = normalizeForMatch(query);
    const groups = [
      ['quatree'],
      ['gourmet'],
      ['supreme'],
      ['dermasense', 'derma sense'],
      ['mix', 'carne'],
      ['gato', 'gatos'],
      ['cao', 'caes', 'cachorro', 'cachorros']
    ];

    return groups.filter((group) => group.some((term) => normalized.includes(term)));
  }

  getForbiddenWeightTerms(query) {
    const normalized = normalizeForMatch(query);
    const weightGroups = [
      ['2-4kg', '2 a 4 kg', '2kg a 4kg', '2 4kg'],
      ['4-10kg', '4 a 10 kg', '4kg a 10kg', '4 10kg', '4,1 a 10kg', '4.1 a 10kg', '4 1 a 10 kg'],
      ['10-25kg', '10 a 25 kg', '10kg a 25kg', '10 25kg', '10,1 a 25kg', '10.1 a 25kg', '10 1 a 25 kg'],
      ['25-50kg', '25 a 50 kg', '25kg a 50kg', '25 50kg'],
      ['30-60kg', '30 a 60 kg', '30kg a 60kg', '30 60kg', '30,1 a 60kg', '30.1 a 60kg']
    ];

    const activeGroup = weightGroups.find((group) => group.some((term) => normalized.includes(term)));
    if (!activeGroup) return [];

    return weightGroups
      .filter((group) => group !== activeGroup)
      .flat();
  }

  scoreCandidate(query, candidate) {
    const url = String(candidate.url || '');
    if (!url || url.includes('.svg')) return -Infinity;
    if (/logo|placeholder|favicon|sprite|banner/i.test(url)) return -Infinity;

    const normalizedContext = normalizeForMatch(`${candidate.context || ''} ${url}`);
    if (/\b(logo|placeholder|favicon|sprite|banner)\b/.test(normalizedContext)) return -Infinity;
    const forbidden = this.getForbiddenTerms(query);
    if (forbidden.some((term) => normalizedContext.includes(term))) return -Infinity;

    const forbiddenWeights = this.getForbiddenWeightTerms(query);
    if (forbiddenWeights.some((term) => normalizedContext.includes(term))) return -Infinity;

    const requiredGroups = this.getRequiredTerms(query);
    const missingRequired = requiredGroups.some((group) => (
      !group.some((term) => normalizedContext.includes(term))
    ));
    if (missingRequired) return -Infinity;

    const queryTokens = normalizeForMatch(query)
      .replace(/[^a-z0-9,\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 2);

    const uniqueTokens = [...new Set(queryTokens)];
    const matched = uniqueTokens.filter((token) => normalizedContext.includes(token));
    const imageBonus = /\.(jpe?g|png|webp)(\?|$)/i.test(url) ? 2 : 0;
    const marketplaceBonus = /mercadolivre|amazon|shopee|petlove|magazineluiza|americanas|casasbahia|nuvemshop|mitiendanube|vtex|tray|tcdn|fbits|awsli|lojasmel|pet|agro/i.test(normalizedContext) ? 4 : 0;
    const sizeBonus = this.estimateImageSizeBonus(url);

    const minimumMatches = Math.min(5, uniqueTokens.length);
    if (matched.length < minimumMatches) return -Infinity;

    return matched.length + imageBonus + marketplaceBonus + sizeBonus + (requiredGroups.length * 2);
  }

  estimateImageSizeBonus(url) {
    const text = String(url || '').toLowerCase();
    const dimensions = [...text.matchAll(/(\d{2,4})[x-](\d{2,4})/g)]
      .map((match) => Math.min(Number(match[1]), Number(match[2])))
      .filter(Boolean);

    if (dimensions.some((size) => size >= 800)) return 6;
    if (dimensions.some((size) => size >= 500)) return 3;
    if (dimensions.some((size) => size > 0 && size < 300)) return -8;
    if (/[?&](w|width|h|height)=([0-9]{1,3})(\D|$)/.test(text)) return -5;
    if (/thumb|thumbnail|small|mini|_p\b/.test(text)) return -4;
    return 0;
  }

  pickBestCandidate(query, candidates) {
    return candidates
      .map((candidate, index) => ({
        ...candidate,
        score: this.scoreCandidate(query, candidate),
        index
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)[0] || null;
  }

  async downloadFirstWorkingImage(product, blockedImageUrls = []) {
    const candidates = await this.findDownloadableImage(product);
    const blocked = new Set(blockedImageUrls.map(normalizeUrlForBlock).filter(Boolean));

    for (const url of candidates) {
      if (blocked.has(normalizeUrlForBlock(url))) {
        console.log('Imagem ignorada por bloqueio manual:', url);
        continue;
      }

      try {
        const imageBuffer = await this.downloadImage(url);
        const metadata = await sharp(imageBuffer).metadata();
        const minSide = Math.min(metadata.width || 0, metadata.height || 0);
        if (minSide > 0 && minSide < 350 && candidates.length > 1) {
          console.warn('Imagem ignorada por baixa resolucao:', url, `${metadata.width}x${metadata.height}`);
          continue;
        }

        return { imageUrl: url, imageBuffer };
      } catch (error) {
        console.warn('Imagem encontrada, mas nao baixou:', url, error.response?.status || error.message);
      }
    }

    throw new Error('Nenhuma imagem encontrada para este produto');
  }

  async removeBackgroundIfConfigured(imageBuffer) {
    if (!process.env.REMOVEBG_API_KEY) return imageBuffer;

    try {
      const response = await axios.post(
        'https://api.remove.bg/v1.0/removebg',
        {
          image_file_b64: imageBuffer.toString('base64'),
          size: 'auto',
          format: 'png'
        },
        {
          timeout: 30000,
          responseType: 'arraybuffer',
          headers: {
            'X-Api-Key': process.env.REMOVEBG_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.warn('Falha ao remover fundo por IA, usando tratamento local:', error.message);
      return imageBuffer;
    }
  }

  async downloadImage(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: 10 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        Referer: new URL(url).origin
      }
    });

    return Buffer.from(response.data);
  }

  async processImage(imageBuffer, sku, options = {}) {
    await fs.mkdir(MEDIA_ROOT, { recursive: true });

    const suffix = options.suffix ? `-${safeFilePart(options.suffix)}` : '';
    const outputName = `${safeFilePart(sku)}${suffix}.jpg`;
    const outputPath = path.join(MEDIA_ROOT, outputName);

    const cutoutBuffer = await this.removeBackgroundIfConfigured(imageBuffer);

    await sharp(cutoutBuffer)
      .rotate()
      .resize(1280, 1280, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(outputPath);

    return {
      image_local_path: outputPath,
      image_public_url: `/media/products/${outputName}`
    };
  }

  async enrich(product, options = {}) {
    const description = this.buildDescription(product);
    const { imageUrl, imageBuffer: originalImage } = await this.downloadFirstWorkingImage(product, options.blockedImageUrls || []);
    const processed = await this.processImage(originalImage, product.sku || product.id_produto);

    return {
      generated_description: description,
      image_source_url: imageUrl,
      ...processed
    };
  }
}

module.exports = new ProductEnrichmentService();
