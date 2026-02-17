/* ===========================================
   Annotation Parser
   Parses Zotero-style annotations from notes
   =========================================== */

/**
 * Parse annotations from a paper's notes
 *
 * Expected format:
 * "quote text" ([Author et al., Year, p.XX](zotero://select/...)) ([pdf](zotero://open-pdf/...?page=X&annotation=XXX)) user's note
 *
 * @param {string} noteText - The note text to parse
 * @param {Object} paper - The paper object for additional context
 * @returns {Array} Array of annotation objects
 */
function parseAnnotationsFromNote(noteText, paper = {}) {
  if (!noteText || typeof noteText !== 'string') return [];

  const annotations = [];

  // Pattern to match annotation blocks (curly quotes U+201C, U+201D)
  // Groups: 1=quote, 2=citation text, 3=citation zotero url, 4=pdf url (optional), 5=user note
  const annotationPattern = /\u201C([^\u201D]+)\u201D\s*\(\[([^\]]+)\]\((zotero:\/\/[^)]+)\)\)\s*(?:\(\[pdf\]\((zotero:\/\/[^)]+)\)\))?\s*([\s\S]*?)(?=\u201C|$)/g;

  let match;
  while ((match = annotationPattern.exec(noteText)) !== null) {
    const [fullMatch, quote, citationText, zoteroUrl, pdfUrl, userNote] = match;

    // Parse the PDF URL for page and annotation ID
    let page = null;
    let annotationId = null;
    if (pdfUrl) {
      const pageMatch = pdfUrl.match(/page=(\d+)/);
      const annMatch = pdfUrl.match(/annotation=([A-Z0-9]+)/);
      if (pageMatch) page = parseInt(pageMatch[1]);
      if (annMatch) annotationId = annMatch[1];
    }

    // Extract Zotero key from URL
    const zoteroKeyMatch = zoteroUrl.match(/items\/([A-Z0-9]+)/);
    const zoteroKey = zoteroKeyMatch ? zoteroKeyMatch[1] : null;

    annotations.push({
      id: generateAnnotationId(),
      quote: quote.trim(),
      source: {
        text: citationText.trim(),
        zoteroKey: zoteroKey,
        zoteroUrl: zoteroUrl
      },
      pdf: pdfUrl ? {
        url: pdfUrl,
        page: page,
        annotationId: annotationId
      } : null,
      myNote: userNote.trim(),
      paperId: paper.id || null,
      paperTitle: paper.title || null,
      createdAt: Date.now()
    });
  }

  // If no structured annotations found, try simpler patterns
  if (annotations.length === 0) {
    const simpleAnnotations = parseSimpleAnnotations(noteText, paper);
    annotations.push(...simpleAnnotations);
  }

  return annotations;
}

/**
 * Parse simpler annotation formats
 * Handles notes that don't follow the full structured format
 */
function parseSimpleAnnotations(noteText, paper = {}) {
  const annotations = [];

  // Pattern for quoted text with any zotero link nearby
  const quotePattern = /"([^"]{20,})"/g;
  const zoteroLinkPattern = /\((zotero:\/\/[^)]+)\)/g;

  let quoteMatch;
  while ((quoteMatch = quotePattern.exec(noteText)) !== null) {
    const quote = quoteMatch[1];
    const quoteStart = quoteMatch.index;
    const quoteEnd = quoteStart + quoteMatch[0].length;

    // Look for zotero links near the quote (within 200 chars after)
    const nearbyText = noteText.substring(quoteEnd, quoteEnd + 300);

    let zoteroUrl = null;
    let pdfUrl = null;
    let sourceText = '';

    // Find citation link
    const citationMatch = nearbyText.match(/\[([^\]]+)\]\((zotero:\/\/select[^)]+)\)/);
    if (citationMatch) {
      sourceText = citationMatch[1];
      zoteroUrl = citationMatch[2];
    }

    // Find PDF link
    const pdfMatch = nearbyText.match(/\[pdf\]\((zotero:\/\/open-pdf[^)]+)\)/i);
    if (pdfMatch) {
      pdfUrl = pdfMatch[1];
    }

    // Get user note (text after the links)
    let userNote = '';
    if (citationMatch || pdfMatch) {
      const lastLinkEnd = Math.max(
        citationMatch ? nearbyText.indexOf(citationMatch[0]) + citationMatch[0].length : 0,
        pdfMatch ? nearbyText.indexOf(pdfMatch[0]) + pdfMatch[0].length : 0
      );
      userNote = nearbyText.substring(lastLinkEnd).trim();
      // Clean up the note - stop at next quote or special chars
      const cleanEnd = userNote.search(/"|^\s*\(|^\s*\[/);
      if (cleanEnd > 0) userNote = userNote.substring(0, cleanEnd);
    }

    // Parse PDF URL
    let page = null;
    let annotationId = null;
    if (pdfUrl) {
      const pageMatch = pdfUrl.match(/page=(\d+)/);
      const annMatch = pdfUrl.match(/annotation=([A-Z0-9]+)/);
      if (pageMatch) page = parseInt(pageMatch[1]);
      if (annMatch) annotationId = annMatch[1];
    }

    // Extract Zotero key
    const zoteroKeyMatch = zoteroUrl?.match(/items\/([A-Z0-9]+)/);
    const zoteroKey = zoteroKeyMatch ? zoteroKeyMatch[1] : null;

    annotations.push({
      id: generateAnnotationId(),
      quote: quote.trim(),
      source: {
        text: sourceText || `${paper.authors?.split(',')[0] || 'Unknown'}, ${paper.year || '?'}`,
        zoteroKey: zoteroKey || paper.zotero_key,
        zoteroUrl: zoteroUrl || null
      },
      pdf: pdfUrl ? {
        url: pdfUrl,
        page: page,
        annotationId: annotationId
      } : null,
      myNote: userNote.trim(),
      paperId: paper.id || null,
      paperTitle: paper.title || null,
      createdAt: Date.now()
    });
  }

  return annotations;
}

