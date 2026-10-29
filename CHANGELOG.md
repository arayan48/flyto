# Changelog

Les changements notables de chaque version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et les versions suivent [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Corrigé
- Le tableau de bord, la liste des transferts, la fiche d'un utilisateur ou d'un transfert, les invitations et
  la page Système de /admin s'affichaient en partie vides depuis la v0.5.0

## [0.5.0] - 2026-10-29

### Modifié
- Le front passe de Vue 2 (plus maintenu depuis fin 2023) à Vue 3 avec Pinia, construit par Vite au lieu de
  webpack ; les fichiers servis portent un hash et sont mis en cache un an
- Icônes Phosphor à la place de Font Awesome 4, seules celles utilisées sont embarquées
- Internet Explorer n'est plus pris en charge (plus de polyfills)
- La fenêtre d'aperçu garde le focus clavier, se ferme avec Échap et bloque le défilement de la page derrière
- « Copier le lien » fonctionne aussi quand Flyto est ouvert en http sur le réseau local
- Police système à la place de DM Sans, en attendant la nouvelle charte de l'interface

### Corrigé
- Les onglets et les liens internes de /admin et de /account ramenaient à la page d'envoi au lieu de changer
  d'onglet

## [0.4.1] - 2026-10-29

### Corrigé
- Un gros envoi plus long que sa durée de conservation (par exemple 1 heure) n'est plus supprimé en cours de
  route : tant qu'il n'est pas fini, seul l'abandon de plus de 48 h compte
- Un fichier expiré n'est plus téléchargeable pendant la minute qui précède son nettoyage
- Un transfert suspendu par un admin ne reçoit plus de nouveaux fichiers
- Les liens de réinitialisation, de vérification et d'invitation n'apparaissent plus dans le journal d'accès
- Un `FLYTO_ADMIN_PASSWORD` trop court ou une adresse invalide n'arrête plus le conteneur en boucle : Flyto le
  signale et propose la page `/setup`
- La suppression de son propre compte est bien inscrite au journal d'audit
- Une langue inconnue (`constructor`, `toString`…) n'est plus acceptée comme langue d'un compte
- Avec Redis, un compteur de tentatives ne peut plus rester sans expiration et bloquer pour toujours
- Un envoi refusé ne laisse plus de transfert fantôme dans la base
- Au démarrage, un dossier illisible dans `/data` est ignoré au lieu d'arrêter Flyto, et un réseau encore
  injoignable (`EHOSTUNREACH`) fait attendre PostgreSQL comme les autres erreurs de connexion

## [0.4.0] - 2026-10-29

### Ajouté
- Flyto est dans le store ZimaOS arayan48 (`https://arayan48.github.io/appstore/store.json`), mis à jour
  automatiquement à chaque release : la mise à jour se fait depuis l'App Store de ZimaOS

### Modifié
- Au démarrage, la base passe au schéma 3 (une colonne ajoutée aux transferts, une aux utilisateurs) :
  rien à faire, et une v0.3.2 remise en place fonctionne toujours avec cette base

### Corrigé
- Un envoi ne peut plus choisir lui-même sa date d'expiration ni verrouiller son transfert : seuls le nom, le
  commentaire, le type, la durée et le mot de passe sont repris de la page d'envoi
- Les fichiers vides s'envoient et se téléchargent, ils restaient invisibles puis disparaissaient après 48 h
- Changer l'expiration d'un transfert (ou le verrouiller) pendant un envoi ne bloque plus cet envoi
- La reprise d'un envoi ne renvoie plus d'erreur sur un fichier déjà téléchargé ou verrouillé, et ne montre
  plus l'empreinte du mot de passe
- Un `Upload-Length` mal formé (`007`) ou un `Upload-Offset` invalide est refusé : le premier faisait sauter la
  limite de taille de l'envoi, le second le contrôle de l'offset
- Un lien `?sid=` ne peut plus imposer l'identifiant d'un transfert (et donc son lien de partage) à celui qui envoie ;
  les nouveaux identifiants font de 8 à 64 caractères `A-Z a-z 0-9 _ -`
- Un transfert anonyme ne peut plus être complété ni verrouillé par un autre visiteur : le navigateur qui l'a
  commencé est reconnu par un cookie
- Deux envois du même fichier en même temps (reprise après une coupure) ne mélangent plus leurs octets : le
  second attend que le premier se termine
- Un envoi refusé ou abandonné avant sa création ne garde plus d'espace réservé pendant 48 h
- La page de téléchargement ne calcule plus le mot de passe quand aucun n'est donné, et une seule fois pour tout
  le transfert (une seule empreinte pour tous ses fichiers)
- Un aperçu ne compte plus comme un téléchargement et n'avertit plus le propriétaire
- Des échecs de connexion anciens ne rapprochent plus du blocage du compte
- `FLYTO_UPDATE_CHECK`, `FLYTO_DISABLE_QR_CODE` et `FLYTO_REQUIRE_BUCKET_PASSWORD` acceptent aussi `0`, `no` et `off`
- Les formulaires admin répondent par une erreur claire au lieu d'une erreur 500 (quota invalide, invitation
  inconnue, action groupée inconnue) ; confirmer une nouvelle adresse déjà prise ne grille plus le lien
