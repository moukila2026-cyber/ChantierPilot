// Visionneuse modale intégrée des pièces justificatives (photos zoomables & PDF).

import { useEffect, useState } from 'react';
import { Alert, Button, Modal } from './ui.jsx';

export function AttachmentPreviewModal({ item, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [mime, setMime] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!item?.url) return undefined;
    let active = true;
    let createdUrl = null;
    setLoading(true);
    setErr('');
    setZoom(1);

    fetch(item.url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Impossible de charger la pièce justificative.');
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);
        if (active) {
          setMime(blob.type || item.mime || '');
          setBlobUrl(createdUrl);
        }
      })
      .catch((e) => {
        if (active) setErr(e.message || 'Lecture impossible.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [item]);

  if (!item) return null;
  const isPdf = mime.includes('pdf') || /\.pdf$/i.test(item.filename || '');

  return (
    <Modal open={Boolean(item)} onClose={onClose} title={item.title || item.filename || 'Pièce justificative'} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee8db] pb-3">
          <p className="max-w-md truncate text-xs font-medium text-[#574f45]">
            {item.filename || 'Document justificatif'}
          </p>
          <div className="flex items-center gap-2">
            {!isPdf && blobUrl && (
              <>
                <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
                  −
                </Button>
                <span className="w-12 text-center text-xs font-bold tabular text-[#141210]">
                  {Math.round(zoom * 100)} %
                </span>
                <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
                  +
                </Button>
              </>
            )}
            <a href={item.url} target="_blank" rel="noreferrer">
              <Button className="min-h-9 px-3.5 py-1 text-xs">Télécharger l’original</Button>
            </a>
          </div>
        </div>

        {loading && (
          <div className="py-14 text-center text-sm font-medium text-[#574f45]">
            Chargement du justificatif…
          </div>
        )}
        {err && <Alert type="error">{err}</Alert>}
        {!loading && !err && blobUrl && (
          isPdf ? (
            <iframe
              title={item.filename || 'Aperçu PDF'}
              src={blobUrl}
              className="h-[65vh] w-full rounded-xl border border-[#e3ddd0] bg-[#faf7f0]"
            />
          ) : (
            <div className="flex max-h-[68vh] items-center justify-center overflow-auto rounded-xl border border-[#e3ddd0] bg-[#141210]/5 p-3">
              <img
                src={blobUrl}
                alt={item.filename || 'Justificatif'}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
                className="max-w-full rounded-lg shadow transition-transform"
              />
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
