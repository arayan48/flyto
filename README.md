# Flyto

Partage de fichiers auto-hébergé : tu déposes tes fichiers, tu obtiens **un seul lien** à envoyer à qui tu veux.
Une alternative à WeTransfer qui tourne chez toi.

* Pas de compte côté destinataires
* Fichiers de toutes tailles, envois et téléchargements reprenables ([tus.io](https://tus.io)), découpés en morceaux de 5 Mo
* Expiration au choix, ou suppression après un seul téléchargement
* Mot de passe sur le lien de téléchargement (tous caractères acceptés : accents, `€`, émojis…)
* Téléchargement de tout le lot en `.zip` ou `.tar.gz`
* Aperçu des fichiers dans le navigateur
* Métadonnées des fichiers et historique des téléchargements dans PostgreSQL
* Page `/admin` avec la liste des envois et le nombre de téléchargements (activée si `FLYTO_ADMIN_PASS` est défini)
* Avertissement dans `/admin` quand une nouvelle version est publiée ([mettre à jour](docs/updating.md))

## Démarrage rapide

### Docker Compose

Le [`docker-compose.yml`](docker-compose.yml) lance Flyto et sa base PostgreSQL.
Change les mots de passe qu'il contient, puis :

```bash
docker compose up -d
```

Voir [Base de données](#base-de-données) pour les dossiers à sauvegarder.

### Docker

Avec une base PostgreSQL déjà en place :

```bash
docker run -p 3000:3000 \
  -e FLYTO_DB_URL=postgres://flyto:secret@hote-postgres:5432/flyto \
  -e FLYTO_ADMIN_PASS=change-moi \
  -e FLYTO_UPLOAD_PASS=change-moi-aussi \
  -v $PWD/data:/data \
  ghcr.io/arayan48/flyto:v0.2.0
```

Au démarrage, le conteneur donne le dossier de données à l'utilisateur `node` (UID 1000) qui fait tourner Flyto.

### Depuis les sources

Node.js 24 ou plus récent et une base PostgreSQL sont requis.

```bash
# Interface
cd app && npm ci && npm run build && cd ..

# Serveur
npm ci --omit=dev
FLYTO_DB_URL=postgres://flyto:secret@localhost:5432/flyto npm start
```

## Configuration

Chaque option de [`config.js`](config.js) peut être définie par une variable d'environnement préfixée par `FLYTO_`.
Les anciennes variables `PSITRANSFER_*` sont encore acceptées.

| Variable | Rôle |
| --- | --- |
| `FLYTO_PORT` | Port d'écoute (par défaut `3000`) |
| `FLYTO_UPLOAD_DIR` | Dossier des fichiers envoyés (par défaut `./data`, `/data` en Docker) |
| `FLYTO_DB_URL` | URL PostgreSQL (`postgres://user:pass@hote:5432/base`), **obligatoire** |
| `FLYTO_UPLOAD_PASS` | Mot de passe pour déposer des fichiers. **À définir si Flyto est exposé sur Internet**, sinon n'importe qui peut remplir ton disque |
| `FLYTO_ADMIN_PASS` | Mot de passe de la page `/admin` |
| `FLYTO_DEFAULT_RETENTION` | Durée de conservation par défaut, en secondes |
| `FLYTO_UPDATE_CHECK` | `false` pour ne plus vérifier les nouvelles versions sur GitHub |

Pour les options oui/non, utilise `true` ou `false`. Tu peux aussi créer un `config.production.js`
(voir `config.dev.js` et [docs/configuration.md](docs/configuration.md)).

### Base de données

Flyto range les métadonnées des fichiers et l'historique des téléchargements dans PostgreSQL ;
les tables sont créées au démarrage. Les fichiers eux-mêmes restent sur le disque, dans `FLYTO_UPLOAD_DIR`.
Sans `FLYTO_DB_URL`, Flyto refuse de démarrer.

Le [`docker-compose.yml`](docker-compose.yml) lance deux services, `flyto` et `database` (PostgreSQL 17),
et s'importe tel quel dans ZimaOS / CasaOS (App Store > installation personnalisée > importer).
Change `POSTGRES_PASSWORD`, le mot de passe dans `FLYTO_DB_URL` et `FLYTO_ADMIN_PASS` avant le premier démarrage.

```bash
docker compose up -d
```

Les fichiers sont dans `/DATA/AppData/flyto/data`, la base dans `/DATA/AppData/flyto/postgres` :
sauvegarde les deux.

Au premier démarrage, les anciens fichiers de métadonnées `<id>.json` (format PsiTransfer) sont importés
dans la base puis supprimés. Un fichier `flyto.sqlite` laissé par la v0.1.0 n'est pas repris.

Les tests qui ont besoin de PostgreSQL sont sautés sans `FLYTO_TEST_DB_URL` ; la CI les lance avec
un conteneur PostgreSQL.

## Débogage

```bash
DEBUG=flyto:* npm start
```

## Crédits et licence

Flyto est basé sur [PsiTransfer](https://github.com/psi-4ward/psitransfer) de Christoph Wiechert,
distribué sous licence BSD 2-Clause. Voir [LICENSE](LICENSE).
