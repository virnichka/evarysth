# Guide des réglages : chaîne de fabrication (Fabrication · phase 2)

Pour toi, propriétaire du site. Ces réglages branchent le stockage des fichiers (Cloudflare R2) et la génération
automatique des fichiers d'impression à chaque commande payée. Tout le code est déjà en ligne mais **éteint** : tant
que ces réglages ne sont pas faits, rien ne change pour les clients ni pour toi.

- **Durée** : 30 à 45 minutes en tout, faisables depuis un téléphone (navigateur, pas d'application à installer).
  Un ordinateur rend seulement la copie des en-têtes du Sheet (étape 7) plus confortable.
- **Règle** : ne colle **jamais** une clé ou un secret dans une conversation avec Claude (ni ailleurs que dans les
  cases indiquées). Claude n'en a pas besoin : il vérifie depuis GitHub que tout fonctionne (fin du guide).
- **Ordre conseillé** : étapes 1 à 7 dans l'ordre. L'étape 6 (secrets du Worker) est **l'interrupteur** : dès que les
  deux secrets y sont, chaque commande payée (mode test) déclenche la génération. Tu peux t'arrêter avant l'étape 6 et
  la faire au moment de la Fabrication · phase 2b.
- Garde une note ouverte (gestionnaire de mots de passe de préférence) pour y coller provisoirement les valeurs des
  étapes 3 et 5 : elles ne s'affichent qu'une fois.

---

## 1. Activer R2 sur le compte Cloudflare (moyen de paiement)
R2 a une offre gratuite (10 Go, largement assez), mais Cloudflare demande un moyen de paiement pour l'activer.
1. Ouvre <https://dash.cloudflare.com> et connecte-toi.
2. Menu (☰ en haut à gauche sur téléphone) → **Storage & databases** → **R2 Object Storage** → **Overview**.
3. Si une page « Purchase R2 » ou « Add R2 subscription » s'affiche : renseigne une carte, choisis l'offre gratuite
   (« Free / Standard, pay as you go »), valide.
4. **Vérifier** : la page R2 affiche maintenant « Buckets » avec un bouton **Create bucket**.

## 2. Créer le bucket `evarysth-stl`
1. Sur la page R2 → **Create bucket**.
2. **Bucket name** : `evarysth-stl` (exactement, en minuscules, avec le tiret).
3. **Location** : Automatic. **Default storage class** : Standard. → **Create bucket**.
4. **Vérifier** : `evarysth-stl` apparaît dans la liste des buckets.
5. *Facultatif (durée de conservation, 24 mois proposés, point ouvert)* : dans le bucket → **Settings** → **Object
   lifecycle rules** → **Add rule** → nom `commandes-24-mois`, préfixe `commandes/`, action « Delete objects » après
   `730` jours → **Save**. Sans règle, rien n'est effacé.

## 3. Créer le jeton R2 (lecture + écriture, ce seul bucket)
1. Page R2 → **Overview** → à droite, **Manage API tokens** (ou « API » → « Manage API tokens »).
2. **Create Account API token** (ou « Create API token »).
3. **Token name** : `evarysth-fabrication`.
4. **Permissions** : **Object Read & Write**.
5. **Specify bucket(s)** : **Apply to specific buckets only** → coche `evarysth-stl` (et rien d'autre).
6. **TTL** : Forever. → **Create API Token** (ou « Create Account API Token »).
7. La page suivante affiche trois valeurs, **une seule fois**. Copie-les dans ta note :
   - **Access Key ID** ;
   - **Secret Access Key** ;
   - l'**endpoint** `https://<identifiant>.r2.cloudflarestorage.com` : l'identifiant (32 caractères, avant
     `.r2.cloudflarestorage.com`) est ton **Account ID**. Il est aussi affiché sur la page R2 Overview (« Account ID »).
8. **Vérifier** : de retour sur « Manage API tokens », `evarysth-fabrication` est listé.

## 4. Ranger les valeurs R2 dans GitHub (secrets d'Actions)
1. Ouvre <https://github.com/virnichka/evarysth/settings/secrets/actions> (connecté à GitHub ; sur téléphone, accepte
   « version ordinateur » si la page Settings ne s'affiche pas).
2. Onglet **Secrets** → **New repository secret** :
   - **Name** `R2_ACCESS_KEY_ID`, **Secret** = l'Access Key ID → **Add secret** ;
   - **New repository secret** : **Name** `R2_SECRET_ACCESS_KEY`, **Secret** = la Secret Access Key → **Add secret**.
3. Onglet **Variables** (même page) → **New repository variable** : **Name** `R2_ACCOUNT_ID`, **Value** = l'Account ID
   (ce n'est pas un secret) → **Add variable**.
4. **Vérifier** : onglet Secrets, tu vois `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY` ; onglet Variables,
   `R2_ACCOUNT_ID` avec sa valeur.

## 5. Créer le secret partagé `FABRICATION_HMAC` et le ranger dans GitHub
C'est un mot de passe que seuls GitHub et le Worker connaissent : le Worker refuse tout rappel qui n'est pas signé avec.
1. Génère un mot de passe aléatoire de **64 caractères, lettres et chiffres seulement** (sans symbole) :
   - iPhone : app **Mots de passe** (ou Réglages → Mots de passe) → **+** → le champ mot de passe propose un mot de passe
     fort ; ou ton gestionnaire (1Password, Bitwarden, Proton Pass…) → « Générer » → 64 caractères, symboles décochés ;
   - Android : Google Password Manager ou ton gestionnaire, même réglage.
2. Copie-le dans ta note.
3. GitHub → <https://github.com/virnichka/evarysth/settings/secrets/actions> → **New repository secret** → **Name**
   `FABRICATION_HMAC`, **Secret** = ce mot de passe → **Add secret**.
4. **Vérifier** : `FABRICATION_HMAC` apparaît dans la liste des secrets.

## 6. Interrupteur : secrets du Worker (`GH_ACTIONS_TOKEN`, `FABRICATION_HMAC`)
**a. Jeton GitHub du Worker** (lui permet de lancer le workflow de fabrication, rien d'autre)
1. Ouvre <https://github.com/settings/personal-access-tokens/new> (« Fine-grained token »).
2. **Token name** : `evarysth-worker-fabrication`. **Expiration** : **Custom** → une date dans 1 an (note-la dans ton
   agenda : il faudra le renouveler ; une alerte dans /admin est prévue en Fabrication · phase 3).
3. **Resource owner** : `virnichka`. **Repository access** : **Only select repositories** → `virnichka/evarysth`.
4. **Permissions** → **Repository permissions** → **Actions** : **Read and write**. Ne touche à rien d'autre
   (« Metadata : Read-only » s'ajoute tout seul, c'est normal).
5. **Generate token** → copie le jeton (`github_pat_…`), affiché une seule fois.

**b. Les poser sur le Worker**
1. <https://dash.cloudflare.com> → **Workers & Pages** → **evarysth-checkout** → **Settings** → **Variables and Secrets**
   → **Add**.
2. **Type** : **Secret** ; **Variable name** : `GH_ACTIONS_TOKEN` ; **Value** : le jeton `github_pat_…` → **Deploy**
   (ou « Save and deploy »).
3. **Add** de nouveau → **Type** Secret ; `FABRICATION_HMAC` ; **Value** : **le même** mot de passe qu'à l'étape 5
   → **Deploy**.
4. **Vérifier** : la liste montre `GH_ACTIONS_TOKEN` et `FABRICATION_HMAC` de type « Secret » (valeur masquée), à
   côté des secrets existants (Stripe, Google…). Les prochains déploiements automatiques du Worker les conservent.

## 7. Colonnes du Sheet (onglet « Commandes CF »)
1. Ouvre le Google Sheet des commandes → onglet **Commandes CF**.
2. Ligne 1 (en-têtes), dans les premières cellules **vides à droite** des colonnes existantes, ajoute ces six en-têtes,
   un par cellule, orthographe exacte (accents, majuscules, espaces) :

   | Génération | SHA | Masse g | Temps min | Plateaux | Motif génération |
   |---|---|---|---|---|---|

   Sur ordinateur, tu peux copier cette ligne (séparée par des tabulations) et la coller dans la 1re cellule vide :
   `Génération	SHA	Masse g	Temps min	Plateaux	Motif génération`
3. Ne déplace ni ne renomme les colonnes existantes. L'ordre des nouvelles colonnes est libre (lues par leur nom).
4. **Vérifier** : six nouveaux en-têtes sur la ligne 1, rien d'autre de changé. Les lignes en dessous restent vides :
   le Worker les remplit (`en_cours`, puis `prete` ou `echec`).

---

## Ce que Claude vérifie ensuite (Fabrication · phase 2b, sans te demander aucun secret)
Dis simplement « réglages faits » (et lesquels). Claude pourra alors :
- **R2 et `FABRICATION_HMAC` côté GitHub** : lancer `fabrication.yml` avec un n° fictif (`CF-2000-0000-1`) **sans** le mode
  essai : fichiers envoyés dans R2 (le journal du run le montre), puis rappel au Worker. Réponse **404** (« article
  introuvable ») = signature acceptée, donc `FABRICATION_HMAC` identique des deux côtés ; **401** = valeurs différentes ;
  **503** = secret absent du Worker.
- **Jeton GitHub du Worker et colonnes du Sheet** : une commande test (`?checkout=test`, carte de test Stripe
  4242 4242 4242 4242) doit faire apparaître dans « Commandes CF » `Génération = en_cours`, puis `prete` avec masse,
  temps et plateaux en moins de 10 minutes ; le run correspondant est visible dans l'onglet Actions de GitHub.
- **Activer le binding R2** du Worker (`wrangler.toml`), puis vérifier `/fichier/` et le déploiement.
- Les en-têtes du Sheet, si tu lui donnes le lien du classeur (ce n'est pas un secret).

## En cas de souci
- **Run « Fabrication » rouge avec « Fabrication non configurée : Manquant … »** : le message liste exactement ce qui
  manque dans GitHub (étapes 4 et 5). Rien n'a été généré ni envoyé.
- **Ligne « Fichiers non générés (fabrication pas encore réglée) » dans l'historique d'une commande** (/admin) : un des
  deux secrets du Worker manque (étape 6) ; la commande suit son cours normal.
- **`Génération = a_declencher`** : GitHub n'a pas répondu ; le Worker réessaie seul toutes les 10 minutes (6 essais),
  puis passe à `echec` avec le motif. Jeton expiré ou mauvais droits : refaire l'étape 6a.
- **Jeton GitHub perdu ou expiré** : en créer un nouveau (6a) et remplacer la valeur de `GH_ACTIONS_TOKEN` (6b, bouton
  « Edit » du secret). Même chose pour `FABRICATION_HMAC` : changer la valeur **aux deux endroits** (étapes 5 et 6b).
