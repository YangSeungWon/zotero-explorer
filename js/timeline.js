/* ===========================================
   Timeline View & Mini Timeline
   =========================================== */

// Timeline view rendering (full view)
function renderTimeline(filteredPapers) {
  // Timeline: show all papers, highlight filtered ones
  const papers = allPapers;
  const filteredIds = new Set(filteredPapers.map(p => p.id));
  const hasActiveFilter = filteredIds.size < allPapers.length;
  const isLight = document.documentElement.dataset.theme === 'light';

  // Muted color for background papers (faint cluster hint, lower brightness)
  function muteColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const gray = isLight ? 225 : 35;
    const amount = 0.88;
    const nr = Math.round(r + (gray - r) * amount);
    const ng = Math.round(g + (gray - g) * amount);
    const nb = Math.round(b + (gray - b) * amount);
    return `rgb(${nr}, ${ng}, ${nb})`;
  }

  // Get unique clusters and sort
  const clusters = [...new Set(papers.map(p => p.cluster))].sort((a, b) => a - b);
  const clusterY = {};
  clusters.forEach((c, i) => { clusterY[c] = i; });

  // Determine if paper is highlighted
  function isHighlighted(p) {
    if (selectedPaper !== null) {
      return p.id === selectedPaper.id || connectedPapers.has(p.id);
    }
    if (highlightCluster !== null) {
      return p.cluster === highlightCluster;
    }
    if (hasActiveFilter) {
      return filteredIds.has(p.id);
    }
    return true;
  }

  // Size based on citations
  function getSize(p) {
    const baseSize = 8;
    const citationBonus = p.citation_count ? Math.log10(p.citation_count + 1) * 5 : 0;
    return baseSize + citationBonus;
  }

  // Compute jitter for ALL papers first (to maintain consistent positions)
  const jitterMap = {};
  papers.forEach(p => {
    const key = `${p.year}-${p.cluster}`;
    if (!jitterMap[key]) jitterMap[key] = 0;
    jitterMap[key]++;
  });

  const jitterCount = {};
  const paperPositions = papers.map(p => {
    const key = `${p.year}-${p.cluster}`;
    if (!jitterCount[key]) jitterCount[key] = 0;
    const count = jitterMap[key];
    const jitter = count > 1 ? (jitterCount[key]++ / count - 0.5) * 0.6 : 0;
    return { paper: p, x: p.year, y: clusterY[p.cluster] + jitter };
  });

  // Split into foreground and background
  const fgPositions = paperPositions.filter(pos => isHighlighted(pos.paper));
  const bgPositions = paperPositions.filter(pos => !isHighlighted(pos.paper));

  // Background trace (dimmed, no interaction)
  const bgTrace = {
    x: bgPositions.map(pos => pos.x),
    y: bgPositions.map(pos => pos.y),
    mode: 'markers',
    type: 'scatter',
    name: 'Papers (bg)',
    showlegend: false,
    marker: {
      size: bgPositions.map(pos => getSize(pos.paper)),
      color: bgPositions.map(pos => muteColor(CLUSTER_COLORS[pos.paper.cluster % CLUSTER_COLORS.length])),
      opacity: 1,
      line: { width: 0.5, color: isLight ? '#ddd' : '#333' }
    },
    hoverinfo: 'skip'
  };

  // Foreground trace (highlighted, interactive)
  const fgTrace = {
    x: fgPositions.map(pos => pos.x),
    y: fgPositions.map(pos => pos.y),
    text: fgPositions.map(pos => `<b>${pos.paper.title}</b><br>${pos.paper.year}<br>Cluster ${pos.paper.cluster}`),
    customdata: fgPositions.map(pos => pos.paper),
    mode: 'markers',
    type: 'scatter',
    name: 'Papers',
    marker: {
      size: fgPositions.map(pos => getSize(pos.paper)),
      color: fgPositions.map(pos => CLUSTER_COLORS[pos.paper.cluster % CLUSTER_COLORS.length]),
      opacity: fgPositions.map(pos => {
        const p = pos.paper;
        if (selectedPaper !== null) {
          if (p.id === selectedPaper.id) return 1;
          if (connectedPapers.has(p.id)) return 0.9;
        }
        return 0.8;
      }),
      line: {
        width: fgPositions.map(pos => {
          const p = pos.paper;
          if (selectedPaper && p.id === selectedPaper.id) return 3;
          if (selectedPaper && connectedPapers.has(p.id)) return 2.5;
          return 0.5;
        }),
        color: fgPositions.map(pos => {
          const p = pos.paper;
          if (selectedPaper && p.id === selectedPaper.id) return '#00ffff';
          if (selectedPaper && connectedPapers.has(p.id)) {
            return p.year < selectedPaper.year ? '#58a6ff' : '#f97316';
          }
          return '#0d1117';
        })
      }
    },
    hovertemplate: '%{text}<extra></extra>'
  };
  const colors = isLight ? {
    bg: '#ffffff', grid: '#eaeef2', zero: '#d0d7de', text: '#656d76'
  } : {
    bg: '#0d1117', grid: '#21262d', zero: '#30363d', text: '#8b949e'
  };

  // Y-axis tick labels (cluster labels)
  const yTickVals = clusters.map(c => clusterY[c]);
  const yTickText = clusters.map(c => {
    const label = clusterLabels[c] || `Cluster ${c}`;
    return label.length > 20 ? label.substring(0, 18) + '...' : label;
  });

  const layout = {
    margin: { l: 150, r: 20, t: 20, b: 50 },
    paper_bgcolor: colors.bg,
    plot_bgcolor: colors.bg,
    xaxis: {
      title: 'Year',
      showgrid: true,
      gridcolor: colors.grid,
      zerolinecolor: colors.zero,
      tickfont: { color: colors.text },
      dtick: 5
    },
    yaxis: {
      title: '',
      showgrid: true,
      gridcolor: colors.grid,
      tickmode: 'array',
      tickvals: yTickVals,
      ticktext: yTickText,
      tickfont: { color: colors.text, size: 10 }
    },
    showlegend: false,
    hovermode: 'closest'
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };

  const plotDiv = document.getElementById('timelinePlot');
  let pointClicked = false;

  // Build traces array: background first, then foreground
  const traces = [];
  if (bgPositions.length > 0) traces.push(bgTrace);
  traces.push(fgTrace);

  Plotly.newPlot(plotDiv, traces, layout, config).then(function() {
    plotDiv.on('plotly_click', function(data) {
      if (data.points && data.points[0] && data.points[0].customdata) {
        const paper = data.points[0].customdata;
        // Only allow clicking on highlighted/filtered papers
        if (!filteredIds.has(paper.id)) {
          return;
        }
        pointClicked = true;
        showDetail(paper);
      }
    });

    // Empty space click to clear selection
    const plotArea = plotDiv.querySelector('.nsewdrag');
    if (plotArea) {
      plotArea.addEventListener('click', function(e) {
        setTimeout(() => {
          if (!pointClicked && selectedPaper !== null) {
            clearSelection();
          }
          pointClicked = false;
        }, 10);
      });
    }

    plotDiv.on('plotly_hover', function(data) {
      if (!data.points || !data.points[0] || !data.points[0].customdata) return;
      const paper = data.points[0].customdata;
      // Only allow hovering on highlighted/filtered papers
      if (!filteredIds.has(paper.id)) {
        return;
      }
      if (typeof showHoverPreview === 'function') {
        showHoverPreview(paper);
      }
    });

    plotDiv.on('plotly_unhover', function() {
      if (selectedPaper === null && typeof showDefaultPanel === 'function') {
        showDefaultPanel();
      }
    });
  });
}

