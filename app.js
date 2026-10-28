(function () {
  'use strict';
  const C = window.QuizCore;
  const bank = window.QUESTION_BANK;
  const questions = bank.questions;
  const $ = id => document.getElementById(id);
  const PAGE_SIZE = 98;
  let state = C.createState();
  let storageBlocked = false;
  let storageMessage = '';
  let mode = 'all';
  let sequence = [];
  let directoryPage = 0;
  let selected = [];
  let submitted = false;
  let autoTimer = null;
  let toastTimer = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function toast(text) {
    clearTimeout(toastTimer);
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
  }
  function storageWarning(message) {
    storageMessage = message;
    $('storage-warning').textContent = message;
    $('storage-warning').hidden = !message;
    const status = $('save-status');
    status.replaceChildren();
    const dot = el('i', 'save-dot');
    if (message) dot.style.background = '#c39a55';
    status.append(dot, document.createTextNode(message ? '记录暂未保存，请导出备份' : '进度自动保存'));
  }
  function save() {
    if (storageBlocked) return false;
    try {
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify(state));
      if (storageMessage) storageWarning('');
      return true;
    } catch (error) {
      storageWarning('当前浏览器无法保存记录。可以继续刷题，但关闭后进度可能丢失，请使用页面底部「导出记录」备份。');
      return false;
    }
  }
  function load() {
    let raw;
    try { raw = localStorage.getItem(C.STORAGE_KEY); }
    catch (error) { storageWarning('当前浏览器无法读取或保存记录。可以继续刷题，请使用「导出记录」备份进度。'); return; }
    if (!raw) return;
    try { state = C.validateState(JSON.parse(raw), questions); }
    catch (error) {
      storageBlocked = true;
      storageWarning('已有记录格式异常，暂不覆盖原记录。可以临时刷题并导出；请导入有效备份，或点击「重置进度」恢复自动保存。');
    }
  }
  function cancelAuto() { clearTimeout(autoTimer); autoTimer = null; }
  function activeQuestion() { return sequence.find(q => q.id === state.currentId); }
  function filters() { return { mode, type: $('type-filter').value }; }
  function directoryQuestions() { return C.filterQuestions(questions, state, { ...filters(), query: $('question-search').value }); }
  function pageForCurrent() { return Math.max(0, Math.floor(directoryQuestions().findIndex(q => q.id === state.currentId) / PAGE_SIZE)); }
  function applyFilters() {
    cancelAuto();
    sequence = C.filterQuestions(questions, state, filters());
    if (sequence.length && !sequence.some(q => q.id === state.currentId)) state.currentId = sequence[0].id;
    directoryPage = pageForCurrent();
    renderAll();
    save();
  }
  function renderStats() {
    const stats = C.summarize(state);
    $('answered-count').textContent = stats.answered;
    $('total-count').textContent = questions.length;
    $('accuracy-count').textContent = stats.accuracy === null ? '—' : stats.accuracy;
    $('accuracy-unit').textContent = stats.accuracy === null ? '' : '%';
    $('mistake-count').textContent = stats.mistakes;
    $('mistake-tab-count').textContent = stats.mistakes;
    $('progress-meter').style.width = (stats.answered / questions.length * 100) + '%';
    $('progress-note').textContent = stats.answered ? `已练习 ${Math.round(stats.answered / questions.length * 100)}%，继续积累` : '慢慢来，每一题都算数';
    $('attempt-note').textContent = stats.attempts ? `累计提交 ${stats.attempts} 次 · 答对 ${stats.correct} 次` : '提交答案后开始统计';
    $('mode-all').classList.toggle('active', mode === 'all');
    $('mode-mistakes').classList.toggle('active', mode === 'mistakes');
    $('mode-all').setAttribute('aria-pressed', String(mode === 'all'));
    $('mode-mistakes').setAttribute('aria-pressed', String(mode === 'mistakes'));
    $('clear-filters').hidden = !$('type-filter').value && !$('question-search').value;
  }
  function renderDirectory() {
    const matches = directoryQuestions();
    const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    directoryPage = Math.min(directoryPage, totalPages - 1);
    $('directory-count').textContent = `${matches.length} 题`;
    const start = directoryPage * PAGE_SIZE;
    const group = matches.slice(start, start + PAGE_SIZE);
    $('directory-range').textContent = group.length ? `题号 ${group[0].id} – ${group.at(-1).id}` : '没有匹配的题目';
    $('directory-page').textContent = `${directoryPage + 1} / ${totalPages}`;
    $('directory-prev').disabled = directoryPage === 0;
    $('directory-next').disabled = directoryPage + 1 >= totalPages;
    const fragment = document.createDocumentFragment();
    for (const q of group) {
      const record = state.records[q.id];
      const button = el('button', 'question-number', q.id);
      if (record) button.classList.add(record.lastCorrect ? 'correct' : 'wrong');
      if (q.id === state.currentId) { button.classList.add('current'); button.setAttribute('aria-current', 'step'); }
      const status = record ? (record.lastCorrect ? '答对' : '答错') : '未答';
      button.setAttribute('aria-label', `第 ${q.id} 题，${q.type}，${status}`);
      button.title = `第 ${q.id} 题 · ${q.type} · ${status}`;
      button.addEventListener('click', () => {
        navigate(q.id, true);
        if (window.matchMedia('(max-width: 760px)').matches) toggleDirectory(false);
      });
      fragment.append(button);
    }
    if (!group.length) fragment.append(el('p', 'empty-grid', '试试其他题号或关键词'));
    $('question-grid').replaceChildren(fragment);
  }
  function renderOptions(q) {
    $('answer-options').hidden = q.type === '填空题';
    $('fill-answer-wrap').hidden = q.type !== '填空题';
    $('answer-options').replaceChildren();
    if (q.type === '填空题') {
      $('fill-answer').value = selected[0] || '';
      $('fill-answer').disabled = submitted;
      return;
    }
    q.options.forEach((option, index) => {
      const chosen = selected.includes(option.key);
      const button = el('button', 'answer-option' + (q.type === '多选题' ? ' multi' : ''));
      button.dataset.key = option.key;
      button.setAttribute('aria-label', `${q.type === '判断题' ? '' : option.key + '：'}${option.text}`);
      button.setAttribute('aria-pressed', String(chosen));
      button.disabled = submitted;
      button.classList.toggle('selected', chosen);
      const isExpected = q.answer.includes(option.key);
      button.classList.toggle('is-correct', submitted && isExpected);
      button.classList.toggle('is-wrong', submitted && chosen && !isExpected);
      button.append(el('span', 'option-key', q.type === '判断题' ? (index === 0 ? '✓' : '×') : option.key), el('span', 'option-text', option.text));
      if (submitted && (isExpected || chosen)) button.append(el('span', 'option-mark', isExpected ? '✓' : '×'));
      button.addEventListener('click', () => choose(option.key));
      $('answer-options').append(button);
    });
  }
  function choose(key) {
    const q = activeQuestion();
    if (!q || submitted) return;
    if (q.type === '多选题') selected = selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key];
    else selected = [key];
    // Preserve focus while reflecting the selected state for keyboard and touch users.
    for (const button of $('answer-options').children) {
      const chosen = selected.includes(button.dataset.key);
      button.classList.toggle('selected', chosen);
      button.setAttribute('aria-pressed', String(chosen));
    }
    $('submit-button').disabled = !selected.length;
  }
  function formatAnswer(q, answer) { return q.type === '填空题' || q.type === '判断题' ? answer.join('、') : [...answer].sort().join('、'); }
  function renderFeedback(q) {
    const record = state.records[q.id];
    $('feedback').hidden = !submitted;
    $('explanation').hidden = !submitted;
    $('retry-button').hidden = !submitted;
    $('submit-button').hidden = submitted;
    $('answer-shortcut').textContent = submitted ? '知识常温习，记忆才牢固' : '选好后，按 Enter 提交';
    $('completion').hidden = true;
    if (!submitted) return;
    const correct = record.lastCorrect;
    const index = sequence.findIndex(item => item.id === q.id);
    const hasNext = index < sequence.length - 1;
    $('feedback').classList.toggle('wrong-feedback', !correct);
    $('feedback').replaceChildren(el('strong', '', correct ? '✓ 回答正确，继续积累！' : '× 这道题再温习一下'));
    if (!correct) {
      $('feedback').append(el('p', '', `你的答案：${formatAnswer(q, record.lastAnswer)}　·　正确答案：${formatAnswer(q, q.answer)}`));
      $('feedback').append(el('p', '', '已记录到错题本。停留本题，可查看解析后再做一次。'));
    } else {
      $('feedback').append(el('p', '', autoTimer ? '1 秒后自动进入下一题，也可以点击「下一道」。' : '可以查看解析，或继续练习下一题。'));
    }
    $('explanation-text').textContent = q.explanation || '原题库未提供解析。';
    $('remove-mistake').hidden = !record.inMistakes;
    if (correct && !hasNext) {
      $('completion').hidden = false;
      $('completion').textContent = `✦ 已到${mode === 'mistakes' ? '本轮错题' : $('type-filter').value ? '当前题型' : '题库'}最后一题。${C.summarize(state).answered === questions.length ? '全部题目已练习，去错题本巩固一下吧。' : '你可以从目录跳转，或切换题型继续练习。'}`;
    }
  }
  function renderQuestion() {
    const q = activeQuestion();
    $('question-card').hidden = !q;
    $('empty-state').hidden = Boolean(q);
    if (!q) {
      const noMistakes = mode === 'mistakes' && !C.summarize(state).mistakes;
      $('empty-title').textContent = noMistakes ? '错题本，还是空的' : '没有找到这道题';
      $('empty-description').textContent = noMistakes ? '每次答错的题都会自动收录在这里。先从一道题开始吧。' : '试试清除筛选条件，或输入其他题号、题目关键词。';
      $('empty-action').textContent = noMistakes ? '开始顺序刷题' : '清除筛选';
      $('previous-question').disabled = true;
      $('next-question').disabled = true;
      $('navigation-count').textContent = '0 题';
      return;
    }
    const record = state.records[q.id];
    submitted = Boolean(record);
    selected = record ? [...record.lastAnswer] : [];
    const index = sequence.findIndex(item => item.id === q.id);
    $('question-type').textContent = q.type;
    $('question-position').textContent = `第 ${index + 1} / ${sequence.length} 题`;
    $('question-history').textContent = !record ? '尚未作答' : record.inMistakes ? record.lastCorrect ? '已订正 · 错题保留' : `累计答错 ${record.wrongAttempts} 次` : `已练习 ${record.attempts} 次`;
    $('question-text').replaceChildren(el('span', 'question-id', `${q.id}.`), document.createTextNode(q.text));
    $('answer-instruction').textContent = q.type === '多选题' ? '选择所有正确选项，漏选、多选均判为错误。' : q.type === '填空题' ? '请填写空缺内容，输入完成后提交答案。' : q.type === '判断题' ? '判断这句话是否正确，选择后提交答案。' : '只有一个正确选项，选择后提交答案。';
    $('source-warning').hidden = !q.warnings?.length;
    $('source-warning').textContent = q.warnings?.length ? '原题库提示：' + q.warnings.join('；') + ' 本题仍按原表答案判分。' : '';
    renderOptions(q);
    $('submit-button').disabled = !selected.length || (q.type === '填空题' && !C.normalizeFill(selected[0]));
    renderFeedback(q);
    $('previous-question').disabled = index <= 0;
    $('next-question').disabled = index >= sequence.length - 1;
    $('navigation-count').textContent = `${index + 1} / ${sequence.length}`;
  }
  function renderAll() { renderStats(); renderDirectory(); renderQuestion(); }
  function navigate(id, focus = false) {
    if (!sequence.some(q => q.id === id)) return;
    cancelAuto();
    state.currentId = id;
    directoryPage = pageForCurrent();
    renderAll(); save();
    if (focus) $('question-text').focus({ preventScroll: true });
  }
  function move(delta) {
    const index = sequence.findIndex(q => q.id === state.currentId);
    if (index < 0 || !sequence[index + delta]) return;
    navigate(sequence[index + delta].id, true);
  }
  function submit() {
    const q = activeQuestion();
    if (!q || submitted) return;
    if (q.type === '填空题') selected = [$('fill-answer').value];
    if (!selected.length || (q.type === '填空题' && !C.normalizeFill(selected[0]))) return;
    const record = C.recordAttempt(state, q, selected);
    submitted = true;
    const index = sequence.findIndex(item => item.id === q.id);
    if (record.lastCorrect && index < sequence.length - 1) {
      const nextId = sequence[index + 1].id;
      autoTimer = setTimeout(() => navigate(nextId, true), 1000);
    }
    save(); renderAll();
  }
  function retry() {
    const q = activeQuestion();
    if (!q) return;
    cancelAuto(); selected = []; submitted = false;
    renderOptions(q); renderFeedback(q);
    $('submit-button').disabled = true;
    if (q.type === '填空题') $('fill-answer').focus();
    else $('answer-options').querySelector('button')?.focus();
  }
  function setMode(value) { mode = value; applyFilters(); }
  function toggleDirectory(open) {
    document.querySelector('.directory').classList.toggle('expanded', open);
    $('directory-toggle').setAttribute('aria-expanded', String(open));
    $('directory-toggle').setAttribute('aria-label', `${open ? '收起' : '展开'}题号目录`);
  }
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  $('submit-button').addEventListener('click', submit);
  $('retry-button').addEventListener('click', retry);
  $('fill-answer').addEventListener('input', () => { selected = [$('fill-answer').value]; $('submit-button').disabled = !C.normalizeFill(selected[0]); });
  $('fill-answer').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit(); } });
  $('previous-question').addEventListener('click', () => move(-1));
  $('next-question').addEventListener('click', () => move(1));
  $('mode-all').addEventListener('click', () => setMode('all'));
  $('mode-mistakes').addEventListener('click', () => setMode('mistakes'));
  $('review-mistakes').addEventListener('click', () => { $('type-filter').value = ''; $('question-search').value = ''; setMode('mistakes'); });
  $('type-filter').addEventListener('change', applyFilters);
  $('question-search').addEventListener('input', () => { directoryPage = 0; renderStats(); renderDirectory(); });
  $('clear-filters').addEventListener('click', () => { $('type-filter').value = ''; $('question-search').value = ''; applyFilters(); });
  $('directory-prev').addEventListener('click', () => { directoryPage--; renderDirectory(); });
  $('directory-next').addEventListener('click', () => { directoryPage++; renderDirectory(); });
  $('directory-toggle').addEventListener('click', () => toggleDirectory($('directory-toggle').getAttribute('aria-expanded') !== 'true'));
  $('empty-action').addEventListener('click', () => {
    if (mode === 'mistakes' && !C.summarize(state).mistakes) mode = 'all';
    $('type-filter').value = ''; $('question-search').value = ''; applyFilters();
  });
  $('remove-mistake').addEventListener('click', () => {
    const q = activeQuestion();
    if (!q || !window.confirm(`将第 ${q.id} 题移出错题本？答题历史和统计仍会保留。`)) return;
    cancelAuto();
    const oldIndex = sequence.findIndex(item => item.id === q.id);
    state.records[q.id].inMistakes = false;
    if (mode === 'mistakes') {
      sequence = C.filterQuestions(questions, state, filters());
      if (sequence.length) state.currentId = sequence[Math.min(oldIndex, sequence.length - 1)].id;
      directoryPage = Math.max(0, Math.floor(Math.min(oldIndex, sequence.length - 1) / PAGE_SIZE));
    }
    save(); renderAll(); toast('已移出错题本，答题历史已保留');
  });
  $('help-button').addEventListener('click', () => { cancelAuto(); const q = activeQuestion(); if (q) renderFeedback(q); $('help-dialog').showModal(); });
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', event => {
    const rect = $('help-dialog').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('help-dialog').close();
  });
  $('export-records').addEventListener('click', () => {
    download(JSON.stringify({ format: 'zhixi-backup', exportedAt: new Date().toISOString(), state }, null, 2), `知习-刷题记录-${new Date().toLocaleDateString('sv-SE')}.json`);
    toast('备份已导出，请妥善保存');
  });
  $('import-records').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async () => {
    const file = $('import-file').files[0];
    $('import-file').value = '';
    if (!file) return;
    try {
      if (file.size > 6 * 1024 * 1024) throw new Error('文件过大，请选择本软件导出的 JSON 备份。');
      const data = JSON.parse(await file.text());
      if (data.format !== 'zhixi-backup') throw new Error('请选择本软件导出的 JSON 备份文件。');
      const nextState = C.validateState(data.state, questions);
      if (!window.confirm(`即将导入 ${Object.keys(nextState.records).length} 道题的记录，并替换当前全部进度。建议先导出当前记录。是否继续？`)) return;
      cancelAuto(); state = nextState; storageBlocked = false; mode = 'all';
      $('type-filter').value = ''; $('question-search').value = '';
      applyFilters(); toast(storageMessage ? '记录已导入当前会话；浏览器无法保存，请继续导出备份' : '记录已导入，可以继续练习了');
    } catch (error) { toast(error instanceof SyntaxError ? '无法读取该文件，请选择有效的 JSON 备份。当前进度未改变。' : error.message); }
  });
  $('reset-records').addEventListener('click', () => {
    if (!window.confirm('确定重置全部刷题进度和错题记录吗？此操作不可撤销，建议先导出备份。')) return;
    cancelAuto(); state = C.createState(); storageBlocked = false; mode = 'all';
    $('type-filter').value = ''; $('question-search').value = '';
    applyFilters(); toast('进度已重置，从新的一题开始');
  });
  document.addEventListener('keydown', event => {
    if ($('help-dialog').open || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = event.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target.isContentEditable) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    else if (event.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { event.preventDefault(); submit(); }
    else if (/^[1-6]$/.test(event.key)) {
      const q = activeQuestion();
      if (q && q.type !== '填空题') { event.preventDefault(); const option = q.options[Number(event.key) - 1]; if (option) choose(option.key); }
    }
  });
  window.addEventListener('pagehide', cancelAuto);
  load();
  sequence = C.filterQuestions(questions, state);
  directoryPage = Math.max(0, Math.floor(sequence.findIndex(q => q.id === state.currentId) / PAGE_SIZE));
  renderAll(); save();
})();
