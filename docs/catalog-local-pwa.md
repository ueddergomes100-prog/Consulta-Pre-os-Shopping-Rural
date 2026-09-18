# Catálogo local e aplicativo desktop

## Servidor

Execute `node src/catalog-public-server.js` na raiz do projeto. A porta padrão
é 3010 e o servidor escuta em `0.0.0.0`. Ele serve somente o catálogo e seus
endpoints públicos, sem disponibilizar o painel da integração na rota raiz.

No próprio computador: `http://localhost:3010/catalogo`.
Nos demais dispositivos da mesma rede: `http://IP-DO-SERVIDOR:3010/catalogo`.
Medicamentos: acrescente `/medicamentos`.

Liberação do Firewall do Windows, em PowerShell como administrador:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\enable-catalog-lan.ps1
```

A regra permite somente TCP 3010 para o Node na sub-rede local. Não abre a porta
do PostgreSQL. Não exige encaminhamento de portas no roteador nem túnel público.
Reserve o IP no DHCP do roteador para manter os atalhos dos outros dispositivos
funcionando. O computador, a API e o banco precisam permanecer disponíveis.

## Desktop / PWA

`scripts/windows/install-catalog-desktop.ps1` cria um atalho do Windows que abre
o catálogo em uma janela própria do Edge (ou Chrome). Isso é um atalho em modo
aplicativo, não uma confirmação de instalação do PWA pelo navegador.

O botão **Instalar aplicativo** usa o convite de instalação do navegador quando
disponível. O manifesto inclui nome, logo, modo standalone e atalho para
medicamentos. Há service worker somente em contexto seguro e no build de produção.

- `localhost`/`127.0.0.1`: permite PWA neste computador sem certificado.
- HTTP por IP da rede: consulta online funciona; não permite service worker ou
  instalação PWA promovida pelo manifesto. O Edge permite instalar o site como
  aplicativo pelo menu. Não desative as proteções do navegador.
- PWA completo pelo IP: requer HTTPS com certificado confiável em cada cliente.

O service worker guarda somente interface, scripts, estilos e logo. **Nunca
armazena respostas da API nem preços/estoque.** Sem conexão, a interface mostra
o aviso e remove produtos da tela. Novos builds recebem um cache próprio; a nova
versão passa a controlar o app quando as janelas da versão anterior fecham.

Ícones: `node scripts/generate-catalog-icons.js`.
Build: `cd frontend; node node_modules/vite/bin/vite.js build`.