// Mini timeline rendering (stacked histogram by cluster)
function renderMiniTimeline(papers) {
  const canvas = document.getElementById('timelineCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();

  // Set canvas size
  canvas.width = rect.width;
  canvas.height = rect.height;

  // Get year range
  const years = papers.map(p => p.year).filter(Boolean);
  if (years.length === 0) return;

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearSpan = maxYear - minYear || 1;

  // Count papers per year per cluster
  const yearClusterCounts = {};
  const clusters = new Set();
  papers.forEach(p => {
    if (!p.year) return;
    if (!yearClusterCounts[p.year]) yearClusterCounts[p.year] = {};
    yearClusterCounts[p.year][p.cluster] = (yearClusterCounts[p.year][p.cluster] || 0) + 1;
    clusters.add(p.cluster);
  });

  // Get max total count for scaling
  let maxCount = 0;
  for (let year = minYear; year <= maxYear; year++) {
    const yearData = yearClusterCounts[year] || {};
    const total = Object.values(yearData).reduce((a, b) => a + b, 0);
    if (total > maxCount) maxCount = total;
  }

  // Sort clusters for consistent stacking
  const sortedClusters = [...clusters].sort((a, b) => a - b);

  // Drawing settings
  const padding = { left: 40, right: 20, top: 5, bottom: 20 };
  const drawWidth = canvas.width - padding.left - padding.right;
  const drawHeight = canvas.height - padding.top - padding.bottom;
  const barWidth = Math.max(2, drawWidth / yearSpan - 1);

  const isLight = document.documentElement.dataset.theme === 'light';

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw stacked bars
  for (let year = minYear; year <= maxYear; year++) {
    const yearData = yearClusterCounts[year] || {};
    const x = padding.left + ((year - minYear) / yearSpan) * drawWidth;
    const inRange = !yearRange || (year >= yearRange.min && year <= yearRange.max);

    let yOffset = 0;
    sortedClusters.forEach(cluster => {
      const count = yearData[cluster] || 0;
      if (count === 0) return;

      const segmentHeight = maxCount > 0 ? (count / maxCount) * drawHeight : 0;
      const y = canvas.height - padding.bottom - yOffset - segmentHeight;

      // Get cluster color with opacity
      const baseColor = CLUSTER_COLORS[cluster % CLUSTER_COLORS.length];
      ctx.globalAlpha = inRange ? 0.8 : 0.25;
      ctx.fillStyle = baseColor;
      ctx.fillRect(x - barWidth / 2, y, barWidth, segmentHeight);

      yOffset += segmentHeight;
    });

    // Black border around entire bar
    if (yOffset > 0) {
      ctx.globalAlpha = inRange ? 0.8 : 0.25;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x - barWidth / 2, canvas.height - padding.bottom - yOffset, barWidth, yOffset);
    }
  }
  ctx.globalAlpha = 1;

  // Draw axis
  ctx.strokeStyle = isLight ? '#d0d7de' : '#30363d';
  ctx.beginPath();
  ctx.moveTo(padding.left, canvas.height - padding.bottom);
  ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
  ctx.stroke();

  // Year labels
  ctx.fillStyle = isLight ? '#656d76' : '#8b949e';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';

  const labelStep = yearSpan > 20 ? 10 : (yearSpan > 10 ? 5 : 2);
  for (let year = Math.ceil(minYear / labelStep) * labelStep; year <= maxYear; year += labelStep) {
    const x = padding.left + ((year - minYear) / yearSpan) * drawWidth;
    ctx.fillText(year.toString(), x, canvas.height - 5);
  }

  // Store year mapping for brush
  canvas._yearData = { minYear, maxYear, yearSpan, padding, drawWidth };
}

