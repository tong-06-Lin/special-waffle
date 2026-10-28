#!/usr/bin/env python3
"""Exercise the real browser UI against source or a built single-file artifact.

Run: python3 tests/browser_smoke.py [--target dist/中华知识刷题本.html]
The server and browser are local; no external service or application package is needed.
"""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
from urllib.parse import quote

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', default='index.html', help='HTML file relative to the repository')
    args = parser.parse_args()
    target = (ROOT / args.target).resolve()
    if not target.is_file() or not target.is_relative_to(ROOT):
        parser.error('target must be an existing file inside the repository')
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    url = origin + '/' + quote(target.relative_to(ROOT).as_posix())
    completed = []
    errors = []
    external = []

    def passed(name):
        completed.append(name)
        print(f'PASS {name}', flush=True)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 1440, 'height': 1080}, accept_downloads=True)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith((origin + '/', 'blob:', 'data:')) else None)
            page.goto(url)
            expect(page.locator('#question-text')).to_be_visible()
            expect(page.locator('#total-count')).to_have_text('2525')
            expect(page.locator('#answered-count')).to_have_text('0')
            expect(page.locator('#submit-button')).to_be_disabled()
            page.screenshot(path='/tmp/zhixi-desktop.png', full_page=True)
            passed('initial directory, all 2525 questions and disabled empty submission')

            def expect_question(question_id):
                expect(page.locator('#question-text .question-id')).to_have_text(f'{question_id}.')

            def state():
                return page.evaluate('JSON.parse(localStorage.getItem(QuizCore.STORAGE_KEY))')

            def jump(question_id):
                page.locator('#type-filter').select_option('')
                page.locator('#question-search').fill(str(question_id))
                expect(page.locator('#question-grid button')).to_have_count(1)
                page.locator('#question-grid button').click()
                expect_question(question_id)
                page.locator('#clear-filters').click()
                expect_question(question_id)

            def select(keys):
                for key in keys:
                    page.locator(f'#answer-options button[data-key="{key}"]').click()

            def submit_wrong(question_id):
                page.locator('#submit-button').click()
                expect(page.locator('#feedback')).to_contain_text('这道题再温习一下')
                page.wait_for_timeout(1250)
                expect_question(question_id)
                expect(page.locator('#explanation')).to_be_visible()
                assert state()['records'][str(question_id)]['inMistakes']

            expect(page.locator('#previous-question')).to_be_disabled()
            page.locator('#mode-mistakes').click()
            expect(page.locator('#empty-title')).to_have_text('错题本，还是空的')
            expect(page.locator('#previous-question')).to_be_disabled()
            expect(page.locator('#next-question')).to_be_disabled()
            page.locator('#empty-action').click()
            expect_question(1)
            passed('empty mistake book and first-question navigation boundary')

            select(['正确'])
            submit_wrong(1)
            expect(page.locator('#mistake-count')).to_have_text('1')
            expect(page.locator('#submit-button')).to_be_hidden()
            before_attempts = state()['records']['1']['attempts']
            page.locator('#feedback').click()
            assert state()['records']['1']['attempts'] == before_attempts
            page.reload()
            expect_question(1)
            expect(page.locator('#feedback')).to_contain_text('正确答案：错误')
            expect(page.locator('#mistake-count')).to_have_text('1')
            passed('wrong answer stays put, records mistake and survives refresh')

            page.locator('#retry-button').click()
            select(['错误'])
            page.locator('#submit-button').click()
            expect(page.locator('#feedback')).to_contain_text('回答正确')
            expect_question(2)
            assert state()['records']['1']['inMistakes'] is True
            assert state()['records']['1']['lastCorrect'] is True
            page.locator('#previous-question').click()
            expect_question(1)
            expect(page.locator('#question-history')).to_contain_text('已订正')
            expect(page.locator('#previous-question')).to_be_disabled()
            page.locator('#next-question').click()
            expect_question(2)
            passed('retry correct auto-advances; previous/next works; corrected mistake retained')

            page.locator('#question-search').fill('999999')
            expect(page.locator('#question-grid button')).to_have_count(0)
            expect(page.locator('#directory-range')).to_have_text('没有匹配的题目')
            expect_question(2)
            page.locator('#clear-filters').click()
            expect_question(2)
            page.locator('#question-search').fill('春节')
            assert page.locator('#question-grid button').count() > 1
            page.locator('#clear-filters').click()
            jump(475)
            expect(page.locator('#question-type')).to_have_text('单选题')
            select(['B'])
            submit_wrong(475)
            page.locator('#retry-button').click()
            select(['A'])
            page.locator('#submit-button').click()
            expect_question(476)
            passed('number/keyword/no-result directory search and single-choice grading')

            page.locator('#type-filter').select_option('多选题')
            expect(page.locator('#directory-count')).to_have_text('429 题')
            multiple = page.evaluate("QUESTION_BANK.questions.find(q => q.type === '多选题' && q.answer.length > 1 && q.answer.length < q.options.length)")
            jump(multiple['id'])
            select(multiple['answer'][:-1])
            submit_wrong(multiple['id'])
            page.locator('#retry-button').click()
            extra = next(o['key'] for o in multiple['options'] if o['key'] not in multiple['answer'])
            select(multiple['answer'] + [extra])
            submit_wrong(multiple['id'])
            page.locator('#retry-button').click()
            select(list(reversed(multiple['answer'])))
            page.locator('#submit-button').click()
            expect_question(multiple['id'] + 1)
            assert state()['records'][str(multiple['id'])]['wrongAttempts'] == 2
            passed('multiple-choice missing/extra options fail; exact unordered set passes')

            jump(2176)
            expect(page.locator('#question-type')).to_have_text('填空题')
            expect(page.locator('#answer-options')).to_be_hidden()
            page.locator('#fill-answer').fill('　')
            expect(page.locator('#submit-button')).to_be_disabled()
            page.locator('#fill-answer').fill('《》')
            expect(page.locator('#submit-button')).to_be_disabled()
            page.locator('#fill-answer').fill('  《福》　')
            page.locator('#fill-answer').press('Enter')
            expect_question(2177)
            page.locator('#fill-answer').fill('李白')
            submit_wrong(2177)
            page.reload()
            expect_question(2177)
            expect(page.locator('#fill-answer')).to_have_value('李白')
            expect(page.locator('#fill-answer')).to_be_disabled()
            passed('fill-in normalization, normalized-empty protection and wrong-answer persistence')

            page.locator('#review-mistakes').click()
            expect(page.locator('#mode-mistakes')).to_have_attribute('aria-pressed', 'true')
            expect(page.locator('#directory-count')).to_have_text('4 题')
            page.locator('#question-grid button').first.click()
            expect_question(1)
            expect(page.locator('#question-history')).to_contain_text('已订正')
            before_remove = state()['records']['1'].copy()
            page.once('dialog', lambda dialog: dialog.dismiss())
            page.locator('#remove-mistake').click()
            assert state()['records']['1']['inMistakes'] is True
            page.once('dialog', lambda dialog: dialog.accept())
            page.locator('#remove-mistake').click()
            expect(page.locator('#mistake-count')).to_have_text('3')
            record = state()['records']['1']
            assert record['attempts'] == before_remove['attempts']
            assert record['inMistakes'] is False
            assert record['wrongAttempts'] == before_remove['wrongAttempts']
            passed('mistake review includes corrected questions; cancel/removal preserves attempt history')

            before_export = state()
            with page.expect_download() as info:
                page.locator('#export-records').click()
            download = info.value
            with open(download.path(), encoding='utf-8') as handle:
                backup = json.load(handle)
            assert backup['format'] == 'zhixi-backup'
            assert backup['state'] == before_export
            backup_payload = {'name': '知习备份.json', 'mimeType': 'application/json', 'buffer': json.dumps(backup, ensure_ascii=False).encode()}
            page.once('dialog', lambda dialog: dialog.dismiss())
            page.locator('#reset-records').click()
            assert state() == before_export
            page.once('dialog', lambda dialog: dialog.accept())
            page.locator('#reset-records').click()
            expect(page.locator('#answered-count')).to_have_text('0')
            empty_state = state()
            page.once('dialog', lambda dialog: dialog.dismiss())
            page.locator('#import-file').set_input_files(backup_payload)
            page.wait_for_timeout(200)
            assert state() == empty_state
            page.once('dialog', lambda dialog: dialog.accept())
            page.locator('#import-file').set_input_files(backup_payload)
            expect(page.locator('#answered-count')).to_have_text(str(len(before_export['records'])))
            assert state() == before_export
            page.reload()
            assert state() == before_export
            passed('export backup, reset cancellation, import cancellation and confirmed restore')

            before_invalid = state()
            page.locator('#import-file').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'not json'})
            expect(page.locator('#toast')).to_contain_text('有效的 JSON')
            assert state() == before_invalid
            invalid = json.loads(json.dumps(backup))
            invalid['state']['currentId'] = '1'
            page.locator('#import-file').set_input_files({'name': 'bad-id.json', 'mimeType': 'application/json', 'buffer': json.dumps(invalid).encode()})
            expect(page.locator('#toast')).to_contain_text('题号无效')
            assert state() == before_invalid
            page.locator('#import-file').set_input_files([])
            assert state() == before_invalid
            passed('malformed/incompatible backups and cancelled file selection keep current data')

            jump(2525)
            expect(page.locator('#next-question')).to_be_disabled()
            page.locator('#fill-answer').fill('经络')
            page.locator('#submit-button').click()
            expect(page.locator('#completion')).to_contain_text('题库最后一题')
            page.wait_for_timeout(1250)
            expect_question(2525)
            expect(page.locator('#next-question')).to_be_disabled()
            page.locator('#previous-question').click()
            expect_question(2524)
            passed('final correct answer stays on final question without looping')

            mobile_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
            mobile = mobile_context.new_page()
            mobile.on('pageerror', lambda error: errors.append(str(error)))
            mobile.goto(url)
            expect(mobile.locator('#directory-content')).to_be_hidden()
            mobile.locator('#directory-toggle').click()
            expect(mobile.locator('#directory-content')).to_be_visible()
            expect(mobile.locator('#directory-toggle')).to_have_attribute('aria-expanded', 'true')
            mobile.locator('#question-search').fill('475')
            mobile.locator('#question-grid button').click()
            expect(mobile.locator('#question-text .question-id')).to_have_text('475.')
            expect(mobile.locator('#directory-content')).to_be_hidden()
            for width in [320, 375, 390, 768, 1024, 1440]:
                mobile.set_viewport_size({'width': width, 'height': 900})
                overflow = mobile.evaluate('document.documentElement.scrollWidth > window.innerWidth')
                assert not overflow, f'horizontal overflow at {width}px'
            mobile.set_viewport_size({'width': 390, 'height': 844})
            mobile.screenshot(path='/tmp/zhixi-mobile.png', full_page=True)
            passed('mobile directory expansion/jump/collapse and 320–1440px no-overflow layouts')
            assert errors == [], f'browser JavaScript errors: {errors}'
            assert external == [], f'unexpected external requests: {external}'
            passed('no JavaScript errors or external network requests')
            mobile_context.close()
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f'Browser smoke passed: {len(completed)} checks; target={args.target}', flush=True)


if __name__ == '__main__':
    main()
