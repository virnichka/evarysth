/* Faux bucket R2 en mémoire (get / put / delete / list avec prefix et delimiter), partagé par les tests d'entretien */
export function fauxBucket(depart = {}) {
  const m = new Map(Object.entries(depart));
  const octets = v => (typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array(v));
  return {
    m,
    async get(k) {
      if (!m.has(k)) return null;
      const v = m.get(k);
      return { text: async () => (typeof v === "string" ? v : new TextDecoder().decode(v)), arrayBuffer: async () => octets(v).buffer };
    },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "", delimiter, limit = 1000 } = {}) {
      const objects = [], prefixes = new Set();
      for (const k of [...m.keys()].sort()) {
        if (!k.startsWith(prefix)) continue;
        const reste = k.slice(prefix.length), i = delimiter ? reste.indexOf(delimiter) : -1;
        if (i >= 0) prefixes.add(prefix + reste.slice(0, i + 1)); else objects.push({ key: k });
      }
      return { objects: objects.slice(0, limit), delimitedPrefixes: [...prefixes], truncated: false };
    }
  };
}
