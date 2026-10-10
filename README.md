# Blosmile · Cabinets dentaires à Fontainebleau

Refonte locale complète, en français, du site du cabinet. L’identité reprend le logo original, son bleu nuit et son ivoire ; les photographies proviennent du site source. Le site fonctionne sans service externe de paiement, de réservation ni de stockage.

## Version GitHub Pages

- Site public : https://connected-mate.github.io/blosmile-fontainebleau/
- Dépôt : https://github.com/Connected-Mate/blosmile-fontainebleau

Chaque push sur `main` lance les 25 tests, vérifie le rendu puis publie uniquement le dossier statique généré. Le déploiement utilise GitHub Actions et GitHub Pages ; les actions sont fixées à leurs commits. Les pages, photos, polices, itinéraires et QR fonctionnent sans serveur applicatif. Les URL et métadonnées tiennent compte du sous-dossier du dépôt.

**Le back-office reste local.** GitHub Pages ne fait pas tourner Express ou SQLite. Les mots de passe, sessions, sauvegardes, fichiers `.env` et données de `.local` ne sont jamais exportés. Le site public ne contient pas de lien vers une administration indisponible. Les sources du back-office sont conservées dans ce dépôt pour son utilisation locale.

Pour publier des changements faits dans le back-office :

```sh
npm run sync:pages
npm test
npm run check
git add data/content.json public/assets
git commit -m "Mettre à jour le contenu du cabinet"
git push
```

`sync:pages` exporte le contenu courant de SQLite vers le fichier public de départ et copie uniquement les images importées référencées vers `public/assets/cms`. Il ne modifie pas la base locale. Relire les changements avant le commit. Le push déclenche ensuite la publication ; un enregistrement dans le back-office seul ne modifie pas le site GitHub Pages.

Pour contrôler le résultat statique avant un push :

```sh
PAGES_URL=https://connected-mate.github.io/blosmile-fontainebleau npm run build:pages
npm run preview:pages
```

L’aperçu utilise le port 4173 et le même sous-dossier que le site public. `PAGES_INDEXABLE=false` permet un export non indexable ; l’export public normal active l’indexation sur l’URL HTTPS réelle. Les variantes de choix QR et les anciennes adresses restent en noindex. Les anciennes URL sont des pages de redirection HTML, GitHub Pages ne permettant pas les redirections serveur personnalisées.

Les mentions d’hébergement et la confidentialité sont adaptées à GitHub Pages dans l’export uniquement. Les renseignements juridiques manquants restent indiqués. Un domaine personnalisé n’a pas été enregistré.

## Ouvrir le site local

- Site : http://127.0.0.1:3000
- Adresse et itinéraires : http://127.0.0.1:3000/venir
- Administration : http://127.0.0.1:3000/admin
- Identifiant initial : `admin`
- Mot de passe personnel à cette installation : fichier `.local/admin-access.txt`. Ce fichier est privé et n’est pas inclus dans l’archive du projet.

Pour démarrer après fermeture du serveur :

```sh
npm ci
npm start
```

Node.js **22.16 ou supérieur** est nécessaire (`node:sqlite`). La réalisation a été vérifiée avec Node 25.2.1. `npm run dev` redémarre le serveur lors des changements de code. Le serveur écoute uniquement sur `127.0.0.1` par défaut. Le back-office n’est pas hébergé publiquement ; le site vitrine est exporté vers GitHub Pages comme expliqué ci-dessus.

## Ce qui est livré

36 pages publiques : accueil complet, équipe (7 praticiens et 8 collaboratrices), cabinet et galerie, vue des soins, 4 pages détaillées, contact et horaires, adresse et itinéraires, FAQ, mentions légales, confidentialité, index des conseils et 22 fiches pédagogiques. Une véritable page 404 est également prévue.

141 médias originaux sont archivés, avec des alias descriptifs pour les photographies utilisées. Les polices sont hébergées localement et leurs licences conservées. L’accueil réunit les coordonnées, les horaires, les soins, les praticiens, le cabinet, le parcours de visite et les réponses aux questions pratiques.

Le back-office permet de modifier les textes, les photos, les fiches d’équipe, les soins, les articles, les coordonnées, les horaires et les paramètres SEO. Il comprend une médiathèque avec recherche/import, un éditeur JSON avancé, l’export, 100 versions restaurables et le changement de mot de passe. Les horaires affichés et les données structurées utilisent les mêmes plages d’ouverture.

