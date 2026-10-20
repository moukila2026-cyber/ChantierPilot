import { useState } from 'react';
import heroHashedJpg from '../assets/btp-hero-abidjan.jpg';
import terrainHashedJpg from '../assets/btp-equipe-terrain.jpg';
import budgetHashedJpg from '../assets/btp-suivi-budget.jpg';

export const BTP_VISUALS = {
  hero: {
    hashed: heroHashedJpg,
    webp: '/images/landing/chantier-abidjan.webp',
    jpg: '/images/landing/chantier-abidjan.jpg',
    width: 1280,
    height: 714,
    defaultAlt: 'Deux responsables du BTP vérifiant un plan et le suivi d’un chantier à Abidjan',
  },
  terrain: {
    hashed: terrainHashedJpg,
    webp: '/images/landing/equipe-terrain.webp',
    jpg: '/images/landing/equipe-terrain.jpg',
    width: 1280,
    height: 796,
    defaultAlt: 'Chef de chantier et équipe d’armature contrôlant l’avancement sur le terrain à Abidjan',
  },
  budget: {
    hashed: budgetHashedJpg,
    webp: '/images/landing/suivi-budget.webp',
    jpg: '/images/landing/suivi-budget.jpg',
    width: 1280,
    height: 714,
    defaultAlt: 'Bureau de conduite de travaux BTP avec plans roulés, casque de sécurité et dossiers chantier',
  },
};

export default function BtpVisual({
  kind = 'hero',
  alt,
  className = 'h-56 w-full object-cover object-center',
  eager = false,
}) {
  const asset = BTP_VISUALS[kind] || BTP_VISUALS.hero;
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const sources = [asset.hashed, asset.jpg];
  const currentSrc = sources[Math.min(fallbackIndex, sources.length - 1)];

  return (
    <picture className="block w-full bg-[#181512]">
      {fallbackIndex === 0 && <source srcSet={asset.webp} type="image/webp" />}
      <img
        src={currentSrc}
        alt={alt || asset.defaultAlt}
        width={asset.width}
        height={asset.height}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding={eager ? 'sync' : 'async'}
        onError={() => {
          if (fallbackIndex < sources.length - 1) setFallbackIndex((i) => i + 1);
        }}
        className={className}
      />
    </picture>
  );
}
