export interface Palette {
  id: string;
  name: string;
  colors: string[];
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
    id: "grayscale",
    name: "Thang Xám",
    colors: ["#000000", "#222222", "#444444", "#666666", "#888888", "#aaaaaa", "#cccccc", "#eeeeee", "#ffffff"],
  },
];
