# Mes tâches — PWA todo

Petite application de tâches (tâches du jour + projets), avec thèmes, choix de langue
(FR / EN) et espace de réflexion visuel. 100 % statique, aucune dépendance,
fonctionne hors-ligne et s'installe sur mobile.

## Lancer en local
Ouvrir `index.html` dans un navigateur, ou servir le dossier :

    python3 -m http.server 8000

puis ouvrir http://localhost:8000

Note : le service worker (mode hors-ligne) ne s'active que via un serveur (http/https),
pas en ouvrant le fichier directement (`file://`).

## Déployer sur GitHub Pages
1. Créer un dépôt et y pousser le contenu de ce dossier.
2. Sur GitHub : **Settings > Pages > Source** = branche `main`, dossier `/ (root)`.
3. L'app sera servie sur `https://<utilisateur>.github.io/<dépôt>/`.

Tous les chemins sont relatifs (`./`), donc l'app marche à la racine comme dans un
sous-dossier. Le fichier `.nojekyll` évite que GitHub ignore certains fichiers.

## Installer sur Android
Ouvrir l'URL dans Chrome, puis menu **⋮ > Ajouter à l'écran d'accueil**.

## Structure
    index.html            page + écran d'accueil + onglets
    style.css             styles + thèmes (11, dont sakura / aquatique / forêt / boréal)
    app.js                logique, i18n, stockage local
    manifest.webmanifest  métadonnées d'installation
    service-worker.js     cache hors-ligne
    icons/                icône de l'app : icon.svg est le maître, les PNG 192 / 512
                          en sont rendus ; favicon.svg est la variante d'onglet
    icons/alt/            icône de rechange (l'horizon), prête mais non branchée
