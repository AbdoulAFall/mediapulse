/**
 * Palette de couleurs centralisée pour les chaînes MediaPulse.
 * Chaque chaîne a une couleur unique — importez depuis ce fichier pour garantir
 * la cohérence entre tous les composants (graphiques, barres, légendes).
 */

export const CHANNEL_COLORS: Record<string, string> = {
  "TFM":              "#c62828",  // rouge soutenu
  "RTS":              "#1565c0",  // bleu royal
  "2STV":             "#2e7d32",  // vert forêt
  "Sen TV":           "#e65100",  // orange brûlé
  "Walf TV":          "#6a1b9a",  // violet profond
  "Solution TV":      "#00695c",  // sarcelle foncé
  "Eric Favre TV":    "#f9a825",  // ambre / or
  "Sans Limites TV":  "#ad1457",  // rose fuchsia
  "Solo Media Group": "#37474f",  // ardoise bleue
  "Seneweb TV":       "#0097a7",  // cyan
  "Xalaat TV":        "#558b2f",  // vert olive
};

/** Couleurs de secours pour les chaînes non listées ci-dessus. */
export const FALLBACK_COLORS = [
  "#5d4037",  // brun
  "#0277bd",  // bleu clair
  "#4e342e",  // brun foncé
  "#00838f",  // teal
  "#7b1fa2",  // violet
  "#ef6c00",  // orange
];

/**
 * Retourne la couleur d'une chaîne par son nom.
 * @param name  Nom de la chaîne (ex : "TFM")
 * @param idx   Index de fallback si la chaîne n'est pas dans le dictionnaire
 */
export function channelColor(name: string, idx = 0): string {
  return CHANNEL_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/**
 * Tableau ordonné des couleurs dans l'ordre CHANNEL_COLORS.
 * Utilisé par les composants qui reçoivent les chaînes triées par vues.
 */
export const CHANNEL_COLORS_LIST = Object.values(CHANNEL_COLORS);
