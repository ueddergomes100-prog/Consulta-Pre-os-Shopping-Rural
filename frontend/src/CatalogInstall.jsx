import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';

export default function CatalogInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const dialogRef = useRef(null);

  useEffect(() => {
    const ready = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const complete = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', complete);
    if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/catalog-sw.js', { scope: '/catalogo' }).catch(() => {
        // A instalação é opcional; uma falha não impede consultar o catálogo online.
      });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) { dialogRef.current?.showModal(); return; }
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      dialogRef.current?.showModal();
    } finally { setInstallPrompt(null); }
  };

  if (installed) return null;
  return (
    <>
      <button type="button" className="catalog-button catalog-install" onClick={install}>
        <Download size={16} /> Instalar aplicativo
      </button>
      <dialog ref={dialogRef} className="catalog-install-dialog" aria-labelledby="catalog-install-title">
        <form method="dialog"><button type="submit" aria-label="Fechar instruções"><X size={20} /></button></form>
        <h2 id="catalog-install-title">Shopping Rural no desktop</h2>
        <p>No Microsoft Edge, abra o menu <b>… → Mais ferramentas → Aplicativos → Instalar este site como aplicativo</b>.</p>
        <p>No Chrome, procure <b>Instalar</b> na barra de endereço ou no menu do navegador.</p>
        {!window.isSecureContext && <p>Você está acessando por IP na rede local. A instalação completa do PWA exige HTTPS; neste endereço, use a opção do Edge para abrir o site como aplicativo.</p>}
        <p>O computador da loja precisa estar ligado e conectado. Preços e estoque precisam de conexão com a loja.</p>
      </dialog>
    </>
  );
}
