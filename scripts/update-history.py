#!/usr/bin/env python3
"""Bezpečná aktualizace Extra Renty; nikdy nedoplňuje neověřená čísla."""
import csv
import io
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'renta.csv'
SOURCE = 'https://www.loterie-tikety.cz/rubriky/sazeni/loterie-extra-renta-od-sazky_7897.html'
MONTHS = dict(zip('ledna unora brezna dubna kvetna cervna cervence srpna zari rijna listopadu prosince'.split(),range(1,13)))
HEADER = ['Datum', *[f'sloupec {i}' for i in range(1,8)], 'Dodatkove cislo']

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s).lower()) if unicodedata.category(c) != 'Mn')

def date_iso(s):
    s = norm(s)
    m = re.search(r'(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)',s)
    if m: y,mo,d=map(int,m.groups())
    else:
        m=re.search(r'(?<!\d)(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?!\d)',s)
        if m: d,mo,y=map(int,m.groups())
        else:
            m=re.search(r'(?<!\d)(\d{1,2})\.\s*([a-z]+)\s+(\d{4})(?!\d)',s)
            if not m or m[2] not in MONTHS: return None
            d,mo,y=int(m[1]),MONTHS[m[2]],int(m[3])
    try: return datetime(y,mo,d).date().isoformat()
    except ValueError: return None

def valid(main,bonus=None):
    return len(main)==7 and len(set(main))==7 and all(1<=n<=33 for n in main) and (bonus is None or 1<=bonus<=33 and bonus not in main)

def load():
    draws={}; incomplete=[]
    with TARGET.open(encoding='utf-8-sig',newline='') as f:
        rows=list(csv.reader(f,delimiter=';'))
    for row in rows[1:]:
        if not row or not any(x.strip() for x in row):continue
        if len(row)<8: raise ValueError(f'Neúplný řádek CSV: {row}')
        try:
            main=[int(x.strip()) for x in row[1:8]]
            bonus=int(row[8]) if len(row)>8 and row[8].strip() else None
        except ValueError:raise ValueError(f'Neplatná čísla v CSV: {row}')
        if not valid(main,bonus):raise ValueError(f'Neplatná kombinace: {row}')
        d=date_iso(row[0])
        if not d:
            if bonus is not None:raise ValueError(f'Nejasné datum s dodatkovým číslem: {row}')
            incomplete.append((row,main));continue
        if d in draws and set(draws[d][0])!=set(main):raise ValueError(f'Konflikt historie: {d}')
        if d in draws and draws[d][1] is not None and bonus is not None and draws[d][1]!=bonus:raise ValueError(f'Konflikt dodatkového čísla: {d}')
        if d not in draws or draws[d][1] is None:draws[d]=(main,bonus)
    for row,main in incomplete:
        if sum(set(x[0])==set(main) for x in draws.values())!=1:raise ValueError(f'Nejasný nedatovaný řádek: {row}')
        print('Přeskočena ověřená duplicita bez data:',row[0])
    return draws,len(incomplete)

def parse(html):
    soup=BeautifulSoup(html,'html.parser')
    table=next((t for t in soup.find_all('table') if 'datum slosovani' in norm(t.get_text(' ',strip=True)) and 'tazena cisla' in norm(t.get_text(' ',strip=True))),None)
    if table is None:raise ValueError('Tabulka archivu nebyla nalezena')
    results=[]
    for tr in table.find_all('tr'):
        cells=[td.get_text(' ',strip=True) for td in tr.find_all('td')]
        if len(cells)<2:continue
        d=date_iso(cells[0]);nums=[int(x) for x in re.findall(r'\d+',' '.join(cells[1:]))]
        if not d or len(nums) not in (7,8):continue
        main=nums[:7];bonus=nums[7] if len(nums)==8 else None
        if valid(main,bonus):results.append((d,main,bonus))
    if not results:raise ValueError('Nenalezeny platné výsledky')
    return results

def update(draws,rows):
    added=bonus_added=0
    for d,main,bonus in rows:
        if d in draws:
            old,oldbonus=draws[d]
            if set(old)!=set(main) or oldbonus is not None and bonus is not None and oldbonus!=bonus:raise ValueError(f'Konflikt výsledků: {d}')
            if oldbonus is None and bonus is not None:draws[d]=(old,bonus);bonus_added+=1
        else:draws[d]=(main,bonus);added+=1
    return added,bonus_added

def save(draws):
    with TARGET.open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f,delimiter=';',lineterminator='\r\n');w.writerow(HEADER)
        for d,(main,bonus) in sorted(draws.items(),reverse=True):
            w.writerow([datetime.fromisoformat(d).strftime('%d.%m.%Y'),*main,bonus if bonus is not None else ''])

def main():
    draws,incomplete=load()
    print('Původní historie:',len(draws),'losování')
    response=requests.get(SOURCE,headers={'User-Agent':'Mozilla/5.0','Accept':'text/html'},timeout=30)
    response.raise_for_status()
    rows=parse(response.text)
    added,bonus_added=update(draws,rows)
    if added or bonus_added or incomplete:save(draws)
    print(f'HOTOVO: {len(rows)} ověřených, {added} nových, {bonus_added} doplněných dodatkových čísel, {len(draws)} celkem.')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,requests.RequestException) as exc:
        print('CHYBA (CSV ponecháno beze změny):',exc,file=sys.stderr);sys.exit(1)
