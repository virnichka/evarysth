# Prompt pour Gemini — optimisation du suivi des commandes Evarysth

> À copier tel quel dans Gemini. Sa réponse est conçue pour être recollée dans Claude.

---

Tu es consultant en opérations e-commerce et en outils no-code / low-code. Tu vas critiquer un processus de
traitement des commandes conçu par un autre assistant (Claude), puis proposer mieux. Ta réponse sera recollée
telle quelle dans Claude, qui la lira, la contredira si besoin et implémentera la solution retenue : écris pour
un pair technique, pas pour un débutant. Sois direct, concret, chiffré quand c'est possible. Ne flatte pas :
si un choix est mauvais, dis-le et explique pourquoi.

## 1. Contexte de l'entreprise

- **Evarysth** : petite boutique en ligne française (micro-entreprise, **une seule personne**) qui vend des
  pièces imprimées en 3D (rangement, supports, accessoires), noir mat par défaut, 2-3 coloris par produit.
- Chaque produit existe en **3 tailles standard** ou en **sur-mesure** (1 à 3 cotes en mm saisies par le
  client). Le sur-mesure représente **la majorité des ventes**.
- Le propriétaire **ne fabrique pas** : il sous-traite l'impression à un ou plusieurs **fabricants** (imprimeurs
  3D indépendants). Aujourd'hui un seul fabricant ; à terme plusieurs, car une commande peut mêler des articles
  qu'un même fabricant ne sait pas tous faire (matière, coloris).
- Volume actuel : **lancement**, ventes encore fermées (Stripe en mode test). Hypothèse de travail : 0 à 30
  commandes / mois la 1re année, peut-être 100+ ensuite.
- Le propriétaire gère cela à côté d'autres activités, souvent **depuis son téléphone**.

## 2. Stack technique actuelle

- Site statique (HTML/CSS/JS sans build) sur **GitHub Pages**, catalogue dans un fichier JS.
- Paiement : **Stripe Checkout** via un **Cloudflare Worker** (prix recalculés côté serveur).
- Back-office : **un Google Sheet** (compte Gmail perso), lu/écrit par le Worker via un compte de service.
  Pas de base de données, pas de page d'admin.
- E-mails transactionnels : **Brevo** (API), contenus codés dans le Worker.
- Fichiers STL standards : **Cloudflare R2** (prévu, pas encore activé), servis par lien signé 14 jours ;
  STL sur-mesure : **lien Google Drive collé à la main**.
- Tâche planifiée Cloudflare (**cron toutes les 10 min**) qui lit le Sheet et déclenche les e-mails.
- Stripe reste la référence pour l'argent (reçus, remboursements).

## 3. Processus actuel, étape par étape

### Modèle de données (Google Sheet)
- **`Commandes EV`** : une ligne par commande client (`EV-AAAA-NNNN`, seul n° vu par le client). Statut
  **calculé par formule** à partir des lignes fournisseur (`payee`, `en_fabrication`, `partiellement_expediee`,
  `expediee`, `livree`, `incident`, `remboursee`, `annulee`), avec une colonne « Statut forcé » manuelle.
- **`Commandes CF`** : une ligne **par article** ; n° fournisseur `CF-AAAA-NNNN-X` (lettre = fabricant), seul n°
  vu par le fabricant. 9 statuts : `payee`, `fichier_a_produire`, `envoyee_fabricant`, `acceptee`, `expediee`,
  `livree`, `incident`, `remboursee`, `annulee`. Colonnes : fabricant (menu), lien STL, transporteur, n° de suivi,
  « Action requise » (formule), « Commande OpenSCAD » (formule), « Dernier statut notifié » (réservée au Worker).
- **`Journal`** : une ligne par changement de statut (date, n°, ancien → nouveau, auteur worker/fabricant/propriétaire).
- **`Fabricants`** : nom, e-mail, délai, « livre le client » oui/non. **`Listes`** : valeurs des menus.
- Onglets hérités d'un ancien suivi manuel (`Synthèse`, `Livre des recettes`, `Checklist`, `Modèles d'e-mails`,
  `Après-vente`, `Mode d'emploi`) qui pointent **encore sur l'ancien onglet** : ils ne sont plus alimentés.

