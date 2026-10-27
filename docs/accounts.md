# Comptes et administration

Depuis la v0.3.0, il faut un compte pour envoyer des fichiers. Le lien obtenu à la fin de l'envoi
s'ouvre sans compte : n'importe qui peut télécharger, avec le mot de passe du transfert s'il y en a un.

## Le premier administrateur

Tant qu'aucun administrateur actif n'existe, Flyto en crée un de l'une de ces trois façons :

| Moyen | Quand l'utiliser |
| --- | --- |
| `FLYTO_ADMIN_EMAIL` + `FLYTO_ADMIN_PASSWORD` | Au déploiement (Docker Compose, ZimaOS). Le compte est créé au premier démarrage ; ensuite les variables sont ignorées. Les valeurs d'exemple du compose (`change-me-too`…) sont refusées. |
| Page `/setup` | Sans ces variables. Les logs affichent un code à usage unique (`docker logs flyto`), à saisir sur la page. |
| `node cli.js admin create --email …` | À tout moment, depuis le conteneur, par exemple si l'accès est perdu. |

Si l'adresse de `FLYTO_ADMIN_EMAIL` existe déjà sans être admin (le dernier admin a été rétrogradé),
le compte redevient administrateur avec ce mot de passe.

### Ligne de commande

```bash
docker exec -it flyto node cli.js help
docker exec -it flyto node cli.js user list
docker exec -it flyto node cli.js user reset-password moi@exemple.fr
docker exec -it flyto node cli.js user disable-2fa moi@exemple.fr
```

Sans `--password`, un mot de passe aléatoire est affiché. Chaque commande est inscrite au journal d'audit.

## Ce que voit un utilisateur

* **Envoi** : comme avant, avec en plus la limite applicable (10 Go par envoi par défaut) et l'espace utilisé.
  Un transfert appartient à celui qui l'a créé : personne d'autre ne peut y ajouter de fichiers.
* **Mon compte** :
  * *Mes transferts* : liens, téléchargements, expiration, suppression d'un transfert ou d'un fichier ;
  * *Profil* : nom, e-mail (confirmé par un lien quand l'envoi d'e-mails est configuré), langue des e-mails,
    avertissement par e-mail quand ses fichiers sont téléchargés ;
  * *Sécurité* : mot de passe (les autres sessions sont fermées), double authentification TOTP
    avec 10 codes de secours ;
  * *Sessions* : appareils connectés, déconnexion à distance ;
  * *Mes données* : export JSON et suppression du compte avec tous ses transferts.
* **Mot de passe oublié** : lien par e-mail valable une heure.

## L'administration (`/admin`)

| Onglet | Contenu |
| --- | --- |
| Tableau de bord | Utilisateurs, transferts actifs, stockage et disque, activité du jour, graphiques par jour (envois, volume, téléchargements, inscriptions) sur 7 à 365 jours, plus gros utilisateurs, activité récente, alertes (maintenance, adresse publique, e-mail, comptes à valider, 2FA, mise à jour, disque) |
| Utilisateurs | Recherche, filtres (rôle, statut, bloqués, e-mail non confirmé, 2FA), tri, export CSV ; création (avec mot de passe ou lien d'invitation) ; fiche : profil, rôle, statut, limites personnelles, notes internes, lien ou e-mail de réinitialisation, nouveau mot de passe, déblocage, confirmation d'e-mail, désactivation de la 2FA, déconnexion partout, sessions, transferts, activité, suppression (en gardant ou non ses transferts) |
| Transferts | Tous les transferts avec leur propriétaire, recherche (identifiant, nom de fichier, propriétaire), filtres, tri, export CSV, actions groupées ; fiche : fichiers, journal des téléchargements, expiration, propriétaire, suspension avec motif, suppression |
| Téléchargements | Historique (date, fichier, transfert, propriétaire, IP, navigateur), recherche, export CSV |
| Invitations | Liens d'inscription limités en nombre d'utilisations et en durée, réservés ou non à une adresse, envoyés ou non par e-mail, révocables |
| Journal | Connexions et échecs, inscriptions, changements de compte, actions des administrateurs et de la CLI, filtres, export CSV |
| Réglages | Tous les réglages ci-dessous, appliqués sans redémarrage |
| Système | Version et mises à jour, Node.js, mémoire, charge, disque, PostgreSQL (taille, tables), cache, configuration ; maintenance : nettoyage des fichiers expirés, des orphelins, purge des journaux, vidage du cache, déconnexion de tout le monde |

### Réglages

* **Général** : nom du site, description (aperçus de liens), adresse publique, contact, pages de conditions
  et de confidentialité (liens en pied de page et à l'inscription).
* **Bandeau et maintenance** : message sur toutes les pages ; le mode maintenance suspend les envois
  (sauf pour les admins), les téléchargements continuent.
* **Comptes** : inscription ouverte, sur invitation ou fermée ; validation des nouveaux comptes par un admin ;
  confirmation de l'e-mail ; domaines autorisés ; e-mail aux admins à chaque inscription.
* **Sécurité** : longueur des mots de passe, durée des sessions, nombre d'échecs avant blocage et durée du blocage,
  2FA obligatoire pour les admins, essais de mot de passe de transfert par IP.
* **Envois et limites** : envois sans compte, taille d'un transfert (10 Go par défaut), taille d'un fichier,
  stockage par utilisateur, nombre de transferts actifs, nombre de fichiers par transfert, durées proposées
  et durée par défaut, mot de passe obligatoire, extensions refusées. Les limites se règlent aussi par
  utilisateur (vide : celle du réglage, 0 : illimité). Les admins ne sont pas limités.
* **Téléchargements** : bouton QR code, taille des aperçus, lien du bouton E-Mail, enregistrement des IP
  et du navigateur, anonymisation des IP (activée par défaut).
* **E-mail** : serveur SMTP (ou `FLYTO_SMTP_URL`), expéditeur, e-mail de test.
* **Conservation** : durée de conservation du journal et de l'historique des téléchargements.

## Sécurité

* Mots de passe hachés en Argon2id ; message identique que le compte existe ou non.
* Session dans un cookie `HttpOnly`, `SameSite=Lax` (`Secure` en HTTPS) ; seule son empreinte est en base.
  Chaque requête qui modifie quelque chose demande en plus un jeton CSRF.
* Limites de tentatives (connexion, inscription, mot de passe oublié, codes 2FA, mots de passe de transfert),
  partagées par Redis s'il est configuré, et blocage temporaire du compte après trop d'échecs.
* Codes TOTP utilisables une seule fois, codes de secours stockés hachés.
* Les e-mails déclenchés sans être connecté (mot de passe oublié, confirmation) ne partent que si l'adresse
  publique est définie : un lien construit depuis l'en-tête `Host` permettrait à un tiers de recevoir
  le jeton d'un autre.
* Il reste toujours au moins un administrateur actif ; un admin ne peut ni se rétrograder ni se désactiver.
* Derrière un reverse proxy, mets `FLYTO_TRUST_PROXY` pour que les IP et le cookie `Secure` soient justes.

## Redis

Facultatif. Avec `FLYTO_REDIS_URL`, Redis garde pendant une minute les sessions déjà vérifiées
(pas de requête SQL à chaque morceau de 5 Mo envoyé), les compteurs de tentatives et les statistiques
du tableau de bord (30 secondes). Sans Redis, le même cache vit dans la mémoire du processus.
Si Redis tombe, Flyto continue avec la base. Le compose le lance sans persistance, limité à 64 Mo.
