// Generates the fictional GEDCOM 5.5.1 fixtures in fixtures/synthetic/.
//
// Every person here is invented. The files copy the *quirks* of real Ancestry
// exports (BOM, CRLF, CONT/CONC, two parent families, odd dates, lowercase
// places, people with no places) and follow one paternal line from Vancouver
// through Ontario and Quebec back to the Isle of Lewis, Scotland.
//
// The output is deterministic: the same code always writes the same bytes, and
// a unit test fails if the committed files drift from the generator.
//
//   npm run fixtures
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Written into every fixture header; the privacy guard requires it. */
export const MARKER = 'TREEHOUSE-SYNTHETIC';
export const SIZES = [30, 500, 5000];
export const OUT_DIR = new URL('../../fixtures/synthetic/', import.meta.url);

const BOM = String.fromCharCode(0xfeff);
const EOL = '\r\n';

// Real places with approximate coordinates (good to a few kilometres), so later
// milestones can assert that the camera ends up near them.
const PLACES = {
  BC: [
    ['Vancouver, British Columbia, Canada', 49.2827, -123.1207],
    ['North Vancouver, British Columbia, Canada', 49.32, -123.0724],
    ['Burnaby, British Columbia, Canada', 49.2488, -122.9805],
    ['New Westminster, British Columbia, Canada', 49.2057, -122.911],
    ['Victoria, British Columbia, Canada', 48.4284, -123.3656],
  ],
  ON: [
    ['Kincardine, Bruce, Ontario, Canada', 44.1767, -81.6367],
    ['Ripley, Bruce, Ontario, Canada', 44.0667, -81.5667],
    ['Goderich, Huron, Ontario, Canada', 43.7428, -81.7139],
    ['Toronto, York, Ontario, Canada', 43.6532, -79.3832],
    ['Hamilton, Wentworth, Ontario, Canada', 43.2557, -79.8711],
  ],
  QC: [
    ['Scotstown, Compton, Quebec, Canada', 45.5236, -71.2806],
    ['Lingwick, Compton, Quebec, Canada', 45.6333, -71.3667],
    // Shares its name with the town on Lewis: a deliberate geocoding trap.
    ['Stornoway, Frontenac, Quebec, Canada', 45.7167, -71.1667],
    ['Sherbrooke, Quebec, Canada', 45.4042, -71.8929],
    ['Montreal, Quebec, Canada', 45.5019, -73.5674],
  ],
  SCO: [
    ['Barvas, Lewis, Ross and Cromarty, Scotland', 58.3597, -6.5069],
    ['Stornoway, Lewis, Ross and Cromarty, Scotland', 58.2093, -6.3865],
    ['Ness, Lewis, Ross and Cromarty, Scotland', 58.4925, -6.2289],
    ['Uig, Lewis, Ross and Cromarty, Scotland', 58.1833, -7.0167],
    ['Carloway, Lewis, Ross and Cromarty, Scotland', 58.2833, -6.7833],
    ['Back, Lewis, Ross and Cromarty, Scotland', 58.2833, -6.3167],
  ],
};

const STREETS = ['Alder Street', 'Larch Avenue', 'Juniper Road', 'Tamarack Lane', 'Sumac Crescent'];

