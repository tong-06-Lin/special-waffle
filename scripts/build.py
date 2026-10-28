#!/usr/bin/env python3
"""Build a self-contained, offline quiz HTML and a small user distribution zip."""
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
NAME = '中华知识刷题本'


def build():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'styles.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
    for source in ['data/questions.js', 'core.js', 'app.js']:
        script = (ROOT / source).read_text(encoding='utf-8')
        # HTML script elements terminate at </script regardless of JS quoting.
        script = re.sub(r'</script', r'<\\/script', script, flags=re.IGNORECASE)
        html = html.replace(f'<script src="{source}"></script>', '<script>\n' + script + '\n</script>')
    if '<script src=' in html or 'href="styles.css"' in html:
        raise RuntimeError('Build still contains external application assets')
    DIST.mkdir(exist_ok=True)
    target = DIST / f'{NAME}.html'
    target.write_text(html, encoding='utf-8')
    # A conventional entry point allows the same tested app to run on a static host.
    for filename in ('index.html', 'quiz.html'):
        (DIST / filename).write_text(html, encoding='utf-8')
    instructions = '''知习 · 中华知识刷题本

1. 将“中华知识刷题本.html”保存到电脑，使用 Chrome、Edge、Firefox 或 Safari 浏览器打开。
2. 无需安装、无需账号，题库已内置，断网也能刷题。请在浏览器打开，不要使用文件管理器的静态预览。
3. 选择答案（多选可选多项）或输入填空答案，再点击“提交答案”。答对约1秒后进入下一题；答错停留并自动记录错题。
4. 搜索题号/关键词后，点击目录题号跳转；支持上一道、下一道和题型筛选。
5. 错题订正后仍保留，方便反复复习；可手动移出错题本。
6. 进度保存在当前浏览器。换设备、换浏览器、移动文件或清理数据可能导致旧记录不可见，请定期“导出记录”；在其他设备“导入记录”可迁移进度（会替换当前记录）。
7. 手机打开本地HTML取决于系统和浏览器支持；若只能预览，请在电脑浏览器使用，或通过静态网站托管后用手机访问。没有安装包、云端同步或服务器要求。

题库：2026中华知识竞赛·初赛题库.xlsx，共2525题。
判断474题，单选1272题，多选429题，填空350题。题号、答案和解析均按原表保留。
第495题原表缺B选项，已在界面提示，仍按原答案A判分。
填空题按原表答案判分，忽略空格、全半角和书名号，不作同义词模糊判断。
'''
    (DIST / '使用说明.txt').write_text(instructions, encoding='utf-8')
    with ZipFile(DIST / f'{NAME}.zip', 'w', compression=ZIP_DEFLATED) as archive:
        archive.write(target, target.name)
        archive.write(DIST / '使用说明.txt', '使用说明.txt')
    with ZipFile(DIST / 'quiz.zip', 'w', compression=ZIP_DEFLATED) as archive:
        archive.write(DIST / 'quiz.html', 'quiz.html')
        archive.write(DIST / '使用说明.txt', '使用说明.txt')
    with ZipFile(DIST / 'website.zip', 'w', compression=ZIP_DEFLATED) as archive:
        archive.write(DIST / 'index.html', 'index.html')
    print(f'Built {target} ({target.stat().st_size:,} bytes)')
    print(f'Packaged {DIST / (NAME + ".zip")}')


if __name__ == '__main__':
    build()
