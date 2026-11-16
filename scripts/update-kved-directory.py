#!/usr/bin/env python3
"""Download the complete KVED-2010 class directory from Ukrstat."""
import concurrent.futures
import datetime
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE = 'https://kved.ukrstat.gov.ua'
INDEX = BASE + '/KVED2010/kv10_i.html'
CACHE = Path('/private/tmp/grantfolio-kved-2010')
OUTPUT = Path(__file__).resolve().parents[1] / 'frontend/src/data/kved-2010.json'

class Rows(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell, self.link = [], None, None, None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr': self.row = []
        elif tag in ('td', 'th') and self.row is not None: self.cell = {'text': [], 'links': []}
        elif tag == 'a' and self.cell is not None:
            self.link = {'href': attrs.get('href', ''), 'text': []}
    def handle_data(self, text):
        if self.cell is not None: self.cell['text'].append(text)
        if self.link is not None: self.link['text'].append(text)
    def handle_endtag(self, tag):
        if tag == 'a' and self.link is not None:
            self.cell['links'].append(self.link); self.link = None
        elif tag in ('td', 'th') and self.cell is not None:
            self.row.append(self.cell); self.cell = None; self.link = None
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row); self.row = None; self.cell = None; self.link = None

def norm(parts): return ' '.join(''.join(parts).split())
def safe_url(href):
    url = urllib.parse.urljoin(BASE, href)
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or p.netloc != 'kved.ukrstat.gov.ua' or not p.path.startswith('/KVED2010/') or p.query or p.fragment:
        raise ValueError(f'Unexpected URL: {url}')
    return url

def fetch(url):
    safe_url(url)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'GrantFolio KVED directory updater'})
            with urllib.request.urlopen(req, timeout=30) as response:
                if safe_url(response.geturl()) != url: raise ValueError('Unexpected redirect')
                raw = response.read()
                CACHE.mkdir(parents=True, exist_ok=True)
                (CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.html')).write_bytes(raw)
                data = raw.decode('cp1251')
            parser = Rows(); parser.feed(data)
            return parser.rows
        except Exception:
            if attempt == 2: raise
            time.sleep(attempt + 1)

def children(rows, pattern):
    found = []
    for row in rows:
        if len(row) < 2: continue
        for link in row[0]['links']:
            code = norm(link['text'])
            if re.fullmatch(pattern, code):
                title = norm(row[1]['text'])
                if not title: raise ValueError(f'Missing title for {code}')
                found.append((code, title, safe_url(link['href'])))
    if not found: raise ValueError(f'No rows matching {pattern}')
    return found

def crawl():
    sections = children(fetch(INDEX), r'[A-U]')
    if {x[0] for x in sections} != set('ABCDEFGHIJKLMNOPQRSTU') or len(sections) != 21:
        raise ValueError('Incomplete or duplicate section index')
    entries, seen_divisions, seen_groups = {}, set(), set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        section_pages = list(pool.map(lambda x: fetch(x[2]), sections))
        divisions = []
        for section, rows in zip(sections, section_pages):
            for code, _, url in children(rows, r'\d{2}'):
                if code in seen_divisions: raise ValueError(f'Duplicate division {code}')
                seen_divisions.add(code); divisions.append((section[0], code, url))
        division_pages = list(pool.map(lambda x: fetch(x[2]), divisions))
        groups = []
        for division, rows in zip(divisions, division_pages):
            for code, _, url in children(rows, r'\d{2}\.\d'):
                if not code.startswith(division[1] + '.') or code in seen_groups: raise ValueError(f'Invalid or duplicate group {code}')
                seen_groups.add(code); groups.append((division[0], code, url))
        group_pages = list(pool.map(lambda x: fetch(x[2]), groups))
        for group, rows in zip(groups, group_pages):
            for code, title, url in children(rows, r'\d{2}\.\d{2}'):
                if not code.startswith(group[1]) or code in entries: raise ValueError(f'Invalid or duplicate class {code}')
                expected = f'{BASE}/KVED2010/{code[:2]}/KVED10_{code[:2]}_{code[3:]}.html'
                if url != expected: raise ValueError(f'Unexpected class URL for {code}: {url}')
                entries[code] = {'value': code, 'label': title, 'section': group[0], 'source': url}
    return [entries[code] for code in sorted(entries)], len(sections), len(divisions), len(groups)

def main():
    entries, sections, divisions, groups = crawl()
    content = json.dumps(entries, ensure_ascii=False, indent=2) + '\n'
    temp = OUTPUT.with_suffix('.json.tmp')
    try:
        temp.write_text(content, encoding='utf-8'); temp.replace(OUTPUT)
    finally:
        temp.unlink(missing_ok=True)
    print(f'{datetime.datetime.now(datetime.timezone.utc).isoformat()}: {sections} sections, {divisions} divisions, {groups} groups, {len(entries)} classes; 0 failures')
if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'Crawl failed; dataset unchanged: {exc}', file=sys.stderr); sys.exit(1)
