#!/usr/bin/env python3
"""Import the supplied quiz workbook without third-party Python packages.

Workbook contents are data only. No formulas, macros, or external links execute.
"""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import posixpath
import re
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
TYPES = {
    "判断题": "判断题",
    "单项选择题": "单选题",
    "多项选择题": "多选题",
    "填空题": "填空题",
}
HEADERS = ["序号", "题型", "题目", "选项A", "选项B", "选项C", "选项D", "选项E", "选项F", "正确答案", "解析"]


def text_nodes(element):
    return "".join(node.text or "" for node in element.findall(".//s:t", NS))


def read_rows(source):
    """Yield Excel row numbers and cell strings from the named bank sheet."""
    with ZipFile(source) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [text_nodes(si) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next((s for s in workbook.findall("s:sheets/s:sheet", NS) if s.get("name") == "初赛题库"), None)
        if sheet is None:
            raise ValueError("找不到“初赛题库”工作表")
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_id = sheet.get(f"{{{REL_NS}}}id")
        target = next(r.get("Target") for r in relationships if r.get("Id") == rel_id)
        sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        sheet_xml = ET.fromstring(archive.read(sheet_path))
        for row in sheet_xml.findall("s:sheetData/s:row", NS):
            values = {}
            for cell in row.findall("s:c", NS):
                column = re.match(r"[A-Z]+", cell.get("r", ""))
                if column is None:
                    raise ValueError("工作表中存在无效单元格地址")
                if cell.find("s:f", NS) is not None:
                    raise ValueError(f"{cell.get('r')} 包含公式，请先核对并转为固定题目数据")
                node = cell.find("s:v", NS)
                value = node.text or "" if node is not None else ""
                if cell.get("t") == "s":
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = text_nodes(cell)
                elif cell.get("t") == "e":
                    raise ValueError(f"{cell.get('r')} 包含 Excel 错误值")
                values[column.group()] = value.strip()
            yield int(row.get("r")), [values.get(chr(ord("A") + i), "") for i in range(11)]


def import_bank(source):
    rows = iter(read_rows(source))
    _, headers = next(rows)
    if headers != HEADERS:
        raise ValueError(f"表头不匹配：{headers}")
    questions = []
    seen = set()
    empty_rows = []
    for row_number, row in rows:
        if not any(row):
            empty_rows.append(row_number)
            continue
        id_text, original_type, text = row[:3]
        if not re.fullmatch(r"[1-9][0-9]*", id_text):
            raise ValueError(f"第 {row_number} 行题号不是正整数：{id_text!r}")
        qid = int(id_text)
        if qid in seen:
            raise ValueError(f"重复题号：{qid}")
        seen.add(qid)
        if original_type not in TYPES:
            raise ValueError(f"题号 {qid} 的题型不支持：{original_type}")
        qtype = TYPES[original_type]
        if not text or not row[9]:
            raise ValueError(f"题号 {qid} 缺少题干或答案")
        warnings = []
        if qtype == "判断题":
            if row[9] not in ("正确", "错误"):
                raise ValueError(f"题号 {qid} 的判断答案无效：{row[9]}")
            options = [{"key": value, "text": value} for value in ("正确", "错误")]
            answer = [row[9]]
        elif qtype in ("单选题", "多选题"):
            options = [{"key": chr(65 + i), "text": value} for i, value in enumerate(row[3:9]) if value]
            answer = list(row[9])
            keys = [option["key"] for option in options]
            if len(options) < 2 or len(set(answer)) != len(answer) or not all(key in keys for key in answer):
                raise ValueError(f"题号 {qid} 的选项或答案无效")
            if qtype == "单选题" and len(answer) != 1:
                raise ValueError(f"题号 {qid} 的单选答案不是一项")
            if qtype == "多选题" and len(answer) < 2:
                raise ValueError(f"题号 {qid} 的多选答案不足两项")
            last_key = max(keys)
            missing = [chr(c) for c in range(65, ord(last_key)) if chr(c) not in keys]
            if missing:
                warnings.append(f"原表选项 {'、'.join(missing)} 为空，已按原表保留其余选项与答案，建议核对原题。")
        else:
            options = []
            answer = [row[9]]
        if not row[10]:
            warnings.append("原表未提供解析。")
        question = {
            "id": qid,
            "type": qtype,
            "text": text,
            "options": options,
            "answer": answer,
            "explanation": row[10],
        }
        if warnings:
            question["warnings"] = warnings
        questions.append(question)
    if not questions:
        raise ValueError("未导入任何题目")
    ids = [q["id"] for q in questions]
    if ids != sorted(ids):
        raise ValueError("题号未按升序排列，请先核对题库")
    return {
        "title": "2026中华知识竞赛·初赛题库",
        "source": source.name,
        "questions": questions,
    }, empty_rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="原始 xlsx 题库路径")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "questions.js")
    args = parser.parse_args()
    bank, empty_rows = import_bank(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
    # Keep generated data safe when it is embedded in the portable HTML edition.
    payload = payload.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    args.output.write_text("// Generated by scripts/import_questions.py; source text and answers are preserved.\nwindow.QUESTION_BANK = " + payload + ";\n", encoding="utf-8")
    summary = {
        "questions": len(bank["questions"]),
        "types": dict(Counter(q["type"] for q in bank["questions"])),
        "empty_rows_skipped": empty_rows,
        "warnings": [{"id": q["id"], "warnings": q["warnings"]} for q in bank["questions"] if q.get("warnings")],
        "output": str(args.output),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, StopIteration) as exc:
        sys.exit(f"导入失败：{exc}")
