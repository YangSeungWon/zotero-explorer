/* ===========================================
   Global Constants
   =========================================== */

const MOBILE_BREAKPOINT = 768;
const TOAST_TIMEOUT = 3000;
const FILTER_STATUS_TIMEOUT = 800;
const SYNC_POLL_INTERVAL = 1000;
const SYNC_MODAL_POLL_INTERVAL = 3000;
const DEBOUNCE_DELAY = 200;
const SEMANTIC_SEARCH_DEBOUNCE = 500;
const DETAIL_PANEL_MIN_WIDTH = 250;
const DETAIL_PANEL_MAX_WIDTH = 600;
const MINI_TIMELINE_MIN_HEIGHT = 40;
const MINI_TIMELINE_MAX_HEIGHT = 200;

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
let zoomScale = 1;
let bookmarkedPapers = new Set();
let currentView = 'map'; // 'map' or 'timeline'
let yearRange = null; // { min, max } for mini timeline filter
let semanticSearchMode = false; // When true, use semantic search API
let semanticSearchResults = null; // Cached semantic search results
