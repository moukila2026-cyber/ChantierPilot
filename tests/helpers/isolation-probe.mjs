// Vérifie seulement la présence des noms : aucune valeur n'est affichée.
const forbidden = [
  'DATABASE_URL', 'DATABASE_URL_ADMIN', 'RESEND_API_KEY', 'MAIL_FROM',
  'MAIL_WEBHOOK_URL', 'SASPAY_SECRET_KEY', 'VERCEL_TOKEN', 'CHANTIERPILOT_TEST_SENTINEL',
];
if (process.env.NODE_ENV !== 'test' || forbidden.some((name) => name in process.env)) {
  console.error('L’environnement enfant de test n’est pas isolé.');
  process.exit(1);
}
