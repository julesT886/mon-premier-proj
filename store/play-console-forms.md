# Questionnaires Play Console — réponses pour Brumeterre

Réponses correspondant au code actuel. **Si tu actives l'IA (backend + `EXPO_PUBLIC_API_URL`),
mets à jour la section « Sécurité des données »** (voir plus bas).

## Règles relatives aux applications → Contenu de l'application

| Rubrique                          | Réponse                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| **Politique de confidentialité**  | `https://julest886.github.io/mon-premier-proj/privacy.html`                     |
| **Accès aux applications**        | Toutes les fonctionnalités sont accessibles sans restriction (pas de connexion) |
| **Annonces**                      | Non, l'application ne contient pas d'annonces                                   |
| **Public cible**                  | 18 ans et plus (le jeu vise les adultes ; évite les règles « Familles »)        |
| **Applications d'actualités**     | Non                                                                             |
| **Applications de santé**         | Non                                                                             |
| **Applications financières**      | Non                                                                             |
| **Applications gouvernementales** | Non                                                                             |
| **ID publicitaire**               | Non, l'application n'utilise pas l'identifiant publicitaire                     |

## Classification du contenu (questionnaire IARC)

- Catégorie : **Jeu**.
- **Violence** : oui, violence **fantastique** légère. Combats contre des créatures imaginaires
  (loups de mousse, golems, kraken…), barres de vie et chiffres de dégâts, **pas de sang, pas de
  démembrement, pas d'humains réalistes**.
- Sexualité, nudité, langage grossier, drogues, alcool, tabac, jeux d'argent : **non**.
- Contenu généré par les utilisateurs / échanges entre utilisateurs : **non** (le seul texte libre
  est le nom du héros, jamais partagé avec d'autres joueurs).
- Partage de localisation : **non**. Achats numériques : **non**.

Classification attendue : PEGI 7 / Everyone 10+ environ (le questionnaire la calcule).

## Sécurité des données (Data safety)

### Version actuelle (IA désactivée, `EXPO_PUBLIC_API_URL` vide)

- **Votre application collecte-t-elle ou partage-t-elle des données utilisateur ?** → **Non**.
  Toute la partie reste sur l'appareil ; rien n'est transmis.
- Chiffrement en transit : sans objet (aucune transmission).
- Suppression des données : l'utilisateur peut tout effacer (Réglages → Recommencer une partie,
  ou désinstallation).

### Si l'IA est activée plus tard

Déclarer alors :

| Type de données                                                                            | Collectée | Partagée                                | Finalité                | Facultative |
| ------------------------------------------------------------------------------------------ | --------- | --------------------------------------- | ----------------------- | ----------- |
| Identifiants de l'appareil ou autres (identifiant aléatoire créé par l'app)                | Oui       | Non                                     | Fonctionnalité de l'app | Non         |
| Activité dans l'application → autres actions (données de jeu : build, combats, événements) | Oui       | Oui (Anthropic, fournisseur de service) | Fonctionnalité de l'app | Oui         |
| Autre contenu généré par l'utilisateur (nom du héros)                                      | Oui       | Oui (Anthropic, fournisseur de service) | Fonctionnalité de l'app | Oui         |

- Données **chiffrées en transit** : oui (HTTPS).
- Traitement **éphémère** possible à déclarer : oui (cache serveur de 24 h maximum).
- Suppression : effacement automatique du cache sous 24 h ; aucune donnée conservée côté serveur
  au-delà.

## Fiche technique de l'app

| Champ          | Valeur                                                               |
| -------------- | -------------------------------------------------------------------- |
| Nom du package | `com.brumeterre.app` (définitif après la première publication)       |
| Version        | `1.0.0` (versionCode `1`, à incrémenter à chaque envoi)              |
| Catégorie      | Jeu → Jeu de rôle                                                    |
| Coordonnées    | `brumeterre.dev@gmail.com` (e-mail de contact, visible sur la fiche) |
