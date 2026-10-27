# Changelog

Les changements notables de chaque version. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et les versions suivent [SemVer](https://semver.org/lang/fr/).

## [Non publié]

## [0.1.0] - 2026-10-27

Première version de Flyto, basée sur PsiTransfer.

### Ajouté
- Métadonnées des fichiers dans une base SQLite (`flyto.sqlite`) au lieu des fichiers `.json` à côté des envois
- Option PostgreSQL pour les métadonnées (`FLYTO_DB_URL`)
- `docker-compose.yml` prêt à importer dans ZimaOS / CasaOS

### Modifié
- Le projet devient Flyto : nom, image Docker, variables d'environnement `FLYTO_*`
  (l'ancien préfixe `PSITRANSFER_` est encore lu)

[Non publié]: https://github.com/arayan48/flyto/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arayan48/flyto/releases/tag/v0.1.0