/**
 * Generate unique ID for annotation
 */
function generateAnnotationId() {
  return 'ann_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Check if a paper has parseable annotations in its notes
 */
function hasAnnotations(paper) {
  if (!paper.notes && !paper.notes_html) return false;
  const noteText = paper.notes_html || paper.notes;
  // Check for quoted text with zotero links
  return /"[^"]{20,}"/.test(noteText) && /zotero:\/\//.test(noteText);
}

/**
 * Count annotations in a paper's notes (quick estimate)
 */
function countAnnotations(paper) {
  if (!paper.notes && !paper.notes_html) return 0;
  const noteText = paper.notes_html || paper.notes;
  const matches = noteText.match(/"[^"]{20,}"/g);
  return matches ? matches.length : 0;
}

/**
 * Extract all zotero links from text
 */
function extractZoteroLinks(text) {
  if (!text) return [];

  const links = [];
  const linkPattern = /\[([^\]]*)\]\((zotero:\/\/[^)]+)\)/g;

  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const [, label, url] = match;

    let type = 'item';
    if (url.includes('open-pdf')) type = 'pdf';
    if (url.includes('annotation=')) type = 'annotation';

    links.push({ label, url, type });
  }

  return links;
}

/**
 * Create a manual annotation (not parsed from notes)
 */
function createManualAnnotation(data = {}) {
  return {
    id: generateAnnotationId(),
    quote: data.quote || '',
    source: {
      text: data.sourceText || '',
      zoteroKey: data.zoteroKey || null,
      zoteroUrl: data.zoteroUrl || null
    },
    pdf: data.pdfUrl ? {
      url: data.pdfUrl,
      page: data.page || null,
      annotationId: data.annotationId || null
    } : null,
    myNote: data.myNote || '',
    paperId: data.paperId || null,
    paperTitle: data.paperTitle || null,
    createdAt: Date.now(),
    isManual: true
  };
}

/**
 * Parse a single raw annotation text (from Zotero copy-paste)
 * Format: "quote" ([Author, Year, p.XX](zotero://...)) ([pdf](zotero://...)) user note
 *         [reference]
 *         Paper Title
 *
 * Handles both curly quotes (\u201C\u201D) and straight quotes ("").
 *
 * @param {string} rawText - Raw annotation text
 * @returns {Object} Parsed annotation object
 */
function parseRawAnnotation(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { quote: '', source: {}, pdf: null, myNote: '', referencePaperTitle: null };
  }

  // Split at [reference] marker
  let mainText = rawText;
  let referencePaperTitle = null;
  const refIndex = rawText.search(/\[reference\]/i);
  if (refIndex >= 0) {
    mainText = rawText.substring(0, refIndex).trim();
    const afterRef = rawText.substring(refIndex).replace(/\[reference\]/i, '').trim();
    if (afterRef) {
      // Take the first non-empty line as the paper title
      referencePaperTitle = afterRef.split('\n').map(l => l.trim()).find(l => l) || null;
    }
  }

  // Try to extract quoted text — curly quotes first, then straight quotes
  const quotePatterns = [
    /\u201C([^\u201D]+)\u201D/,     // curly quotes
    /"([^"]+)"/                       // straight quotes
  ];

  let quoteMatch = null;
  for (const pat of quotePatterns) {
    quoteMatch = mainText.match(pat);
    if (quoteMatch) break;
  }

  if (!quoteMatch) {
    return { quote: '', source: {}, pdf: null, myNote: '', referencePaperTitle };
  }

  const quote = quoteMatch[1];
  const afterQuote = mainText.substring(mainText.indexOf(quoteMatch[0]) + quoteMatch[0].length);

  // Find source link: ([Author, Year, p.X](zotero://select/...))
  let sourceText = '';
  let zoteroUrl = null;
  let zoteroKey = null;
  const sourceMatch = afterQuote.match(/\(\[([^\]]+)\]\((zotero:\/\/[^)]+)\)\)/);
  if (sourceMatch) {
    sourceText = sourceMatch[1];
    zoteroUrl = sourceMatch[2];
    const keyMatch = zoteroUrl.match(/items\/([A-Z0-9]+)/);
    if (keyMatch) zoteroKey = keyMatch[1];
  }

  // Find PDF link: ([pdf](zotero://open-pdf/...))
  let pdfUrl = null;
  let page = null;
  let annotationId = null;
  const pdfMatch = afterQuote.match(/\(\[pdf\]\((zotero:\/\/[^)]+)\)\)/i);
  if (pdfMatch) {
    pdfUrl = pdfMatch[1];
    const pageMatch = pdfUrl.match(/page=(\d+)/);
    const annMatch = pdfUrl.match(/annotation=([A-Z0-9]+)/);
    if (pageMatch) page = parseInt(pageMatch[1]);
    if (annMatch) annotationId = annMatch[1];
  }

  // Everything after the links is the user note
  let userNote = afterQuote;
  if (sourceMatch) userNote = userNote.replace(sourceMatch[0], '');
  if (pdfMatch) userNote = userNote.replace(pdfMatch[0], '');
  userNote = userNote.trim();

  return {
    id: generateAnnotationId(),
    quote: quote.trim(),
    source: {
      text: sourceText.trim(),
      zoteroKey: zoteroKey,
      zoteroUrl: zoteroUrl
    },
    pdf: pdfUrl ? {
      url: pdfUrl,
      page: page,
      annotationId: annotationId
    } : null,
    myNote: userNote,
    referencePaperTitle: referencePaperTitle,
    createdAt: Date.now()
  };
}
