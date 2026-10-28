# Changelog

Les changements notables de chaque version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et les versions suivent [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Flyto est dans le store ZimaOS arayan48 (`https://arayan48.github.io/appstore/store.json`), mis à jour
  automatiquement à chaque release : la mise à jour se fait depuis l'App Store de ZimaOS

### Corrigé
- Un envoi ne peut plus choisir lui-même sa date d'expiration ni verrouiller son transfert : seuls le nom, le
  commentaire, le type, la durée et le mot de passe sont repris de la page d'envoi
- Les fichiers vides s'envoient et se téléchargent, ils restaient invisibles puis disparaissaient après 48 h
- Changer l'expiration d'un transfert (ou le verrouiller) pendant un envoi ne bloque plus cet envoi
- La reprise d'un envoi ne renvoie plus d'erreur sur un fichier déjà téléchargé ou verrouillé, et ne montre
  plus l'empreinte du mot de passe

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

[Non publié]: https://github.com/arayan48/flyto/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/arayan48/flyto/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/arayan48/flyto/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/arayan48/flyto/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/arayan48/flyto/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/arayan48/flyto/releases/tag/v0.1.0
