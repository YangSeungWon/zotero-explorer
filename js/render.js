/* ===========================================
   Plotly Rendering
   =========================================== */

function render(filteredPapers) {
  // highlight 모드면 전체 논문 표시, filter 모드면 필터된 것만
  const papers = filterMode === 'highlight' ? allPapers : filteredPapers;
  const filteredIds = new Set(filteredPapers.map(p => p.id));

  // Separate papers and apps
  const paperItems = papers.filter(p => p.is_paper);
  const appItems = papers.filter(p => !p.is_paper);

  // opacity 계산 함수
  function getOpacity(p, baseOpacity) {
    if (selectedPaper !== null) {
      if (p.id === selectedPaper.id) return 1;
      if (connectedPapers.has(p.id)) return 0.9;
      return 0.5;
    }
    if (highlightCluster !== null) {
      return p.cluster === highlightCluster ? 1 : 0.15;
    }
    if (filterMode === 'highlight') {
      return filteredIds.has(p.id) ? baseOpacity : 0.15;
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

  function getLineColor(p) {
    if (selectedPaper !== null && p.id === selectedPaper.id) return '#ffd700';
    if (selectedPaper !== null && connectedPapers.has(p.id)) return '#ff6b6b';
    return '#0d1117';
  }

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
      size: paperItems.map(p => getSize(p)),
      color: paperItems.map(p => CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]),
      opacity: paperItems.map(p => getOpacity(p, 0.8)),
      line: {
        width: paperItems.map(p => getLineWidth(p)),
        color: paperItems.map(p => getLineColor(p))
      }
    },
    hovertemplate: '%{text}<extra></extra>'
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
      size: 14,
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

  // 인용 관계 선
  const traces = [];

  if (showCitations && citationLinks.length > 0) {
    const visibleIds = new Set(papers.map(p => p.id));
    const idToPos = {};
    papers.forEach(p => { idToPos[p.id] = { x: p.x, y: p.y }; });

    const relevantLinks = citationLinks.filter(
      link => visibleIds.has(link.source) && visibleIds.has(link.target)
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

  traces.push(paperTrace, appTrace);

  const plotDiv = document.getElementById('plot');

  // 호버용 위치 맵 저장
  const idToPos = {};
  papers.forEach(p => { idToPos[p.id] = { x: p.x, y: p.y }; });

  Plotly.newPlot(plotDiv, traces, layout, config).then(function() {
    plotDiv.on('plotly_click', function(data) {
      if (data.points && data.points[0] && data.points[0].customdata) {
        showDetail(data.points[0].customdata);
      } else if (selectedPaper !== null) {
        // 빈 공간 클릭 시 선택 해제
        clearSelection();
      }
    });

    // Ctrl+호버 시 인용선 미리보기
    let ctrlPressed = false;
    document.addEventListener('keydown', e => {
      if (e.key === 'Control') {
        ctrlPressed = true;
        document.body.classList.add('ctrl-pressed');
      }
    });
    document.addEventListener('keyup', e => {
      if (e.key === 'Control') {
        ctrlPressed = false;
        document.body.classList.remove('ctrl-pressed');
      }
    });

    // 호버용 빈 트레이스 2개 미리 추가 (refs, citedBy)
    Plotly.addTraces(plotDiv, [
      { x: [], y: [], mode: 'lines', type: 'scatter', line: { color: 'rgba(88, 166, 255, 0.6)', width: 2 }, hoverinfo: 'none', showlegend: false },
      { x: [], y: [], mode: 'lines', type: 'scatter', line: { color: 'rgba(249, 115, 22, 0.6)', width: 2 }, hoverinfo: 'none', showlegend: false }
    ]);
    const refTraceIdx = plotDiv.data.length - 2;
    const citedByTraceIdx = plotDiv.data.length - 1;

    plotDiv.on('plotly_hover', function(data) {
      if (!ctrlPressed) return;
      if (selectedPaper !== null) return;
      if (!showCitations || citationLinks.length === 0) return;
      if (!data.points || !data.points[0] || !data.points[0].customdata) return;

      const hoveredId = data.points[0].customdata.id;

      // 단일 trace로 모든 선 그리기 (null로 구분)
      const refX = [], refY = [], citedByX = [], citedByY = [];

      citationLinks.forEach(link => {
        const source = idToPos[link.source];
        const target = idToPos[link.target];
        if (!source || !target) return;

        if (link.source === hoveredId) {
          refX.push(source.x, target.x, null);
          refY.push(source.y, target.y, null);
        } else if (link.target === hoveredId) {
          citedByX.push(source.x, target.x, null);
          citedByY.push(source.y, target.y, null);
        }
      });

      Plotly.restyle(plotDiv, { x: [refX, citedByX], y: [refY, citedByY] }, [refTraceIdx, citedByTraceIdx]);
    });

    plotDiv.on('plotly_unhover', function() {
      Plotly.restyle(plotDiv, { x: [[], []], y: [[], []] }, [refTraceIdx, citedByTraceIdx]);
    });
  });
}
