# Documents joints et duplication

Les documents sont stockés dans PostgreSQL (colonne `bytea`), indépendamment du disque éphémère de Render. La migration 005 ajoute deux tables sans modifier les fiches existantes. Elle s’exécute dans la transaction du système de migrations.

## Documents

- Formats : DOC, DOCX, XLS, XLSX, PDF, PPT, PPTX, JPG, JPEG, PNG, WEBP.
- Limites : 5 Mo par fichier, 50 Mo par projet, 200 Mo au total. Les copies de documents comptent dans ces limites.
- Import multiple ou glisser-déposer, traitement individuel avec résultat pour chaque fichier.
- Nom original conservé ; seul le titre affiché peut être renommé.
- Consultation et téléchargement : membres autorisés du projet. Ajout, renommage et suppression : administrateur ou chef responsable.
- Contrôle de l’extension et de la signature du contenu. Les documents Office modernes doivent contenir une structure ZIP Office compatible, avec limites sur les entrées et la taille décompressée déclarée.
- Routes authentifiées, contrôle CSRF pour les écritures, réponses privées sans cache. Aperçu réservé aux PDF/images, avec CSP restrictive. Les documents ne sont jamais exécutés par le serveur.
- Suppression d’une copie indépendante de son original. Une suppression de projet entraîne la suppression de ses documents uniquement si les autres dépendances permettent déjà la suppression du projet.

## Duplication

Le formulaire prérempli prépare une nouvelle fiche ; Annuler ne crée rien. Un nouveau code modifiable est proposé. Le serveur génère l’identifiant lors de l’enregistrement.

- Projet : société et autres champs modifiables ; documents copiés uniquement sur demande ; modules et actions non copiés implicitement.
- Module : projet de destination modifiable ; le choix du module principal est remis à Aucun lors du changement de projet ; actions copiées uniquement sur demande. Leur pilote est conservé s’il est membre actif du projet de destination, sinon le chef de projet lui est substitué.
- Action : module de destination modifiable ; dates prévisionnelles conservées par défaut, ou ressaisies si la case est décochée. Statut, avancement, dates réelles, résultats, cause et actions correctives réinitialisés côté serveur.
- Historique et commentaires jamais recopiés. Les nouvelles fiches ont leur propre audit.
- Traçabilité durable : identifiants source/copie, auteur, date et lien vers la source si elle reste accessible.
- Clé de requête unique et empreinte du contenu : les répétitions d’un même enregistrement ne créent pas de doublon. Contrôle des permissions et transaction atomique pour toutes les copies optionnelles.

## Vérification

`npm run plans:test` vérifie notamment les formats, quotas, droits, téléchargements, copies indépendantes, relations et requêtes concurrentes.

`npm test` vérifie les formulaires et le blocage du double envoi.

Après `npm run build`, `node scripts/plans-documents-review.mjs` lance un parcours Edge isolé, sur une base en mémoire et sans identifiants réels. Il vérifie les trois duplications, les documents et l’affichage à 1440, 834 et 390 pixels, avec contrôles axe AA. Les captures locales sont produites dans `docs/plans-documents-review/`.

La liste partagée des emplacements inclut désormais **FSP ALGERIE**.