- `node cli.js user disable` ferme aussi les sessions gardées en cache par Redis
- Une erreur sur une page affiche la page d'erreur de Flyto au lieu de l'erreur brute d'Express

### Supprimé
- Les dépendances `cors`, `method-override`, `fs-promise`, `to-object-reducer` et `common-streams`, et le code
  tus jamais utilisé (CORS, `X-HTTP-Method-Override`, longueur différée, sommes de contrôle, concaténation)

## [0.3.2] - 2026-10-28

### Corrigé
- Un envoi ne reste plus bloqué quand un fichier est refusé (taille, type, quota) : le lien s'affiche pour les
  autres fichiers, et un fichier déjà signalé trop gros ou interdit doit être retiré avant d'envoyer
- Un fichier à téléchargement unique est envoyé en entier : une reprise ou un gestionnaire de téléchargement
  ne le supprime plus après le premier morceau, et les morceaux suivants ne comptent plus comme des téléchargements
- Le mot de passe d'un envoi n'est marqué obligatoire que lorsque l'admin l'exige
- L'inscription explique quand une invitation n'est plus valide
- Un admin sans double authentification, alors qu'elle est exigée, arrive sur la page qui l'active au lieu
  d'un `/admin` rempli d'erreurs
- Les pages d'erreur, les erreurs d'envoi et de téléchargement et le pied de page sont traduits ; en
  français, le site dit partout « envoi » et « Connexion », et le pied de page n'a plus de mots collés
- Le `docker-compose.yml` ne met plus `http://localhost:3000/` comme adresse publique, qui cassait les liens
  de « Mes transferts », de l'admin et des e-mails : vide par défaut sur un réseau local, et Flyto prévient
  au démarrage si l'adresse publique pointe vers localhost

### Ajouté
- `FLYTO_TRUST_PROXY` dans le `docker-compose.yml` (et l'interface de ZimaOS), à mettre à `1` derrière un
  reverse proxy ou un tunnel Cloudflare pour que les limites de tentatives restent propres à chaque visiteur

## [0.3.1] - 2026-10-28

### Corrigé
- Le compose importé dans ZimaOS démarre : ZimaOS impose le bridge par défaut, où `database` et `redis`
  ne se résolvent pas, et Flyto les joint maintenant par des `links`
- Un mot de passe PostgreSQL refusé arrête Flyto avec un message qui explique pourquoi (base gardée d'une
  installation précédente) et comment le corriger, au lieu d'une trace d'erreur brute

## [0.3.0] - 2026-10-27

**À lire avant de mettre à jour depuis la v0.2.0 :** les envois demandent maintenant un compte,
`FLYTO_ADMIN_PASS` et `FLYTO_UPLOAD_PASS` ne servent plus. Crée le premier administrateur avec
`FLYTO_ADMIN_EMAIL` et `FLYTO_ADMIN_PASSWORD`, ou depuis `/setup` avec le code affiché dans les logs
(voir docs/updating.md).

### Ajouté
- Comptes utilisateurs : connexion, inscription ouverte, sur invitation ou fermée, validation par un admin,
  confirmation de l'e-mail, mot de passe oublié, double authentification TOTP avec codes de secours,
  sessions visibles et révocables, export et suppression de ses données
- Le téléchargement reste sans compte ; chaque transfert appartient à son auteur, personne d'autre ne peut
  y ajouter de fichiers
- Limite de 10 Go par envoi par défaut, et limites réglables par fichier, stockage total, nombre de transferts
  actifs et de fichiers, pour tous ou par utilisateur
- Administration complète dans `/admin` : tableau de bord avec graphiques, utilisateurs, transferts
  (suspension, expiration, propriétaire, actions groupées), historique des téléchargements, invitations,
  journal d'audit, réglages appliqués sans redémarrage, informations système et maintenance, exports CSV
- Premier administrateur créé au déploiement (`FLYTO_ADMIN_EMAIL`), par l'assistant `/setup` ou par
  `node cli.js admin create` ; commandes `node cli.js user …` pour dépanner un compte
- E-mails (SMTP réglable dans `/admin` ou `FLYTO_SMTP_URL`) : bienvenue, invitation, réinitialisation,
  confirmation, avertissement de téléchargement
- Cache Redis facultatif (`FLYTO_REDIS_URL`) pour les sessions, les limites de tentatives et les statistiques,
  service `redis` dans le `docker-compose.yml`
- Bandeau d'annonce et mode maintenance, pages de conditions et de confidentialité, extensions refusées
- Identité visuelle flyto : logo, favicons, icône d'application, image de partage, police DM Sans servie
  par Flyto
- Point de contrôle `/healthz`, utilisé par le `HEALTHCHECK` de l'image

### Modifié
- **Incompatible :** `FLYTO_ADMIN_PASS` et `FLYTO_UPLOAD_PASS` sont retirés, remplacés par les comptes
- Le mot de passe obligatoire des transferts et les durées proposées sont vérifiés par le serveur
- Les envois commencés puis abandonnés depuis 48 h sont supprimés et ne comptent plus dans les limites
- Schéma de base versionné (table `schema_migrations`)

### Corrigé
- Au démarrage, Flyto attend PostgreSQL jusqu'à une minute au lieu de quitter aussitôt : sur ZimaOS et
  CasaOS, qui ignorent `depends_on`, le premier lancement échouait avec `getaddrinfo ENOTFOUND database`.
- Un envoi ne peut plus dépasser la taille annoncée à sa création (réponse 413) : envoyer plus d'octets
  que prévu permettait de contourner `FLYTO_MAX_FILE_SIZE` et de remplir le disque

## [0.2.0] - 2026-10-27

**À lire avant de mettre à jour depuis la v0.1.0 :** Flyto a maintenant besoin d'une base PostgreSQL
(`FLYTO_DB_URL`). Le `docker-compose.yml` fournit le service `database`. Les métadonnées rangées dans
`flyto.sqlite` par la v0.1.0 ne sont pas reprises : les envois existants n'apparaîtront plus.

### Ajouté
- Le pied de page affiche la version de Flyto, avec un lien vers ses notes de version

### Modifié
- **Incompatible :** PostgreSQL devient la seule base de métadonnées, `FLYTO_DB_URL` est obligatoire.
  Le support SQLite et `FLYTO_DB_FILE` sont retirés ; un `flyto.sqlite` existant n'est pas importé

### Corrigé
- Téléchargement en `.zip` / `.tar.gz` : bon type de contenu, plus de téléchargement bloqué quand un fichier
  manque sur le disque, fichiers libérés si le téléchargement est interrompu, et liens valides pour les envois
  dont l'identifiant contient des majuscules ou des tirets
- Les fichiers dont l'envoi n'est pas terminé ne sont plus proposés au téléchargement
- La liste des fichiers envoyée au navigateur ne contient plus l'empreinte du mot de passe
- Envois : un morceau renvoyé deux fois n'est plus ajouté en double au fichier (réponse 409 comme le prévoit
  le protocole tus), et un envoi coupé en cours de route ne laisse plus de fichier ouvert sur le serveur