## Adresse, itinéraires et téléphone

L’adresse cliquable sur l’accueil, l’en-tête, les pages de soins, le contact et le pied de page mène à `/venir`. Cette page propose Google Maps, Waze et Apple Plans, la copie d’adresse et une fiche contact `.vcf` à importer dans le carnet d’adresses.

Sur téléphone, les liens d’itinéraire sont prioritaires. Sur ordinateur, un panneau QR permet de choisir l’application à ouvrir sur le téléphone. Le QR est généré localement et encode directement le lien du service choisi : le téléphone n’a pas besoin d’accéder au serveur local. Les liens HTTPS peuvent ouvrir l’application installée ou sa version web, selon le système et ses réglages. Les liens, la fiche contact et le formulaire de choix du QR fonctionnent sans JavaScript.

Modifier **Votre cabinet → Adresse / Code postal / Ville** met à jour les itinéraires, QR, fiche contact et données structurées. Les métadonnées préremplies utilisent les variables `{{address}}`, `{{postalCode}}`, `{{city}}` et `{{phone}}` ; les conserver permet aux coordonnées de rester synchronisées. Un texte libre saisi sans variable reste un texte personnalisé.

La navigation mobile, le carrousel et la galerie ont été renforcés : clavier, restitution du focus, défilement borné, respect du mouvement réduit, affichage tactile et replis pour les API absentes. Contrôles visuels dans le navigateur intégré aux largeurs 320, 390, 701, 768 et ordinateur ; ce contrôle ne remplace pas des essais sur iPhone/Android physiques et sur chaque moteur Safari/Firefox/Chrome/Edge. L’ouverture d’applications natives doit encore être confirmée sur ces appareils.

## Modifier le contenu

1. Ouvrir `/admin` et se connecter.
2. Choisir la rubrique dans la colonne de gauche.
3. Modifier les champs, ajouter ou réordonner les éléments. Pour les horaires, utiliser les champs ouverture/fermeture ; sans plage, le jour est fermé.
4. Cliquer sur **Enregistrer**. Les modifications sont immédiatement persistées dans SQLite et visibles après actualisation du site.
5. Utiliser **Historique** pour revenir à une version précédente ou **Réglages et sauvegarde** pour exporter le contenu.

Les boutons de rendez-vous utilisent le lien de rendez-vous configuré ; par défaut, ils appellent le secrétariat. Aucun faux créneau en ligne n’est proposé. Les liens e-mail et itinéraire ouvrent les applications correspondantes.

Les images importées sont conservées dans `.local/uploads`. L’export JSON contient les chemins des médias, pas leurs fichiers. Le contenu actif vit dans `.local/blosmile.sqlite` ; `data/content.json` est uniquement le contenu de première installation. Le modifier ne remplace pas les modifications déjà enregistrées.

## Vérifications et entretien

```sh
npm test
npm run check
npm run health
npm run backup
```

- `test` vérifie les parcours serveur, l’authentification, les droits, CSRF, les versions, les imports, le rendu des vraies pages, les liens internes et le référencement.
- `check` rend les 37 vues (404 comprise), valide le contenu et contrôle l’existence des médias.
- `health` vérifie les principales adresses du serveur démarré.
- `backup` crée une copie cohérente de SQLite, un export JSON et une copie des médias dans `.local/backups/<date>`. Les sessions sont retirées de la sauvegarde. Cette opération fonctionne pendant que le serveur tourne.

Conserver régulièrement une copie du projet et des sauvegardes sur un autre support. L’archive de livraison contient le code et le contenu initial, sans mots de passe, sessions ni dépendances installées. Pour restaurer complètement une sauvegarde, arrêter le serveur, conserver une copie de `.local`, remplacer sa base SQLite par celle de la sauvegarde et son dossier `uploads`, puis redémarrer. Supprimer les anciens fichiers `blosmile.sqlite-wal` et `blosmile.sqlite-shm` uniquement après l’arrêt du serveur et après avoir sauvegardé le dossier complet. Les médias d’origine sont aussi présents dans le dossier `assets` de chaque sauvegarde.

