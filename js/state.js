/* ===========================================
   Global State
   =========================================== */

let allPapers = [];
let currentFiltered = [];
let clusterCentroids = {};
let clusterLabels = {};
let citationLinks = [];
let referenceCache = {};
let dataMeta = {};
let showCitations = true;
let highlightCluster = null;
let filterMode = 'highlight';
let selectedPaper = null;
let connectedPapers = new Set();
let allTags = new Set();
let hoverTraceCount = 0;
let hoveredPaper = null;
let zoomScale = 1;
let bookmarkedPapers = new Set();
