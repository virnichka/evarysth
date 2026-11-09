/* Evarysth — catalogue (données de démo)
   Chaque produit : une version standard (3 tailles) et une version sur-mesure (cotes en mm). */
window.EVARYSTH = window.EVARYSTH || {};

EVARYSTH.universes = [
  { id: "balcon", code: "01", name: "Balcon & Extérieur", short: "Balcon", sub: "sans percer",
    pitch: "Tout se clipse sur votre garde-corps. Zéro trou, zéro souci avec le propriétaire." },
  { id: "bureau", code: "02", name: "Bureau & Tech", short: "Bureau", sub: "invisible",
    pitch: "Câbles, chargeurs, casques : tout disparaît sous le plateau." },
  { id: "meubles", code: "03", name: "Meubles & Rangement", short: "Meubles", sub: "malins",
    pitch: "Les petites pièces qui manquaient à vos meubles du commerce." },
  { id: "deco", code: "04", name: "Déco & Objets", short: "Déco", sub: "à poser",
    pitch: "Des pièces à exposer, imprimées à la taille de votre étagère." }
];

/* Matières d'impression : chaque produit en désigne une (champ matiere).
   jeu (mm) : jeu d'ajustement de la matière, appliqué par le modèle 3D à chaque cote fonctionnelle
   (pièce qui entre dans un trou du client : cote − jeu ; pièce qui entoure un objet du client : cote + jeu).
   Il ne change ni la cote saisie par le client ni le prix. */
EVARYSTH.matieres = {
  pa12: { label: "Nylon PA12", court: "PA12", jeu: 0.3, perk: ["Très résistant", "Nylon industriel"],
    desc: "Nylon PA12, imprimé en 3D industrielle : léger, très résistant aux chocs, à l'humidité et aux UV." },
  petg: { label: "PETG", court: "PETG", jeu: 0.3, perk: ["Robuste", "Peu cassant"],
    desc: "PETG, le plastique des bouteilles en version technique : solide, un peu souple plutôt que cassant, et peu sensible à l'humidité." },
  asa: { label: "ASA", court: "ASA", jeu: 0.3, perk: ["Tient dehors", "Résiste aux UV"],
    desc: "ASA, un plastique pensé pour l'extérieur : il encaisse le soleil, la pluie et le gel sans jaunir ni devenir cassant." },
  pla: { label: "PLA", court: "PLA", jeu: 0.2, perk: ["Rigide", "Fini net"],
    desc: "PLA, un plastique d'origine végétale : rigide, au rendu net et précis. Il craint la forte chaleur (au-delà de 50 °C environ) : évitez la plage arrière d'une voiture en plein été." },
  pacf: { label: "Nylon carbone (PA-CF)", court: "PA-CF", jeu: 0.25, perk: ["Très rigide", "Nylon + carbone"],
    desc: "Nylon chargé de fibres de carbone : très rigide et stable, avec un toucher mat légèrement minéral. Il supporte bien la chaleur et les chocs." }
};
EVARYSTH.matiere = p => EVARYSTH.matieres[p && p.matiere] || EVARYSTH.matieres.pa12;
/* Jeu d'ajustement (mm) de la matière imprimée : celle de la fiche d'impression, sinon celle du produit */
EVARYSTH.jeu = p => (EVARYSTH.matieres[p && p.impression && p.impression.matiere] || EVARYSTH.matiere(p)).jeu;

/* Petites fabriques pour garder le catalogue lisible */
const sizes = (label, opts) => ({ label, options: opts.map(([l, hint, values]) => ({ label: l, hint, values })) });
const param = (key, label, min, max, def, step = 1, pricePerUnit) =>
  ({ key, label, min, max, step, def, ...(pricePerUnit ? { pricePerUnit } : {}) });

/* Fiche d'impression (champ impression, contrôlée par tools/lib/impression.mjs et les tests de tools/test/) :
   orientation = rotation propre (lignes, déterminant +1) du repère du modèle (Y vers le haut, comme l'aperçu)
   vers le plateau (Z vers le haut) ; pieces : orientation propre à une pièce, par volume décroissant ;
   parPlateau = exemplaires complets par plateau (Bambu Lab, 256 × 256 mm) aux cotes par défaut. */
