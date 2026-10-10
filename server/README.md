# Serveur et administration Blosmile

Le site est rendu côté serveur avec Express et EJS. Le contenu publié est conservé dans SQLite, dans `.local/blosmile.sqlite`. Les modifications du back-office sont persistantes et chaque enregistrement crée une révision (100 versions conservées).

## Démarrage

Node.js 22.16 ou supérieur, avec `node:sqlite`, est requis. Exécuter `npm install`, puis `npm start`. Par défaut, le serveur écoute uniquement `http://127.0.0.1:3000`. `npm run dev` active le redémarrage automatique lors des changements de code.

À la première ouverture, `data/content.json` est importé une seule fois. Si les articles sont absents de ce document, `data/articles.json` est ajouté au contenu initial. Ensuite, la base devient la source du contenu publié : modifier directement le fichier de départ ne remplace pas les modifications de l’administration.

Le back-office est disponible sur `/admin`. Le nom initial est `admin`. Un mot de passe aléatoire est écrit dans `.local/admin-access.txt`, avec les permissions privées `0600`, sans affichage dans les journaux. Modifier ce mot de passe dans **Réglages et sauvegarde** supprime ce fichier et déconnecte les autres sessions. `npm run reset-admin` crée un nouvel accès et révoque toutes les sessions. Le répertoire `.local` doit rester exclu de Git et de tout répertoire servi publiquement.

## Utilisation

La navigation donne accès aux coordonnées, à l’accueil, à l’équipe, aux soins, aux questions fréquentes, aux pages, aux mentions, au référencement et aux articles. Tous les champs du document sont éditables, y compris les champs ajoutés à l’avenir via l’éditeur JSON. Les collections permettent ajout, suppression et changement d’ordre. **Enregistrer** applique les modifications au site immédiatement, après validation.

La médiathèque accepte un fichier JPEG, PNG, WebP ou GIF de 8 Mo maximum ; les signatures binaires sont contrôlées et le SVG est refusé. Les imports sont stockés dans `.local/uploads`, avec des noms aléatoires. Les champs images disposent d’un sélecteur. Les images d’origine dans `public/assets` peuvent aussi être utilisées en renseignant leur chemin, par exemple `/assets/cabinet-soins.jpeg`.

L’historique restaure une version en créant une nouvelle révision ; la version précédente reste accessible. L’export JSON conserve le contenu, mais pas les fichiers images. Exécuter `npm run backup` pour une copie cohérente de SQLite, du contenu JSON et des médias, dans `.local/backups`. Cette commande utilise l’API SQLite et peut fonctionner pendant que le site tourne. Les sessions ne sont pas conservées. Les instructions de restauration figurent dans le README principal.

L’éditeur vérifie les collisions : si une autre session a enregistré depuis le chargement, il faut exporter le brouillon, recharger et réappliquer les changements souhaités.

## Publication et référencement

La version locale est volontairement en `noindex`. Pour une publication, renseigner le domaine réel dans `seo.siteUrl`, puis activer `seo.indexable`. `SITE_URL` peut remplacer le domaine configuré. L’indexation reste bloquée pour localhost et les domaines de développement réservés. Les balises canoniques n’utilisent aucun domaine inventé.

Le serveur produit les titres et descriptions propres aux pages, Open Graph, JSON-LD (Dentist, horaires, fil d’Ariane, FAQ, personnes de l’équipe, soins et articles), `/sitemap.xml`, `/robots.txt` et `/llms.txt`. Le plan du site contient les pages de contenu et les articles seulement lorsque l’indexation est activée. L’administration et ses API restent en `noindex`. Les anciens chemins sont redirigés en 301 vers leur nouvelle page.

Variables : `HOST` (défaut `127.0.0.1`), `PORT` (défaut `3000`), `SITE_URL`, `NODE_ENV=production`. Derrière un unique reverse proxy de confiance qui termine HTTPS, définir `TRUST_PROXY=1` ; le proxy doit transmettre et assainir `X-Forwarded-Proto`. Les cookies de session deviennent alors `Secure` lorsque les requêtes sont reconnues comme HTTPS. Ne pas activer cette option derrière un proxy non maîtrisé. Un déploiement HTTPS, des sauvegardes, le domaine réel et les informations légales complètes restent à configurer pour une mise en ligne.

## Itinéraires et export de contact

`server/directions.mjs` dérive les liens Google Maps, Waze et Apple Plans exclusivement des coordonnées courantes ; `presentation.mjs` les transmet aux vues. Ne pas maintenir manuellement un second lien `practice.mapUrl` : ce champ historique est remplacé au rendu. Les variables de coordonnées des métadonnées sont résolues par `server/seo.mjs`.

