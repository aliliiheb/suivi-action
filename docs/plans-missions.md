# Gestion des missions

Le menu Missions propose la création, la recherche, les filtres, les indicateurs,
la consultation, la modification, la duplication et l'archivage des missions.
Chaque mission possède un numéro unique, une société, un responsable, une équipe,
un emplacement, des dates prévisionnelles et effectives, un statut et une priorité.

## Relations et conservation des données

Une mission peut réunir plusieurs projets, modules et actions d'une même société.
Chaque fiche possède une association facultative à une mission. Le projet principal
de la mission est facultatif ; les associations restent explicites et ne se propagent
pas automatiquement aux enfants. Les sélecteurs permettent de rechercher, créer et
modifier une mission sans perdre la saisie du formulaire parent.

Les anciens numéros de mission des actions sont conservés. Le rapprochement se fait
explicitement depuis la mission ou la fiche Action. Aucun rapprochement incertain
n'est exécuté lors de la migration. Les exports Word et Excel affichent les numéros
actualisés et les liens vers les missions accessibles.

La migration 006 ajoute les tables, colonnes générées et contraintes de relations
sans réécrire les fiches existantes. Elle est appliquée dans une transaction au
démarrage. Ne pas supprimer ces tables ou colonnes pour revenir à une ancienne
version : conserver une sauvegarde de la base et procéder à une correction additive.

## Autorisations et documents

Les administrateurs et chefs responsables peuvent gérer une mission. Les membres
et utilisateurs ayant accès au projet principal peuvent la consulter et commenter.
Associer une fiche exige également le droit de modifier cette fiche ; les relations
entre sociétés différentes sont refusées. Une mission archivée reste consultable.

Les documents sont stockés dans PostgreSQL, avec accès authentifié, validation du
format et du contenu, prévisualisation PDF/images, renommage et téléchargement.
Limites : 5 Mo par fichier, 50 Mo par projet ou mission, 200 Mo au total.

La duplication crée une fiche indépendante avec un nouveau numéro. Elle réinitialise
le suivi effectif et ne recopie ni associations, ni documents, ni commentaires.
La provenance et les changements d'association sont conservés dans l'historique.

## Vérifications

- `npm run plans:test` : 27 tests serveur, migrations et droits compris.
- `npm test` : 95 tests front-end et intégration.
- `npm run build` : contrôle TypeScript et compilation de production.
- `node scripts/plans-missions-review.mjs` : parcours navigateur local, formulaires
  imbriqués, documents, copie, associations, archivage, navigation et contrôles
  d'accessibilité sur ordinateur, tablette et téléphone.
- `node scripts/plans-documents-review.mjs` : non-régression des documents et
  duplications de projets, modules et actions.

Les scripts de revue utilisent une base locale isolée et ne créent pas de données
de démonstration dans la base de production.
