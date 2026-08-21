const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

class NuvemShopService {
  constructor() {
    this.baseUrl = `https://api.nuvemshop.com.br/2025-03/${process.env.NUVEMSHOP_STORE_ID}`;
    this.lastRequestAt = 0;
    this.requestDelayMs = Number(process.env.NUVEMSHOP_API_DELAY_MS || 1200);
    this.headers = {
      'Authentication': `bearer ${process.env.NUVEMSHOP_ACCESS_TOKEN}`,
      'User-Agent': process.env.NUVEMSHOP_USER_AGENT,
      'Content-Type': 'application/json'
    };
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(config, attempt = 1) {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.requestDelayMs) {
      await this.wait(this.requestDelayMs - elapsed);
    }

    this.lastRequestAt = Date.now();

    try {
      return await axios({
        ...config,
        headers: {
          ...this.headers,
          ...(config.headers || {})
        }
      });
    } catch (error) {
      const status = error.response?.status || error.response?.data?.code;
      if (status === 429 && attempt <= 5) {
        const retryAfterSeconds = Number(error.response?.headers?.['retry-after'] || 0);
        const backoffMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : attempt * 10000;
        console.warn(`NuvemShop limitou requisicoes. Aguardando ${Math.ceil(backoffMs / 1000)}s antes de tentar novamente...`);
        await this.wait(backoffMs);
        return this.request(config, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Busca um produto na NuvemShop pelo SKU
   */
  async findProductBySku(sku) {
    try {
      const response = await this.request({
        method: 'get',
        url: `${this.baseUrl}/products`,
        params: { sku }
      });
      
      // Filtra para garantir que o SKU é idêntico (a API pode retornar "parecidos")
      const exactMatch = response.data.find(p => 
        p.variants.some(v => String(v.sku) === String(sku))
      );
      
      return exactMatch || null;
    } catch (error) {
      console.error(`Erro ao buscar SKU ${sku}:`, error.response?.data || error.message);
      throw new Error(`Erro ao buscar SKU ${sku}: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  async getProduct(productId) {
    try {
      const response = await this.request({
        method: 'get',
        url: `${this.baseUrl}/products/${productId}`
      });
      return response.data;
    } catch (error) {
      throw new Error(`Erro ao buscar produto: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  async deleteProduct(productId) {
    try {
      await this.request({
        method: 'delete',
        url: `${this.baseUrl}/products/${productId}`
      });
      return true;
    } catch (error) {
      throw new Error(`Erro ao remover produto: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * Cria um novo produto na NuvemShop
   */
  async createProduct(data) {
    try {
      const payload = {
        name: { pt: data.nome },
        description: data.descricao ? { pt: data.descricao } : undefined,
        variants: [{
          sku: data.sku,
          price: data.preco,
          promotional_price: data.precoPromocional || null,
          stock: data.estoque
        }]
      };
      
      const response = await this.request({
        method: 'post',
        url: `${this.baseUrl}/products`,
        data: payload
      });
      return response.data;
    } catch (error) {
      throw new Error(`Erro ao criar produto: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  async updateProduct(productId, data) {
    try {
      const payload = {};
      if (data.nome) payload.name = { pt: data.nome };
      if (data.descricao) payload.description = { pt: data.descricao };

      if (Object.keys(payload).length === 0) return null;

      const response = await this.request({
        method: 'put',
        url: `${this.baseUrl}/products/${productId}`,
        data: payload
      });
      return response.data;
    } catch (error) {
      throw new Error(`Erro ao atualizar produto: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  async listProductImages(productId) {
    try {
      const response = await this.request({
        method: 'get',
        url: `${this.baseUrl}/products/${productId}/images`
      });
      return response.data || [];
    } catch (error) {
      throw new Error(`Erro ao listar imagens: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  async deleteProductImage(productId, imageId) {
    try {
      await this.request({
        method: 'delete',
        url: `${this.baseUrl}/products/${productId}/images/${imageId}`
      });
      return true;
    } catch (error) {
      const status = error.response?.status || error.response?.data?.code;
      if (status === 404) return false;

      throw new Error(`Erro ao apagar imagem: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * Envia uma imagem local para o produto na NuvemShop.
   */
  async uploadProductImage(productId, imagePath, altText, position) {
    if (!imagePath) return null;

    try {
      const file = await fs.readFile(imagePath);
      const payload = {
        attachment: file.toString('base64'),
        filename: path.basename(imagePath),
        alt: altText || undefined,
        position: position || undefined
      };

      const response = await this.request({
        method: 'post',
        url: `${this.baseUrl}/products/${productId}/images`,
        data: payload
      });

      return response.data;
    } catch (error) {
      throw new Error(`Erro ao enviar imagem: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  async replaceProductImages(productId, imagePaths, altText) {
    const paths = imagePaths.filter(Boolean);
    if (paths.length === 0) return [];

    const currentImages = await this.listProductImages(productId);
    for (const image of currentImages) {
      await this.deleteProductImage(productId, image.id);
    }

    const uploaded = [];
    for (const [index, imagePath] of paths.entries()) {
      uploaded.push(await this.uploadProductImage(productId, imagePath, altText, index + 1));
    }

    return uploaded;
  }

  /**
   * Atualiza estoque e preço de uma variante específica
   */
  async updateVariant(productId, variantId, data) {
    try {
      const payload = {};
      if (data.estoque !== undefined) payload.stock = data.estoque;
      if (data.preco !== undefined) payload.price = data.preco;
      if (Object.prototype.hasOwnProperty.call(data, 'precoPromocional')) {
        payload.promotional_price = data.precoPromocional;
      }

      const response = await this.request({
        method: 'put',
        url: `${this.baseUrl}/products/${productId}/variants/${variantId}`,
        data: payload
      });
      return response.data;
    } catch (error) {
      throw new Error(`Erro ao atualizar variante: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }
}

module.exports = new NuvemShopService();
