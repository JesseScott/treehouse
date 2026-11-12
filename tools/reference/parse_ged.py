import sys, re, json, collections

path, out_json = sys.argv[1], sys.argv[2]
LINE = re.compile(r'^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$')

# ---- build generic tree -------------------------------------------------
records, stack, bad = [], [], []
with open(path, encoding='utf-8-sig') as fh:
    for n, raw in enumerate(fh, 1):
        raw = raw.rstrip('\r\n')
        if not raw.strip():
            continue
        m = LINE.match(raw)
        if not m:
            bad.append((n, raw))
            continue
        lvl, xref, tag, val = int(m[1]), m[2], m[3], m[4] or ''
        node = {'tag': tag, 'xref': xref, 'val': val, 'kids': []}
        if tag in ('CONT', 'CONC') and stack and lvl == len(stack):
            parent = stack[lvl - 1]
            parent['val'] += ('\n' if tag == 'CONT' else '') + val
            continue
        del stack[lvl:]
        if lvl == 0:
            records.append(node)
        elif len(stack) == lvl:
            stack[-1]['kids'].append(node)
        else:
            bad.append((n, raw))
            continue
        stack.append(node)

def kid(n, tag):
    return next((k for k in n['kids'] if k['tag'] == tag), None)
def kids(n, tag):
    return [k for k in n['kids'] if k['tag'] == tag]
def kv(n, tag):
    k = kid(n, tag) if n else None
    return k['val'] if k else None
def event(n, tag):
    e = kid(n, tag)
    return {'date': kv(e, 'DATE'), 'place': kv(e, 'PLAC')} if e else None
def year(d):
    m = re.search(r'\b(1[0-9]{3}|20[0-9]{2})\b', d or '')
    return int(m[1]) if m else None

indi, fam = {}, {}
for r in records:
    if r['tag'] == 'INDI':
        indi[r['xref']] = {
            'id': r['xref'],
            'name': (kv(r, 'NAME') or '').replace('/', '').strip(),
            'names': [k['val'] for k in kids(r, 'NAME')],
            'surname': kv(kid(r, 'NAME'), 'SURN') if kid(r, 'NAME') else None,
            'sex': kv(r, 'SEX'),
            'birth': event(r, 'BIRT'), 'death': event(r, 'DEAT'), 'burial': event(r, 'BURI'),
            'residences': [{'date': kv(k, 'DATE'), 'place': kv(k, 'PLAC')} for k in kids(r, 'RESI')],
            'famc': [k['val'] for k in kids(r, 'FAMC')],
            'fams': [k['val'] for k in kids(r, 'FAMS')],
            'sources': sum(1 for k in r['kids'] for s in ([k] + k['kids']) if s['tag'] == 'SOUR'),
        }
    elif r['tag'] == 'FAM':
        fam[r['xref']] = {
            'id': r['xref'], 'husb': kv(r, 'HUSB'), 'wife': kv(r, 'WIFE'),
            'children': [k['val'] for k in kids(r, 'CHIL')],
            'marriage': event(r, 'MARR'), 'divorce': event(r, 'DIV'),
        }

