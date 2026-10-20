// Aide à la décision : les soldes ne constituent pas des créances certifiées.

function isoDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

export function retentionAmount(project) {
  const bps = Number(project?.retention_bps || 0);
  if (bps <= 0) return 0;
  return Math.round((Number(project?.budget || 0) * bps) / 10000);
}

export function projectAlerts(projects, today = new Date().toISOString().slice(0, 10)) {
  return projects.flatMap((p) => {
    const alerts = [];
    const budget = Number(p.budget);
    const expenses = Number(p.expenses_total);
    const received = Number(p.payments_total);
    const add = (kind, title, action) => alerts.push({ project_id: p.id, project_name: p.name, kind, title, action });
    if (expenses > budget) add('danger', 'Budget dépassé', 'Vérifier les achats et valider un avenant avant de nouvelles dépenses.');
    else if (budget > 0 && expenses >= budget * 0.8 && p.status !== 'termine') add('warning', '80 % du budget consommé', 'Comparer les dépenses restantes aux travaux encore à réaliser.');
    if (expenses > received) add('warning', 'Trésorerie chantier négative', 'Contrôler les avances et préparer une demande de règlement au client.');
    const end = isoDate(p.end_date);
    if (end && end < today && !['termine', 'archive'].includes(p.status)) add('danger', 'Date de fin dépassée', 'Replanifier avec le chef de chantier et informer le client.');
    if (p.status === 'termine' && budget > received) add('warning', 'Chantier terminé, solde déclaré restant', 'Vérifier le montant contractuel et les paiements avant de relancer le client.');
    const retDate = isoDate(p.retention_release_date);
    const retAmt = retentionAmount(p);
    if (retAmt > 0 && !p.retention_released && retDate && retDate <= today) {
      add('warning', 'Retenue de garantie libérable', `Mainlevée prévue le ${retDate} (${retAmt.toLocaleString('fr-FR')} FCFA à réclamer au maître d’ouvrage).`);
    }
    return alerts;
  }).sort((a, b) => (a.kind === 'danger' ? 0 : 1) - (b.kind === 'danger' ? 0 : 1));
}

export function operationalAlerts({
  overdueInvoices = [],
  overpaidSubcontracts = [],
  openAdvances = [],
  lowStock = [],
} = {}) {
  const alerts = [];
  for (const inv of overdueInvoices) {
    alerts.push({
      project_id: inv.project_id || null,
      href: '/documents',
      project_name: inv.number || 'Facturation',
      kind: 'danger',
      title: 'Facture échue non soldée',
      action: `${inv.client_name} — ${Number(inv.remaining || 0).toLocaleString('fr-FR')} FCFA restant à encaisser.`,
    });
  }
  for (const sub of overpaidSubcontracts) {
    alerts.push({
      project_id: sub.project_id,
      project_name: sub.project_name || sub.subcontractor_name,
      kind: 'danger',
      title: `Avance sous-traitant supérieure à l’avancement (${sub.trade_lot})`,
      action: `${sub.subcontractor_name} : ${sub.paid_pct} % réglé pour ${sub.progress} % d’avancement constaté.`,
    });
  }
  for (const adv of openAdvances) {
    alerts.push({
      project_id: adv.project_id,
      href: '/terrain',
      project_name: adv.project_name || 'Caisse chantier',
      kind: 'warning',
      title: 'Avance de caisse ouverte à justifier',
      action: `${Number(adv.remaining || 0).toLocaleString('fr-FR')} FCFA restant à justifier ou restituer.`,
    });
  }
  for (const item of lowStock) {
    alerts.push({
      project_id: item.project_id || null,
      href: '/terrain',
      project_name: item.name,
      kind: 'warning',
      title: 'Stock chantier sous le seuil minimum',
      action: `Disponible ${(Number(item.available_milli || 0) / 1000).toLocaleString('fr-FR')} ${item.unit} (seuil ${(Number(item.minimum_milli || 0) / 1000).toLocaleString('fr-FR')} ${item.unit}).`,
    });
  }
  return alerts;
}
