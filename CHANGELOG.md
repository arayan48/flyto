# Changelog

Les changements notables de chaque version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et les versions suivent [SemVer](https://semver.org/lang/fr/).

## [Non publié]

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

[Non publié]: https://github.com/arayan48/flyto/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arayan48/flyto/releases/tag/v0.1.0
