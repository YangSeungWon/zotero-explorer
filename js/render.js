/* ===========================================
   Plotly Rendering
   =========================================== */

function render(filteredPapers) {
  // Map/Timeline: show all papers, highlight filtered ones
  const papers = allPapers;
  const filteredIds = new Set(filteredPapers.map(p => p.id));

  // Separate papers and apps
  const paperItems = papers.filter(p => p.is_paper);
  const appItems = papers.filter(p => !p.is_paper);

  // opacity 계산 함수
  const hasActiveFilter = filteredIds.size < allPapers.length;

  function getOpacity(p, baseOpacity) {
    const isFiltered = filteredIds.has(p.id);
    const isHighlightedCluster = highlightCluster !== null && p.cluster === highlightCluster;
    const isHighlighted = isHighlightedCluster || (hasActiveFilter && isFiltered);

    // 논문 선택 + 하이라이트(클러스터 또는 필터) 동시
    if (selectedPaper !== null && (highlightCluster !== null || hasActiveFilter)) {
      if (p.id === selectedPaper.id) return 1;
      if (connectedPapers.has(p.id)) {
        return isHighlighted ? 0.9 : 0.4;
      }
      return isHighlighted ? 0.6 : 0.1;
    }
    // 논문만 선택된 경우
    if (selectedPaper !== null) {
      if (p.id === selectedPaper.id) return 1;
      if (connectedPapers.has(p.id)) return 0.9;
      return 0.5;
    }
    // 클러스터만 하이라이트된 경우
    if (highlightCluster !== null) {
      return p.cluster === highlightCluster ? 1 : 0.15;
    }
    // 필터만 활성화된 경우
    if (hasActiveFilter) {
      return isFiltered ? baseOpacity : 0.15;
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
    if (bookmarkedPapers.has(p.id)) return baseWidth + 1;  // bookmark border
    return baseWidth;
  }

  function getLineColor(p, isolated = false) {
    if (selectedPaper !== null && p.id === selectedPaper.id) return '#00ffff';  // cyan for selection
    if (selectedPaper !== null && connectedPapers.has(p.id)) return '#ff6b6b';
    if (bookmarkedPapers.has(p.id)) return '#ffd700';  // gold for bookmark
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
  const isSearchActive = filteredIds.size < allPapers.length;
  const glowItems = isSearchActive ? paperItems.filter(p => filteredIds.has(p.id)) : [];

  // 단어 단위 줄바꿈
  function wrapText(text, maxLen = 25) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length <= maxLen) {
        line = (line + ' ' + word).trim();
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.join('<br>');
  }

  // 노트 첫 문단 추출
  function getFirstParagraph(notes, maxLen = 100) {
    if (!notes) return '';
    const para = notes.split(/\n\s*\n/)[0].trim();
    if (para.length > maxLen) {
      return para.substring(0, maxLen) + '...';
    }
    return para;
  }

  // Papers trace
  const paperTrace = {
    x: paperItems.map(p => p.x),
    y: paperItems.map(p => p.y),
    text: paperItems.map(p => {
      const wrappedTitle = wrapText(p.title || '', 28);
      const firstNote = getFirstParagraph(p.notes);
      const notePreview = firstNote ? `<br><br><i>"${wrapText(firstNote, 28)}"</i>` : '';
      return `<b>${wrappedTitle}</b><br><br>` +
        `${p.year || 'N/A'}<br>` +
        `${(p.venue || '').substring(0, 30)}<br>` +
        `Cluster ${p.cluster}` +
        notePreview;
    }),
    customdata: paperItems,
    mode: 'markers',
    type: 'scatter',
    name: 'Papers',
    marker: {
      size: paperItems.map(p => getSize(p) * zoomScale),
      color: paperItems.map(p => CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]),
      opacity: paperItems.map(p => getOpacity(p, 0.8)),
      line: {
        width: paperItems.map(p => getLineWidth(p)),
        color: paperItems.map(p => getLineColor(p, isIsolated(p)))
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

  // 북마크 표시 (골드 링)
  const bookmarkedItems = papers.filter(p => bookmarkedPapers.has(p.id));
  const bookmarkTrace = {
    x: bookmarkedItems.map(p => p.x),
    y: bookmarkedItems.map(p => p.y),
    mode: 'markers',
    type: 'scatter',
    name: 'Bookmarked',
    showlegend: false,
    marker: {
      size: bookmarkedItems.map(p => (getSize(p) + 6) * zoomScale),
      symbol: 'circle-open',
      color: '#ffd700',
      line: { width: 2, color: '#ffd700' }
    },
    hoverinfo: 'skip'
  };

  // Apps trace
  const appTrace = {
    x: appItems.map(p => p.x),
    y: appItems.map(p => p.y),
    text: appItems.map(p => {
      const wrappedTitle = wrapText(p.title || '', 28);
      return `<b>${wrappedTitle}</b><br><br>` +
        `App/Service<br>` +
        `Cluster ${p.cluster}`;
    }),
    customdata: appItems,
    mode: 'markers',
    type: 'scatter',
    name: 'Apps/Services',
    marker: {
      size: 14 * zoomScale,
      symbol: 'diamond',
      color: appItems.map(p => CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]),
      opacity: appItems.map(p => getOpacity(p, 0.9)),
      line: { width: 2, color: '#bc8cff' }
    },
    hovertemplate: '%{text}<extra></extra>'
  };

  const isLight = document.documentElement.dataset.theme === 'light';
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
    hovermode: 'closest'
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

  // 인용 관계 선
  const traces = [];

  if (showCitations && citationLinks.length > 0) {
    const idToPos = {};
    papers.forEach(p => { idToPos[p.id] = { x: p.x, y: p.y }; });

    // Only show citation lines between highlighted/filtered papers
    const relevantLinks = citationLinks.filter(
      link => filteredIds.has(link.source) && filteredIds.has(link.target)
    );

    if (selectedPaper !== null) {
      const refLinks = relevantLinks.filter(link => link.source === selectedPaper.id);
      const citedByLinks = relevantLinks.filter(link => link.target === selectedPaper.id);
      const otherLinks = relevantLinks.filter(
        link => link.source !== selectedPaper.id && link.target !== selectedPaper.id
      );

      otherLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (source && target) {
          traces.push({
            x: [source.x, target.x],
            y: [source.y, target.y],
            mode: 'lines',
            type: 'scatter',
            line: { color: 'rgba(128, 128, 128, 0.1)', width: 1 },
            hoverinfo: 'none',
            showlegend: false
          });
        }
      });

      refLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (source && target) {
          traces.push({
            x: [source.x, target.x],
            y: [source.y, target.y],
            mode: 'lines',
            type: 'scatter',
            line: { color: 'rgba(88, 166, 255, 0.8)', width: 2 },
            hoverinfo: 'none',
            showlegend: false
          });
        }
      });

      citedByLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (source && target) {
          traces.push({
            x: [source.x, target.x],
            y: [source.y, target.y],
            mode: 'lines',
            type: 'scatter',
            line: { color: 'rgba(249, 115, 22, 0.8)', width: 2 },
            hoverinfo: 'none',
            showlegend: false
          });
        }
      });
    } else {
      relevantLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (source && target) {
          traces.push({
            x: [source.x, target.x],
            y: [source.y, target.y],
            mode: 'lines',
            type: 'scatter',
            line: { color: 'rgba(128, 128, 128, 0.25)', width: 1 },
            hoverinfo: 'none',
            showlegend: false
          });
        }
      });
    }
  }

  if (glowItems.length > 0) traces.push(glowTrace);
  traces.push(paperTrace, appTrace);
  if (bookmarkedItems.length > 0) traces.push(bookmarkTrace);

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

  Plotly.newPlot(plotDiv, traces, layout, config).then(function() {
    let pointClicked = false;

    plotDiv.on('plotly_click', function(data) {
      if (data.points && data.points[0] && data.points[0].customdata) {
        const paper = data.points[0].customdata;

        // Only allow clicking on highlighted/filtered papers
        if (!filteredIds.has(paper.id)) {
          return;
        }

        pointClicked = true;

        // Check if in link paper mode for Ideas
        if (typeof handlePaperClickForIdea === 'function' && typeof linkPaperMode !== 'undefined' && linkPaperMode) {
          handlePaperClickForIdea(paper);
        } else {
          showDetail(paper);
        }
      }
    });

    // 빈 공간 클릭 시 선택 해제 (plotly_click은 빈 공간에서 발생하지 않음)
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

    // 호버용 빈 트레이스 2개 미리 추가 (refs, citedBy)
    Plotly.addTraces(plotDiv, [
      { x: [], y: [], mode: 'lines', type: 'scatter', line: { color: 'rgba(88, 166, 255, 0.6)', width: 2 }, hoverinfo: 'none', showlegend: false },
      { x: [], y: [], mode: 'lines', type: 'scatter', line: { color: 'rgba(249, 115, 22, 0.6)', width: 2 }, hoverinfo: 'none', showlegend: false }
    ]);
    const refTraceIdx = plotDiv.data.length - 2;
    const citedByTraceIdx = plotDiv.data.length - 1;

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

      const cached = hoverLinesCache.get(hoveredItem.id);
      if (cached) {
        Plotly.restyle(plotDiv, {
          x: [cached.refX, cached.citedByX],
          y: [cached.refY, cached.citedByY]
        }, [refTraceIdx, citedByTraceIdx]);
      } else {
        Plotly.restyle(plotDiv, { x: [[], []], y: [[], []] }, [refTraceIdx, citedByTraceIdx]);
      }
    });

    plotDiv.on('plotly_unhover', function() {
      Plotly.restyle(plotDiv, { x: [[], []], y: [[], []] }, [refTraceIdx, citedByTraceIdx]);

      // 선택된 논문 없으면 기본 패널로
      if (selectedPaper === null && typeof showDefaultPanel === 'function') {
        showDefaultPanel();
      }
    });

    // 줌에 따라 마커 크기 조정
    const initialXRange = plotDiv.layout.xaxis.range || [Math.min(...papers.map(p => p.x)), Math.max(...papers.map(p => p.x))];
    const initialRange = initialXRange[1] - initialXRange[0];

    function updateMarkerSizes() {
      const paperIdx = plotDiv.data.findIndex(t => t.name === 'Papers');
      const appIdx = plotDiv.data.findIndex(t => t.name === 'Apps/Services');
      const glowIdx = plotDiv.data.findIndex(t => t.marker?.color === 'rgba(0, 255, 255, 0.3)');
      const bookmarkIdx = plotDiv.data.findIndex(t => t.name === 'Bookmarked');

      if (paperIdx >= 0) {
        const newPaperSizes = paperItems.map(p => getSize(p) * zoomScale);
        Plotly.restyle(plotDiv, { 'marker.size': [newPaperSizes] }, [paperIdx]);
      }
      if (appIdx >= 0) {
        const newAppSizes = appItems.map(() => 14 * zoomScale);
        Plotly.restyle(plotDiv, { 'marker.size': [newAppSizes] }, [appIdx]);
      }
      if (glowIdx >= 0 && glowItems.length > 0) {
        const newGlowSizes = glowItems.map(p => (getSize(p) + 12) * zoomScale);
        Plotly.restyle(plotDiv, { 'marker.size': [newGlowSizes] }, [glowIdx]);
      }
      if (bookmarkIdx >= 0 && bookmarkedItems.length > 0) {
        const newBookmarkSizes = bookmarkedItems.map(p => (getSize(p) + 6) * zoomScale);
        Plotly.restyle(plotDiv, { 'marker.size': [newBookmarkSizes] }, [bookmarkIdx]);
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
