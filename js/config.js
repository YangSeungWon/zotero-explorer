/* ===========================================
   Configuration & Constants
   =========================================== */

// Fallback only. Real colors come from papers.json `cluster_colors`, which assigns
// one validated hue per TOPIC FAMILY (see build_map.py step 6.6) instead of cycling a
// palette by cluster index -- with 44 clusters, `cluster % 15` gave unrelated topics
// the same color, so the color carried no information.
const CLUSTER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
  '#dfe6e9', '#a29bfe', '#fd79a8', '#00b894', '#e17055',
  '#74b9ff', '#55efc4', '#b2bec3', '#ffeaa7', '#fab1a0'
];

// Populated by loadData() from papers.json: { clusterId: {light, dark} }
let clusterColorMap = {};

/** Color for a cluster, honouring the current theme. Falls back to the legacy palette. */
function clusterColor(cluster) {
  const entry = clusterColorMap[cluster];
  if (entry) {
    return document.documentElement.dataset.theme === 'light' ? entry.light : entry.dark;
  }
  return CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
}
