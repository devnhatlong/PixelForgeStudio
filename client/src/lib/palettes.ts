export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

/** h: 0-360, s/l: 0-100 */
function hslHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 12 hues × N lightness steps, generated so the palette is always consistent. */
function hueGrid(steps: number[], sat = 70): string[] {
  const out: string[] = [];
  for (const l of steps) for (let i = 0; i < 12; i++) out.push(hslHex(i * 30, sat, l));
  return out;
}

export const PALETTES: Palette[] = [
  {
    id: "cat-warm",
    name: "Mèo Vàng & Thú Cưng (Ấm Áp)",
    colors: [
      "#1a1214", "#3d2317", "#5c3320", "#d97724", "#f0a848", "#f6d27a", "#fbe9c8",
      "#ffffff", "#d8586f", "#f08aa0", "#3fa35c", "#9ee68c", "#43405a", "#6c6890",
    ],
  },
  {
    id: "pico8",
    name: "PICO-8",
    colors: [
      "#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
      "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
    ],
  },
  {
    id: "endesga32",
    name: "Endesga 32",
    colors: [
      "#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39", "#3e2731", "#a22633",
      "#e43b44", "#f77622", "#feae34", "#fee761", "#63c74d", "#3e8948", "#265c42", "#193c3e",
      "#124e89", "#0099db", "#2ce8f5", "#ffffff", "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
      "#262b44", "#181425", "#ff0044", "#68386c", "#b55088", "#f6757a", "#e8b796", "#c28569",
    ],
  },
  {
    id: "gameboy",
    name: "Game Boy (4 màu)",
    colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
  },
  {
    id: "sweetie16",
    name: "Sweetie 16",
    colors: [
      "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070", "#38b764", "#257179",
      "#29366f", "#3b5dc9", "#41a6f6", "#73eff7", "#f4f4f4", "#94b0c2", "#566c86", "#333c57",
    ],
  },
  {
    id: "db32",
    name: "DawnBringer 32",
    colors: [
      "#000000", "#222034", "#45283c", "#663931", "#8f563b", "#df7126", "#d9a066", "#eec39a",
      "#fbf236", "#99e550", "#6abe30", "#37946e", "#4b692f", "#524b24", "#323c39", "#3f3f74",
      "#306082", "#5b6ee1", "#639bff", "#5fcde4", "#cbdbfc", "#ffffff", "#9badb7", "#847e87",
      "#696a6a", "#595652", "#76428a", "#ac3232", "#d95763", "#d77bba", "#8f974a", "#8a6f30",
    ],
  },
  {
    id: "aap64",
    name: "AAP-64",
    colors: [
      "#060608", "#141013", "#3b1725", "#73172d", "#b4202a", "#df3e23", "#fa6a0a", "#f9a31b",
      "#ffd541", "#fffc40", "#d6f264", "#9cdb43", "#59c135", "#14a02e", "#1a7a3e", "#24523b",
      "#122020", "#143464", "#285cc4", "#249fde", "#20d6c7", "#a6fcdb", "#ffffff", "#fef3c0",
      "#fad6b8", "#f5a097", "#e86a73", "#bc4a9b", "#793a80", "#403353", "#242234", "#221c1a",
      "#322b28", "#71413b", "#bb7547", "#dba463", "#f4d29c", "#dae0ea", "#b3b9d1", "#8b93af",
      "#6d758d", "#4a5462", "#333941", "#422433", "#5b3138", "#8e5252", "#ba756a", "#e9b5a3",
      "#e3e6ff", "#b9bffb", "#849be4", "#588dbe", "#477d85", "#23674e", "#328464", "#5daf8d",
      "#92dcba", "#cdf7e2", "#e4d2aa", "#c7b08b", "#a08662", "#796755", "#5a4e44", "#423934",
    ],
  },
  {
    id: "rainbow72",
    name: "Cầu vồng 72 (12 tông × 6 sắc độ)",
    colors: hueGrid([88, 74, 60, 48, 36, 24]),
  },
  {
    id: "pastel36",
    name: "Pastel 36",
    colors: hueGrid([90, 80, 70], 55),
  },
  {
    id: "vivid36",
    name: "Rực rỡ 36",
    colors: hueGrid([65, 50, 35], 95),
  },
  {
    id: "skin",
    name: "Tông da & tóc",
    colors: [
      "#fde7d6", "#f9d5bd", "#f3c4a3", "#eba184", "#d9906d", "#c27b58", "#a86447", "#8d5038",
      "#6e3d2a", "#4f2b1d", "#33190f", "#f6e7c1", "#e6c98a", "#c9a15b", "#8b6a2b", "#5a4218",
      "#2b2320", "#4a3b35", "#7a5c4a", "#a8896e", "#d4b89a", "#1c1b1f", "#3a3846", "#6b6a7a",
    ],
  },
  {
    id: "nature",
    name: "Thiên nhiên (cỏ, đất, nước, trời)",
    colors: [
      "#1b3a1e", "#2f5e2f", "#3f8a3a", "#6cbf4c", "#a4de6a", "#d8f2a5", "#3b2a1a", "#5c4028",
      "#7f5a35", "#a67c4b", "#c9a06a", "#e6c890", "#0b2c4a", "#144e7a", "#1f78b4", "#4fa8e0",
      "#8fd0f5", "#cfeeff", "#4a4e69", "#7d8597", "#adb5bd", "#dee2e6", "#f8f9fa", "#ffffff",
    ],
  },
  {
    id: "grayscale",
    name: "Thang Xám 16",
    colors: Array.from({ length: 16 }, (_, i) => { const v = Math.round((i / 15) * 255).toString(16).padStart(2, "0"); return `#${v}${v}${v}`; }),
  },
];