### Ce qui est automatique
1. Paiement Stripe → webhook → le Worker écrit la ligne EV + une ligne CF par article (anti-doublon par id de
   session Stripe, numérotation « écrire puis vérifier » car Sheets n'a pas de verrou), envoie l'e-mail client
   « commande reçue » et une « fiche de fabrication » par e-mail au propriétaire.
2. Statut initial de chaque article : `payee` (standard) ou `fichier_a_produire` (sur-mesure).
3. Toutes les 10 min, le cron compare `Statut` et `Dernier statut notifié` sur chaque ligne CF :
   - attribue les n° CF (regroupement par commande + fabricant) dès qu'un fabricant est choisi ;
   - `envoyee_fabricant` → e-mail au fabricant (articles, cotes, coloris, lien STL, adresse client seulement si
     le fabricant livre le client, et deux liens signés « Accepter » / « Expédier ») ;
   - `expediee` → e-mail au client avec transporteur + suivi (« un colis de votre commande… » s'il y en a plusieurs) ;
   - pas d'`acceptee` 48 h après l'envoi → une relance par e-mail **au propriétaire** (pas au fabricant) ;
   - journalise tout changement fait à la main dans le Sheet.
4. Le fabricant clique « Accepter » puis « Expédier » (formulaire transporteur + n° de suivi) : le Worker met à
   jour toutes les lignes de la CF.

### Ce que le propriétaire fait à la main, par commande
1. Ouvrir le Sheet, onglet `Commandes CF`.
2. **Choisir le fabricant** dans un menu, ligne par ligne (même quand il n'y en a qu'un).
3. Sur-mesure : copier la commande OpenSCAD générée, la lancer **en local sur son ordinateur**, téléverser le STL
   sur Google Drive, régler le partage, **coller le lien** dans « Lien STL ».
4. Passer **chaque ligne** de la CF à `envoyee_fabricant` (si une ligne est oubliée, le groupe est incohérent).
5. Attendre jusqu'à 10 min que le cron envoie l'e-mail ; surveiller ensuite l'acceptation (relance à 48 h).
6. Si le fabricant ne clique pas : saisir lui-même transporteur et suivi, et le statut.
7. **Passer à `livree` à la main** (aucun suivi transporteur automatique).
8. Incident / remboursement : rembourser **dans Stripe**, puis reporter `remboursee` / `annulee` **dans le Sheet**
   (double saisie, rien ne synchronise les deux).
9. Changer de fabricant après envoi : remettre les lignes à `payee`, changer le fabricant, repasser à `envoyee_fabricant`.
10. Règles à respecter : ne jamais supprimer de ligne, ne jamais écrire dans 5 colonnes protégées (simple
    avertissement), ne pas casser les formules d'en-tête (`MAP`/`FILTER`/`COUNTIFS`).

### Ce qui n'existe pas du tout
- Coût fournisseur, facture fournisseur, paiement du fabricant, marge par commande.
- Livre des recettes alimenté (obligatoire en micro-entreprise) ; rapprochement avec les versements Stripe.
- Date de livraison promise au client et alerte de retard.
- Vue « ce que je dois faire aujourd'hui » utilisable sur téléphone.
- Suivi des retours / SAV structuré.
- Génération automatique des STL sur-mesure (idée V2 : GitHub Action OpenSCAD → R2).
- Proposition automatique du fabricant (idée V2 : capacités par fabricant).

### Prérequis encore non faits
Compte de service Google et secrets Cloudflare non posés, R2 non activé, ligne fabricant vide : **le circuit
n'a jamais tourné en réel**. C'est donc le bon moment pour changer d'approche si nécessaire.

## 4. Points faibles déjà identifiés (par Claude)

1. **Trop de clics par commande** : choisir le fabricant puis changer le statut de chaque ligne, alors qu'avec
   un seul fabricant tout pourrait partir seul.
2. **Le sur-mesure est le goulot** : OpenSCAD local + Drive + copier-coller du lien, pour la majorité des ventes.
3. **Latence de 10 min** et aucun retour visible dans le Sheet de ce que le cron a fait ou raté.
4. **Le Sheet sert à la fois de base de données et d'interface** : formules d'en-tête fragiles, colonnes
   « interdites » protégées par simple avertissement, numérotation sans verrou, limite de lignes de la grille,
   mauvaise ergonomie mobile.
5. **Deux niveaux EV / CF** : juste sur le principe, mais lourd à lire pour une personne seule avec un fabricant.
6. **Argent hors du système** : remboursements en double saisie Stripe/Sheet, aucun coût fournisseur, livre
   des recettes débranché.
7. **Notifications dispersées** : fiche de fabrication par e-mail + Sheet + relances par e-mail.
8. **Statut `livree` manuel**, donc souvent oublié ; pas d'alerte de retard.

## 5. Pistes envisagées (non tranchées)

- A. **Garder le Sheet mais le simplifier** : fabricant par défaut pré-rempli, envoi automatique au fabricant
  pour le standard, statut changé une fois par CF (case à cocher « Envoyer » sur la ligne EV), onglet
  « À faire » filtré, colonne « Dernier message du Worker » pour voir les erreurs.
- B. **Automatiser le sur-mesure** : génération OpenSCAD côté serveur (GitHub Action ou conteneur) → STL sur R2
  → lien signé dans l'e-mail fabricant, sans intervention.
- C. **Remplacer le Sheet** par une base (Cloudflare D1) + une petite page d'admin mobile servie par le Worker
  (liste des actions du jour, boutons d'action), le Sheet devenant un export en lecture seule.
- D. **Outil tiers** (Airtable, Notion, un back-office type Shopify/Sendcloud, un portail fabricant existant…).
- E. **Synchroniser l'argent** : webhooks Stripe `charge.refunded` → statut automatique ; livre des recettes
  généré depuis Stripe ; colonnes coût fournisseur / payé le.
- F. **Suivi transporteur** automatique (API agrégateur) pour passer `livree` seul et alerter les retards.

## 6. Ce que j'attends de toi

Réponds **en français**, dans **exactement** cette structure Markdown (Claude s'appuiera dessus) :

### 1. Diagnostic
Ce qui est bien conçu et à garder ; ce qui est mal conçu, sur-conçu ou risqué. Classe les points faibles
(les miens + ceux que tu ajoutes) par impact sur le temps du propriétaire et sur le risque d'erreur client.

### 2. Critique des pistes A à F
Pour chacune : verdict (garder / adapter / rejeter), justification, coût de mise en place estimé, coût récurrent,
risque. Dis clairement si le Sheet doit rester l'outil principal **à ce volume**, et à partir de quel volume
ou de quel signal il faudrait en changer.

### 3. Processus cible
Le parcours idéal d'une commande standard **et** d'une commande sur-mesure, étape par étape, en marquant chaque
étape « auto » ou « manuel ». Objectif : **nombre d'actions manuelles du propriétaire par commande** le plus bas
possible (donne le chiffre avant / après). Précise ce que voit le propriétaire, le fabricant et le client.

### 4. Modèle de données cible
Entités, champs essentiels, statuts (propose une liste réduite si possible), qui écrit quoi. Dis ce qu'on
supprime de l'actuel.

### 5. Plan de mise en œuvre
3 à 6 étapes ordonnées, chacune livrable seule et testable, la première faisable avant la 1re vraie vente.
Pour chaque étape : objectif, ce qui change, critère de réussite.

### 6. Questions ouvertes et désaccords
Les hypothèses que tu as dû faire, les questions à poser au propriétaire, et les points où tu t'attends à ce
que Claude ne soit pas d'accord (avec ton argument d'avance).

Contraintes à respecter :
- Personne seule, budget minimal (outils gratuits ou quasi gratuits privilégiés), pas de serveur à administrer.
- Le dépôt du site est **public** : aucun secret dans le code.
- RGPD : l'adresse du client ne va au fabricant que s'il livre lui-même ; tout nouveau sous-traitant est à
  déclarer.
- Pas de promesse invérifiable au client (délais garantis, etc.).
- Ne propose pas de réécrire ce qui marche (paiement Stripe, liens fournisseur signés, e-mails Brevo) sans
  raison forte.
