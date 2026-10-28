(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BANK_ID = 'zhonghua-2026-prelim-v1';
  const STORAGE_KEY = 'zhixi:zhonghua:2026:v1';
  const normalizeFill = value => String(value).normalize('NFKC').trim().replace(/\s+/gu, '').replace(/[《》]/gu, '').toLocaleLowerCase();
  function isCorrect(question, answer) {
    if (!Array.isArray(answer) || !answer.length) return false;
    if (question.type === '填空题') return answer.length === 1 && normalizeFill(answer[0]) !== '' && normalizeFill(answer[0]) === normalizeFill(question.answer[0]);
    const actual = [...new Set(answer)].sort();
    const expected = [...new Set(question.answer)].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
  }
  function createState() { return { schema: 1, bankId: BANK_ID, currentId: 1, records: {} }; }
  function recordAttempt(state, question, answer, now = new Date().toISOString()) {
    const previous = state.records[question.id];
    const correct = isCorrect(question, answer);
    const record = {
      attempts: (previous?.attempts || 0) + 1,
      correctAttempts: (previous?.correctAttempts || 0) + Number(correct),
      wrongAttempts: (previous?.wrongAttempts || 0) + Number(!correct),
      lastAnswer: [...answer], lastCorrect: correct, updatedAt: now,
      inMistakes: !correct || Boolean(previous?.inMistakes)
    };
    state.records[question.id] = record;
    return record;
  }
  function summarize(state) {
    const records = Object.values(state.records);
    const attempts = records.reduce((sum, record) => sum + record.attempts, 0);
    const correct = records.reduce((sum, record) => sum + record.correctAttempts, 0);
    return { answered: records.length, attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : null, mistakes: records.filter(record => record.inMistakes).length };
  }
  function filterQuestions(questions, state, { mode = 'all', type = '', query = '' } = {}) {
    const term = query.trim().toLocaleLowerCase().replace(/^第\s*(\d+)\s*题$/, '$1');
    return questions.filter(q => (mode !== 'mistakes' || state.records[q.id]?.inMistakes) && (!type || q.type === type) && (!term || (/^\d+$/.test(term) ? String(q.id) === term : [q.text, ...q.options.map(option => option.text)].join(' ').toLocaleLowerCase().includes(term))));
  }
  function validateState(input, questions) {
    if (!input || input.schema !== 1 || input.bankId !== BANK_ID || !input.records || typeof input.records !== 'object' || Array.isArray(input.records)) throw new Error('记录格式或题库版本不匹配，请选择本软件导出的备份。');
    const result = createState();
    const byId = new Map(questions.map(question => [String(question.id), question]));
    if (!Number.isSafeInteger(input.currentId) || !byId.has(String(input.currentId))) throw new Error('备份中的题号无效。');
    result.currentId = input.currentId;
    for (const [id, record] of Object.entries(input.records)) {
      const q = byId.get(id);
      if (!q || !record || !Number.isSafeInteger(record.attempts) || record.attempts < 1 || !Number.isSafeInteger(record.correctAttempts) || record.correctAttempts < 0 || !Number.isSafeInteger(record.wrongAttempts) || record.wrongAttempts < 0 || record.correctAttempts + record.wrongAttempts !== record.attempts || typeof record.lastCorrect !== 'boolean' || typeof record.inMistakes !== 'boolean' || !Array.isArray(record.lastAnswer) || !record.lastAnswer.length || !record.lastAnswer.every(value => typeof value === 'string' && value.length <= 1000) || new Set(record.lastAnswer).size !== record.lastAnswer.length) throw new Error('备份含有无效的答题记录，未导入。');
      if ((q.type === '填空题' ? record.lastAnswer.length !== 1 || !normalizeFill(record.lastAnswer[0]) : (q.type !== '多选题' && record.lastAnswer.length !== 1) || record.lastAnswer.some(key => !q.options.some(option => option.key === key))) || isCorrect(q, record.lastAnswer) !== record.lastCorrect || (record.lastCorrect ? record.correctAttempts : record.wrongAttempts) < 1 || (record.inMistakes && record.wrongAttempts === 0)) throw new Error('备份中的答案记录与题库不符，未导入。');
      result.records[id] = { attempts: record.attempts, correctAttempts: record.correctAttempts, wrongAttempts: record.wrongAttempts, lastAnswer: [...record.lastAnswer], lastCorrect: record.lastCorrect, inMistakes: record.inMistakes, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt.slice(0, 40) : '' };
    }
    return result;
  }
  return { BANK_ID, STORAGE_KEY, normalizeFill, isCorrect, createState, recordAttempt, summarize, filterQuestions, validateState };
});
