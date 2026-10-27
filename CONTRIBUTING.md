# Contribuer à Flyto

Ce document décrit comment le projet est développé : branches, commits, revues et releases.
Il s'applique à tout le monde, mainteneur compris.

## Le principe : GitHub Flow

`main` est toujours stable et déployable. On ne pousse jamais directement dessus.

Chaque changement, même petit, suit le même chemin :

1. Partir d'un `main` à jour
2. Créer une branche dédiée
3. Committer par petites étapes
4. Pousser la branche et ouvrir une Pull Request
5. Attendre que la CI passe
6. Fusionner dans `main` (squash), supprimer la branche

```bash
git switch main && git pull
git switch -c feat/expiration-personnalisee
# ... travail, commits ...
git push -u origin feat/expiration-personnalisee
gh pr create --fill
```

Une PR = une fonctionnalité ou un correctif. Si une PR commence à mélanger deux sujets, on la coupe en deux.

## Nommer les branches

`<type>/<description-courte>`, en minuscules et avec des tirets :

| Préfixe | Usage |
|---|---|
| `feat/` | nouvelle fonctionnalité |
| `fix/` | correction de bug |
| `docs/` | documentation uniquement |
| `refactor/` | réorganisation du code sans changement de comportement |
| `chore/` | outillage, dépendances, CI |
| `test/` | ajout ou correction de tests |

Exemples : `feat/stockage-postgres`, `fix/zip-noms-accentues`, `chore/node-26`.

## Messages de commit

Le projet suit [Conventional Commits](https://www.conventionalcommits.org/fr/). Le changelog des
releases est généré à partir de ces messages, donc le format compte.

```
<type>(<portée optionnelle>): <résumé à l'impératif>

<corps optionnel : le pourquoi, pas le comment>
```

Types acceptés : `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `deps`, `style`, `revert`.

```
feat(admin): afficher la taille totale des envois
fix(download): encoder les noms de fichiers non ASCII dans le zip
docs: ajouter le déploiement sur ZimaOS
```

Un changement incompatible (config renommée, format de base modifié…) prend un `!` après le type,
avec une explication dans le corps :

```
feat(config)!: ne plus lire l'ancien préfixe PSITRANSFER_

Seules les variables FLYTO_* sont prises en compte.
```

Quelques règles simples :

* Un commit = une étape cohérente. Le projet doit compiler et les tests passer à chaque commit.
* Résumé court (moins de 72 caractères), sans point final.
* Pas de commit « wip » ou « fix » tout seul dans `main` : le squash au moment de la fusion s'en occupe,
  et le titre de la PR devient le message final. Le titre de la PR suit donc le même format.

## Avant d'ouvrir une PR

```bash
npm test
cd app && npm run build
```

La CI lance les mêmes commandes sur chaque PR. Une PR rouge n'est pas fusionnée.
Sans `FLYTO_TEST_DB_URL`, les tests qui ont besoin de PostgreSQL sont sautés en local ; la CI les lance
avec un conteneur PostgreSQL.

## Versions et releases

Les versions suivent [SemVer](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`.

* **CORRECTIF** (`1.2.3` → `1.2.4`) : uniquement des `fix`
* **MINEUR** (`1.2.3` → `1.3.0`) : au moins un `feat`, rien d'incompatible
* **MAJEUR** (`1.2.3` → `2.0.0`) : au moins un changement marqué `!`

On ne publie une release que depuis `main`, quand plusieurs changements utiles se sont accumulés
ou qu'un correctif important doit sortir.

### Publier une release

1. Mettre à jour [CHANGELOG.md](CHANGELOG.md) : déplacer le contenu de « Non publié » sous la nouvelle version
2. Mettre à jour la version dans `package.json` et `app/package.json` (`npm version X.Y.Z --no-git-tag-version`),
   et le tag de l'image dans [docker-compose.yml](docker-compose.yml)
3. Committer via une PR `chore(release): vX.Y.Z` et la fusionner
4. Taguer `main` et pousser le tag :

```bash
git switch main && git pull
git tag -a v1.3.0 -m "v1.3.0"
git push origin v1.3.0
```

Le tag déclenche [build_release.yaml](.github/workflows/build_release.yaml), qui :

* relance les tests
* construit l'image Docker `ghcr.io/arayan48/flyto:v1.3.0` (amd64 et arm64), plus `v1.3` et `v1`
* crée la release GitHub avec l'archive et les notes générées depuis les commits

Un tag avec un suffixe (`v1.3.0-rc.1`) produit une pré-release, sans toucher aux tags stables.

### Images Docker disponibles

| Tag | Contenu | Pour qui |
|---|---|---|
| `vX.Y.Z` | une release précise, figée | production |
| `vX` / `vX.Y` | la dernière release de cette série | production avec mises à jour automatiques |
| `latest` | le dernier commit de `main` | tests uniquement |

Un serveur de production n'utilise jamais `latest`.

## Déploiement sur un NAS (ZimaOS / CasaOS)

Le serveur ne reçoit que des releases.

1. Publier la release (voir plus haut) et attendre la fin du workflow
2. Dans ZimaOS, ouvrir l'app Flyto, remplacer le tag de l'image par la nouvelle version, enregistrer
3. Vérifier que la page d'accueil et `/admin` répondent

En cas de problème, revenir au tag précédent : les données (`/DATA/AppData/flyto`) ne sont pas touchées
par un changement d'image. Si une release modifie le schéma de la base, ses notes le précisent.

## Signaler un bug

Ouvrir une issue avec la version utilisée, les étapes pour reproduire, ce qui était attendu
et ce qui s'est passé. Les logs du conteneur (`docker logs flyto`) aident beaucoup.