// Mini timeline brush interaction
function initMiniTimelineBrush() {
  const canvas = document.getElementById('timelineCanvas');
  const brush = document.getElementById('brushSelection');
  if (!canvas || !brush) return;

  let isDragging = false;
  let startX = 0;

  function getYearFromX(x) {
    const data = canvas._yearData;
    if (!data) return null;
    const relX = x - data.padding.left;
    const ratio = Math.max(0, Math.min(1, relX / data.drawWidth));
    return Math.round(data.minYear + ratio * data.yearSpan);
  }

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.offsetX;
    brush.style.left = `${startX + 12}px`; // 12px padding
    brush.style.width = '0px';
    brush.classList.add('active');
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const currentX = e.offsetX;
    const left = Math.min(startX, currentX);
    const width = Math.abs(currentX - startX);
    brush.style.left = `${left + 12}px`;
    brush.style.width = `${width}px`;
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const endX = e.offsetX;
    const x1 = Math.min(startX, endX);
    const x2 = Math.max(startX, endX);

    // If too small, treat as click (reset)
    if (x2 - x1 < 10) {
      yearRange = null;
      brush.classList.remove('active');
    } else {
      const year1 = getYearFromX(x1);
      const year2 = getYearFromX(x2);
      if (year1 !== null && year2 !== null) {
        yearRange = { min: Math.min(year1, year2), max: Math.max(year1, year2) };
      }
    }

    // Update filter and re-render
    applyFilters();
    renderMiniTimeline(allPapers);
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
    }
  });

  // Double-click to reset
  canvas.addEventListener('dblclick', () => {
    yearRange = null;
    brush.classList.remove('active');
    applyFilters();
    renderMiniTimeline(allPapers);
  });
}

// Switch between map, timeline, and list view
function switchView(view) {
  currentView = view;
  localStorage.setItem('currentView', view);

  const mapPlot = document.getElementById('plot');
  const timelinePlot = document.getElementById('timelinePlot');
  const listView = document.getElementById('listView');
  const detailPanel = document.getElementById('detailPanel');
  const leftSidebar = document.getElementById('leftSidebar');
  const miniTimeline = document.getElementById('miniTimeline');
  const isMobileView = window.innerWidth <= MOBILE_BREAKPOINT;

  // Update mobile body classes
  document.body.classList.remove('mobile-view-map', 'mobile-view-list');
  if (isMobileView) {
    document.body.classList.add(view === 'list' ? 'mobile-view-list' : 'mobile-view-map');
  }

  // Hide all views first
  mapPlot.style.display = 'none';
  timelinePlot.style.display = 'none';
  if (listView) listView.style.display = 'none';

  if (view === 'map') {
    mapPlot.style.display = 'block';
    if (detailPanel) detailPanel.style.display = '';
    if (leftSidebar) leftSidebar.style.display = '';
    if (miniTimeline) miniTimeline.style.display = '';
    render(currentFiltered);
  } else if (view === 'list') {
    if (listView) listView.style.display = 'flex';
    if (detailPanel) detailPanel.style.display = '';
    if (leftSidebar) leftSidebar.style.display = '';
    if (miniTimeline) miniTimeline.style.display = 'none';
    renderListView(currentFiltered);
  } else if (view === 'timeline') {
    timelinePlot.style.display = 'block';
    if (detailPanel) detailPanel.style.display = '';
    if (leftSidebar) leftSidebar.style.display = '';
    if (miniTimeline) miniTimeline.style.display = 'none';
    renderTimeline(currentFiltered);
  }

  // Update button states
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}
