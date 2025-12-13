/* ===========================================
   Plotly Rendering
   =========================================== */

function render(filteredPapers) {
  const renderStart = performance.now();

  // Map/Timeline: show all papers, highlight filtered ones
  const papers = allPapers;
  const filteredIds = new Set(filteredPapers.map(p => p.id));

  // Separate papers and apps
  const paperItems = papers.filter(p => p.is_paper);
  const appItems = papers.filter(p => !p.is_paper);

  const hasActiveFilter = filteredIds.size < allPapers.length;
  const isLight = document.documentElement.dataset.theme === 'light';

  // Muted color for background papers (faint cluster hint, lower brightness)
  function muteColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Blend toward muted gray
    const gray = isLight ? 225 : 35;
    const amount = 0.88;  // More gray, less color

    const nr = Math.round(r + (gray - r) * amount);
    const ng = Math.round(g + (gray - g) * amount);
    const nb = Math.round(b + (gray - b) * amount);

    return `rgb(${nr}, ${ng}, ${nb})`;
  }

  // Determine if paper is highlighted (foreground) or dimmed (background)
  function isHighlighted(p) {
    // When paper is selected, show selected + connected as highlighted
    if (selectedPaper !== null) {
      return p.id === selectedPaper.id || connectedPapers.has(p.id);
    }
    // Cluster highlight
    if (highlightCluster !== null) {
      return p.cluster === highlightCluster;
    }
    // Filter active
    if (hasActiveFilter) {
      return filteredIds.has(p.id);
    }
    // No filter - all highlighted
    return true;
  }

  // Split into foreground (highlighted) and background (dimmed)
  const fgPapers = paperItems.filter(p => isHighlighted(p));
  const bgPapers = paperItems.filter(p => !isHighlighted(p));
  const fgApps = appItems.filter(p => isHighlighted(p));
  const bgApps = appItems.filter(p => !isHighlighted(p));

  // Opacity for foreground papers
  function getFgOpacity(p, baseOpacity) {
    if (selectedPaper !== null) {
      if (p.id === selectedPaper.id) return 1;
      if (connectedPapers.has(p.id)) return 0.9;
    }
    return baseOpacity;
  }

  // 내부 인용수 계산
  const myS2Ids = new Set(papers.map(p => p.s2_id).filter(Boolean));
  const s2IdToInternal = {};
  papers.forEach(p => {
    if (p.s2_id) {
      const internalCiteCount = (p.citations || []).filter(citeId => myS2Ids.has(citeId)).length;
      s2IdToInternal[p.id] = internalCiteCount;
    }
  });

  // 마커 크기 (인용 0: 6px, 인용 1000: ~25px)
  function getSize(p) {
    const baseSize = 6;
    const citationBonus = p.citation_count ? Math.log10(p.citation_count + 1) * 6.3 : 0;
    return baseSize + citationBonus;
  }

  // 선택된 논문 테두리 (내부인용 반영)
  function getLineWidth(p) {
    const internalCount = s2IdToInternal[p.id] || 0;
    const baseWidth = internalCount > 0 ? 0.5 + Math.min(internalCount, 5) * 0.4 : 0.5;

    if (selectedPaper !== null && p.id === selectedPaper.id) return baseWidth + 1.5;
    if (selectedPaper !== null && connectedPapers.has(p.id)) return baseWidth + 1;
    return baseWidth;
  }

  function getLineColor(p, isolated = false) {
    if (selectedPaper !== null && p.id === selectedPaper.id) return '#00ffff';  // cyan for selection
    if (selectedPaper !== null && connectedPapers.has(p.id)) return '#ff6b6b';
    if (isolated) return '#4a5568'; // 회색 테두리 (isolated)
    return '#0d1117';
  }

  // isolated 논문 식별 (내부 인용 관계 없음)
  const connectedIds = new Set();
  citationLinks.forEach(link => {
    connectedIds.add(link.source);
    connectedIds.add(link.target);
  });
  const isIsolated = (p) => !connectedIds.has(p.id);

  // 검색 결과 glow 효과용
  const glowItems = hasActiveFilter ? fgPapers : [];

  // 단순 줄바꿈 (단어 경계에서 maxWidth마다)
  function wrapText(text, maxWidth = 55) {
    if (!text) return '';
    const clean = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    const words = clean.split(' ');
    const lines = [];
    let line = '';

    for (const word of words) {
      const testLine = line ? line + ' ' + word : word;
      if (testLine.length <= maxWidth) {
        line = testLine;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);

    return lines.join('<br>');
  }

  // 노트 추출 (툴팁용) - 모든 줄바꿈 제거 후 단어 단위로만 줄바꿈
  function getNotesPreview(notes, maxLen = 330) {
    if (!notes) return '';
    let clean = notes.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length > maxLen) {
      clean = clean.substring(0, maxLen) + '...';
    }
    return wrapText(clean, 55);
  }

  // 클러스터 라벨 가져오기
  function getClusterLabel(cluster) {
    const label = clusterLabels[cluster];
    if (label && label !== `Cluster ${cluster}`) {
      return label.length > 20 ? label.substring(0, 20) + '...' : label;
    }
    return `Cluster ${cluster}`;
  }

  // Background papers trace (dimmed, no interaction, faint cluster colors)
  const bgPaperTrace = {
    x: bgPapers.map(p => p.x),
    y: bgPapers.map(p => p.y),
    mode: 'markers',
    type: 'scatter',
    name: 'Papers (bg)',
    showlegend: false,
    marker: {
      size: bgPapers.map(p => getSize(p) * zoomScale),
      color: bgPapers.map(p => muteColor(CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length])),
      opacity: 1,
      line: { width: 0.5, color: isLight ? '#ddd' : '#333' }
    },
    hoverinfo: 'skip'
  };

  // Foreground papers trace (highlighted, interactive)
  const fgPaperTrace = {
    x: fgPapers.map(p => p.x),
    y: fgPapers.map(p => p.y),
    text: fgPapers.map(p => {
      const title = wrapText(p.title || 'Untitled', 55);
      const notesPreview = getNotesPreview(p.notes, 330);
      const noteSection = notesPreview ? `<br><br><i>"${notesPreview}"</i>` : '';
      const citationInfo = p.citation_count ? ` · ${p.citation_count} cited` : '';
      const clusterName = getClusterLabel(p.cluster);
      return `<b>${title}</b><br>` +
        `${p.year || 'N/A'} · ${(p.venue || 'Unknown').substring(0, 25)}${citationInfo}<br>` +
        `<span style="color: ${CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]}">● </span>${clusterName}` +
        noteSection;
    }),
    customdata: fgPapers,
    mode: 'markers',
    type: 'scatter',
    name: 'Papers',
    marker: {
      size: fgPapers.map(p => getSize(p) * zoomScale),
      color: fgPapers.map(p => CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]),
      opacity: fgPapers.map(p => getFgOpacity(p, 0.8)),
      line: {
        width: fgPapers.map(p => getLineWidth(p)),
        color: fgPapers.map(p => getLineColor(p, isIsolated(p)))
      }
    },
    hovertemplate: '%{text}<extra></extra>'
  };

  // 검색 결과 glow 레이어 (마커 뒤에)
  const glowTrace = {
    x: glowItems.map(p => p.x),
    y: glowItems.map(p => p.y),
    mode: 'markers',
    type: 'scatter',
    showlegend: false,
    marker: {
      size: glowItems.map(p => (getSize(p) + 12) * zoomScale),
      color: 'rgba(0, 255, 255, 0.3)',
      line: { width: 0 }
    },
    hoverinfo: 'skip'
  };


  // Background apps trace (dimmed, faint cluster colors)
  const bgAppTrace = {
    x: bgApps.map(p => p.x),
    y: bgApps.map(p => p.y),
    mode: 'markers',
    type: 'scatter',
    name: 'Apps (bg)',
    showlegend: false,
    marker: {
      size: 14 * zoomScale,
      symbol: 'diamond',
      color: bgApps.map(p => muteColor(CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length])),
      opacity: 1,
      line: { width: 1, color: isLight ? '#ddd' : '#444' }
    },
    hoverinfo: 'skip'
  };

  // Foreground apps trace (highlighted)
  const fgAppTrace = {
    x: fgApps.map(p => p.x),
    y: fgApps.map(p => p.y),
    text: fgApps.map(p => {
      const title = wrapText(p.title || 'Untitled', 55);
      const clusterName = getClusterLabel(p.cluster);
      return `<b>${title}</b><br>` +
        `App/Service<br>` +
        `<span style="color: ${CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]}">● </span>${clusterName}`;
    }),
    customdata: fgApps,
    mode: 'markers',
    type: 'scatter',
    name: 'Apps/Services',
    marker: {
      size: 14 * zoomScale,
      symbol: 'diamond',
      color: fgApps.map(p => CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]),
      opacity: fgApps.map(p => getFgOpacity(p, 0.9)),
      line: { width: 2, color: '#bc8cff' }
    },
    hovertemplate: '%{text}<extra></extra>'
  };

  const colors = isLight ? {
    bg: '#ffffff', grid: '#eaeef2', zero: '#d0d7de', text: '#656d76'
  } : {
    bg: '#0d1117', grid: '#21262d', zero: '#30363d', text: '#8b949e'
  };

  const layout = {
    margin: { l: 40, r: 20, t: 20, b: 40 },
    paper_bgcolor: colors.bg,
    plot_bgcolor: colors.bg,
    xaxis: {
      title: '',
      showgrid: true,
      gridcolor: colors.grid,
      zerolinecolor: colors.zero,
      tickfont: { color: colors.text }
    },
    yaxis: {
      title: '',
      showgrid: true,
      gridcolor: colors.grid,
      zerolinecolor: colors.zero,
      tickfont: { color: colors.text }
    },
    showlegend: false,
    hovermode: 'closest',
    hoverlabel: {
      bgcolor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(22, 27, 34, 0.95)',
      bordercolor: 'rgba(88, 166, 255, 0.5)',
      font: { color: isLight ? '#1f2328' : '#c9d1d9', size: 12 }
    }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };

  // 현재 줌 상태 저장 (리렌더링 시 보존)
  const plotDiv = document.getElementById('plot');
  let savedXRange = null, savedYRange = null;
  if (plotDiv && plotDiv.layout) {
    savedXRange = plotDiv.layout.xaxis?.range;
    savedYRange = plotDiv.layout.yaxis?.range;
  }

  // Order: bg papers (dimmed) first, below everything
  const traces = [];
  if (bgPapers.length > 0) traces.push(bgPaperTrace);
  if (bgApps.length > 0) traces.push(bgAppTrace);

  // 인용 관계 선 (above bg papers, below fg papers)
  // Consolidated into 3 traces max instead of N individual traces for performance
  if (showCitations && citationLinks.length > 0) {
    const idToPos = {};
    papers.forEach(p => { idToPos[p.id] = { x: p.x, y: p.y }; });

    // Only show citation lines between highlighted/filtered papers
    const relevantLinks = citationLinks.filter(
      link => filteredIds.has(link.source) && filteredIds.has(link.target)
    );

    if (selectedPaper !== null) {
      // 3 consolidated traces: other (gray), refs (blue), citedBy (orange)
      const otherX = [], otherY = [];
      const refX = [], refY = [];
      const citedByX = [], citedByY = [];

      relevantLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (!source || !target) return;

        if (link.source === selectedPaper.id) {
          // Reference link (blue)
          refX.push(source.x, target.x, null);
          refY.push(source.y, target.y, null);
        } else if (link.target === selectedPaper.id) {
          // Cited by link (orange)
          citedByX.push(source.x, target.x, null);
          citedByY.push(source.y, target.y, null);
        } else {
          // Other link (gray, dimmed)
          otherX.push(source.x, target.x, null);
          otherY.push(source.y, target.y, null);
        }
      });

      if (otherX.length > 0) {
        traces.push({
          x: otherX, y: otherY,
          mode: 'lines', type: 'scatter',
          line: { color: 'rgba(128, 128, 128, 0.1)', width: 1 },
          hoverinfo: 'none', showlegend: false
        });
      }
      if (refX.length > 0) {
        traces.push({
          x: refX, y: refY,
          mode: 'lines', type: 'scatter',
          line: { color: 'rgba(88, 166, 255, 0.8)', width: 2 },
          hoverinfo: 'none', showlegend: false
        });
      }
      if (citedByX.length > 0) {
        traces.push({
          x: citedByX, y: citedByY,
          mode: 'lines', type: 'scatter',
          line: { color: 'rgba(249, 115, 22, 0.8)', width: 2 },
          hoverinfo: 'none', showlegend: false
        });
      }
    } else {
      // Single consolidated trace for all links
      const allX = [], allY = [];
      relevantLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (source && target) {
          allX.push(source.x, target.x, null);
          allY.push(source.y, target.y, null);
        }
      });

      if (allX.length > 0) {
        traces.push({
          x: allX, y: allY,
          mode: 'lines', type: 'scatter',
          line: { color: 'rgba(128, 128, 128, 0.25)', width: 1 },
          hoverinfo: 'none', showlegend: false
        });
      }
    }
  }

  // Hover line traces (empty, will be filled on hover) - before fg so lines are below nodes
  // Use unique names to find them later reliably
  const hoverRefTrace = { x: [], y: [], mode: 'lines', type: 'scatter', line: { color: 'rgba(88, 166, 255, 0.6)', width: 2 }, hoverinfo: 'none', showlegend: false, name: '_hoverRef' };
  const hoverCitedByTrace = { x: [], y: [], mode: 'lines', type: 'scatter', line: { color: 'rgba(249, 115, 22, 0.6)', width: 2 }, hoverinfo: 'none', showlegend: false, name: '_hoverCitedBy' };
  traces.push(hoverRefTrace, hoverCitedByTrace);

  // Glow and foreground (highlighted) papers on top
  if (glowItems.length > 0) traces.push(glowTrace);
  traces.push(fgPaperTrace, fgAppTrace);

  // 저장된 줌 상태 적용
  if (savedXRange) layout.xaxis.range = savedXRange;
  if (savedYRange) layout.yaxis.range = savedYRange;

  // 호버용 위치 맵 저장
  const idToPos = {};
  papers.forEach(p => { idToPos[p.id] = { x: p.x, y: p.y }; });

  // 인용선 좌표 사전 계산 (O(n) 한번만)
  const hoverLinesCache = new Map();
  if (showCitations && citationLinks.length > 0) {
    citationLinks.forEach(link => {
      const source = idToPos[link.source];
      const target = idToPos[link.target];
      if (!source || !target) return;

      // source가 인용하는 것 (refs)
      if (!hoverLinesCache.has(link.source)) {
        hoverLinesCache.set(link.source, { refX: [], refY: [], citedByX: [], citedByY: [] });
      }
      const srcCache = hoverLinesCache.get(link.source);
      srcCache.refX.push(source.x, target.x, null);
      srcCache.refY.push(source.y, target.y, null);

      // target이 인용받는 것 (citedBy)
      if (!hoverLinesCache.has(link.target)) {
        hoverLinesCache.set(link.target, { refX: [], refY: [], citedByX: [], citedByY: [] });
      }
      const tgtCache = hoverLinesCache.get(link.target);
      tgtCache.citedByX.push(source.x, target.x, null);
      tgtCache.citedByY.push(source.y, target.y, null);
    });
  }

  Plotly.react(plotDiv, traces, layout, config).then(function() {
    const renderTime = performance.now() - renderStart;
    console.log(`%c[Render] ${renderTime.toFixed(1)}ms | ${traces.length} traces | ${papers.length} papers`,
      renderTime < 100 ? 'color: green' : renderTime < 300 ? 'color: orange' : 'color: red');

    // Remove old event listeners to prevent memory leak
    plotDiv.removeAllListeners('plotly_click');
    plotDiv.removeAllListeners('plotly_hover');
    plotDiv.removeAllListeners('plotly_unhover');
    plotDiv.removeAllListeners('plotly_relayout');
    plotDiv.removeAllListeners('plotly_doubleclick');

    // Initialize click state only once (don't reset on re-render)
    if (plotDiv._pointClicked === undefined) {
      plotDiv._pointClicked = false;
    }

    plotDiv.on('plotly_click', function(data) {
      if (data.points && data.points[0] && data.points[0].customdata) {
        const paper = data.points[0].customdata;

        // Only allow clicking on highlighted/filtered papers
        if (!filteredIds.has(paper.id)) {
          return;
        }

        plotDiv._pointClicked = true;
        showDetail(paper);
      }
    });

    // 빈 공간 클릭 시 선택 해제 (plotly_click은 빈 공간에서 발생하지 않음)
    // DOM 리스너는 한번만 추가 (중복 방지)
    const plotArea = plotDiv.querySelector('.nsewdrag');
    if (plotArea && !plotArea._emptyClickHandler) {
      plotArea._emptyClickHandler = function(e) {
        setTimeout(() => {
          if (!plotDiv._pointClicked && selectedPaper !== null) {
            clearSelection();
          }
          plotDiv._pointClicked = false;
        }, 10);
      };
      plotArea.addEventListener('click', plotArea._emptyClickHandler);
    }

    // 호버용 트레이스 인덱스 찾기 (이름으로 안전하게)
    function getHoverTraceIndices() {
      const refIdx = plotDiv.data.findIndex(t => t.name === '_hoverRef');
      const citedByIdx = plotDiv.data.findIndex(t => t.name === '_hoverCitedBy');
      return { refIdx, citedByIdx };
    }

    plotDiv.on('plotly_hover', function(data) {
      if (!data.points || !data.points[0] || !data.points[0].customdata) return;

      const hoveredItem = data.points[0].customdata;

      // Only allow hovering on highlighted/filtered papers
      if (!filteredIds.has(hoveredItem.id)) {
        return;
      }

      // 사이드패널에 호버 미리보기
      if (typeof showHoverPreview === 'function') {
        showHoverPreview(hoveredItem);
      }

      // 호버 시 인용선 표시 (사전 계산된 캐시 사용)
      if (selectedPaper !== null) return;
      if (!showCitations || citationLinks.length === 0) return;

      const { refIdx, citedByIdx } = getHoverTraceIndices();
      if (refIdx < 0 || citedByIdx < 0) return;

      const cached = hoverLinesCache.get(hoveredItem.id);
      if (cached) {
        Plotly.restyle(plotDiv, {
          x: [cached.refX, cached.citedByX],
          y: [cached.refY, cached.citedByY]
        }, [refIdx, citedByIdx]);
      } else {
        Plotly.restyle(plotDiv, { x: [[], []], y: [[], []] }, [refIdx, citedByIdx]);
      }
    });

    plotDiv.on('plotly_unhover', function() {
      const { refIdx, citedByIdx } = getHoverTraceIndices();
      if (refIdx >= 0 && citedByIdx >= 0) {
        Plotly.restyle(plotDiv, { x: [[], []], y: [[], []] }, [refIdx, citedByIdx]);
      }

      // 선택된 논문 없으면 기본 패널로
      if (selectedPaper === null && typeof showDefaultPanel === 'function') {
        showDefaultPanel();
      }
    });

    // 줌에 따라 마커 크기 조정
    const initialXRange = plotDiv.layout.xaxis.range || [Math.min(...papers.map(p => p.x)), Math.max(...papers.map(p => p.x))];
    const initialRange = initialXRange[1] - initialXRange[0];

    function updateMarkerSizes() {
      const bgPaperIdx = plotDiv.data.findIndex(t => t.name === 'Papers (bg)');
      const fgPaperIdx = plotDiv.data.findIndex(t => t.name === 'Papers');
      const bgAppIdx = plotDiv.data.findIndex(t => t.name === 'Apps (bg)');
      const fgAppIdx = plotDiv.data.findIndex(t => t.name === 'Apps/Services');
      const glowIdx = plotDiv.data.findIndex(t => t.marker?.color === 'rgba(0, 255, 255, 0.3)');

      // Combine all restyle calls into one for better performance
      const sizes = [];
      const indices = [];

      if (bgPaperIdx >= 0 && bgPapers.length > 0) {
        sizes.push(bgPapers.map(p => getSize(p) * zoomScale));
        indices.push(bgPaperIdx);
      }
      if (fgPaperIdx >= 0) {
        sizes.push(fgPapers.map(p => getSize(p) * zoomScale));
        indices.push(fgPaperIdx);
      }
      if (bgAppIdx >= 0 && bgApps.length > 0) {
        sizes.push(bgApps.map(() => 14 * zoomScale));
        indices.push(bgAppIdx);
      }
      if (fgAppIdx >= 0) {
        sizes.push(fgApps.map(() => 14 * zoomScale));
        indices.push(fgAppIdx);
      }
      if (glowIdx >= 0 && glowItems.length > 0) {
        sizes.push(glowItems.map(p => (getSize(p) + 12) * zoomScale));
        indices.push(glowIdx);
      }

      if (indices.length > 0) {
        const restyleStart = performance.now();
        Plotly.restyle(plotDiv, { 'marker.size': sizes }, indices).then(() => {
          console.log(`%c[Restyle] ${(performance.now() - restyleStart).toFixed(1)}ms`, 'color: #888');
        });
      }
    }

    plotDiv.on('plotly_relayout', function(eventData) {
      if (eventData['xaxis.autorange'] || eventData['yaxis.autorange']) {
        zoomScale = 1;
      } else if (eventData['xaxis.range[0]'] !== undefined) {
        const newRange = eventData['xaxis.range[1]'] - eventData['xaxis.range[0]'];
        const zoomFactor = Math.sqrt(initialRange / newRange);
        zoomScale = Math.max(0.5, Math.min(5, zoomFactor));
      } else {
        return;
      }
      updateMarkerSizes();
    });

    // 더블클릭 리셋 보완
    plotDiv.on('plotly_doubleclick', function() {
      zoomScale = 1;
      updateMarkerSizes();
    });
  });
}
