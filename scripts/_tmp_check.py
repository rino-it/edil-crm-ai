import csv,re
from collections import defaultdict

rows=[]
with open('scripts/_webapp_esposizione_fornitori.csv',encoding='utf-8') as f:
    r=csv.DictReader(f)
    for row in r:
        if row['fornitore']=='TOTALE':
            continue
        rows.append((row['fornitore'], float(row['totale_residuo_webapp'])))

def norm(s):
    s=s.lower()
    s=re.sub(r'[^a-z0-9 ]+',' ',s)
    s=re.sub(r'\b(srl|spa|snc|sas|s p a|societa|unipersonale|di|e|c)\b',' ',s)
    s=re.sub(r'\s+',' ',s).strip()
    return s

bucket=defaultdict(list)
for n,v in rows:
    bucket[norm(n)].append((n,v))

dups=[]
for k,vals in bucket.items():
    if len(vals)>1:
        tot=sum(v for _,v in vals)
        top=max(v for _,v in vals)
        extra=tot-top
        dups.append((extra,tot,vals))

dups.sort(reverse=True,key=lambda x:x[0])
print('Possibili duplicati per nome normalizzato (extra oltre la voce maggiore):')
for extra,tot,vals in dups[:15]:
    if extra < 50: continue
    names=' | '.join(f"{n}={v:,.2f}" for n,v in vals)
    print(f"  extra={extra:>10,.2f} ; totale_gruppo={tot:>10,.2f} ; {names}")
