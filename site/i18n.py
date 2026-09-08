# -*- coding: utf-8 -*-
"""Переводы статического сайта.

Английский текст в content.py и generate.py остаётся единственным источником
правды: ключ здесь — это сама английская строка, дословно. Так перевод нельзя
«потерять» при редактировании копирайта — изменённая английская строка просто
перестанет находиться, и генератор об этом скажет.

Пустая строка в значении означает «переводить не нужно» (имена собственные,
аббревиатуры, номера): такой ключ не попадёт в отчёт о недостающем.
"""

import json
import os

LOCALES = ("en", "pl", "ru")
LABEL = {"en": "EN", "pl": "PL", "ru": "RU"}
HTML_LANG = {"en": "en", "pl": "pl", "ru": "ru"}

# Строки, одинаковые во всех языках: названия, домен, реквизиты.
SAME = {
    "Bestway Football",
    "Bestway Plus Sp. z o.o.",
    "Bestway Plus",
    "bestwayfootball.pl",
    "bestwaypluspl@gmail.com",
    "FAQ",
}

def _load(lang: str) -> dict:
    """Переводы лежат рядом, в locales/<lang>.json. Отдельные файлы, а не
    словарь в коде: их правит переводчик, а не программист."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "locales", f"{lang}.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


TABLES = {"pl": _load("pl"), "ru": _load("ru")}

_missing: dict[str, list[str]] = {"pl": [], "ru": []}


def t(text: str, lang: str) -> str:
    """Перевод строки. Для en — сама строка."""
    if lang == "en" or not text.strip():
        return text
    if text in SAME:
        return text
    value = TABLES[lang].get(text)
    if value:
        return value
    if text not in _missing[lang]:
        _missing[lang].append(text)
    return text


def missing(lang: str) -> list[str]:
    return _missing[lang]


def reset() -> None:
    for v in _missing.values():
        v.clear()
