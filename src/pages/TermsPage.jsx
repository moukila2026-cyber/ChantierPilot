import { Link } from 'react-router-dom';
import { Card, Footer } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

const sections = [
  {
    title: '1. Objet et acceptation',
    paragraphs: [
      'Les présentes conditions encadrent l’accès à ChantierPilot, un outil de suivi opérationnel de chantiers destiné aux entreprises du BTP. En créant un compte ou en utilisant le service, l’utilisateur reconnaît en avoir pris connaissance pour le compte de son entreprise.',
      'Les forfaits et quotas sont affichés dans Offres & tarifs. L’essai gratuit dure 14 jours sans carte. Chaque paiement SasPay confirmé ouvre 30 jours d’accès en modification. Le renouvellement nécessite une validation du client : il ne s’agit pas d’un prélèvement récurrent. Les frais éventuels sont présentés par SasPay avant validation. Import et formation sont facultatifs, sur devis. À expiration ou suspension, l’espace passe en lecture seule avec exports disponibles, sans suppression des données.',
    ],
  },
  {
    title: '2. Comptes et responsabilités des utilisateurs',
    paragraphs: [
      'L’entreprise fournit des informations exactes, maintient la confidentialité de ses identifiants et limite les accès aux personnes qu’elle autorise. Toute action effectuée au moyen d’un compte est réputée réalisée sous la responsabilité de son entreprise, sauf preuve contraire.',
      'L’utilisateur s’engage à ne pas tenter d’accéder aux données d’une autre entreprise, perturber le service, contourner ses contrôles de sécurité ni y déposer un contenu illicite ou malveillant.',
    ],
  },
  {
    title: '3. Données de chantier et justificatifs',
    paragraphs: [
      'L’entreprise demeure responsable de l’exactitude, de la licéité et de la conservation de ses données et pièces. ChantierPilot permet de consigner des budgets, dépenses, encaissements déclarés, références et justificatifs ; il ne vérifie pas auprès d’une banque, d’un client ou d’un fournisseur la réalité d’une opération.',
      'Un encaissement n’est signalé comme prouvé dans l’application que lorsqu’un justificatif est joint. Une référence seule documente une déclaration, mais ne constitue pas une preuve contrôlée par ChantierPilot. Les rapports générés sont des documents de suivi et ne sont ni une certification comptable, ni un conseil fiscal, juridique ou financier.',
    ],
  },
  {
    title: '4. Données personnelles et confidentialité',
    paragraphs: [
      'Les données de compte, les coordonnées professionnelles, les informations de chantier, le journal d’activité et les pièces jointes sont traités pour fournir, sécuriser et administrer le service. Les accès sont cloisonnés par entreprise selon les mécanismes techniques prévus par l’application.',
      'L’entreprise s’assure qu’elle dispose des droits nécessaires pour saisir les informations personnelles de ses salariés, clients, fournisseurs et autres interlocuteurs. Pour toute demande concernant les données, l’entreprise peut contacter l’éditeur via les coordonnées indiquées ci-dessous. Les modalités complètes de protection des données doivent être précisées dans une politique de confidentialité dédiée.',
    ],
  },
  {
    title: '5. Disponibilité, maintenance et évolution',
    paragraphs: [
      'Le service est fourni selon le périmètre effectivement mis à disposition. Des interruptions peuvent survenir pour maintenance, mise à jour ou incident technique. Aucun taux de disponibilité ni délai de rétablissement n’est garanti par les présentes conditions ; ces engagements nécessitent un accord écrit distinct.',
      'L’éditeur peut faire évoluer les fonctions pour des motifs de sécurité, de maintenance ou d’amélioration. Il s’efforcera de préserver les fonctions essentielles et d’informer les entreprises des changements importants.',
    ],
  },
  {
    title: '6. Propriété intellectuelle',
    paragraphs: [
      'Le logiciel, son interface, ses éléments graphiques et sa documentation restent protégés par les droits applicables. Sous réserve du respect des présentes conditions et de l’accord commercial applicable, l’entreprise dispose d’un droit d’accès personnel, non exclusif et non transférable pendant la durée de son utilisation autorisée.',
      'L’entreprise conserve ses droits sur les données et documents qu’elle fournit. Elle autorise leur traitement uniquement dans la mesure nécessaire à l’exploitation du service.',
    ],
  },
  {
    title: '7. Limitation du rôle du service',
    paragraphs: [
      'ChantierPilot est un outil de gestion et de suivi. Les paiements d’abonnement au logiciel sont traités par SasPay ; les encaissements des chantiers restent des déclarations. Il ne tient pas une comptabilité complète, ne certifie pas les pièces et ne remplace pas les contrôles de l’entreprise ni les conseils de professionnels qualifiés.',
      'Dans les limites permises par le droit applicable, l’éditeur ne répond pas des décisions prises sur la base de données erronées ou incomplètes saisies par l’entreprise, ni de la perte indirecte résultant d’un usage non conforme. Aucune disposition n’exclut une responsabilité qui ne peut légalement l’être.',
    ],
  },
  {
    title: '8. Suspension et fin d’accès',
    paragraphs: [
      'L’accès peut être suspendu si la sécurité du service ou d’autres utilisateurs est menacée, en cas d’usage illicite ou selon les conditions commerciales convenues. Dans la mesure du possible, l’entreprise sera informée et pourra corriger le manquement.',
      'Les modalités de résiliation, de restitution et de suppression des données sont celles prévues dans l’accord commercial applicable ou, à défaut, convenues avec l’éditeur. L’entreprise devrait exporter les données nécessaires avant la fin de son accès.',
    ],
  },
  {
    title: '9. Droit applicable et contact',
    paragraphs: [
      'Les présentes conditions sont régies par le droit applicable en Côte d’Ivoire. Les parties chercheront d’abord une solution amiable à tout différend ; à défaut, celui-ci sera porté devant les juridictions compétentes conformément aux règles applicables.',
      'Pour toute question relative au service ou aux présentes conditions, contactez SHOPIN30 au +225 05 01 30 33 43.',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo compact inverted to="/" />
          <Link to="/connexion" className="text-sm font-medium text-slate-300 hover:text-white">Connexion</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Conditions générales d’utilisation</h1>
        <p className="mt-2 text-sm text-slate-500">Version du 17 octobre 2026 · Service ChantierPilot</p>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>À valider avant commercialisation :</strong> l’identité juridique complète de l’éditeur (raison sociale, adresse et immatriculation) ainsi que la politique de confidentialité doivent être complétées et vérifiées avant la mise en production commerciale.
        </div>
        <div className="mt-6 space-y-4">
          {sections.map(({ title, paragraphs }) => (
            <Card key={title}>
              <h2 className="font-bold text-slate-900">{title}</h2>
              {paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-6 text-slate-600">{paragraph}</p>)}
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link to="/offres" className="font-semibold text-amber-700 underline">Consulter les offres</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
