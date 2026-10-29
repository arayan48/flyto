# Mettre à jour Flyto

## Être prévenu

Toutes les 12 heures, Flyto demande à GitHub quelle est la dernière version publiée
(`https://api.github.com/repos/arayan48/flyto/releases/latest`). Si elle est plus récente que celle
qui tourne :

* un bandeau s'affiche en haut de la page `/admin`, avec un lien vers les nouveautés ;
* une ligne est écrite dans les logs du conteneur :
  `Flyto v0.2.0 is available (running v0.1.0): https://github.com/arayan48/flyto/releases/tag/v0.2.0`

Le bouton « Plus tard » masque le bandeau jusqu'à la version suivante. Les pré-versions (`v0.2.0-rc.1`)
ne déclenchent pas d'avertissement.

La requête n'envoie rien d'autre que le numéro de version dans l'en-tête `User-Agent`.
Pour la couper, mets `FLYTO_UPDATE_CHECK=false`. Si tu maintiens un fork, `FLYTO_UPDATE_CHECK_REPO`
indique le dépôt à surveiller (`proprietaire/depot`).

Avant toute mise à jour, lis les notes de version : en 0.x, un changement de version mineure
(`0.1` → `0.2`) peut demander une action de ta part, c'est alors écrit en tête des notes.

## De la v0.2 à la v0.3 : les comptes

La v0.3.0 remplace les mots de passe partagés par des comptes. `FLYTO_ADMIN_PASS` et `FLYTO_UPLOAD_PASS`
ne servent plus (un avertissement s'affiche dans les logs s'ils sont encore là) :

1. Ajoute `FLYTO_ADMIN_EMAIL` et `FLYTO_ADMIN_PASSWORD` (ou utilise la page `/setup` avec le code des logs),
   et `FLYTO_PUBLIC_URL` pour les liens des e-mails.
2. Facultatif : ajoute le service `redis` du nouveau `docker-compose.yml` et `FLYTO_REDIS_URL`.
3. Après le démarrage, connecte-toi, puis règle dans `/admin` > Réglages les inscriptions
   (sur invitation par défaut), les limites (10 Go par envoi) et l'envoi d'e-mails.

Les transferts existants restent téléchargeables ; ils apparaissent comme anonymes dans `/admin`.
Les nouvelles tables sont créées au démarrage. Pour revenir à la v0.2.0, l'ancienne image fonctionne
toujours avec la même base (elle ignore les nouvelles tables).

## ZimaOS / CasaOS

### Installé depuis le store arayan48

Si Flyto vient du store `https://arayan48.github.io/appstore/store.json`, chaque release met le store à jour
quelques minutes après sa publication : l'App Store de ZimaOS propose alors la mise à jour de Flyto.

Pour passer d'une installation importée à celle du store, désinstalle l'app Flyto **sans supprimer ses
données**, puis installe-la depuis le store avec les mêmes mots de passe (`POSTGRES_PASSWORD` et
`FLYTO_DB_URL`) : la base et les fichiers de `/DATA/AppData/flyto` sont repris.

### Installé par import du docker-compose.yml

1. Ouvre l'app Flyto, puis **Paramètres** (icône engrenage).
2. Dans le champ de l'image, remplace le tag par la nouvelle version, par exemple
   `ghcr.io/arayan48/flyto:v0.5.0`.
3. Enregistre : ZimaOS télécharge l'image et redémarre le conteneur.

Les fichiers et la base restent dans `/DATA/AppData/flyto`, ils ne sont pas touchés.

## Docker Compose

Dans `docker-compose.yml`, change le tag de l'image (`ghcr.io/arayan48/flyto:v0.5.0`), puis :

```bash
docker compose pull
docker compose up -d
```

Avec le tag `latest` ou `v0`, seules les deux commandes suffisent.

## Docker

```bash
docker pull ghcr.io/arayan48/flyto:v0.5.0
docker stop flyto && docker rm flyto
```

Relance ensuite le conteneur avec la même commande `docker run` qu'avant, en changeant seulement le tag.
Les données sont dans le volume `/data`, elles sont conservées.

## Depuis les sources

```bash
git fetch --tags
git checkout v0.5.0
npm ci
cd app && npm ci && npm run build && cd ..
```

Puis redémarre le service (`systemctl restart flyto` si tu suis [deployment-systemd.md](deployment-systemd.md)).