// Invented surnames, so no generated person can match a real family.
const LINE_SURNAME = 'MacBriar';
const SURNAMES = [
  'MacFennel',
  'MacTarn',
  'MacQuill',
  'MacOrrin',
  'Thistlewick',
  'Fernhollow',
  'Brackenmoor',
  'Larchwell',
  'Rowanbeck',
  'Heatherstane',
  'Kelpholm',
  'Gannetley',
  'Peatfold',
  'Cairnmoss',
  'Dulseby',
  'Skerrow',
  'Machairn',
  'Whinbury',
  'Curlewick',
  'Ottershaw',
];
const GIVEN = {
  old: {
    M: [
      'Murdo',
      'Angus',
      'Donald',
      'Malcolm',
      'Norman',
      'Kenneth',
      'Alasdair',
      'Ruairidh',
      'Iain',
      'Tormod',
    ],
    F: [
      'Mòrag',
      'Seònaid',
      'Catrìona',
      'Peigi',
      'Annag',
      'Effie',
      'Christina',
      'Màiri',
      'Isabella',
      'Kirsty',
    ],
  },
  modern: {
    M: [
      'Walter',
      'Harold',
      'Gordon',
      'Douglas',
      'Stanley',
      'Russell',
      'Glenn',
      'Dale',
      'Trevor',
      'Kyle',
    ],
    F: [
      'Mabel',
      'Edith',
      'Doris',
      'Lorraine',
      'Shirley',
      'Marlene',
      'Brenda',
      'Colleen',
      'Tanya',
      'Kelsey',
    ],
  },
};
const NICKNAMES = ['Sandy', 'Bàn', 'Ruadh', 'Dolly', 'Curly', 'Mòr'];
const ALT_NAMES = {
  Mòrag: 'Marion',
  Seònaid: 'Janet',
  Catrìona: 'Catherine',
  Tormod: 'Norman',
  Iain: 'John',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Birth years of the paternal line, root first: Vancouver, Ontario, Quebec, then Lewis. */
const LINE_YEARS = [1986, 1957, 1928, 1899, 1871, 1842, 1813, 1785];

const LONG_NOTE =
  'Family tradition holds that the household left the croft after a run of poor harvests and ' +
  'sailed for Quebec with two kists, a spinning wheel and a Gaelic bible, settling first among ' +
  'neighbours from the same township before the younger sons moved on to Bruce County.';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function regionForYear(year) {
  if (year >= 1945) return 'BC';
  if (year >= 1900) return 'ON';
  if (year >= 1860) return 'QC';
  return 'SCO';
}

/** Builds the people and families of one fixture. */
export function buildTree(size) {
  if (size < 20) throw new Error('A fixture needs at least 20 people for the fixed quirks.');
  const rng = mulberry32(0x7ee0 + size);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const chance = (p) => rng() < p;

  const people = [];
  const families = [];

  const place = (year) => {
    const [name, lat, lng] = pick(PLACES[regionForYear(year)]);
    return { name, lat, lng };
  };
  const quirkyPlace = (year) => {
    const p = place(year);
    const roll = rng();
    if (roll < 0.06) return null;
    if (roll < 0.12) return p.name.toLowerCase();
    if (roll < 0.17) return `${int(2, 980)} ${pick(STREETS)}, ${p.name}`;
    if (roll < 0.2 && p.name.includes('Lewis')) return `Croft ${int(1, 40)}, ${p.name}`;
    if (roll < 0.25) return p.name.replace(/, (Canada|Scotland)$/, '');
    return p.name;
  };
  const date = (year) => {
    const roll = rng();
    const day = String(int(1, 28)).padStart(2, '0');
    const month = int(1, 12);
    if (roll < 0.58) return `${Number(day)} ${MONTHS[month - 1]} ${year}`;
    if (roll < 0.7) return String(year);
    if (roll < 0.78) return `Abt. ${year}`;
    if (roll < 0.82) return `After ${year - 1}`;
    if (roll < 0.86) return `Bef. ${year + 1}`;
    if (roll < 0.92) return `${MONTHS[month - 1]} ${year}`;
    if (roll < 0.96) return `${day} ${String(month).padStart(2, '0')} ${year}`;
    return `Bet. ${year - 2}-${year + 2}`;
  };

  function addPerson({ sex, surname, birthYear, plain = false }) {
    const era = birthYear < 1900 ? 'old' : 'modern';
    const given = pick(GIVEN[era][sex]);
    const person = {
      id: `@I${420000000000 + people.length + 1}@`,
      sex,
      given,
      surname,
      displayGiven: given,
      surnameSuffix: '',
      birthYear,
      birth: null,
      death: null,
      residences: [],
      note: null,
      famc: [],
      fams: [],
    };
    if (!plain) {
      const roll = rng();
      if (roll < 0.03) person.displayGiven = `${given} "${pick(NICKNAMES)}"`;
      else if (roll < 0.05 && ALT_NAMES[given])
        person.displayGiven = `${given} (${ALT_NAMES[given]})`;
      else if (roll < 0.07) person.surnameSuffix = ' ';
    }
    // About 3% of people have no events at all, so no places.
    if (plain || !chance(0.03)) {
      const birthPlace = plain ? place(birthYear).name : quirkyPlace(birthYear);
      person.birth = {
        date: plain ? `${int(1, 28)} ${pick(MONTHS)} ${birthYear}` : date(birthYear),
      };
      if (birthPlace) person.birth.place = birthPlace;
      if (birthYear < 1935) {
        // Old enough that nobody dies before their children are born.
        const deathYear = birthYear + int(62, 94);
        const deathPlace = plain ? place(birthYear + 30).name : quirkyPlace(birthYear + 30);
        person.death = { date: plain ? String(deathYear) : date(deathYear) };
        if (deathPlace) person.death.place = deathPlace;
      }
      if (!plain && chance(0.35)) {
        const resYear = birthYear + int(18, 55);
        const resPlace = quirkyPlace(resYear);
        if (resPlace && resYear < 2024)
          person.residences.push({ date: String(resYear), place: resPlace });
      }
    }
    people.push(person);
    return person;
  }

  function addFamily(husband, wife) {
    const family = {
      id: `@F${families.length + 1}@`,
      husb: husband,
      wife,
      children: [],
      marriage: null,
    };
    const partners = [husband, wife].filter(Boolean);
    for (const partner of partners) partner.fams.push(family);
    if (partners.length === 2 && chance(0.7)) {
      const year = Math.max(husband.birthYear, wife.birthYear) + int(19, 27);
      const p = quirkyPlace(year);
      family.marriage = { date: date(year), ...(p ? { place: p } : {}) };
    }
    families.push(family);
    return family;
  }

  function addChild(family, child) {
    family.children.push(child);
    child.famc.push(family);
  }

  function addParents(child, { fatherYear, plain = false } = {}) {
    const father = addPerson({
      sex: 'M',
      surname: child.surname,
      birthYear: fatherYear ?? child.birthYear - int(24, 36),
      plain,
    });
    const mother = addPerson({
      sex: 'F',
      surname: pick(SURNAMES),
      birthYear: child.birthYear - int(20, 34),
    });
    const family = addFamily(father, mother);
    addChild(family, child);
    return { father, mother, family };
  }

  // ---- the fixed part: one paternal line with every quirk on it -------------
  const root = addPerson({
    sex: 'M',
    surname: LINE_SURNAME,
    birthYear: LINE_YEARS[0],
    plain: true,
  });
  root.given = root.displayGiven = 'Rowan';
  const line = [root];
  const lineMothers = [];
  for (let g = 1; g < LINE_YEARS.length; g++) {
    const { father, mother } = addParents(line[g - 1], { fatherYear: LINE_YEARS[g], plain: true });
    line.push(father);
    lineMothers.push(mother);
  }
  const setBirth = (person, dateText, placeText) => {
    person.birth = { date: dateText, ...(placeText ? { place: placeText } : {}) };
  };
  // Root: an ambiguous numeric date (5 November or 11 May?).
  setBirth(root, '05 11 1986', PLACES.BC[0][0]);
  setBirth(line[1], '14 Feb 1957', PLACES.BC[0][0]);
  // A street address inside a place.
  setBirth(line[2], '3 Sep 1928', PLACES.ON[0][0]);
  line[2].residences = [{ date: '1962', place: `312 ${STREETS[0]}, ${PLACES.BC[0][0]}` }];
  setBirth(line[3], '21 Oct 1899', PLACES.QC[0][0]);
  setBirth(line[4], 'After 1870', PLACES.QC[1][0]);
  // A croft number, an approximate date, a nickname in quotes and a long note.
  setBirth(line[5], 'Abt. 1842', `Croft 14, ${PLACES.SCO[0][0]}`);
  line[5].given = 'Murdo';
  line[5].displayGiven = 'Murdo "Murchadh Bàn"';
  line[5].death = { date: '1911', place: PLACES.QC[1][0] };
  line[5].note = `${LONG_NOTE}\nSee also the township rental of 1851.\n\nTranscribed from a family letter.`;
  // A lowercase place and a month-and-year date.
  setBirth(line[6], 'Jul 1813', PLACES.SCO[0][0].toLowerCase());
  setBirth(line[7], '1785', PLACES.SCO[2][0]);
  // A Gaelic name with an English one in parentheses and a trailing space in the surname.
  const morag = lineMothers[6];
  morag.given = 'Mòrag';
  morag.displayGiven = 'Mòrag (Marion)';
  morag.surname = 'MacFennel';
  morag.surnameSuffix = ' ';
  // The root's mother has dates but no places anywhere.
  const rootMother = lineMothers[0];
  rootMother.displayGiven = rootMother.given;
  rootMother.surnameSuffix = '';
  rootMother.birth = { date: `Abt. ${rootMother.birthYear}` };
  rootMother.death = null;
  rootMother.residences = [];

  // Two parent families: the 1899 ancestor also belongs to a foster family.
  const fosterFather = addPerson({ sex: 'M', surname: 'Peatfold', birthYear: 1868 });
  const fosterMother = addPerson({ sex: 'F', surname: 'Skerrow', birthYear: 1872 });
  addChild(addFamily(fosterFather, fosterMother), line[3]);

  // A duplicate record: the 1871 ancestor entered twice in the same family.
  const duplicate = addPerson({
    sex: 'M',
    surname: LINE_SURNAME,
    birthYear: line[4].birthYear,
    plain: true,
  });
  duplicate.given = duplicate.displayGiven = line[4].given;
  duplicate.birth = { date: String(line[4].birthYear) };
  duplicate.death = null;
  addChild(line[4].famc[0], duplicate);

  // A detached branch: a couple with no link to anyone else.
  const detachedHusband = addPerson({ sex: 'M', surname: 'Ottershaw', birthYear: 1880 });
  const detachedWife = addPerson({ sex: 'F', surname: 'Curlewick', birthYear: 1884 });
  const detachedFamily = addFamily(detachedHusband, detachedWife);

  // ---- the grown part: parents, siblings and spouses until the size is met --
  const needParents = people.filter(
    (p) => p.famc.length === 0 && p !== detachedHusband && p !== detachedWife,
  );
  let cursor = 0;
  const queueParents = (person) => {
    if (person.famc.length === 0) needParents.push(person);
  };

  let guard = 0;
  while (people.length < size) {
    if (++guard > size * 200) throw new Error(`Could not grow the tree to ${size} people.`);
    const remaining = size - people.length;
    const roll = rng();
    if (roll < 0.3 && remaining >= 2) {
      while (cursor < needParents.length && needParents[cursor].birthYear < 1765) cursor++;
      const child = needParents[cursor];
      if (!child) continue;
      cursor++;
      const { father, mother } = addParents(child);
      queueParents(father);
      queueParents(mother);
    } else if (roll < 0.8) {
      const family = pick(families);
      if (!family.wife || !family.husb || family.children.length >= 8) continue;
      const lo = family.wife.birthYear + 18;
      const hi = Math.min(family.wife.birthYear + 44, 2018);
      const near = family.children.length
        ? pick(family.children).birthYear + int(-8, 8)
        : family.wife.birthYear + int(20, 34);
      const birthYear = Math.max(lo, Math.min(hi, near));
      if (lo > hi || family.children.some((c) => c.birthYear === birthYear)) continue;
      addChild(
        family,
        addPerson({ sex: chance(0.5) ? 'M' : 'F', surname: family.husb.surname, birthYear }),
      );
    } else {
      const person = pick(people);
      if (person.fams.length > 0 || person.birthYear > 1992 || person === duplicate) continue;
      if (!person.birth) continue;
      const spouse = addPerson({
        sex: person.sex === 'M' ? 'F' : 'M',
        surname: pick(SURNAMES),
        birthYear: person.birthYear + int(-4, 4),
      });
      if (person.sex === 'M') addFamily(person, spouse);
      else addFamily(spouse, person);
      queueParents(spouse);
    }
  }

  const coords = Object.fromEntries(
    Object.values(PLACES)
      .flat()
      .map(([name, lat, lng]) => [name.toLowerCase(), { lat, lng }]),
  );
  const locate = (text) => {
    const key = Object.keys(coords).find((name) => text.toLowerCase().endsWith(name));
    return coords[key];
  };

  return {
    size,
    people,
    families,
    root,
    line,
    quirks: {
      twoParentFamilies: [line[3].id],
      duplicates: [[line[4].id, duplicate.id]],
      detached: [detachedHusband.id, detachedWife.id],
      detachedFamily: detachedFamily.id,
      noPlaces: [rootMother.id],
    },
    locate,
  };
}

function noteLines(note) {
  // CONT starts a new line of the note; CONC continues one, split mid-word as exports do.
  const out = [];
  note.split('\n').forEach((text, i) => {
    const chunks = [];
    let rest = text;
    while (rest.length > 88) {
      let cut = 88;
      while (rest[cut] === ' ' || rest[cut - 1] === ' ') cut--;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    chunks.push(rest);
    chunks.forEach((chunk, j) => {
      const tag = i === 0 && j === 0 ? '1 NOTE' : j === 0 ? '2 CONT' : '2 CONC';
      out.push(chunk ? `${tag} ${chunk}` : tag);
    });
  });
  return out;
}

function eventLines(tag, event) {
  const out = [`1 ${tag}`];
  if (event.date) out.push(`2 DATE ${event.date}`);
  if (event.place) out.push(`2 PLAC ${event.place}`);
  return out;
}

/** Serialises a tree as GEDCOM 5.5.1 with a BOM and CRLF line endings. */
export function toGedcom(tree) {
  const lines = [
    '0 HEAD',
    `1 SOUR ${MARKER}`,
    '2 NAME treehouse synthetic fixture generator',
    '2 VERS 1',
    '1 DATE 1 JAN 2026',
    '1 NOTE Fictional people generated by tools/fixtures/generate.mjs. Not real family data.',
    '1 SUBM @SUBM1@',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '0 @SUBM1@ SUBM',
    '1 NAME Treehouse Fixture Generator',
  ];
  for (const p of tree.people) {
    lines.push(
      `0 ${p.id} INDI`,
      `1 NAME ${p.displayGiven} /${p.surname}${p.surnameSuffix}/`,
      `2 GIVN ${p.displayGiven}`,
      `2 SURN ${p.surname}${p.surnameSuffix}`,
      `1 SEX ${p.sex}`,
    );
    if (p.birth) lines.push(...eventLines('BIRT', p.birth));
    if (p.death) lines.push(...eventLines('DEAT', p.death));
    for (const residence of p.residences) lines.push(...eventLines('RESI', residence));
    if (p.note) lines.push(...noteLines(p.note));
    for (const family of p.famc) lines.push(`1 FAMC ${family.id}`);
    for (const family of p.fams) lines.push(`1 FAMS ${family.id}`);
  }
  for (const f of tree.families) {
    lines.push(`0 ${f.id} FAM`);
    if (f.husb) lines.push(`1 HUSB ${f.husb.id}`);
    if (f.wife) lines.push(`1 WIFE ${f.wife.id}`);
    for (const child of f.children) lines.push(`1 CHIL ${child.id}`);
    if (f.marriage) lines.push(...eventLines('MARR', f.marriage));
  }
  lines.push('0 TRLR');
  return BOM + lines.join(EOL) + EOL;
}

export function fileName(size) {
  return `treehouse-${size}.ged`;
}

/** Generates one fixture: its GEDCOM text and its manifest entry. */
export function generate(size) {
  const tree = buildTree(size);
  const gedcom = toGedcom(tree);
  const manifest = {
    file: fileName(size),
    sha256: createHash('sha256').update(gedcom, 'utf8').digest('hex'),
    people: tree.people.length,
    families: tree.families.length,
    rootId: tree.root.id,
    // Root first. Coordinates are approximate; use them with a tolerance.
    paternalLine: tree.line.map((p) => ({
      id: p.id,
      name: `${p.displayGiven} ${p.surname}`,
      birthYear: p.birthYear,
      birthPlace: p.birth.place,
      ...tree.locate(p.birth.place),
    })),
    quirks: tree.quirks,
  };
  return { gedcom, manifest };
}

export function generateAll() {
  return SIZES.map((size) => generate(size));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT_DIR, { recursive: true });
  const fixtures = generateAll();
  for (const { gedcom, manifest } of fixtures) {
    writeFileSync(new URL(manifest.file, OUT_DIR), gedcom);
    console.log(`${manifest.file}: ${manifest.people} people, ${manifest.families} families`);
  }
  const manifest = {
    note: 'Generated by tools/fixtures/generate.mjs. Fictional people only. Do not edit by hand.',
    marker: MARKER,
    fixtures: fixtures.map((f) => f.manifest),
  };
  writeFileSync(new URL('manifest.json', OUT_DIR), JSON.stringify(manifest, null, 2) + '\n');
}
