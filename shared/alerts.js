// Aide à la décision : les soldes ne constituent pas des créances certifiées.
export function projectAlerts(projects, today = new Date().toISOString().slice(0, 10)) {
  return projects.flatMap(p => {
    const alerts = [];
    const budget = Number(p.budget), expenses = Number(p.expenses_total), received = Number(p.payments_total);
    const add = (kind, title, action) => alerts.push({ project_id: p.id, project_name: p.name, kind, title, action });
    if (expenses > budget) add('danger', 'Budget dépassé', 'Vérifier les achats et valider un avenant avant de nouvelles dépenses.');
    else if (budget > 0 && expenses >= budget * .8 && p.status !== 'termine') add('warning', '80 % du budget consommé', 'Comparer les dépenses restantes aux travaux encore à réaliser.');
    if (expenses > received) add('warning', 'Trésorerie chantier négative', 'Contrôler les avances et préparer une demande de règlement au client.');
    const end = p.end_date ? String(p.end_date).slice(0, 10) : null;
    if (end && end < today && !['termine','archive'].includes(p.status)) add('danger', 'Date de fin dépassée', 'Replanifier avec le chef de chantier et informer le client.');
    if (p.status === 'termine' && budget > received) add('warning', 'Chantier terminé, solde déclaré restant', 'Vérifier le montant contractuel et les paiements avant de relancer le client.');
    return alerts;
  }).sort((a,b) => (a.kind === 'danger' ? 0 : 1) - (b.kind === 'danger' ? 0 : 1));
}