`npm run reset-admin` crée un nouvel accès et invalide les anciennes sessions. Le serveur ne contient aucune donnée patient et le CMS n’est pas un logiciel de dossiers médicaux. Aucune tâche récurrente externe n’a été installée : les commandes d’entretien sont disponibles à la demande.

## Bilan de la livraison locale

Le contrôle de la livraison locale validait 20 tests automatisés, 37 vues HTML (dont la 404), les médias référencés et 15 adresses opérationnelles. Les trois QR codes sont décodés par un lecteur indépendant et testés après changement d’adresse. L’accueil a été contrôlé dans le navigateur sur ordinateur et aux largeurs mobiles 320 et 390 pixels ; menu, galerie, carrousel, FAQ et enregistrement depuis l’administration ont été exercés. La sauvegarde a été vérifiée : JSON identique à sa base SQLite et aucune session conservée.

40 agents ont réellement participé au total : 32 dans la première réalisation, puis 8 dans la passe d’amélioration suivante. Le plafond rencontré lors de la première passe et les audits alors traités directement restent documentés dans les rapports historiques. Les rapports datés sont dans `research/audits` ; certains conservent les constats initiaux, avant correction. Le bilan initial est dans `research/delivery-verification.txt` ; le bilan actualisé est dans `research/refinement-delivery.txt`.

## Référencement local et moteurs de réponse

Le nom retenu est **Blosmile — Cabinets dentaires à Fontainebleau**, en conservant la marque existante. Proposition de domaine court : **blosmile-fontainebleau.fr** ; disponibilité et droits non vérifiés, domaine non enregistré.

Le référencement technique comprend : rendu HTML côté serveur, titres et descriptions individuels, liens canoniques, Open Graph, JSON-LD (`Dentist`, coordonnées, horaires, équipe, soins, FAQ, articles et fil d’Ariane), sitemap, robots et fichier de synthèse `/llms.txt`. Les liens historiques des rubriques et des 22 articles redirigent vers les nouvelles adresses.

**La version locale est volontairement non indexable.** Avant publication, renseigner le domaine réellement utilisé dans **Référencement → Domaine officiel**, puis activer l’indexation. `SITE_URL` peut remplacer cette valeur côté serveur. En local, le sitemap est vide ; il se remplit lorsque le domaine public et l’indexation sont configurés.

Après mise en ligne : vérifier le site dans Search Console, soumettre le sitemap, maintenir les coordonnées de la fiche Google Business Profile, reprendre les redirections sur l’ancien domaine et suivre les performances réelles. Les fonctionnalités IA de Google ne nécessitent pas de balisage spécial ; `/llms.txt` est une aide documentaire, pas une garantie de visibilité. Aucune position ni citation dans un moteur de réponse ne peut être garantie. Plan sourcé : `research/07-seo-plan.txt`.

## Informations du cabinet restant à valider

Le site source consulté le 10 octobre 2026 affiche **192 rue Grande**, alors que le nom de domaine comporte 194. Les coordonnées et les diplômes publiés ont été repris à partir de cette source ; ils doivent être confirmés par le cabinet pour la mise en ligne.

Le SIRET, la dénomination sociale exacte, les identifiants professionnels et l’hébergement public du nouveau site ne sont pas établis dans la source exploitable : les champs existent dans le CMS et ne sont pas inventés. Les identifiants de l’ancien éditeur ENPS n’ont pas été attribués au cabinet. Les droits sur les médias et les textes pédagogiques doivent être validés par le cabinet. Les fiches sont des synthèses originales sourcées ; elles ne prétendent pas à une validation médicale déjà obtenue.

GitHub Pages fournit l’hébergement HTTPS de la version publique. Un domaine personnalisé, les accès Search Console/Google Business et la validation finale des mentions restent à compléter.

## Organisation du projet

- `server/` : Express, SQLite, authentification, API et référencement.
- `views/` : templates HTML rendus côté serveur.
- `public/` : design, scripts, médias originaux et back-office.
- `data/` : données de première installation.
- `tests/`, `scripts/` : tests et entretien.
- `research/` : rapports et sources archivés dans le workspace local, exclus du dépôt public.
- `.local/` : données actives et accès privés, exclus de Git et de l’archive.

Documentation technique complémentaire : `server/README.md`.
