import { useState } from 'react';
import { Button, Modal } from './ui.jsx';

export function AttachmentPreviewModal({
  item = null,
  open,
  title,
  url,
  downloadUrl,
  mime,
  filename,
  onClose,
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const resolved = item || (open && url ? { title, url, downloadUrl, mime, filename } : null);
  if (!resolved) return null;

  const targetUrl = resolved.url || '';
  const targetDownload = resolved.downloadUrl || targetUrl;
  const targetMime = String(resolved.mime || '');
  const targetName = resolved.title || resolved.filename || 'Pièce justificative';
  const isPdf = targetMime === 'application/pdf' || /\.pdf(\?|$)/i.test(targetName) || /\.pdf(\?|$)/i.test(targetUrl);

  return (
    <Modal open={Boolean(resolved)} title={targetName} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ded7c7] bg-[#faf7f0] px-3.5 py-2.5">
          {!isPdf ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="secondary" className="min-h-9 px-3 py-1 text-sm font-extrabold" title="Réduire" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                −
              </Button>
              <span className="min-w-14 text-center text-xs font-extrabold tabular text-[#141210]">
                {Math.round(zoom * 100)} %
              </span>
              <Button variant="secondary" className="min-h-9 px-3 py-1 text-sm font-extrabold" title="Agrandir" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
                +
              </Button>
              <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => setRotation((r) => (r + 90) % 360)}>
                ↻ Pivoter
              </Button>
              {(zoom !== 1 || rotation !== 0) && (
                <Button variant="ghost" className="min-h-9 px-2.5 py-1 text-xs" onClick={() => { setZoom(1); setRotation(0); }}>
                  Réinitialiser
                </Button>
              )}
            </div>
          ) : (
            <span className="text-xs font-bold text-[#574f45]">Document PDF haute définition</span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={targetUrl}
              target="_blank"
              rel="noreferrer"
              className="cp-btn cp-btn-secondary min-h-9 px-3 py-1 text-xs"
            >
              Nouvel onglet ↗
            </a>
            <a
              href={targetDownload}
              download={resolved.filename || true}
              className="cp-btn cp-btn-primary min-h-9 px-3.5 py-1 text-xs"
            >
              ⬇ Télécharger
            </a>
          </div>
        </div>

        <div className="max-h-[68vh] overflow-auto rounded-2xl border border-[#ded7c7] bg-[#141210] p-3 text-center">
          {isPdf ? (
            <iframe
              src={targetUrl}
              title={targetName}
              className="h-[62vh] w-full rounded-xl bg-white"
            />
          ) : (
            <div className="flex min-h-64 items-center justify-center overflow-auto py-2">
              <img
                src={targetUrl}
                alt={targetName}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.18s ease',
                }}
                className="mx-auto max-h-[60vh] max-w-full rounded-lg object-contain shadow-lg"
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