const POSE = {
  debout: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],     // comme l'aperçu (Y → Z)
  retourne: [[1, 0, 0], [0, 0, 1], [0, -1, 0]],   // tête en bas (Y → −Z)
  aPlat: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],       // profil extrudé selon Z, couché à plat (Z → Z)
  surLeCote: [[0, 0, -1], [0, 1, 0], [1, 0, 0]]    // X → Z
};

/* shape : illustration utilisée (voir app.js) · popular : mis en avant sur l'accueil */
EVARYSTH.products = [
  /* ---------- 01 · Balcon & Extérieur ---------- */
  {
    id: "crochet-balcon", universe: "balcon", matiere: "asa", shape: "hook", model: "crochet-balcon", popular: true,
    name: "Crochet de balcon", price: 12,
    tagline: "Pour suspendre lanterne, plante ou serviette.",
    desc: "Glissez-le sur la main courante, suspendez. Résiste aux UV et à la pluie.",
    variants: sizes("Épaisseur de main courante", [["S", "≤ 35 mm", { a: 30 }], ["M", "≤ 55 mm", { a: 50 }], ["L", "≤ 75 mm", { a: 70 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "terracotta", label: "Terracotta", hex: "#c0643f", roughness: 0.7 },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 }
    ],
    impression: { matiere: "asa", orientation: POSE.aPlat, supports: false, parPlateau: 4,
      remarques: "Couché sur le flanc : le crochet garde ses fibres dans le sens de l'effort." },
    custom: { surcharge: 4, params: [param("a", "Épaisseur de main courante", 15, 100, 42)] }
  },
  {
    id: "tablette-rambarde", universe: "balcon", matiere: "asa", shape: "bracket", model: "tablette-rambarde", popular: true,
    name: "Tablette café de balcon", price: 29,
    tagline: "Une petite table pour le café, posée sur la rambarde.",
    desc: "Une tablette qui se cale sur le garde-corps : la place d'une tasse, d'un verre et d'un téléphone, sans rien percer.",
    variants: sizes("Épaisseur de rambarde", [["Fine", "20–40 mm", { a: 30, b: 220 }], ["Moyenne", "40–60 mm", { a: 50, b: 220 }], ["Large", "60–80 mm", { a: 70, b: 220 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 }
    ],
    impression: { matiere: "asa", orientation: POSE.retourne, supports: false, parPlateau: 1,
      remarques: "Tablette contre le plateau, ouverture du U vers le haut." },
    custom: { surcharge: 8, params: [param("a", "Épaisseur de la rambarde", 15, 100, 45), param("b", "Largeur de la tablette", 160, 250, 220, 10, 0.05)] }
  },

  /* ---------- 02 · Bureau & Tech ---------- */
  {
    id: "support-casque", universe: "bureau", matiere: "asa", shape: "hook", model: "support-casque", popular: true,
    name: "Support casque invisible", price: 16,
    tagline: "Le casque se range sous le bureau, hors de vue.",
    desc: "Une pince discrète qui se serre sur le plateau. Le casque pend en dessous, le bureau reste dégagé.",
    variants: sizes("Épaisseur du plateau", [["18 mm", "standard", { a: 18 }], ["25 mm", "massif", { a: 25 }], ["40 mm", "épais", { a: 40 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "sable", label: "Sable", hex: "#d8c39a", roughness: 0.65 }
    ],
    impression: { matiere: "asa", orientation: POSE.aPlat, supports: false, parPlateau: 4,
      remarques: "Couché sur le flanc, profil à plat." },
    custom: { surcharge: 4, params: [param("a", "Épaisseur du plateau", 12, 60, 28)] }
  },
  {
    id: "passe-cable", universe: "bureau", matiere: "pla", shape: "ring", model: "passe-cable", popular: true,
    name: "Passe-câble de bureau", price: 9,
    tagline: "Un trou propre pour faire passer les câbles.",
    desc: "S'emboîte dans le trou du plateau et cache ses bords. Le couvercle s'ouvre juste assez pour les câbles.",
    variants: sizes("Diamètre du trou", [["Ø 50", "petit", { a: 50 }], ["Ø 60", "standard", { a: 60 }], ["Ø 80", "grand", { a: 80 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 }
    ],
    impression: { matiere: "pla", orientation: POSE.retourne, supports: false, parPlateau: 5,
      remarques: "Deux pièces : la bague, collerette contre le plateau (l'épaulement intérieur de 1,5 mm passe sans support), et le couvercle, imprimé à part, à plat." },
    custom: { surcharge: 3, params: [param("a", "Diamètre du trou", 30, 100, 60)] }
  },
  {
    id: "crochet-appui-tete", universe: "bureau", matiere: "asa", shape: "hook", model: "crochet-appui-tete",
    name: "Crochet d'appui-tête multifonction", price: 14,
    tagline: "La tablette, le sac et la gourde rangés derrière le siège avant.",
    desc: "Une plaque fine qui pend contre le dos du siège avant, tenue par un œillet enfilé sur une tige de l'appui-tête : on sort l'appui-tête, on passe l'œillet, on le remet. Deux petits crochets reçoivent la tranche d'une tablette, deux grands crochets en bas portent un sac, un cabas ou une gourde à mousqueton. Réglez le diamètre de la tige, l'épaisseur de votre tablette et la distance entre la tige et le dos du siège.",
    variants: sizes("Épaisseur de la tablette", [["Fine", "tablette nue, 9 mm", { a: 14, b: 9, c: 35 }], ["Standard", "avec coque, 15 mm", { a: 14, b: 15, c: 35 }], ["Large", "coque épaisse, 20 mm", { a: 14, b: 20, c: 35 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 },
      { id: "moka", label: "Moka", hex: "#5b4034", roughness: 0.6 }
    ],
    impression: { matiere: "asa", orientation: POSE.retourne, supports: true, parPlateau: 6,
      remarques: "Tête en bas, languette à œillet contre le plateau (comme le modèle d'origine) ; supports sous les crochets." },
    custom: { surcharge: 3, params: [
      param("a", "Diamètre de la tige d'appui-tête", 10, 20, 14),
      param("b", "Épaisseur de la tablette", 6, 22, 15),
      param("c", "Distance tige – dos du siège", 25, 55, 35)
    ] },
    photos: [
      { src: "assets/photos/crochet-appui-tete/1.webp", alt: "Tablette posée sur les petits crochets derrière un siège avant, un sac et une gourde suspendus aux grands crochets" },
      { src: "assets/photos/crochet-appui-tete/2.webp", alt: "Gros plan des grands crochets : sangle de sac et mousqueton de gourde", pos: "50% 40%" }
    ],
    photosNote: "Photos d'illustration : modèle proche, la fixation et les détails diffèrent de la pièce livrée"
  },

  /* ---------- 03 · Meubles & Rangement ---------- */
  {
    id: "equerre-l", universe: "meubles", matiere: "petg", shape: "bracket", model: "equerre",
    name: "Équerre en L sur-mesure", price: 9,
    tagline: "Renforce un angle ou soutient une étagère, à vos cotes.",
    desc: "Une équerre pleine, avec un congé dans l'angle pour plus de rigidité. Réglez la longueur de chaque branche et la largeur, et faites tourner la pièce en 3D avant de commander.",
    variants: sizes("Taille", [["Petite", "60 × 60 mm", { a: 60, b: 60, c: 15 }], ["Moyenne", "100 × 100 mm", { a: 100, b: 100, c: 20 }], ["Grande", "150 × 150 mm", { a: 150, b: 150, c: 30 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 }
    ],
    impression: { matiere: "petg", orientation: POSE.aPlat, supports: false, parPlateau: 4,
      remarques: "Couchée sur une face : le profil en L est à plat." },
    custom: { surcharge: 3, params: [
      param("a", "Longueur de la 1re branche", 50, 200, 100, 1, 0.02),
      param("b", "Longueur de la 2e branche", 50, 200, 100, 1, 0.02),
      param("c", "Largeur de la pièce", 10, 40, 20, 1, 0.05)
    ] }
  },
  {
    id: "boite-rugged", universe: "meubles", matiere: "pacf", shape: "case", model: "boite-rugged", popular: true,
    name: "Boîte robuste à loquets", price: 32,
    tagline: "Une boîte qui encaisse les chocs, aux dimensions de ce que vous rangez.",
    desc: "Couvercle à charnière intégrée, deux loquets qui se clipsent et un rebord qui emboîte le couvercle. Réglez la longueur, la largeur et la hauteur intérieures : charnière, loquets et parois gardent leurs vraies cotes, seule la boîte s'agrandit.",
    variants: sizes("Format intérieur", [["S", "120 × 80 × 40 mm", { a: 120, b: 80, c: 40 }], ["M", "150 × 100 × 50 mm", { a: 150, b: 100, c: 50 }], ["L", "220 × 150 × 80 mm", { a: 220, b: 150, c: 80 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "sable", label: "Sable", hex: "#d8c39a", roughness: 0.65 },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 }
    ],
    impression: { matiere: "pacf", orientation: POSE.debout, supports: false, parPlateau: 1,
      remarques: "Quatre pièces dans l'orientation des fichiers d'origine : boîte ouverture en haut, couvercle retourné, loquets debout sur leur tranche.", pieces: [
      { nom: "boîte" }, { nom: "couvercle", orientation: POSE.retourne },
      { nom: "loquet", orientation: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]] }, { nom: "loquet", orientation: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]] }] },
    custom: { surcharge: 6, params: [
      param("a", "Longueur intérieure", 110, 245, 150, 5, 0.06),
      param("b", "Largeur intérieure", 60, 230, 100, 5, 0.08),
      param("c", "Hauteur intérieure", 35, 150, 50, 5, 0.1)
    ] },
    photos: [
      { src: "assets/photos/boite-rugged/1.webp", alt: "Boîte robuste ouverte, couvercle garni de mousse, outils et multimètre rangés à l'intérieur" },
      { src: "assets/photos/boite-rugged/2.webp", alt: "Gros plan d'un loquet clipsé sur le rebord du couvercle", pos: "50% 40%" }
    ],
    photosNote: "Photos : coloris de démonstration, mousse et outils non fournis"
  },
  {
    id: "support-casque-gyroide", universe: "meubles", matiere: "pacf", shape: "headstand", model: "support-casque-gyroide",
    name: "Support casque Gyroïde", price: 29,
    tagline: "Un vrai présentoir pour votre casque, léger comme une dentelle.",
    desc: "Socle plein, colonne et tête en treillis gyroïde, appui bombé qui épouse l'arceau sans le marquer. Réglez la hauteur pour que les coussinets ne touchent pas le bureau, et la largeur de votre arceau, que l'appui déborde de 4 mm de chaque côté : le treillis garde la même maille, il gagne simplement des cellules.",
    variants: sizes("Taille du casque", [["Compact", "supra-auriculaire", { a: 220, b: 100 }], ["Standard", "circum-auriculaire", { a: 250, b: 120 }], ["Grand", "casque de studio", { a: 255, b: 140 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 }
    ],
    impression: { matiere: "pacf", orientation: POSE.debout, supports: false, parPlateau: 2,
      remarques: "Debout sur son socle : le treillis gyroïde se soutient seul." },
    custom: { surcharge: 6, params: [
      param("a", "Hauteur totale du support", 200, 255, 250, 5, 0.05),
      param("b", "Largeur de l'arceau du casque", 80, 160, 120, 5, 0.06)
    ] },
    photos: [
      { src: "assets/photos/support-casque-gyroide/1.webp", alt: "Support casque Gyroïde posé sur un bureau en bois, un casque circum-auriculaire suspendu à son appui" },
      { src: "assets/photos/support-casque-gyroide/2.webp", alt: "Support casque Gyroïde vu de trois quarts : socle plein, colonne et tête en treillis" },
      { src: "assets/photos/support-casque-gyroide/3.webp", alt: "Support casque Gyroïde vu de l'autre côté, nervure centrale dans la tête" },
      { src: "assets/photos/support-casque-gyroide/4.webp", alt: "Gros plan du treillis gyroïde sous l'appui bombé" }
    ],
    photosNote: "Photos : coloris de démonstration, casque non fourni"
  },
  {
    id: "organiseur-tiroir", universe: "meubles", matiere: "pacf", shape: "tray", model: "organiseur-tiroir", popular: true,
    name: "Organiseur de tiroir", price: 28,
    tagline: "Un casier qui épouse exactement votre tiroir.",
    desc: "Fini les centimètres perdus : l'organiseur est fabriqué à la cote intérieure de votre tiroir. Au-delà de 25 cm, il arrive en modules qui se posent côte à côte.",
    variants: sizes("Format", [["Petit", "200 × 300", { a: 200, b: 300 }], ["Moyen", "300 × 400", { a: 300, b: 400 }], ["Grand", "400 × 500", { a: 400, b: 500 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 }
    ],
    impression: { matiere: "pacf", orientation: POSE.debout, supports: false, plateaux: 3,
      remarques: "Chaque module debout sur son fond." },
    custom: { surcharge: 10, params: [param("a", "Largeur intérieure du tiroir", 120, 560, 320, 5, 0.03), param("b", "Profondeur intérieure du tiroir", 150, 560, 420, 5, 0.02)] }
  },
  {
    id: "vide-poche-cles", universe: "meubles", matiere: "pla", shape: "hook", model: "vide-poche-cles", popular: true,
    name: "Vide-poche porte-clés", price: 19,
    tagline: "Les clés accrochées, la monnaie dans le bac, dès l'entrée.",
    desc: "Un dosseret qui s'enroule en haut en une tablette à crochets, posé sur un bac qui lui sert de pied : les trousseaux pendent au-dessus du bac, les pièces, écouteurs et cartes tombent dedans. Rien à fixer au mur, il se pose sur le meuble d'entrée. Réglez la largeur (un crochet tous les 20 mm), la profondeur du bac et la hauteur pour les longs trousseaux.",
    variants: sizes("Largeur", [["Compact", "60 mm, 3 crochets", { a: 60, b: 60, c: 110 }], ["Standard", "75 mm, 4 crochets", { a: 75, b: 75, c: 120 }], ["Large", "120 mm, 6 crochets", { a: 120, b: 80, c: 130 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "cacao", label: "Brun cacao", hex: "#5b463d", roughness: 0.62 },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 }
    ],
    impression: { matiere: "pla", orientation: POSE.surLeCote, supports: false, parPlateau: 6,
      remarques: "Sur le côté : dosseret, tablette et crochets ont leur profil à plat." },
    custom: { surcharge: 5, params: [
      param("a", "Largeur", 60, 180, 75, 5, 0.06),
      param("b", "Profondeur du bac", 55, 120, 75, 5, 0.04),
      param("c", "Hauteur totale", 100, 180, 120, 5, 0.03)
    ] },
    photos: [
      { src: "assets/photos/vide-poche-cles/1.webp", alt: "Le vide-poche sur un meuble d'entrée, clés et télécommande de voiture aux crochets, pièces et écouteurs dans le bac" },
      { src: "assets/photos/vide-poche-cles/2.webp", alt: "Le vide-poche vu de trois quarts : quatre crochets en J sous la tablette, bac aux coins arrondis" },
      { src: "assets/photos/vide-poche-cles/3.webp", alt: "Gros plan sur les crochets qui pendent de la tablette" },
      { src: "assets/photos/vide-poche-cles/4.webp", alt: "Gros plan sur le bac et ses parois arrondies" }
    ],
    photosNote: "Photos : coloris brun cacao ; la vue 3D montre le coloris choisi"
  },
  {
    id: "distributeur-cotons", universe: "meubles", matiere: "pacf", shape: "dispenser", model: "distributeur-cotons",
    name: "Distributeur cotons & cotons-tiges", price: 18,
    tagline: "Les disques à portée de main, les cotons-tiges juste à côté.",
    desc: "Un tube où s'empilent les disques de coton, avec une fente frontale arrondie pour attraper le dernier du bas, et un pot accolé pour les cotons-tiges. Réglez le diamètre de vos disques : le tube garde 2,5 mm de jeu pour qu'ils glissent sans flotter. Choisissez ensuite la hauteur de la pile et celle du pot.",
    variants: sizes("Taille de la pile", [["Compact", "environ 50 disques", { a: 58, b: 110, c: 45 }], ["Standard", "environ 80 disques", { a: 58, b: 150, c: 50 }], ["Grand", "environ 110 disques", { a: 60, b: 190, c: 55 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 }
    ],
    impression: { matiere: "pacf", orientation: POSE.debout, supports: false, parPlateau: 4,
      remarques: "Debout sur son fond, fente et pot ouverts vers le haut." },
    custom: { surcharge: 4, params: [
      param("a", "Diamètre de vos disques de coton", 45, 75, 58, 1, 0.1),
      param("b", "Hauteur du distributeur", 100, 200, 150, 5, 0.05),
      param("c", "Hauteur du pot à cotons-tiges", 35, 70, 50, 5, 0.05)
    ] },
    photos: [
      { src: "assets/photos/distributeur-cotons/1.webp", alt: "Distributeur posé au bord d'un lavabo, pile de disques visible par la fente et cotons-tiges dans le pot" },
      { src: "assets/photos/distributeur-cotons/2.webp", alt: "Distributeur de trois quarts sur fond clair, tube plein de disques et pot de cotons-tiges" },
      { src: "assets/photos/distributeur-cotons/3.webp", alt: "Gros plan sur le haut du tube et la pile de disques de coton" },
      { src: "assets/photos/distributeur-cotons/4.webp", alt: "Gros plan sur la fente vide et le pot accolé" }
    ],
    photosNote: "Photos : rendus de démonstration, coloris crème ; disques et cotons-tiges non fournis"
  },
  {
    id: "cintre-sac", universe: "meubles", matiere: "petg", shape: "hook", model: "cintre-sac",
    name: "Cintre à sac pour tringle", price: 9,
    tagline: "Le sac à dos rangé dans la penderie, comme une veste.",
    desc: "Un crochet épais qui se pose sur la tringle de votre penderie, et une large barre courbe pour accrocher la poignée ou les bretelles d'un sac à dos, d'un cabas ou d'un sac de sport. Le crochet est ajusté au diamètre de votre tringle.",
    variants: sizes("Diamètre de la tringle", [["Ø 19", "fine", { a: 19 }], ["Ø 25", "standard", { a: 25 }], ["Ø 32", "épaisse", { a: 32 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "sable", label: "Sable", hex: "#d8c39a", roughness: 0.65 },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 }
    ],
    impression: { matiere: "petg", orientation: POSE.aPlat, supports: false, parPlateau: 15,
      remarques: "Couché, voile contre le plateau." },
    custom: { surcharge: 3, params: [param("a", "Diamètre de la tringle", 15, 40, 25)] },
    /* Photos commerciales (facultatif) : 1re = vignette du catalogue. note = taille photographiée */
    photos: [
      { src: "assets/photos/cintre-sac/1.webp", alt: "Deux sacs à dos suspendus à la tringle d'une penderie par les cintres" },
      { src: "assets/photos/cintre-sac/2.webp", alt: "Gros plan du crochet posé sur la tringle, une sangle de sac accrochée", pos: "50% 45%" }
    ],
    photosNote: "Photos : modèle standard, coloris de démonstration"
  },
  {
    id: "support-aerosol-skadis", universe: "meubles", matiere: "asa", shape: "cup", model: "support-aerosol-skadis",
    name: "Support de bombe pour SKADIS", price: 12,
    tagline: "La bombe aérosol rangée debout sur le panneau perforé, toujours à portée de main.",
    desc: "Un gobelet qui s'accroche au panneau IKEA SKADIS sans outil : deux crochets passent dans les trous du haut, deux ergots calent la pièce plus bas. Côtés en creux et encoche à l'avant pour saisir la bombe d'une main, fond ajouré qui la retient par son rebord. Réglez le diamètre de votre bombe et la hauteur du support.",
    variants: sizes("Diamètre de la bombe", [["Ø 45", "petit format", { a: 45, b: 60 }], ["Ø 54", "standard", { a: 54, b: 60 }], ["Ø 65", "bombe de peinture", { a: 65, b: 70 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 }
    ],
    impression: { matiere: "asa", orientation: POSE.debout, supports: true, parPlateau: 9,
      remarques: "Debout sur son fond ajouré ; supports sous les crochets et les ergots SKADIS." },
    custom: { surcharge: 3, params: [
      param("a", "Diamètre de la bombe", 40, 80, 54),
      param("b", "Hauteur du support", 60, 110, 60, 5, 0.05)
    ] },
    photos: [
      { src: "assets/photos/support-aerosol-skadis/1.webp", alt: "Bombe aérosol rangée dans le support, accroché à un panneau perforé d'atelier", pos: "50% 60%" },
      { src: "assets/photos/support-aerosol-skadis/2.webp", alt: "Le support vu de trois quarts : gobelet, encoche avant et crochets à l'arrière" },
      { src: "assets/photos/support-aerosol-skadis/3.webp", alt: "Le support vu de profil : côté en creux et crochets SKADIS" }
    ],
    photosNote: "Photos : prototype Ø 54 imprimé en gris, coloris de démonstration ; bombe non fournie"
  },

  /* ---------- 04 · Déco & Objets ---------- */
  {
    id: "chat-lord", universe: "deco", matiere: "asa", shape: "cat", model: "chat-lord",
    name: "Chat Lord", price: 29,
    tagline: "Un buste de chat couronné de lauriers, drapé à l'antique.",
    desc: "Un buste sculpté façon empereur romain, imprimé d'un seul bloc sur son piédouche. Choisissez sa hauteur, du petit compagnon de bureau à la pièce qui trône sur une étagère : les proportions restent identiques.",
    variants: sizes("Hauteur", [["S", "100 mm", { a: 100 }], ["M", "150 mm", { a: 150 }], ["L", "200 mm", { a: 200 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "marbre", label: "Blanc marbre", hex: "#e6e2d8", roughness: 0.5 },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 }
    ],
    impression: { matiere: "asa", orientation: POSE.debout, supports: true, parPlateau: 6,
      remarques: "Debout sur son piédouche ; supports sous les épaules." },
    custom: { surcharge: 5, params: [
      param("a", "Hauteur du buste", 80, 220, 150, 5, 0.2)
    ] },
    photos: [
      { src: "assets/photos/chat-lord/1.webp", alt: "Buste de chat couronné de lauriers posé sur un bureau en bois, près d'une fenêtre", pos: "40% 50%" },
      { src: "assets/photos/chat-lord/2.webp", alt: "Le buste vu de profil : couronne de lauriers et toge drapée" },
      { src: "assets/photos/chat-lord/3.webp", alt: "Gros plan sur le visage du chat et les feuilles de laurier" },
      { src: "assets/photos/chat-lord/4.webp", alt: "Le buste vu de dos, toge et piédouche" }
    ],
    photosNote: "Photos : coloris gris de démonstration ; la vue 3D montre le coloris choisi"
  },
  {
    id: "carapuce", universe: "deco", matiere: "pa12", shape: "turtle", model: "carapuce",
    name: "Carapuce", price: 19,
    tagline: "La petite tortue la plus effrontée de l'étagère.",
    desc: "Une figurine de Carapuce, carapace sur le dos et queue en spirale, qui adresse un geste bien senti à qui passe devant. Imprimée d'un seul bloc, debout sur ses pattes, elle se règle en hauteur : du clin d'œil posé sur l'écran à la pièce qui ne passe pas inaperçue.",
    variants: sizes("Hauteur", [["S", "80 mm", { a: 80 }], ["M", "120 mm", { a: 120 }], ["L", "160 mm", { a: 160 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "sable", label: "Sable", hex: "#d8c39a", roughness: 0.65 }
    ],
    impression: { matiere: "pa12", orientation: POSE.debout, supports: true, parPlateau: 2,
      remarques: "Debout sur ses pattes ; supports sous les bras et la queue." },
    custom: { surcharge: 5, params: [
      param("a", "Hauteur de la figurine", 60, 200, 120, 5, 0.15)
    ] },
    photos: [
      { src: "assets/photos/carapuce/1.webp", alt: "Carapuce de face, doigt levé, carapace sur le dos et queue en spirale" },
      { src: "assets/photos/carapuce/2.webp", alt: "Carapuce vu de dos : carapace à alvéoles et queue enroulée" },
      { src: "assets/photos/carapuce/3.webp", alt: "Maillage 3D de la figurine, vue de trois quarts" }
    ],
    photosNote: "Photos : rendus de démonstration, coloris beige ; la vue 3D montre le coloris choisi"
  },
  {
    id: "voiture-voronoi", universe: "deco", matiere: "asa", shape: "car", model: "voiture-voronoi",
    name: "Voiture Voronoï", price: 24,
    tagline: "Une sportive à aileron, toute en dentelle de plastique.",
    desc: "Une voiture de sport ajourée de part en part : carrosserie en motif Voronoï, jantes à rayons, aileron arrière sur ses deux mâts. Imprimée d'un seul bloc, elle laisse passer la lumière et se pose sur un bureau ou une étagère. Choisissez sa longueur, de la miniature à la pièce qui attire l'œil.",
    variants: sizes("Longueur", [["S", "100 mm", { a: 100 }], ["M", "140 mm", { a: 140 }], ["L", "200 mm", { a: 200 }]]),
    colors: [
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 },
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "rouge", label: "Rouge course", hex: "#b8322c", roughness: 0.5 }
    ],
    impression: { matiere: "asa", orientation: POSE.debout, supports: true, parPlateau: 3,
      remarques: "Sur ses roues ; supports sous la caisse." },
    custom: { surcharge: 5, params: [
      param("a", "Longueur de la voiture", 100, 240, 140, 5, 0.15)
    ] },
    photos: [
      { src: "assets/photos/voiture-voronoi/1.webp", alt: "La voiture ajourée vue de trois quarts avant, aileron arrière sur ses mâts" },
      { src: "assets/photos/voiture-voronoi/2.webp", alt: "La voiture posée sur un bureau en bois, près d'un stylo plume et d'un bonsaï", pos: "40% 55%" },
      { src: "assets/photos/voiture-voronoi/3.webp", alt: "Gros plan sur la roue avant et le motif ajouré de la carrosserie" },
      { src: "assets/photos/voiture-voronoi/4.webp", alt: "Gros plan sur l'aileron arrière et ses deux mâts" }
    ],
    photosNote: "Photos : rendus de démonstration, coloris blanc ; la vue 3D montre le coloris choisi"
  }
];

EVARYSTH.getProduct = id => EVARYSTH.products.find(p => p.id === id);
EVARYSTH.getUniverse = id => EVARYSTH.universes.find(u => u.id === id);

/* Prix d'une configuration */
EVARYSTH.priceFor = (p, mode, values) => {
  if (mode !== "custom") return p.price;
  let total = p.price + p.custom.surcharge;
  p.custom.params.forEach(prm => {
    if (prm.pricePerUnit) total += Math.max(0, values[prm.key] - prm.def) * prm.pricePerUnit;
  });
  return Math.round(total * 100) / 100;
};

EVARYSTH.fmt = n => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
