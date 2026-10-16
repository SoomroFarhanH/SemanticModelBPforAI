"""Lightweight Power Query M (mashup.pq) parser.

It is deliberately not a full M parser. It tokenises the document, splits it into
section members (queries), splits ``let`` blocks into steps and extracts the
function calls, query references and attributes that the rules need.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

KEYWORDS = {
    "let", "in", "each", "if", "then", "else", "try", "otherwise", "and", "or", "not",
    "true", "false", "null", "meta", "section", "shared", "type", "as", "is", "error",
}
TWO_CHAR = {"=>", "<=", ">=", "<>", "..", "??"}
_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*")
_NUMBER = re.compile(r"\d+(?:\.\d+)?(?:[eE][+-]?\d+)?")
_HASH = re.compile(r"#[A-Za-z_]+")


@dataclass
class Token:
    kind: str  # ident | qident | string | number | sym | kw | hash
    text: str
    start: int
    end: int
    line: int


def _read_quoted(src: str, i: int) -> int:
    """Return the index just after the closing quote of a string starting at src[i] == '"'."""
    n = len(src)
    j = i + 1
    while j < n:
        if src[j] == '"':
            if j + 1 < n and src[j + 1] == '"':
                j += 2
                continue
            return j + 1
        j += 1
    return n


def tokenize(src: str) -> List[Token]:
    toks: List[Token] = []
    i, n, line = 0, len(src), 1
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
        elif c.isspace():
            i += 1
        elif src.startswith("//", i):
            while i < n and src[i] != "\n":
                i += 1
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            line += src.count("\n", i, j)
            i = j
        elif c == '"':
            j = _read_quoted(src, i)
            toks.append(Token("string", src[i + 1 : j - 1].replace('""', '"'), i, j, line))
            line += src.count("\n", i, j)
            i = j
        elif src.startswith('#"', i):
            j = _read_quoted(src, i + 1)
            toks.append(Token("qident", src[i + 2 : j - 1].replace('""', '"'), i, j, line))
            line += src.count("\n", i, j)
            i = j
        elif c == "#":
            m = _HASH.match(src, i)
            if m:
                toks.append(Token("hash", m.group(0), i, m.end(), line))
                i = m.end()
            else:
                toks.append(Token("sym", c, i, i + 1, line))
                i += 1
        elif c.isalpha() or c == "_":
            m = _IDENT.match(src, i)
            text = m.group(0)
            toks.append(Token("kw" if text in KEYWORDS else "ident", text, i, m.end(), line))
            i = m.end()
        elif c.isdigit():
            m = _NUMBER.match(src, i)
            toks.append(Token("number", m.group(0), i, m.end(), line))
            i = m.end()
        else:
            two = src[i : i + 2]
            if two in TWO_CHAR:
                toks.append(Token("sym", two, i, i + 2, line))
                i += 2
            else:
                toks.append(Token("sym", c, i, i + 1, line))
                i += 1
    return toks


OPEN, CLOSE = {"(", "[", "{"}, {")", "]", "}"}


@dataclass
class Step:
    name: str
    text: str
    line: int
    calls: List[str] = field(default_factory=list)
    row_level_calls: List[str] = field(default_factory=list)
    strings: List[str] = field(default_factory=list)


@dataclass
class Member:
    name: str
    attrs: str
    expr: str
    line: int
    steps: List[Step] = field(default_factory=list)
    final: str = ""
    refs: List[str] = field(default_factory=list)
    calls: List[str] = field(default_factory=list)
    strings: List[str] = field(default_factory=list)
    is_let: bool = False
    is_function: bool = False
    is_parameter: bool = False


@dataclass
class Document:
    header_attrs: str
    members: Dict[str, Member]


def _match_bracket(toks: List[Token], i: int) -> int:
    depth = 0
    for j in range(i, len(toks)):
        t = toks[j]
        if t.kind == "sym" and t.text in OPEN:
            depth += 1
        elif t.kind == "sym" and t.text in CLOSE:
            depth -= 1
            if depth == 0:
                return j
    return len(toks) - 1


def _split_members(toks: List[Token]) -> List[List[Token]]:
    chunks: List[List[Token]] = []
    cur: List[Token] = []
    depth = 0
    for t in toks:
        if t.kind == "sym" and t.text in OPEN:
            depth += 1
        elif t.kind == "sym" and t.text in CLOSE:
            depth = max(0, depth - 1)
        if t.kind == "sym" and t.text == ";" and depth == 0:
            if cur:
                chunks.append(cur)
            cur = []
        else:
            cur.append(t)
    if cur:
        chunks.append(cur)
    return chunks


def _scan_calls(toks: List[Token]) -> Tuple[List[str], List[str]]:
    calls: List[str] = []
    row_calls: List[str] = []
    row_mode = False
    for idx, t in enumerate(toks):
        if (t.kind == "kw" and t.text == "each") or (t.kind == "sym" and t.text == "=>"):
            row_mode = True
        if t.kind == "ident" and idx + 1 < len(toks):
            nxt = toks[idx + 1]
            if nxt.kind == "sym" and nxt.text == "(" and "." in t.text:
                calls.append(t.text)
                if row_mode:
                    row_calls.append(t.text)
    return calls, row_calls


def _split_steps(src: str, toks: List[Token]) -> Tuple[List[Step], str]:
    """Split a ``let ... in ...`` token list (starting at ``let``) into steps."""
    steps: List[Step] = []
    depth = 0
    let_depth = 0
    cur: List[Token] = []
    final_start: Optional[int] = None

    def flush() -> None:
        nonlocal cur
        if not cur:
            return
        name_tok = cur[0]
        body = cur[1:]
        if body and body[0].kind == "sym" and body[0].text == "=":
            body = body[1:]
        text = src[body[0].start : body[-1].end] if body else ""
        calls, row_calls = _scan_calls(body)
        strings = [b.text for b in body if b.kind == "string"]
        steps.append(Step(name_tok.text, text, name_tok.line, calls, row_calls, strings))
        cur = []

    for idx in range(1, len(toks)):
        t = toks[idx]
        if t.kind == "kw" and t.text == "let":
            let_depth += 1
        elif t.kind == "kw" and t.text == "in":
            if let_depth == 0 and depth == 0:
                flush()
                final_start = idx + 1
                break
            let_depth -= 1
        elif t.kind == "sym" and t.text in OPEN:
            depth += 1
        elif t.kind == "sym" and t.text in CLOSE:
            depth -= 1
        if t.kind == "sym" and t.text == "," and depth == 0 and let_depth == 0:
            flush()
            continue
        cur.append(t)
    else:
        flush()
    final = ""
    if final_start is not None and final_start < len(toks):
        final = src[toks[final_start].start : toks[-1].end]
    return steps, final


def parse_document(src: str) -> Document:
    toks = tokenize(src)
    header_attrs = ""
    members: Dict[str, Member] = {}
    body_tokens: Dict[str, List[Token]] = {}

    for chunk in _split_members(toks):
        k = 0
        attrs = ""
        if chunk and chunk[0].kind == "sym" and chunk[0].text == "[":
            end = _match_bracket(chunk, 0)
            attrs = src[chunk[0].start : chunk[end].end]
            k = end + 1
        rest = chunk[k:]
        if not rest:
            continue
        if rest[0].kind == "kw" and rest[0].text == "section":
            header_attrs = attrs
            continue
        if rest[0].kind == "kw" and rest[0].text == "shared":
            rest = rest[1:]
        if len(rest) < 3 or rest[0].kind not in ("ident", "qident") or rest[1].text != "=":
            continue
        name = rest[0].text
        body = rest[2:]
        expr = src[body[0].start : body[-1].end] if body else ""
        m = Member(name=name, attrs=attrs, expr=expr, line=rest[0].line)
        m.calls, _ = _scan_calls(body)
        m.strings = [b.text for b in body if b.kind == "string"]
        first = body[0] if body else None
        if first is not None and first.kind == "kw" and first.text == "let":
            m.is_let = True
            m.steps, m.final = _split_steps(src, body)
        if first is not None and first.kind == "sym" and first.text == "(":
            end = _match_bracket(body, 0)
            if end + 1 < len(body) and body[end + 1].text == "=>":
                m.is_function = True
        if re.search(r"IsParameterQuery\s*=\s*true", expr) or re.search(r"IsParameterQuery\s*=\s*true", attrs):
            m.is_parameter = True
        members[name] = m
        body_tokens[name] = body

    names = set(members)
    for name, m in members.items():
        for t in body_tokens[name]:
            if t.kind in ("ident", "qident") and t.text in names and t.text != name and t.text not in m.refs:
                m.refs.append(t.text)
    return Document(header_attrs=header_attrs, members=members)


def extract_destinations(attrs: str) -> List[dict]:
    """Parse the ``DataDestinations`` attribute text into simple dictionaries."""
    if "DataDestinations" not in attrs:
        return []
    names = re.findall(r"QueryName\s*=\s*\"([^\"]+)\"", attrs)
    settings_kind = re.search(r"Settings\s*=\s*\[\s*Kind\s*=\s*\"(\w+)\"", attrs)
    update = re.search(r"UpdateMethod\s*=\s*\[\s*Kind\s*=\s*\"(\w+)\"", attrs)
    dyn = re.search(r"DynamicSchema\s*=\s*(true|false)", attrs)
    type_kind = re.search(r"TypeSettings\s*=\s*\[\s*Kind\s*=\s*\"(\w+)\"", attrs)
    info = {
        "settings_kind": settings_kind.group(1) if settings_kind else None,
        "update_method": update.group(1) if update else None,
        "dynamic_schema": (dyn.group(1) == "true") if dyn else None,
        "has_column_mappings": "ColumnSettings" in attrs,
        "type_kind": type_kind.group(1) if type_kind else None,
    }
    return [dict(query=n, **info) for n in (names or [None])]
