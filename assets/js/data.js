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

/* Matières d'impression : chaque produit en désigne une (champ matiere) */
EVARYSTH.matieres = {
  pa12: { label: "Nylon PA12", court: "PA12", perk: ["Très résistant", "Nylon industriel"],
    desc: "Nylon PA12, imprimé en 3D industrielle : léger, très résistant aux chocs, à l'humidité et aux UV." },
  petg: { label: "PETG", court: "PETG", perk: ["Robuste", "Peu cassant"],
    desc: "PETG, le plastique des bouteilles en version technique : solide, un peu souple plutôt que cassant, et peu sensible à l'humidité." },
  asa: { label: "ASA", court: "ASA", perk: ["Tient dehors", "Résiste aux UV"],
    desc: "ASA, un plastique pensé pour l'extérieur : il encaisse le soleil, la pluie et le gel sans jaunir ni devenir cassant." },
  pla: { label: "PLA", court: "PLA", perk: ["Rigide", "Fini net"],
    desc: "PLA, un plastique d'origine végétale : rigide, au rendu net et précis. Il craint la forte chaleur (au-delà de 50 °C environ) : évitez la plage arrière d'une voiture en plein été." },
  pacf: { label: "Nylon carbone (PA-CF)", court: "PA-CF", perk: ["Très rigide", "Nylon + carbone"],
    desc: "Nylon chargé de fibres de carbone : très rigide et stable, avec un toucher mat légèrement minéral. Il supporte bien la chaleur et les chocs." }
};
EVARYSTH.matiere = p => EVARYSTH.matieres[p && p.matiere] || EVARYSTH.matieres.pa12;

/* Petites fabriques pour garder le catalogue lisible */
const sizes = (label, opts) => ({ label, options: opts.map(([l, hint, values]) => ({ label: l, hint, values })) });
const param = (key, label, min, max, def, step = 1, pricePerUnit) =>
  ({ key, label, min, max, step, def, ...(pricePerUnit ? { pricePerUnit } : {}) });

