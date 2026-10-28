'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../core.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/questions.js'), 'utf8'), sandbox);
const bank = JSON.parse(JSON.stringify(sandbox.window.QUESTION_BANK));
const questions = bank.questions;
const byType = type => questions.find(question => question.type === type);
const wrongAnswer = question => question.type === '填空题'
  ? ['这不是正确答案']
  : [question.options.find(option => !question.answer.includes(option.key))?.key || '不存在的选项'];

function populatedState() {
  const state = core.createState();
  const question = byType('单选题');
  core.recordAttempt(state, question, wrongAnswer(question), '2026-10-29T01:00:00.000Z');
  core.recordAttempt(state, question, question.answer, '2026-10-29T01:01:00.000Z');
  state.currentId = question.id;
  return state;
}

test('all 2,525 imported questions retain unique sequential source IDs and valid answer keys', () => {
  assert.equal(questions.length, 2525);
  const counts = {};
  questions.forEach((question, index) => {
    assert.equal(question.id, index + 1);
    assert.ok(question.text.trim());
    assert.ok(question.explanation.trim());
    counts[question.type] = (counts[question.type] || 0) + 1;
    assert.equal(new Set(question.options.map(option => option.key)).size, question.options.length);
    assert.ok(question.answer.length);
    if (question.type === '填空题') {
      assert.equal(question.options.length, 0);
      assert.equal(question.answer.length, 1);
    } else {
      assert.ok(question.answer.every(key => question.options.some(option => option.key === key)));
      if (question.type !== '多选题') assert.equal(question.answer.length, 1);
    }
    assert.equal(core.isCorrect(question, question.answer), true, `source answer for #${question.id}`);
  });
  assert.deepEqual(counts, { 判断题: 474, 单选题: 1272, 多选题: 429, 填空题: 350 });
});

for (const type of ['判断题', '单选题', '多选题', '填空题']) {
  test(`${type}: source answer passes, an incorrect answer fails, empty input fails`, () => {
    const question = byType(type);
    assert.equal(core.isCorrect(question, question.answer), true);
    assert.equal(core.isCorrect(question, wrongAnswer(question)), false);
    assert.equal(core.isCorrect(question, []), false);
    assert.equal(core.isCorrect(question, null), false);
  });
}

test('multiple choice is order independent and requires the exact set', () => {
  const question = questions.find(q => q.type === '多选题' && q.answer.length > 1 && q.answer.length < q.options.length);
  assert.ok(question);
  assert.equal(core.isCorrect(question, [...question.answer].reverse()), true);
  assert.equal(core.isCorrect(question, question.answer.slice(1)), false);
  assert.equal(core.isCorrect(question, question.options.map(option => option.key)), false);
});

test('five- and six-option source questions are supported without truncation', () => {
  for (const count of [5, 6]) {
    const question = questions.find(q => q.options.length === count);
    assert.ok(question);
    assert.equal(core.isCorrect(question, question.answer), true);
  }
});

test('fill-in normalizes spacing, book-title marks and full-width forms, but rejects different words', () => {
  const question = questions.find(q => q.type === '填空题' && q.answer[0] === '论语');
  assert.ok(question);
  assert.equal(core.isCorrect(question, ['  《论 语》\n']), true);
  assert.equal(core.isCorrect(question, ['论语集解']), false);
  assert.equal(core.isCorrect(question, ['论语', '论语']), false);
  assert.equal(core.isCorrect(question, ['　']), false);
  assert.equal(core.normalizeFill(' ＡＢＣ１２３ '), 'abc123');
});

test('wrong answers enter the mistake book; correcting them retains the mistake history', () => {
  const state = core.createState();
  const question = byType('判断题');
  const answer = wrongAnswer(question);
  const wrong = core.recordAttempt(state, question, answer);
  assert.equal(wrong.inMistakes, true);
  assert.equal(wrong.lastCorrect, false);
  assert.equal(wrong.wrongAttempts, 1);
  answer[0] = 'modified externally';
  assert.notEqual(wrong.lastAnswer[0], answer[0], 'submitted answer is copied');
  const corrected = core.recordAttempt(state, question, question.answer);
  assert.equal(corrected.inMistakes, true);
  assert.equal(corrected.lastCorrect, true);
  assert.equal(corrected.attempts, 2);
  assert.equal(corrected.wrongAttempts, 1);
  assert.equal(corrected.correctAttempts, 1);
});

test('manual removal preserves history and a later wrong attempt adds the question back', () => {
  const state = populatedState();
  const question = byType('单选题');
  state.records[question.id].inMistakes = false;
  assert.equal(core.summarize(state).mistakes, 0);
  core.recordAttempt(state, question, question.answer);
  assert.equal(state.records[question.id].inMistakes, false);
  core.recordAttempt(state, question, wrongAnswer(question));
  assert.equal(state.records[question.id].inMistakes, true);
  assert.equal(state.records[question.id].attempts, 4);
});

