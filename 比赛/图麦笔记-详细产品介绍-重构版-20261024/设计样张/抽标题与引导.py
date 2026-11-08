# -*- coding: utf-8 -*-
"""从生成器里把每页大标题与引导句抽出来，逐页核对前后逻辑。"""
import ast
import re
import sys

STR = r"'(?:[^'\\]|\\.)*'"
PAT = re.compile(r'add\(\s*(' + STR + r')\s*,\s*(' + STR + r')\s*,\s*((?:' + STR + r'\s*\+?\s*)+)')


def strings(group):
    return [ast.literal_eval(s) for s in re.findall(STR, group)]


src = open(sys.argv[1] if len(sys.argv) > 1 else '制作方向样张.py', encoding='utf-8').read()
for i, m in enumerate(PAT.finditer(src), 1):
    print(f'[{i:02d}] {strings(m.group(1))[0]}')
    print(f'     标题: {strings(m.group(2))[0]}')
    print(f'     引导: {"".join(strings(m.group(3)))}')
print('count', i)