/* shape : illustration utilisée (voir app.js) · popular : mis en avant sur l'accueil */
EVARYSTH.products = [
  /* ---------- 01 · Balcon & Extérieur ---------- */
  {
    id: "jardiniere-clip", universe: "balcon", matiere: "pacf", shape: "clamp", model: "jardiniere-clip", popular: true,
    name: "Support jardinière Clip", price: 24,
    tagline: "Accroche une jardinière sur n'importe quelle rambarde.",
    desc: "Se pose à la main sur votre garde-corps et tient une jardinière jusqu'à 8 kg. Aucune vis, aucun outil.",
    variants: sizes("Épaisseur de rambarde", [["Fine", "20–40 mm", { a: 30 }], ["Moyenne", "40–60 mm", { a: 50 }], ["Large", "60–80 mm", { a: 70 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "sauge", label: "Vert sauge", hex: "#9fb39a", roughness: 0.65 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 }
    ],
    custom: { surcharge: 6, params: [param("a", "Épaisseur de votre rambarde", 15, 120, 45)] }
  },
  {
    id: "crochet-balcon", universe: "balcon", matiere: "asa", shape: "hook", model: "crochet-balcon",
    name: "Crochet de balcon", price: 12,
    tagline: "Pour suspendre lanterne, plante ou serviette.",
    desc: "Glissez-le sur la main courante, suspendez. Résiste aux UV et à la pluie.",
    variants: sizes("Épaisseur de main courante", [["S", "≤ 35 mm", { a: 30 }], ["M", "≤ 55 mm", { a: 50 }], ["L", "≤ 75 mm", { a: 70 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "terracotta", label: "Terracotta", hex: "#c0643f", roughness: 0.7 },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 }
    ],
    custom: { surcharge: 4, params: [param("a", "Épaisseur de main courante", 15, 100, 42)] }
  },
  {
    id: "clip-brise-vue", universe: "balcon", matiere: "pa12", shape: "clip", model: "clip-brise-vue",
    name: "Clips brise-vue ×10", price: 14,
    tagline: "Fixe une canisse ou une toile sur les barreaux.",
    desc: "Un clip par barreau, la toile reste tendue même par grand vent. Lot de 10.",
    variants: sizes("Diamètre des barreaux", [["Ø 12", "barreaux fins", { a: 12 }], ["Ø 16", "standard", { a: 16 }], ["Ø 20", "épais", { a: 20 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 }
    ],
    custom: { surcharge: 5, params: [param("a", "Diamètre de vos barreaux", 8, 40, 18)] }
  },
  {
    id: "pince-parasol", universe: "balcon", matiere: "petg", shape: "clamp", model: "pince-parasol", popular: true,
    name: "Pince parasol de rambarde", price: 22,
    tagline: "Le parasol tient droit, sans pied en béton.",
    desc: "Une pince se serre sur la rambarde, l'autre enserre le mât du parasol. Plus de pied encombrant sur un petit balcon.",
    variants: sizes("Épaisseur de rambarde", [["Fine", "20–40 mm", { a: 30, b: 32 }], ["Moyenne", "40–60 mm", { a: 50, b: 32 }], ["Large", "60–80 mm", { a: 70, b: 38 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 }
    ],
    custom: { surcharge: 6, params: [param("a", "Épaisseur de la rambarde", 15, 100, 45), param("b", "Diamètre du mât", 18, 50, 32)] }
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
    custom: { surcharge: 8, params: [param("a", "Épaisseur de la rambarde", 15, 100, 45), param("b", "Largeur de la tablette", 160, 400, 220, 10, 0.05)] }
  },
  {
    id: "clips-guirlande", universe: "balcon", matiere: "pla", shape: "clip", model: "clips-guirlande",
    name: "Clips guirlande lumineuse ×12", price: 12,
    tagline: "Une guirlande bien droite, sans scotch qui se décolle.",
    desc: "Chaque clip se pose sur un barreau et tient le fil de la guirlande. Se retire en un geste à la fin de l'été.",
    variants: sizes("Diamètre des barreaux", [["Ø 12", "barreaux fins", { a: 12 }], ["Ø 16", "standard", { a: 16 }], ["Ø 20", "épais", { a: 20 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 }
    ],
    custom: { surcharge: 4, params: [param("a", "Diamètre de vos barreaux", 8, 40, 16)] }
  },
  {
    id: "pieds-pot", universe: "balcon", matiere: "pacf", shape: "riser", model: "pieds-pot",
    name: "Pieds de pot ×3", price: 10,
    tagline: "L'eau s'écoule, le sol du balcon reste propre.",
    desc: "Trois petits pieds glissés sous le pot : l'arrosage s'écoule, les racines respirent, plus de marque sur le sol.",
    variants: sizes("Hauteur", [["Bas", "15 mm", { a: 15 }], ["Moyen", "25 mm", { a: 25 }], ["Haut", "40 mm", { a: 40 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 }
    ],
    custom: { surcharge: 3, params: [param("a", "Hauteur sous le pot", 10, 80, 25)] }
  },
  {
    id: "clips-tuteur", universe: "balcon", matiere: "pa12", shape: "clip", model: "clips-tuteur",
    name: "Clips tuteur ×20", price: 9,
    tagline: "Attache tomates et grimpantes sans ficelle.",
    desc: "Le clip entoure le tuteur et retient la tige sans l'abîmer. Réutilisable d'une saison à l'autre.",
    variants: sizes("Diamètre du tuteur", [["Ø 8", "bambou fin", { a: 8 }], ["Ø 12", "standard", { a: 12 }], ["Ø 16", "épais", { a: 16 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 },
      { id: "sauge", label: "Vert sauge", hex: "#9fb39a", roughness: 0.65 },
      { id: "terracotta", label: "Terracotta", hex: "#c0643f", roughness: 0.7 }
    ],
    custom: { surcharge: 3, params: [param("a", "Diamètre de votre tuteur", 5, 30, 10)] }
  },
  {
    id: "support-tuyau", universe: "balcon", matiere: "pla", shape: "hook", model: "support-tuyau",
    name: "Support tuyau d'arrosage", price: 18,
    tagline: "Le tuyau enroulé sur la rambarde, pas en boule au sol.",
    desc: "Se pose sur la rambarde et accueille jusqu'à 15 m de tuyau enroulé. Le balcon reste dégagé.",
    variants: sizes("Épaisseur de rambarde", [["Fine", "20–40 mm", { a: 30 }], ["Moyenne", "40–60 mm", { a: 50 }], ["Large", "60–80 mm", { a: 70 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 },
      { id: "sauge", label: "Vert sauge", hex: "#9fb39a", roughness: 0.65 },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 }
    ],
    custom: { surcharge: 5, params: [param("a", "Épaisseur de la rambarde", 15, 100, 45)] }
  },
  {
    id: "enrouleur-mural", universe: "balcon", matiere: "petg", shape: "reel", model: "enrouleur-mural",
    name: "Enrouleur mural tuyau & corde", price: 26,
    tagline: "Le tuyau rangé en boucles larges, sans pli, contre le mur.",
    desc: "Une plaque murale ajourée, une selle cintrée à grand rayon (120 mm) pour que le tuyau ne se plie pas, et une large joue avant qui retient les boucles. La selle est percée de lumières : l'eau s'écoule au lieu de stagner. Réglez la largeur d'enroulement et le diamètre du tuyau ou de la corde : la joue s'adapte. Fixation par 2 vis Ø 4–5 mm (non fournies).",
    variants: sizes("Largeur d'enroulement", [["Corde", "60 mm · Ø 12 mm", { a: 60, b: 12 }], ["Tuyau", "80 mm · Ø 25 mm", { a: 80, b: 25 }], ["Grand", "120 mm · Ø 25 mm", { a: 120, b: 25 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 }
    ],
    custom: { surcharge: 5, params: [
      param("a", "Largeur d'enroulement", 50, 140, 80, 5, 0.08),
      param("b", "Diamètre du tuyau ou de la corde", 8, 35, 25)
    ] }
  },
  {
    id: "pinces-nappe", universe: "balcon", matiere: "petg", shape: "clip", model: "pinces-nappe",
    name: "Pinces à nappe ×4", price: 11,
    tagline: "La nappe ne s'envole plus au premier coup de vent.",
    desc: "Une pince à chaque coin de la table, ajustée à l'épaisseur du plateau. Discrète et efficace.",
    variants: sizes("Épaisseur du plateau", [["Fin", "≤ 20 mm", { a: 18 }], ["Moyen", "≤ 30 mm", { a: 28 }], ["Épais", "≤ 45 mm", { a: 42 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 },
      { id: "sauge", label: "Vert sauge", hex: "#9fb39a", roughness: 0.65 }
    ],
    custom: { surcharge: 3, params: [param("a", "Épaisseur du plateau de table", 8, 60, 25)] }
  },

  /* ---------- 02 · Bureau & Tech ---------- */
  {
    id: "goulotte-cable", universe: "bureau", matiere: "pla", shape: "tray", model: "goulotte-cable", popular: true,
    name: "Range-câbles sous plateau", price: 22,
    tagline: "Multiprise et câbles disparaissent sous le bureau.",
    desc: "Se clipse sur le bord du plateau, accueille multiprise et surplus de câbles. Le dessus reste nu.",
    variants: sizes("Épaisseur du plateau", [["18 mm", "standard", { a: 18, b: 300 }], ["25 mm", "massif", { a: 25, b: 300 }], ["40 mm", "épais", { a: 40, b: 300 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 }
    ],
    custom: { surcharge: 8, params: [param("a", "Épaisseur du plateau", 12, 60, 22), param("b", "Longueur du range-câbles", 150, 500, 300, 10, 0.03)] }
  },
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
    custom: { surcharge: 4, params: [param("a", "Épaisseur du plateau", 12, 60, 28)] }
  },
  {
    id: "dock-chargeur", universe: "bureau", matiere: "pa12", shape: "clip", model: "dock-chargeur",
    name: "Dock chargeur", price: 18,
    tagline: "Votre bloc chargeur tient tout seul, à l'abri.",
    desc: "Un étui ajusté à votre chargeur, qui se colle sous le bureau ou derrière un meuble.",
    variants: sizes("Type de chargeur", [["Compact", "téléphone", { a: 30, b: 30 }], ["Moyen", "tablette", { a: 45, b: 35 }], ["Grand", "ordinateur", { a: 70, b: 30 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 },
      { id: "sauge", label: "Vert sauge", hex: "#9fb39a", roughness: 0.65 }
    ],
    custom: { surcharge: 6, params: [param("a", "Largeur du chargeur", 20, 100, 50), param("b", "Épaisseur du chargeur", 15, 50, 28)] }
  },
  {
    id: "passe-cable", universe: "bureau", matiere: "pla", shape: "ring", model: "passe-cable",
    name: "Passe-câble de bureau", price: 9,
    tagline: "Un trou propre pour faire passer les câbles.",
    desc: "S'emboîte dans le trou du plateau et cache ses bords. Le couvercle s'ouvre juste assez pour les câbles.",
    variants: sizes("Diamètre du trou", [["Ø 50", "petit", { a: 50 }], ["Ø 60", "standard", { a: 60 }], ["Ø 80", "grand", { a: 80 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 }
    ],
    custom: { surcharge: 3, params: [param("a", "Diamètre du trou", 30, 100, 60)] }
  },
  {
    id: "support-portable", universe: "bureau", matiere: "petg", shape: "stand", model: "support-portable", popular: true,
    name: "Support vertical pour portable", price: 19,
    tagline: "L'ordinateur fermé debout, la place libérée.",
    desc: "Rangez votre portable fermé sur la tranche, à côté de l'écran. La fente est taillée à son épaisseur exacte.",
    variants: sizes("Épaisseur du portable", [["Fin", "≤ 16 mm", { a: 16 }], ["Moyen", "≤ 20 mm", { a: 20 }], ["Épais", "≤ 26 mm", { a: 26 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 }
    ],
    custom: { surcharge: 4, params: [param("a", "Épaisseur de l'ordinateur fermé", 10, 40, 18)] }
  },
  {
    id: "support-telephone", universe: "bureau", matiere: "pla", shape: "stand", model: "support-telephone",
    name: "Support téléphone incliné", price: 14,
    tagline: "Le téléphone face à vous, même avec sa coque.",
    desc: "Un support stable, incliné pour lire et taper sans se pencher. Le berceau est ajusté à votre téléphone avec sa coque.",
    variants: sizes("Épaisseur avec coque", [["Fin", "≤ 9 mm", { a: 9 }], ["Moyen", "≤ 12 mm", { a: 12 }], ["Épais", "≤ 16 mm", { a: 16 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 }
    ],
    custom: { surcharge: 3, params: [param("a", "Épaisseur avec la coque", 6, 25, 11)] }
  },
  {
    id: "clips-cables", universe: "bureau", matiere: "asa", shape: "clip", model: "clips-cables",
    name: "Clips câbles de bord ×6", price: 10,
    tagline: "Les câbles de charge restent au bord du bureau.",
    desc: "Les clips se posent sur le bord du plateau et retiennent chacun un câble. Fini les câbles tombés derrière le bureau.",
    variants: sizes("Épaisseur du plateau", [["18 mm", "standard", { a: 18, b: 4 }], ["25 mm", "massif", { a: 25, b: 4 }], ["40 mm", "épais", { a: 40, b: 4 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 }
    ],
    custom: { surcharge: 3, params: [param("a", "Épaisseur du plateau", 12, 60, 22), param("b", "Diamètre du câble", 2, 10, 4)] }
  },
  {
    id: "support-manette", universe: "bureau", matiere: "pa12", shape: "hook", model: "support-manette",
    name: "Support manettes ×2", price: 13,
    tagline: "Les manettes rangées sous le bureau, prêtes à jouer.",
    desc: "Deux supports qui se clipsent sous le plateau. Les manettes s'y accrochent par la poignée, sans encombrer.",
    variants: sizes("Épaisseur du plateau", [["18 mm", "standard", { a: 18 }], ["25 mm", "massif", { a: 25 }], ["40 mm", "épais", { a: 40 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 }
    ],
    custom: { surcharge: 3, params: [param("a", "Épaisseur du plateau", 12, 60, 25)] }
  },
  {
    id: "support-uc", universe: "bureau", matiere: "pa12", shape: "bracket", model: "support-uc",
    name: "Support unité centrale", price: 34,
    tagline: "La tour du PC suspendue sous le bureau.",
    desc: "Deux étriers sous le plateau portent la tour à hauteur. Le sol reste libre et l'aspirateur passe dessous.",
    variants: sizes("Largeur de la tour", [["Mini", "≤ 120 mm", { a: 120 }], ["Moyenne", "≤ 200 mm", { a: 200 }], ["Grande", "≤ 240 mm", { a: 240 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "rose", label: "Rose poudré", hex: "#dca8a4", roughness: 0.62 },
      { id: "terracotta", label: "Terracotta", hex: "#c0643f", roughness: 0.7 }
    ],
    custom: { surcharge: 10, params: [param("a", "Largeur de la tour", 80, 280, 200, 5, 0.05)] }
  },
  {
    id: "organiseur-bureau", universe: "bureau", matiere: "pa12", shape: "tray", model: "organiseur-bureau",
    name: "Vide-poche modulable", price: 17,
    tagline: "Stylos, clés et câbles chacun dans sa case.",
    desc: "Des cases qui s'assemblent comme des briques. Choisissez la longueur pour qu'il épouse le pied de votre écran.",
    variants: sizes("Longueur", [["Court", "160 mm", { a: 160 }], ["Moyen", "240 mm", { a: 240 }], ["Long", "320 mm", { a: 320 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 }
    ],
    custom: { surcharge: 5, params: [param("a", "Longueur du vide-poche", 100, 450, 240, 10, 0.03)] }
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
    custom: { surcharge: 6, params: [
      param("a", "Longueur intérieure", 110, 300, 150, 5, 0.06),
      param("b", "Largeur intérieure", 60, 250, 100, 5, 0.08),
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
    desc: "Socle plein, colonne et tête en treillis gyroïde, appui bombé qui épouse l'arceau sans le marquer. Réglez la hauteur pour que les coussinets ne touchent pas le bureau, et la largeur de l'appui selon votre arceau : le treillis garde la même maille, il gagne simplement des cellules.",
    variants: sizes("Taille du casque", [["Compact", "supra-auriculaire", { a: 220, b: 100 }], ["Standard", "circum-auriculaire", { a: 250, b: 120 }], ["Grand", "casque de studio", { a: 290, b: 140 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 }
    ],
    custom: { surcharge: 6, params: [
      param("a", "Hauteur totale du support", 200, 320, 250, 5, 0.05),
      param("b", "Largeur de l'appui sous l'arceau", 80, 160, 120, 5, 0.06)
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
    id: "rehausseur", universe: "meubles", matiere: "pla", shape: "riser", model: "rehausseur", popular: true,
    name: "Rehausseurs de pieds ×4", price: 26,
    tagline: "Gagnez de la hauteur sous un lit ou un canapé.",
    desc: "Glissez sous chaque pied : vos meubles prennent de la hauteur et libèrent de la place pour ranger.",
    variants: sizes("Hauteur ajoutée", [["+ 50 mm", "discret", { a: 40, b: 50 }], ["+ 80 mm", "bacs fins", { a: 40, b: 80 }], ["+ 120 mm", "valises", { a: 40, b: 120 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 }
    ],
    custom: { surcharge: 8, params: [param("a", "Diamètre / côté du pied", 20, 80, 45), param("b", "Hauteur ajoutée", 30, 150, 90, 5, 0.08)] }
  },
  {
    id: "organiseur-tiroir", universe: "meubles", matiere: "pacf", shape: "tray", model: "organiseur-tiroir", popular: true,
    name: "Organiseur de tiroir", price: 28,
    tagline: "Un casier qui épouse exactement votre tiroir.",
    desc: "Fini les centimètres perdus : l'organiseur est fabriqué à la cote intérieure de votre tiroir.",
    variants: sizes("Format", [["Petit", "200 × 300", { a: 200, b: 300 }], ["Moyen", "300 × 400", { a: 300, b: 400 }], ["Grand", "400 × 500", { a: 400, b: 500 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 }
    ],
    custom: { surcharge: 10, params: [param("a", "Largeur intérieure du tiroir", 120, 560, 320, 5, 0.03), param("b", "Profondeur intérieure du tiroir", 150, 560, 420, 5, 0.02)] }
  },
  {
    id: "crochet-porte", universe: "meubles", matiere: "pla", shape: "hook", model: "crochet-porte",
    name: "Crochets de porte ×2", price: 15,
    tagline: "Des patères sur une porte de placard, sans visser.",
    desc: "Se posent par-dessus la porte et la laissent fermer normalement. Pour sacs, peignoirs, manteaux.",
    variants: sizes("Épaisseur de porte", [["16 mm", "placard", { a: 16 }], ["19 mm", "armoire", { a: 19 }], ["40 mm", "porte de pièce", { a: 40 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "rouge", label: "Rouge brique", hex: "#a8382f", roughness: 0.62 },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 }
    ],
    custom: { surcharge: 4, params: [param("a", "Épaisseur de votre porte", 12, 50, 22)] }
  },
  {
    id: "vide-poche-cles", universe: "meubles", matiere: "pla", shape: "hook", model: "vide-poche-cles",
    name: "Vide-poche porte-clés", price: 19,
    tagline: "Les clés accrochées, la monnaie dans le bac, dès l'entrée.",
    desc: "Un dosseret qui s'enroule en haut en une tablette à crochets, posé sur un bac qui lui sert de pied : les trousseaux pendent au-dessus du bac, les pièces, écouteurs et cartes tombent dedans. Rien à fixer au mur, il se pose sur le meuble d'entrée. Réglez la largeur (un crochet tous les 20 mm), la profondeur du bac et la hauteur pour les longs trousseaux.",
    variants: sizes("Largeur", [["Compact", "60 mm, 3 crochets", { a: 60, b: 60, c: 110 }], ["Standard", "75 mm, 4 crochets", { a: 75, b: 75, c: 120 }], ["Large", "120 mm, 6 crochets", { a: 120, b: 80, c: 130 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "cacao", label: "Brun cacao", hex: "#5b463d", roughness: 0.62 },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 }
    ],
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
    id: "taquets-etagere", universe: "meubles", matiere: "asa", shape: "bracket", model: "taquets-etagere",
    name: "Taquets d'étagère ×8", price: 9,
    tagline: "Les taquets perdus au déménagement, refaits à l'identique.",
    desc: "Taquets à tige, au diamètre exact des trous de votre meuble. Ajoutez enfin l'étagère qui manquait.",
    variants: sizes("Diamètre de la tige", [["Ø 5", "le plus courant", { a: 5 }], ["Ø 6", "intermédiaire", { a: 6 }], ["Ø 8", "meubles anciens", { a: 8 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 },
      { id: "orange", label: "Orange", hex: "#e2742b", roughness: 0.6 }
    ],
    custom: { surcharge: 3, params: [param("a", "Diamètre des trous", 3, 12, 5)] }
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
    id: "poignee-meuble", universe: "meubles", matiere: "pa12", shape: "handle", model: "poignee-meuble",
    name: "Poignée de meuble", price: 8,
    tagline: "Remplacez une poignée cassée sans refaire de trous.",
    desc: "L'écart entre les vis est fait sur mesure, pour reprendre les trous existants. Idéal pour relooker une commode.",
    variants: sizes("Entraxe des vis", [["96 mm", "petite", { a: 96 }], ["128 mm", "le plus courant", { a: 128 }], ["160 mm", "grande", { a: 160 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "blanc", label: "Blanc", hex: "#ecebe6", roughness: 0.6 },
      { id: "sable", label: "Sable", hex: "#d8c39a", roughness: 0.65 }
    ],
    custom: { surcharge: 3, params: [param("a", "Entraxe entre les deux vis", 32, 320, 128)] }
  },
  {
    id: "cales-meuble", universe: "meubles", matiere: "pacf", shape: "riser", model: "cales-meuble",
    name: "Cales de mise à niveau ×4", price: 8,
    tagline: "Fini le meuble bancal sur un vieux parquet.",
    desc: "Des cales fines glissées sous les pieds, à la hauteur exacte qu'il manque. Invisibles une fois posées.",
    variants: sizes("Épaisseur", [["2 mm", "léger écart", { a: 2 }], ["5 mm", "écart moyen", { a: 5 }], ["10 mm", "gros écart", { a: 10 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 }
    ],
    custom: { surcharge: 2, params: [param("a", "Épaisseur de la cale", 1, 30, 4)] }
  },
  {
    id: "separateurs-etagere", universe: "meubles", matiere: "pla", shape: "tray", model: "separateurs-etagere",
    name: "Séparateurs d'étagère ×2", price: 16,
    tagline: "Planches, plaques et sacs rangés à la verticale.",
    desc: "Les séparateurs se clipsent sur l'étagère, sans outil. Idéal pour ranger plaques de cuisson, plateaux ou sacs.",
    variants: sizes("Épaisseur de l'étagère", [["16 mm", "standard", { a: 16, b: 150 }], ["19 mm", "armoire", { a: 19, b: 150 }], ["25 mm", "massive", { a: 25, b: 150 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "terracotta", label: "Terracotta", hex: "#c0643f", roughness: 0.7 },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 }
    ],
    custom: { surcharge: 5, params: [param("a", "Épaisseur de l'étagère", 10, 40, 18), param("b", "Hauteur du séparateur", 80, 300, 150, 10, 0.04)] }
  },
  {
    id: "support-tringle", universe: "meubles", matiere: "petg", shape: "bracket", model: "support-tringle",
    name: "Supports tringle sans perçage ×2", price: 18,
    tagline: "Un rideau sur la fenêtre, sans toucher au mur.",
    desc: "Les supports se clipsent sur le cadre de la fenêtre et portent une tringle légère. Parfait en location.",
    variants: sizes("Épaisseur du cadre", [["Fin", "≤ 50 mm", { a: 50, b: 16 }], ["Moyen", "≤ 70 mm", { a: 70, b: 16 }], ["Épais", "≤ 90 mm", { a: 90, b: 20 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "moutarde", label: "Jaune moutarde", hex: "#d4a72c", roughness: 0.62 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 },
      { id: "bleu", label: "Bleu lagon", hex: "#5fa8d3", roughness: 0.6 }
    ],
    custom: { surcharge: 5, params: [param("a", "Épaisseur du cadre", 30, 120, 60), param("b", "Diamètre de la tringle", 8, 28, 16)] }
  },
  {
    id: "embouts-pieds", universe: "meubles", matiere: "petg", shape: "ring", model: "embouts-pieds",
    name: "Embouts de pieds de chaise ×4", price: 10,
    tagline: "Plus de bruit ni de rayures quand on tire la chaise.",
    desc: "Des embouts ajustés au pied de votre chaise, qui ne glissent pas et protègent le parquet.",
    variants: sizes("Diamètre du pied", [["Ø 20", "fin", { a: 20 }], ["Ø 28", "standard", { a: 28 }], ["Ø 35", "épais", { a: 35 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "olive", label: "Vert olive", hex: "#6f7a45", roughness: 0.68 },
      { id: "sauge", label: "Vert sauge", hex: "#9fb39a", roughness: 0.65 }
    ],
    custom: { surcharge: 3, params: [param("a", "Diamètre du pied", 12, 60, 25)] }
  },
  {
    id: "penderie-etagere", universe: "meubles", matiere: "pacf", shape: "hook", model: "penderie-etagere",
    name: "Penderie sous étagère ×2", price: 14,
    tagline: "Transforme une étagère en penderie.",
    desc: "Deux crochets se glissent sur l'étagère et portent une barre de penderie dessous. Vos cintres trouvent leur place.",
    variants: sizes("Épaisseur de l'étagère", [["16 mm", "standard", { a: 16, b: 20 }], ["19 mm", "armoire", { a: 19, b: 20 }], ["25 mm", "massive", { a: 25, b: 25 }]]),
    colors: [
      { id: "noir", label: "Noir mat", hex: "#2a2a2a" },
      { id: "bronze", label: "Bronze", hex: "#9a7240", roughness: 0.38, metalness: 0.55 },
      { id: "gris", label: "Gris béton", hex: "#8a8c8e", roughness: 0.7 },
      { id: "marine", label: "Bleu nuit", hex: "#2e3e5c", roughness: 0.65 }
    ],
    custom: { surcharge: 4, params: [param("a", "Épaisseur de l'étagère", 10, 40, 18), param("b", "Diamètre de la barre", 12, 32, 20)] }
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
