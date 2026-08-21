# 🚀 Guia Operacional: Integração UNIPLUS <-> NuvemShop

Este guia contém tudo o que você precisa para rodar e manter sua integração ativa.

---

## 🛠️ 1. Como Iniciar o Sistema

Você precisa de **dois terminais** abertos na pasta `C:\Users\USER\Desktop\APi Uniplus`:

### Terminal 1: Backend (O motor)
Este comando inicia o servidor que conversa com o UNIPLUS e com a NuvemShop.
```bash
npm run dev
```
*   **Porta:** 3001
*   **Verificação:** Deve aparecer `✅ Conectado ao banco de dados UNIPLUS` e `🕒 Agendador de estoque configurado`.

### Terminal 2: Frontend (O Painel)
Este comando abre a interface visual para você gerenciar os produtos.
```bash
npm run dev:frontend
```
*   **Acesso:** [http://localhost:5174](http://localhost:5174)

---

## 📦 2. Fluxo de Trabalho Diário

1.  **Escolha de Produtos**:
    *   No painel, use a barra de busca para achar os produtos do UNIPLUS.
    *   Marque o **Checkbox** dos produtos que você deseja que fiquem ativos no site.
2.  **Sincronização Inicial**:
    *   Para enviar os produtos marcados pela primeira vez, clique em **"Sincronizar Agora"**.
    *   O sistema criará o produto na NuvemShop e guardará o vínculo.
3.  **Atualização Automática**:
    *   O sistema rodará sozinho a cada 60 segundos, atualizando Preço e Estoque de todos os produtos marcados.

---

## 🛡️ 3. Proteção de Estoque (Importante)

O sistema possui um mecanismo de **"Shadow Stock"** (Estoque de Sombra).
*   Se o site vender um item, a reserva aparece no painel.
*   O sistema enviará para o site: `Estoque Uniplus - Reservas do Site`.
*   A reserva só some quando você **lançar a venda no Uniplus**.

---

## 🌐 4. Ativando Webhooks (Opcional, mas Recomendado)

Para que o site "avise" o seu sistema sobre vendas em tempo real:
1.  Use o **ngrok** para gerar um link público para o seu PC: `ngrok http 3001`.
2.  No Portal de Parceiros da NuvemShop, cadastre a URL de Webhook: `https://seu-link-ngrok.io/api/webhook/order`.

---

## 📝 5. Dicas de Segurança
*   **Leitura**: O sistema nunca escreverá nada no seu banco `unico`.
*   **Banco Local**: Toda a inteligência da integração está no banco `integracao_nuvemshop`. Faça backup desse banco ocasionalmente.
*   **SKU**: Use sempre o SKU do Uniplus como identificador único para evitar duplicidade.