json.dump({'individuals': list(indi.values()), 'families': list(fam.values())},
          open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

P = print
P(f'records: {len(records)}  individuals: {len(indi)}  families: {len(fam)}  unparseable lines: {len(bad)}')
for b in bad[:10]: P('  BAD', b)

# ---- integrity ----------------------------------------------------------
issues = []
for i in indi.values():
    for f in i['famc'] + i['fams']:
        if f not in fam: issues.append(f"{i['name']} -> missing family {f}")
    for f in i['famc']:
        if f in fam and i['id'] not in fam[f]['children']: issues.append(f"{i['name']} FAMC {f} not reciprocated")
    for f in i['fams']:
        if f in fam and i['id'] not in (fam[f]['husb'], fam[f]['wife']): issues.append(f"{i['name']} FAMS {f} not reciprocated")
    by, dy = year((i['birth'] or {}).get('date')), year((i['death'] or {}).get('date'))
    if by and dy and (dy < by or dy - by > 110): issues.append(f"{i['name']}: born {by}, died {dy}")
for f in fam.values():
    for p in [f['husb'], f['wife']] + f['children']:
        if p and p not in indi: issues.append(f"{f['id']} -> missing person {p}")
    for par in (f['husb'], f['wife']):
        py = year((indi.get(par, {}).get('birth') or {}).get('date')) if par else None
        for c in f['children']:
            cy = year((indi.get(c, {}).get('birth') or {}).get('date'))
            if py and cy and not (12 <= cy - py <= 70):
                issues.append(f"{indi[par]['name']} (b.{py}) parent of {indi[c]['name']} (b.{cy})")
P(f'\nintegrity issues: {len(issues)}')
for x in issues[:40]: P('  -', x)

# ---- stats --------------------------------------------------------------
P('\nsex:', dict(collections.Counter(i['sex'] for i in indi.values())))
bys = [y for y in (year((i['birth'] or {}).get('date')) for i in indi.values()) if y]
P(f'birth years: {min(bys)}-{max(bys)}  (with year: {len(bys)})')
P('by century:', dict(sorted(collections.Counter(f'{y//100*100}s' for y in bys).items())))
P('no parents in tree:', sum(1 for i in indi.values() if not i['famc']),
  ' no birth:', sum(1 for i in indi.values() if not i['birth']),
  ' no sources:', sum(1 for i in indi.values() if not i['sources']))
P('\ntop surnames:', collections.Counter(i['surname'] for i in indi.values() if i['surname']).most_common(25))
def country(p):
    return p.split(',')[-1].strip() if p else None
P('\nbirth countries/regions:', collections.Counter(country((i['birth'] or {}).get('place')) for i in indi.values() if (i['birth'] or {}).get('place')).most_common(20))
P('\ntop birth places:', collections.Counter((i['birth'] or {}).get('place') for i in indi.values() if (i['birth'] or {}).get('place')).most_common(15))

# ---- root + ancestors ---------------------------------------------------
root = next(r['xref'] for r in records if r['tag'] == 'INDI')
def parents(pid):
    out = []
    for f in indi[pid]['famc']:
        if f in fam: out += [p for p in (fam[f]['husb'], fam[f]['wife']) if p]
    return out
def life(i):
    b, d = i['birth'] or {}, i['death'] or {}
    s = f"{year(b.get('date')) or '?'}-{year(d.get('date')) or ''}"
    return f"{i['name']} ({s}; {b.get('place') or 'birthplace unknown'})"
gen, seen, g = [root], {root}, 0
anc_total = 0
P(f"\nroot: {life(indi[root])}")
while gen:
    nxt = []
    for p in gen:
        for q in parents(p):
            if q not in seen: seen.add(q); nxt.append(q)
    g += 1
    if nxt:
        anc_total += len(nxt)
        P(f'\n gen +{g}: {len(nxt)} of {2**g} possible ancestors')
        if g <= 4:
            for q in nxt: P('    ', life(indi[q]))
        else:
            ys = [y for y in (year((indi[q]['birth'] or {}).get('date')) for q in nxt) if y]
            P('     births', f'{min(ys)}-{max(ys)}' if ys else '?', '| surnames:', ', '.join(sorted({indi[q]['surname'] or '?' for q in nxt})))
    gen = nxt
P(f'\ndirect ancestors of root: {anc_total}; other relatives: {len(indi) - anc_total - 1}')

# spouse / children / siblings of root
r = indi[root]
for f in r['fams']:
    F = fam[f]; sp = F['wife'] if F['husb'] == root else F['husb']
    P('\nspouse:', life(indi[sp]) if sp else '(none recorded)', '| marriage:', F['marriage'])
    for c in F['children']: P('   child:', life(indi[c]))
for f in r['famc']:
    for c in fam[f]['children']:
        if c != root: P('sibling:', life(indi[c]))

# oldest people
P('\nearliest-born:')
for i in sorted((i for i in indi.values() if year((i['birth'] or {}).get('date'))), key=lambda i: year(i['birth']['date']))[:8]:
    P('   ', life(i))
# connectivity
adj = collections.defaultdict(set)
for f in fam.values():
    m = [p for p in [f['husb'], f['wife']] + f['children'] if p]
    for a in m:
        adj[a].update(m)
comp, left = [], set(indi)
while left:
    s = left.pop(); q = [s]; c = {s}
    while q:
        for n2 in adj[q.pop()]:
            if n2 in left: left.discard(n2); c.add(n2); q.append(n2)
    comp.append(c)
comp.sort(key=len, reverse=True)
P('\nconnected components:', [len(c) for c in comp])
for c in comp[1:]:
    P('   detached:', [indi[x]['name'] for x in list(c)[:5]])
