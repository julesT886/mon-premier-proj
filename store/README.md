# Publier Brumeterre sur Google Play

Tout ce qu'il faut est dans ce dossier :

| Fichier                 | Contenu                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `play-store-listing.md` | Nom, descriptions FR/EN, catégorie, liste des visuels                        |
| `play-console-forms.md` | Réponses aux questionnaires (confidentialité, contenu, sécurité des données) |
| `graphics/`             | Icône 512×512 et image de présentation 1024×500                              |
| `screenshots/`          | 6 captures téléphone 1080×1920                                               |

Politique de confidentialité en ligne : `https://julest886.github.io/mon-premier-proj/privacy.html`
(source : `apps/mobile/public/privacy.html`).

## Étapes

### 1. Compte Expo et premier build (sur un ordinateur)

EAS Build fabrique l'app Android dans le cloud d'Expo (pas besoin d'Android Studio).
Le plan gratuit d'Expo suffit pour commencer.

```bash
git clone https://github.com/julesT886/mon-premier-proj.git
cd mon-premier-proj
corepack enable && pnpm install
cd apps/mobile
npx eas-cli@latest login            # crée un compte sur expo.dev si besoin
npx eas-cli@latest init             # lie le projet à ton compte (ajoute un projectId dans app.json)
```

**APK de test** (à installer directement sur un téléphone Android) :

```bash
npx eas-cli@latest build -p android --profile preview
```

À la fin, Expo affiche un lien et un QR code pour télécharger l'APK. Installe-le sur un
Android et joue quelques minutes avant d'aller plus loin.

**Fichier pour le Play Store** (format AAB) :

```bash
npx eas-cli@latest build -p android --profile production
```

La première fois, EAS propose de **générer la clé de signature** : accepte, Expo la conserve
pour toi (et Google Play App Signing la gère côté Google).

### 2. Créer l'application dans la Play Console

1. Play Console → **Créer une application** : nom « Brumeterre », langue par défaut français,
   **Jeu**, **Gratuite**, accepte les déclarations.
2. **Fiche principale** : copie les textes de `play-store-listing.md` et envoie les visuels.
3. **Contenu de l'application** : remplis chaque rubrique avec `play-console-forms.md`.

### 3. Test fermé (obligatoire pour les nouveaux comptes personnels)

1. **Tests → Test fermé → Créer un canal**.
2. **Testeurs** : crée une liste d'adresses e-mail (au moins 12 personnes, vérifie le nombre
   demandé dans la Play Console) et copie le **lien d'inscription** à leur envoyer.
3. **Créer une release** → importe le fichier `.aab` du build `production`.
4. Envoie la release en examen. Une fois validée, les testeurs s'inscrivent via le lien et
   installent l'app depuis le Play Store.
5. Les testeurs doivent **garder l'app installée pendant 14 jours d'affilée** (vérifie la règle
   affichée dans la Play Console).

### 4. Production

Après la période de test, la Play Console débloque la demande d'**accès à la production** :
réponds aux questions sur le test, puis crée une release de production avec le même AAB
(ou un nouveau build). Revue Google : de quelques heures à quelques jours.

## Mises à jour

À chaque nouvelle version : incrémente `android.versionCode` (et `version`) dans
`apps/mobile/app.json`, refais `eas build -p android --profile production`, puis importe le
nouvel AAB dans une release.

## Activer l'IA plus tard

1. Déploie l'API (`README.md` racine, section Fly.io) avec ta clé Anthropic.
2. Mets l'URL de l'API dans `EXPO_PUBLIC_API_URL` des profils `preview` et `production`
   de `apps/mobile/eas.json`, puis refais un build.
3. Mets à jour la **sécurité des données** dans la Play Console (`play-console-forms.md`).
