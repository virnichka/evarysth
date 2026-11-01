/* Modulr Studio — catalogue (données de démo) */
window.MODULR = window.MODULR || {};

MODULR.universes = [
  { id: "balcon", code: "01", name: "Balcon & Extérieur", sub: "sans percer",
    pitch: "Tout se clipse sur votre garde-corps. Zéro trou, zéro souci avec le propriétaire." },
  { id: "bureau", code: "02", name: "Bureau & Tech", sub: "invisible",
    pitch: "Câbles, chargeurs, casques : tout disparaît sous le plateau." },
  { id: "meubles", code: "03", name: "Hacks Meubles", sub: "& Rangement",
    pitch: "Les petites pièces qui manquaient à vos meubles du commerce." }
];

/* shape : illustration utilisée (voir app.js) */
MODULR.products = [
  {
    id: "jardiniere-clip", universe: "balcon", shape: "clamp",
    name: "Support jardinière Clip", price: 24,
    tagline: "Accroche une jardinière sur n'importe quelle rambarde.",
    desc: "Se pose à la main sur votre garde-corps et tient une jardinière jusqu'à 8 kg. Aucune vis, aucun outil.",
    variants: { label: "Épaisseur de rambarde", options: [
      { label: "Fine", hint: "20–40 mm", values: { a: 30 } },
      { label: "Moyenne", hint: "40–60 mm", values: { a: 50 } },
      { label: "Large", hint: "60–80 mm", values: { a: 70 } } ] },
    custom: { surcharge: 6, params: [
      { key: "a", label: "Épaisseur de votre rambarde", min: 15, max: 120, step: 1, def: 45 } ] }
  },
  {
    id: "crochet-balcon", universe: "balcon", shape: "hook",
    name: "Crochet de balcon", price: 12,
    tagline: "Pour suspendre lanterne, plante ou serviette.",
    desc: "Glissez-le sur la main courante, suspendez. Résiste aux UV et à la pluie.",
    variants: { label: "Épaisseur de main courante", options: [
      { label: "S", hint: "≤ 35 mm", values: { a: 30 } },
      { label: "M", hint: "≤ 55 mm", values: { a: 50 } },
      { label: "L", hint: "≤ 75 mm", values: { a: 70 } } ] },
    custom: { surcharge: 4, params: [
      { key: "a", label: "Épaisseur de main courante", min: 15, max: 100, step: 1, def: 42 } ] }
  },
  {
    id: "clip-brise-vue", universe: "balcon", shape: "clip",
    name: "Clips brise-vue ×10", price: 14,
    tagline: "Fixe une canisse ou une toile sur les barreaux.",
    desc: "Un clip par barreau, la toile reste tendue même par grand vent. Lot de 10.",
    variants: { label: "Diamètre des barreaux", options: [
      { label: "Ø 12", hint: "barreaux fins", values: { a: 12 } },
      { label: "Ø 16", hint: "standard", values: { a: 16 } },
      { label: "Ø 20", hint: "épais", values: { a: 20 } } ] },
    custom: { surcharge: 5, params: [
      { key: "a", label: "Diamètre de vos barreaux", min: 8, max: 40, step: 1, def: 18 } ] }
  },
  {
    id: "goulotte-cable", universe: "bureau", shape: "tray",
    name: "Range-câbles sous plateau", price: 22,
    tagline: "Multiprise et câbles disparaissent sous le bureau.",
    desc: "Se clipse sur le bord du plateau, accueille multiprise et surplus de câbles. Le dessus reste nu.",
    variants: { label: "Épaisseur du plateau", options: [
      { label: "18 mm", hint: "standard", values: { a: 18, b: 300 } },
      { label: "25 mm", hint: "massif", values: { a: 25, b: 300 } },
      { label: "40 mm", hint: "épais", values: { a: 40, b: 300 } } ] },
    custom: { surcharge: 8, params: [
      { key: "a", label: "Épaisseur du plateau", min: 12, max: 60, step: 1, def: 22 },
      { key: "b", label: "Longueur du range-câbles", min: 150, max: 500, step: 10, def: 300, pricePerUnit: 0.03 } ] }
  },
  {
    id: "support-casque", universe: "bureau", shape: "hook",
    name: "Support casque invisible", price: 16,
    tagline: "Le casque se range sous le bureau, hors de vue.",
    desc: "Une pince discrète qui se serre sur le plateau. Le casque pend en dessous, le bureau reste dégagé.",
    variants: { label: "Épaisseur du plateau", options: [
      { label: "18 mm", hint: "standard", values: { a: 18 } },
      { label: "25 mm", hint: "massif", values: { a: 25 } },
      { label: "40 mm", hint: "épais", values: { a: 40 } } ] },
    custom: { surcharge: 4, params: [
      { key: "a", label: "Épaisseur du plateau", min: 12, max: 60, step: 1, def: 28 } ] }
  },
  {
    id: "dock-chargeur", universe: "bureau", shape: "clip",
    name: "Dock chargeur mural", price: 18,
    tagline: "Votre bloc chargeur tient tout seul, à l'abri.",
    desc: "Un étui ajusté à votre chargeur, qui se colle sous le bureau ou derrière un meuble.",
    variants: { label: "Type de chargeur", options: [
      { label: "Compact", hint: "téléphone", values: { a: 30, b: 30 } },
      { label: "Moyen", hint: "tablette", values: { a: 45, b: 35 } },
      { label: "Grand", hint: "ordinateur", values: { a: 70, b: 30 } } ] },
    custom: { surcharge: 6, params: [
      { key: "a", label: "Largeur du chargeur", min: 20, max: 100, step: 1, def: 50 },
      { key: "b", label: "Épaisseur du chargeur", min: 15, max: 50, step: 1, def: 28 } ] }
  },
  {
    id: "rehausseur", universe: "meubles", shape: "riser",
    name: "Rehausseurs de pieds ×4", price: 26,
    tagline: "Gagnez de la hauteur sous un lit ou un canapé.",
    desc: "Glissez sous chaque pied : vos meubles prennent de la hauteur et libèrent de la place pour ranger.",
    variants: { label: "Hauteur ajoutée", options: [
      { label: "+ 50 mm", hint: "discret", values: { a: 40, b: 50 } },
      { label: "+ 80 mm", hint: "bacs fins", values: { a: 40, b: 80 } },
      { label: "+ 120 mm", hint: "valises", values: { a: 40, b: 120 } } ] },
    custom: { surcharge: 8, params: [
      { key: "a", label: "Diamètre / côté du pied", min: 20, max: 80, step: 1, def: 45 },
      { key: "b", label: "Hauteur ajoutée", min: 30, max: 150, step: 5, def: 90, pricePerUnit: 0.08 } ] }
  },
  {
    id: "organiseur-tiroir", universe: "meubles", shape: "tray",
    name: "Organiseur de tiroir", price: 28,
    tagline: "Un casier qui épouse exactement votre tiroir.",
    desc: "Fini les centimètres perdus : l'organiseur est fabriqué à la cote intérieure de votre tiroir.",
    variants: { label: "Format", options: [
      { label: "Petit", hint: "200 × 300", values: { a: 200, b: 300 } },
      { label: "Moyen", hint: "300 × 400", values: { a: 300, b: 400 } },
      { label: "Grand", hint: "400 × 500", values: { a: 400, b: 500 } } ] },
    custom: { surcharge: 10, params: [
      { key: "a", label: "Largeur intérieure du tiroir", min: 120, max: 560, step: 5, def: 320, pricePerUnit: 0.03 },
      { key: "b", label: "Profondeur intérieure du tiroir", min: 150, max: 560, step: 5, def: 420, pricePerUnit: 0.02 } ] }
  },
  {
    id: "crochet-porte", universe: "meubles", shape: "hook",
    name: "Crochets de porte ×2", price: 15,
    tagline: "Des patères sur une porte de placard, sans visser.",
    desc: "Se posent par-dessus la porte et la laissent fermer normalement. Pour sacs, peignoirs, manteaux.",
    variants: { label: "Épaisseur de porte", options: [
      { label: "16 mm", hint: "placard", values: { a: 16 } },
      { label: "19 mm", hint: "armoire", values: { a: 19 } },
      { label: "40 mm", hint: "porte de pièce", values: { a: 40 } } ] },
    custom: { surcharge: 4, params: [
      { key: "a", label: "Épaisseur de votre porte", min: 12, max: 50, step: 1, def: 22 } ] }
  }
];

MODULR.getProduct = id => MODULR.products.find(p => p.id === id);
MODULR.getUniverse = id => MODULR.universes.find(u => u.id === id);

/* Prix d'une configuration */
MODULR.priceFor = (p, mode, values) => {
  if (mode !== "custom") return p.price;
  let total = p.price + p.custom.surcharge;
  p.custom.params.forEach(prm => {
    if (prm.pricePerUnit) total += Math.max(0, values[prm.key] - prm.def) * prm.pricePerUnit;
  });
  return Math.round(total * 100) / 100;
};

MODULR.fmt = n => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