- Variables d'environnement : `false` désactive bien une option (`FLYTO_REQUIRE_BUCKET_PASSWORD=false` l'activait),
  une URL de webhook ne fait plus planter le démarrage, `FLYTO_TRUST_PROXY=true` est accepté
  et `forceHttps: true` dans un fichier de config redirige vers la bonne adresse
- Avec `FLYTO_UPLOAD_PASS`, l'envoi terminé est bien verrouillé (la requête de verrouillage n'avait pas le mot de passe)
- Les styles propres aux pages (affichage mobile de l'envoi, bandeau de mise à jour de `/admin`) n'étaient pas appliqués
- Au démarrage, Flyto attend d'avoir chargé la liste des fichiers avant d'accepter des connexions
  (les liens répondaient « introuvable » pendant ce temps)
- Image Docker : un dossier de données créé par Docker (bind mount, ZimaOS) appartient à root et Flyto ne pouvait
  pas y écrire ; le conteneur corrige maintenant les droits au démarrage puis lance Flyto en utilisateur `node`.
  L'image déclare aussi un `HEALTHCHECK`

## [0.1.0] - 2026-10-27

Première version de Flyto, basée sur PsiTransfer.

### Ajouté
- Métadonnées des fichiers dans une base SQLite (`flyto.sqlite`) au lieu des fichiers `.json` à côté des envois
- Option PostgreSQL pour les métadonnées (`FLYTO_DB_URL`)
- `docker-compose.yml` prêt à importer dans ZimaOS / CasaOS
- Vérification des nouvelles versions sur GitHub : avertissement dans `/admin` et dans les logs,
  désactivable avec `FLYTO_UPDATE_CHECK=false` ([guide de mise à jour](docs/updating.md))

### Modifié
- Le projet devient Flyto : nom, image Docker, variables d'environnement `FLYTO_*`
  (l'ancien préfixe `PSITRANSFER_` est encore lu)

[Non publié]: https://github.com/arayan48/flyto/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/arayan48/flyto/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/arayan48/flyto/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/arayan48/flyto/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/arayan48/flyto/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/arayan48/flyto/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/arayan48/flyto/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/arayan48/flyto/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/arayan48/flyto/releases/tag/v0.1.0
