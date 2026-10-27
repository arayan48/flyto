# Flyto

Partage de fichiers auto-hébergé : tu déposes tes fichiers, tu obtiens **un seul lien** à envoyer à qui tu veux.
Une alternative à WeTransfer qui tourne chez toi.

* Pas de compte côté destinataires
* Fichiers de toutes tailles, envois et téléchargements reprenables ([tus.io](https://tus.io)), découpés en morceaux de 5 Mo
* Expiration au choix, ou suppression après un seul téléchargement
* Mot de passe sur le lien de téléchargement (tous caractères acceptés : accents, `€`, émojis…)
* Téléchargement de tout le lot en `.zip` ou `.tar.gz`
* Aperçu des fichiers dans le navigateur
* Base de données SQLite intégrée (métadonnées des fichiers et historique des téléchargements)
* Page `/admin` avec la liste des envois et le nombre de téléchargements (activée si `FLYTO_ADMIN_PASS` est défini)
* Avertissement dans `/admin` quand une nouvelle version est publiée ([mettre à jour](docs/updating.md))

## Démarrage rapide

### Docker

```bash
docker run -p 3000:3000 \
  -e FLYTO_ADMIN_PASS=change-moi \
  -e FLYTO_UPLOAD_PASS=change-moi-aussi \
  -v $PWD/data:/data \
  ghcr.io/arayan48/flyto
# le volume de données doit appartenir à l'UID 1000
sudo chown -R 1000 $PWD/data
```

### Depuis les sources

Node.js 24 ou plus récent est requis.

```bash
# Interface
cd app && npm install && npm run build && cd ..

# Serveur
npm install
npm start
```

## Configuration

Chaque option de [`config.js`](config.js) peut être définie par une variable d'environnement préfixée par `FLYTO_`.
Les anciennes variables `PSITRANSFER_*` sont encore acceptées.

| Variable | Rôle |
| --- | --- |
| `FLYTO_PORT` | Port d'écoute (par défaut `3000`) |
| `FLYTO_UPLOAD_DIR` | Dossier des fichiers envoyés (par défaut `./data`, `/data` en Docker) |
| `FLYTO_DB_FILE` | Fichier SQLite (par défaut `<FLYTO_UPLOAD_DIR>/flyto.sqlite`) |
| `FLYTO_DB_URL` | URL PostgreSQL (`postgres://user:pass@hote:5432/base`). Si définie, remplace SQLite |
| `FLYTO_UPLOAD_PASS` | Mot de passe pour déposer des fichiers. **À définir si Flyto est exposé sur Internet**, sinon n'importe qui peut remplir ton disque |
| `FLYTO_ADMIN_PASS` | Mot de passe de la page `/admin` |
| `FLYTO_DEFAULT_RETENTION` | Durée de conservation par défaut, en secondes |
| `FLYTO_UPDATE_CHECK` | `false` pour ne plus vérifier les nouvelles versions sur GitHub |

Tu peux aussi créer un `config.production.js` (voir `config.dev.js`).

### Base de données

Flyto range les métadonnées des fichiers et l'historique des téléchargements dans un fichier SQLite,
via le module `node:sqlite` intégré à Node.js : il n'y a aucun serveur de base de données à installer.
Les fichiers eux-mêmes restent sur le disque, dans `FLYTO_UPLOAD_DIR`.

Au premier démarrage, les anciens fichiers de métadonnées `<id>.json` (format PsiTransfer) sont importés
dans la base puis supprimés.

Pour sauvegarder Flyto, copie le dossier de données en entier : il contient les fichiers et `flyto.sqlite`.

#### PostgreSQL dans un conteneur séparé

Avec `FLYTO_DB_URL`, les métadonnées vont dans PostgreSQL au lieu de SQLite (les tables sont créées
au démarrage). Le [`docker-compose.yml`](docker-compose.yml) lance deux services, `flyto` et `database`
(PostgreSQL 17), et s'importe tel quel dans ZimaOS / CasaOS (App Store > installation personnalisée > importer).
Change `POSTGRES_PASSWORD`, le mot de passe dans `FLYTO_DB_URL` et `FLYTO_ADMIN_PASS` avant le premier démarrage.

```bash
docker compose up -d
```

Les fichiers sont dans `/DATA/AppData/flyto/data`, la base dans `/DATA/AppData/flyto/postgres` :
sauvegarde les deux. Passer de SQLite à PostgreSQL ne migre pas les métadonnées existantes.

Pour lancer les tests PostgreSQL : `FLYTO_TEST_DB_URL=postgres://... npm run test:unit`.

## Débogage

```bash
DEBUG=flyto:* npm start
```

## Crédits et licence

Flyto est basé sur [PsiTransfer](https://github.com/psi-4ward/psitransfer) de Christoph Wiechert,
distribué sous licence BSD 2-Clause. Voir [LICENSE](LICENSE).