- `GET /venir?app=google|waze|apple` : page d’accès ; un choix explicite conserve le panneau QR ouvert, même sans JavaScript.
- `GET /itineraire/qr.png?app=google|waze|apple` : QR PNG 360 pixels, marge de 4 modules, correction M. Le cache mémoire est invalidé après modification du contenu, les réponses HTTP sont `no-store` et `noindex`. Une application inconnue renvoie 400. La longueur des liens est bornée lors de la validation CMS.
- `GET /cabinet.vcf` : vCard 3 UTF-8 en pièce jointe, coordonnées actuelles, caractères échappés et lignes repliées à 75 octets.

Aucun service externe de QR, SDK de carte ni accès automatique à la géolocalisation. Les trois liens ouvrent les services externes seulement sur action de l’utilisateur.

## API d’administration

Toutes les réponses contiennent du JSON, sauf l’export. Toutes les mutations attendent l’en-tête `X-CSRF-Token` obtenu avec `/api/admin/session` ; l’origine est vérifiée. L’authentification utilise un cookie `HttpOnly`, `SameSite=Strict`, expirant après 8 heures. Le serveur ne conserve que le hash du jeton de session. Les mots de passe sont dérivés avec scrypt et un sel aléatoire.

| Méthode | Chemin | Rôle / corps |
| --- | --- | --- |
| GET | `/api/admin/session` | Session, état de connexion et jeton CSRF ; crée une session anonyme si nécessaire |
| POST | `/api/admin/login` | `{username,password}` ; 10 tentatives maximum par IP et 15 minutes |
| POST | `/api/admin/logout` | Ferme la session |
| GET | `/api/admin/content` | `{content,updatedAt}` |
| PUT | `/api/admin/content` | `{content,expectedUpdatedAt}` ; validation et détection de conflit |
| GET | `/api/admin/export` | Télécharge le contenu enregistré en JSON |
| GET | `/api/admin/revisions` | Liste des versions |
| POST | `/api/admin/revisions/:id/restore` | Restaure une version et crée une révision |
| GET | `/api/admin/media` | Liste des images importées |
| POST | `/api/admin/media` | `multipart/form-data`, champ fichier `file` |
| POST | `/api/admin/password` | `{currentPassword,newPassword}` ; minimum 12 caractères |

Les mutations renvoient `422` en cas de contenu invalide, `409` en cas de version périmée, `403` en cas de vérification CSRF/origine échouée, `401` si la connexion est requise. Les requêtes JSON sont limitées à 2 Mo.

## Contrat du rendu

`views/page.ejs` reçoit `{content,page,service,article,member,seo,qrProvider,qrRequested,nonce}`. `service` et `article` sont `null` hors de leurs pages. `seo` contient `title`, `description`, `canonical`, `noindex`, `robots`, `ogImage`, `siteUrl`, `indexable`, et `jsonLd` (JSON sérialisé avec les caractères HTML dangereux échappés). Le JSON-LD peut être inclus avec `<%- seo.jsonLd %>` dans un script portant le nonce. Tous les textes de contenu doivent être inclus avec `<%= ... %>` pour conserver l’échappement EJS.

Les valeurs de `page` sont `home`, `team`, `cabinet`, `services`, `service`, `contact`, `directions`, `faq`, `legal`, `privacy`, `resources`, `article` et `notfound`.

## Vérification

`node --test tests/backend.test.mjs` couvre l’authentification, la rotation des sessions, CSRF et origine, validation et conflits, restauration, export, import de fichiers, changement de mot de passe, rendu SSR, redirections, erreurs 404, robots locaux et sécurité du JSON-LD. Les tests utilisent une base et des fichiers temporaires et ne modifient pas le contenu local.

`npm test` lance 20 tests, dont 6 cas SEO et 2 cas itinéraires : le PNG est réellement décodé avec jsQR. `npm run check` vérifie les 37 vues ; `npm run health` contrôle 15 routes du serveur actif.

## Version publique GitHub Pages

Le serveur Express et ce back-office restent locaux. `npm run sync:pages` prépare les contenus publiables ; `npm run build:pages` rend la version statique (variable `PAGES_URL` obligatoire). GitHub Actions publie uniquement `dist/` après les tests, à chaque push sur main. Les images QR sont générées au build. Les chemins du dépôt, les variantes QR et les métadonnées sont contrôlés dans `tests/pages.test.mjs`. Consulter README.md pour la procédure de mise à jour.
