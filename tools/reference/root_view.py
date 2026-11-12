import sys, json, re, collections
data = json.load(open(sys.argv[1], encoding='utf-8'))
who = sys.argv[2].lower()
indi = {i['id']: i for i in data['individuals']}
fam = {f['id']: f for f in data['families']}
P = print

def year(d):
    m = re.search(r'\b(1[0-9]{3}|20[0-9]{2})\b', d or '')
    return int(m[1]) if m else None
def life(i):
    b, d = i['birth'] or {}, i['death'] or {}
    s = f"{year(b.get('date')) or '?'}-{year(d.get('date')) or ''}"
    pl = b.get('place') or '?'
    dp = d.get('place')
    return f"{i['name']} ({s}) b. {pl}" + (f"; d. {dp}" if dp else '')

roots = [i for i in indi.values() if i['name'].lower() == who]
P('matches:', [(r['id'], life(r)) for r in roots])
root = roots[0]['id']

# Ahnentafel: 1 = root, 2n = father, 2n+1 = mother (extra parent sets flagged)
ahn = {1: root}
extra = []
queue = [1]
while queue:
    n = queue.pop(0)
    p = indi[ahn[n]]
    for k, f in enumerate(p['famc']):
        F = fam.get(f)
        if not F: continue
        if k > 0:
            extra.append((n, p['name'], f, [indi[x]['name'] for x in (F['husb'], F['wife']) if x]))
            continue
        if F['husb']: ahn[2*n] = F['husb']; queue.append(2*n)
        if F['wife']: ahn[2*n+1] = F['wife']; queue.append(2*n+1)

def path(n):
    s = ''
    while n > 1:
        s = ('F' if n % 2 == 0 else 'M') + s; n //= 2
    return s or 'self'

gens = collections.defaultdict(list)
for n in sorted(ahn): gens[n.bit_length() - 1].append(n)
anc_ids = set(ahn.values())
P(f'\nROOT: {life(indi[root])}')
P(f'direct ancestors: {len(ahn)-1} slots, {len(anc_ids)-1} distinct people, {max(gens)} generations')
for g in sorted(gens):
    if g == 0: continue
    P(f'\n=== gen +{g}: {len(gens[g])} of {2**g} ===')
    for n in gens[g]:
        P(f'  {n:>5} {path(n):<{max(gens)}}  {life(indi[ahn[n]])}')
if extra:
    P('\nextra parent sets (second FAMC):')
    for e in extra: P('  ', e)

# end-of-line ancestors (brick walls)
P('\n=== ends of each line (no parents recorded) ===')
for n in sorted(ahn):
    if 2*n not in ahn and 2*n+1 not in ahn and n > 1:
        P(f'  gen +{n.bit_length()-1} {path(n):<{max(gens)}} {life(indi[ahn[n]])}')
P('\n=== one parent missing ===')
for n in sorted(ahn):
    if (2*n in ahn) != (2*n+1 in ahn):
        P(f"  {indi[ahn[n]]['name']}: missing {'mother' if 2*n in ahn else 'father'}")

# immediate family
r = indi[root]
P('\n=== immediate family ===')
for f in r['famc']:
    for c in fam[f]['children']:
        if c != root: P('  sibling:', life(indi[c]))
for f in r['fams']:
    F = fam[f]; sp = F['wife'] if F['husb'] == root else F['husb']
    P('  spouse:', life(indi[sp]) if sp else None, '| marriage:', F['marriage'])
    for c in F['children']: P('    child:', life(indi[c]))

# blood relatives = descendants of any ancestor
def desc(pid, acc):
    for f in indi[pid]['fams']:
        for c in fam[f]['children']:
            if c not in acc: acc.add(c); desc(c, acc)
blood = set(anc_ids)
for a in list(anc_ids): desc(a, blood)
spouses = set()
for b in blood:
    for f in indi[b]['fams']:
        for s in (fam[f]['husb'], fam[f]['wife']):
            if s and s not in blood: spouses.add(s)
P(f'\nblood relatives incl. self & ancestors: {len(blood)}; their spouses: {len(spouses)}; unrelated to root: {len(indi)-len(blood)-len(spouses)}')
P('collateral (non-ancestor) blood relatives by surname:', collections.Counter(indi[b]['surname'] for b in blood - anc_ids).most_common(15))

# possible duplicates among ancestors/blood
key = collections.defaultdict(list)
for b in blood:
    i = indi[b]
    key[(re.sub(r'[^a-z]', '', i['name'].lower()), year((i['birth'] or {}).get('date')))].append(b)
P('\npossible duplicates (same name + birth year) in this subtree:')
for k, v in key.items():
    if len(v) > 1: P('  ', indi[v[0]]['name'], k[1], 'x', len(v))

# sanity: parent age at child's birth, lifespan
P('\ndate problems in this subtree:')
for f in fam.values():
    for par in (f['husb'], f['wife']):
        if par not in blood and par not in spouses: continue
        py = year((indi[par]['birth'] or {}).get('date')) if par else None
        for c in f['children']:
            cy = year((indi[c]['birth'] or {}).get('date'))
            if py and cy and not (13 <= cy - py <= 65):
                P(f"   {indi[par]['name']} (b.{py}) parent of {indi[c]['name']} (b.{cy})")
P('\nbirth countries of ancestors:', collections.Counter(((indi[a]['birth'] or {}).get('place') or '?').split(',')[-1].strip() for a in anc_ids).most_common())
json.dump({'root': root, 'ahnentafel': {str(n): ahn[n] for n in ahn}, 'blood': sorted(blood), 'spouses': sorted(spouses)}, open(sys.argv[3], 'w'))
