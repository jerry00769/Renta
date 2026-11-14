#!/usr/bin/env python3
"""Validate current Extra Renta fixed prize rules. No unsupported live payout scraping."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'renta-vyhry.js'
s=p.read_text(encoding='utf-8')
marker='window.RENTA_PAYOUTS='
assert marker in s
rules=json.loads(s.split(marker,1)[1].strip().rstrip(';'))
assert rules['priceOptions']==[25,50]
assert rules['prizes25']=={'7':24000000,'6+bonus':1200000,'6':10000,'5':1000,'4':100,'3':25}
print('Extra Renta: tabulkové výhry ověřeny, bez změn cache; skutečné výplaty se nestahují.')
