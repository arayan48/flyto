# Flyto

Partage de fichiers auto-hébergé : tu déposes tes fichiers, tu obtiens **un seul lien** à envoyer à qui tu veux.
Une alternative à WeTransfer qui tourne chez toi.

* Comptes pour envoyer, **aucun compte pour télécharger** : le lien suffit
* Jusqu'à 10 Go par envoi par défaut, quotas réglables (par envoi, par fichier, stockage total, nombre de transferts) pour tout le monde ou par utilisateur
* Fichiers de toutes tailles, envois et téléchargements reprenables ([tus.io](https://tus.io)), découpés en morceaux de 5 Mo
* Expiration au choix, ou suppression après un seul téléchargement
* Mot de passe sur le lien de téléchargement (tous caractères acceptés : accents, `€`, émojis…)
* Téléchargement de tout le lot en `.zip` ou `.tar.gz`
* Aperçu des fichiers dans le navigateur
* Métadonnées des fichiers et historique des téléchargements dans PostgreSQL
* Inscription ouverte, sur invitation ou fermée, validation des comptes, double authentification (TOTP), sessions révocables
* Administration complète dans `/admin` : tableau de bord, utilisateurs, transferts, téléchargements, invitations,
  journal d'audit, réglages en direct, maintenance ([détails](docs/accounts.md))
* Cache Redis facultatif pour les sessions, les limites de tentatives et le tableau de bord
* Avertissement dans `/admin` quand une nouvelle version est publiée ([mettre à jour](docs/updating.md))

## Aperçu

![Page d'envoi](docs/screenshots/envoi.png)

| Le lien à partager | Ce que voit la personne qui télécharge |
| --- | --- |
| ![Lien prêt avec QR code](docs/screenshots/lien.png) | ![Page de téléchargement en mode sombre](docs/screenshots/telechargement.png) |

| Administration | Sur téléphone |
| --- | --- |
| ![Tableau de bord de l'administration](docs/screenshots/admin.png) | ![Page d'envoi sur téléphone](docs/screenshots/mobile.png) |

## Démarrage rapide

### Docker Compose

Le [`docker-compose.yml`](docker-compose.yml) lance Flyto, sa base PostgreSQL et un cache Redis.
Change les mots de passe qu'il contient, l'e-mail de l'administrateur et l'adresse publique, puis :

```bash
docker compose up -d
```

Voir [Base de données](#base-de-données) pour les dossiers à sauvegarder.

### Docker

Avec une base PostgreSQL déjà en place :

```bash
docker run -p 3000:3000 \
  -e FLYTO_DB_URL=postgres://flyto:secret@hote-postgres:5432/flyto \
  -e FLYTO_ADMIN_EMAIL=moi@exemple.fr \
  -e FLYTO_ADMIN_PASSWORD='un mot de passe long' \
  -e FLYTO_PUBLIC_URL=https://fichiers.exemple.fr/ \
  -v $PWD/data:/data \
  ghcr.io/arayan48/flyto:v0.3.1
```

### Premier administrateur

Trois façons de créer le compte qui administre l'instance :

1. **Au déploiement** : `FLYTO_ADMIN_EMAIL` et `FLYTO_ADMIN_PASSWORD` créent le compte au premier démarrage
   (ignorés ensuite, et refusés s'ils gardent les valeurs d'exemple du compose).
2. **Assistant** : sans ces variables, les logs affichent un code d'installation ; ouvre `/setup` et saisis-le.
3. **Ligne de commande**, à tout moment : `docker exec -it flyto node cli.js admin create --email moi@exemple.fr`

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
| `FLYTO_ADMIN_EMAIL`, `FLYTO_ADMIN_PASSWORD` | Premier compte administrateur, créé au démarrage s'il n'y en a aucun |
| `FLYTO_PUBLIC_URL` | Adresse publique (`https://fichiers.exemple.fr/`), utilisée dans les e-mails et les liens |
| `FLYTO_TRUST_PROXY` | `1` derrière un reverse proxy ou un tunnel, sinon tous les visiteurs ont l'IP du proxy et partagent les mêmes limites de tentatives |
| `FLYTO_REDIS_URL` | Cache Redis facultatif (`redis://redis:6379`) |
| `FLYTO_SMTP_URL` | Envoi d'e-mails (`smtps://user:pass@smtp.exemple.fr:465`), réglable aussi dans `/admin` |
| `FLYTO_MAIL_FROM` | Expéditeur des e-mails |
| `FLYTO_DEFAULT_RETENTION` | Durée de conservation par défaut, en secondes |
| `FLYTO_UPDATE_CHECK` | `false` pour ne plus vérifier les nouvelles versions sur GitHub |

Le reste (inscriptions, quotas, durées proposées, sécurité, SMTP, bandeau, maintenance…) se règle en direct
dans `/admin` > Réglages ; les variables d'environnement n'en donnent que les valeurs par défaut.

Pour les options oui/non, utilise `true` ou `false`. Tu peux aussi créer un `config.production.js`
(voir `config.dev.js` et [docs/configuration.md](docs/configuration.md)).

### Base de données

Flyto range dans PostgreSQL les métadonnées des fichiers, les comptes, les sessions, les réglages,
le journal d'audit et l'historique des envois et téléchargements ; le schéma est créé et mis à jour au démarrage
(migrations numérotées). Les fichiers eux-mêmes restent sur le disque, dans `FLYTO_UPLOAD_DIR`.
Sans `FLYTO_DB_URL`, Flyto refuse de démarrer.

Le [`docker-compose.yml`](docker-compose.yml) lance trois services, `flyto`, `database` (PostgreSQL 17)
et `redis` (cache sans persistance), et s'importe tel quel dans ZimaOS / CasaOS
(App Store > installation personnalisée > importer). Flyto est aussi dans le store
[arayan48/appstore](https://github.com/arayan48/appstore) : ajoute la source
`https://arayan48.github.io/appstore/store.json` dans l'App Store de ZimaOS pour l'installer et le mettre à jour
de là. Change `POSTGRES_PASSWORD`, le mot de passe dans
`FLYTO_DB_URL`, `FLYTO_ADMIN_EMAIL` et `FLYTO_ADMIN_PASSWORD` avant le premier démarrage.
Sur un réseau local, `FLYTO_PUBLIC_URL` peut rester vide : les liens reprennent l'adresse utilisée pour ouvrir Flyto.
Dès que Flyto passe par un nom de domaine, un reverse proxy ou un tunnel Cloudflare, mets son adresse publique
dans `FLYTO_PUBLIC_URL` et `1` dans `FLYTO_TRUST_PROXY`.

```bash
docker compose up -d
```

Les fichiers sont dans `/DATA/AppData/flyto/data`, la base dans `/DATA/AppData/flyto/postgres` :
sauvegarde les deux. Redis ne contient qu'un cache, rien à sauvegarder.

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