test('summary counts distinct answered questions, attempt accuracy and retained mistakes', () => {
  const state = populatedState();
  const question = byType('填空题');
  core.recordAttempt(state, question, question.answer);
  assert.deepEqual(core.summarize(state), { answered: 2, attempts: 3, correct: 2, accuracy: 67, mistakes: 1 });
  assert.deepEqual(core.summarize(core.createState()), { answered: 0, attempts: 0, correct: 0, accuracy: null, mistakes: 0 });
});

test('directory searches exact source number, Chinese question number, keyword and option text', () => {
  const state = core.createState();
  assert.deepEqual(core.filterQuestions(questions, state, { query: '475' }).map(q => q.id), [475]);
  assert.deepEqual(core.filterQuestions(questions, state, { query: '第 475 题' }).map(q => q.id), [475]);
  assert.deepEqual(core.filterQuestions(questions, state, { query: '999999' }), []);
  assert.ok(core.filterQuestions(questions, state, { query: '刘禹锡' }).every(q => [q.text, ...q.options.map(o => o.text)].some(text => text.includes('刘禹锡'))));
  assert.ok(core.filterQuestions(questions, state, { query: '春节' }).some(q => q.id === 475));
  const optionTextQuestion = questions.find(q => q.type === '单选题' && q.options.some(o => o.text === '围棋'));
  assert.ok(optionTextQuestion);
  assert.ok(core.filterQuestions(questions, state, { query: '围棋' }).some(q => q.id === optionTextQuestion.id));
});

test('type and mistake filters compose with search without changing source order', () => {
  const state = populatedState();
  assert.equal(core.filterQuestions(questions, state, { type: '填空题' }).length, 350);
  assert.deepEqual(core.filterQuestions(questions, state, { mode: 'mistakes' }).map(q => q.id), [475]);
  assert.deepEqual(core.filterQuestions(questions, state, { mode: 'mistakes', type: '判断题' }), []);
  assert.deepEqual(core.filterQuestions(questions, state, { mode: 'mistakes', query: '春节' }).map(q => q.id), [475]);
  state.records[475].inMistakes = false;
  assert.deepEqual(core.filterQuestions(questions, state, { mode: 'mistakes' }), []);
});

test('backup JSON round trip preserves progress and isolates the validated copy', () => {
  const state = populatedState();
  const restored = core.validateState(JSON.parse(JSON.stringify(state)), questions);
  assert.deepEqual(restored, state);
  restored.records[475].lastAnswer[0] = 'B';
  assert.deepEqual(state.records[475].lastAnswer, ['A']);
  assert.deepEqual(core.validateState(core.createState(), questions), core.createState());
});

test('backup validation rejects wrong bank, unknown question and invalid schema', () => {
  for (const change of [
    state => { state.bankId = 'other-bank'; },
    state => { state.schema = 2; },
    state => { state.currentId = 999999; },
    state => { state.records[999999] = state.records[475]; },
    state => { state.records = []; },
  ]) {
    const state = populatedState(); change(state);
    assert.throws(() => core.validateState(state, questions));
  }
});

test('backup validation requires a numeric current question ID', () => {
  const state = populatedState();
  state.currentId = String(state.currentId);
  assert.throws(() => core.validateState(state, questions));
});

test('backup validation rejects inconsistent counts, forged judgments and invalid option keys', () => {
  for (const change of [
    r => { r.attempts = -1; },
    r => { r.attempts += 1; },
    r => { r.correctAttempts = 1.5; },
    r => { r.wrongAttempts = -1; },
    r => { r.lastCorrect = false; },
    r => { r.lastAnswer = ['Z']; },
    r => { r.lastAnswer = []; },
    r => { r.lastAnswer = [null]; },
    r => { r.lastAnswer = ['A', 'A']; },
    r => { r.inMistakes = 'yes'; },
  ]) {
    const state = populatedState(); change(state.records[475]);
    assert.throws(() => core.validateState(state, questions));
  }
});

test('backup validation rejects more than one selection for single-choice questions', () => {
  const state = populatedState();
  state.records[475].lastAnswer = ['A', 'B'];
  state.records[475].lastCorrect = false;
  assert.throws(() => core.validateState(state, questions));
});

test('backup validation rejects a mistake flag when there was never a wrong answer', () => {
  const state = core.createState();
  const question = byType('判断题');
  core.recordAttempt(state, question, question.answer);
  state.records[question.id].inMistakes = true;
  assert.throws(() => core.validateState(state, questions));
});

test('backup validation rejects wrong fill-in judgment and empty normalized text', () => {
  for (const answer of ['错误的字', '　']) {
    const state = core.createState();
    const question = byType('填空题');
    core.recordAttempt(state, question, question.answer);
    state.records[question.id].lastAnswer = [answer];
    assert.throws(() => core.validateState(state, questions));
  }
});
