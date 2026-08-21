const fs = require('fs/promises');
const path = require('path');

class CatalogPopularityService {
  constructor() {
    this.filePath = path.join(__dirname, '..', '..', 'data', 'catalog-popularity.json');
    this.entries = new Map();
    this.loaded = false;
    this.saveQueue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;

    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const stored = JSON.parse(content);

      Object.entries(stored).forEach(([code, entry]) => {
        const count = Number(entry?.count || 0);
        if (count > 0) {
          this.entries.set(code, {
            count,
            lastViewedAt: entry.lastViewedAt || null
          });
        }
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Erro ao carregar popularidade do catálogo:', error.message);
      }
    }

    this.loaded = true;
  }

  async getTopCodes(limit = 20) {
    await this.load();

    return [...this.entries.entries()]
      .sort(([, first], [, second]) => {
        if (second.count !== first.count) return second.count - first.count;
        return String(second.lastViewedAt || '').localeCompare(String(first.lastViewedAt || ''));
      })
      .slice(0, limit)
      .map(([code]) => code);
  }

  async recordView(code) {
    await this.load();

    const normalizedCode = String(code || '').trim();
    const current = this.entries.get(normalizedCode) || { count: 0, lastViewedAt: null };
    this.entries.set(normalizedCode, {
      count: current.count + 1,
      lastViewedAt: new Date().toISOString()
    });

    this.saveQueue = this.saveQueue.then(() => this.persist());
    await this.saveQueue;
  }

  async persist() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const serialized = Object.fromEntries(this.entries);
    await fs.writeFile(this.filePath, JSON.stringify(serialized, null, 2), 'utf8');
  }
}

module.exports = new CatalogPopularityService();
