import { useEffect, useRef, useState } from 'react';
import { Button } from './ui.jsx';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Les repères sont normalisés dans le repère de la page rendue, sans dépendre du zoom.
export default function PlanViewer({ plan, annotations, onMark, onResolve, admin }) {
  const canvas = useRef(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [size, setSize] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let loading = null;
    let render = null;
    let doc = null;
    setError('');
    setSize(null);
    setPages(1);

    (async () => {
      const res = await fetch(`/api/advanced?plan_file=${plan.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Impossible de charger le plan.');
      if (plan.mime === 'application/pdf') {
        const pdf = await import('pdfjs-dist');
        if (disposed) return;
        pdf.GlobalWorkerOptions.workerSrc = workerSrc;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (disposed) return;
        loading = pdf.getDocument({
          data: bytes,
          isEvalSupported: false,
          useWasm: false,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          wasmUrl: '/pdfjs/wasm/',
        });
        doc = await loading.promise;
        if (disposed) return;
        setPages(doc.numPages);
        const sheet = await doc.getPage(page);
        const base = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({ scale: Math.min(1.5, 2500 / base.width, 3500 / base.height) });
        if (disposed) return;
        const node = canvas.current;
        node.width = viewport.width;
        node.height = viewport.height;
        setSize({ width: viewport.width, height: viewport.height });
        render = sheet.render({ canvasContext: node.getContext('2d'), viewport });
        await render.promise;
      } else {
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        if (!disposed) {
          const node = canvas.current;
          const scale = Math.min(1, 2500 / bitmap.width, 3500 / bitmap.height);
          node.width = Math.ceil(bitmap.width * scale);
          node.height = Math.ceil(bitmap.height * scale);
          node.getContext('2d').drawImage(bitmap, 0, 0, node.width, node.height);
          setSize({ width: node.width, height: node.height });
        }
        bitmap.close();
      }
    })().catch((e) => {
      if (!disposed) setError(e.message);
    });

    return () => {
      disposed = true;
      render?.cancel();
      loading?.destroy().catch(() => {});
    };
  }, [plan.id, plan.mime, page]);

  const marks = annotations.filter((a) => a.plan_id === plan.id && a.page === page);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Page précédente</Button>
        <span className="text-sm font-bold tabular text-[#141210]">Page {page} / {pages}</span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Page suivante</Button>
        <a className="text-sm font-bold text-[#854d0e] underline" href={`/api/advanced?plan_file=${plan.id}`} target="_blank" rel="noreferrer">Original</a>
      </div>
      <p className="text-xs text-[#574f45]">
        Cliquez sur le plan pour ajouter une observation à cet emplacement. Les annotations restent attachées à cette révision, sans modifier l’original.
      </p>
      {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
      <div
        className="relative w-full overflow-hidden rounded-xl border border-[#eab956]/40 bg-white shadow-sm"
        style={size ? { aspectRatio: `${size.width}/${size.height}` } : { minHeight: 120 }}
        onClick={(e) => {
          if (!size) return;
          const r = e.currentTarget.getBoundingClientRect();
          onMark({
            page,
            x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
            y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
          });
        }}
      >
        <canvas ref={canvas} className="block h-auto w-full" aria-label={`Plan ${plan.title}, page ${page}`} />
        {marks.map((a, i) => (
          <span
            key={a.id}
            title={a.note}
            className={`pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-extrabold shadow-md ring-2 ${
              a.status === 'resolved'
                ? 'bg-emerald-600 text-white ring-white'
                : 'bg-[#e5a93b] text-[#141210] ring-[#141210]'
            }`}
            style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <Button variant="secondary" disabled={!size} onClick={() => onMark({ page, x: 0.5, y: 0.5 })}>
        Ajouter un repère au centre
      </Button>
      <ol className="space-y-2">
        {marks.map((a, i) => (
          <li key={a.id} className="rounded-xl border border-[#e3ddd0] bg-[#faf7f0] p-3 text-sm text-[#141210]">
            <strong>{i + 1}. {a.status === 'resolved' ? 'Résolue' : 'Ouverte'}</strong> — {a.note}
            {admin && a.status === 'open' && (
              <Button variant="secondary" className="ml-2 min-h-9 text-xs" onClick={() => onResolve(a.id)}>Résoudre</Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
