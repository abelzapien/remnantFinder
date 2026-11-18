import fs from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_ROOT = 'c:\\Users\\abelz\\Workspace\\remnantFinder';
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const BATCH_DIR = path.join(DATA_DIR, 'translation_batches');
const RESX_DIR = path.join(WORKSPACE_ROOT, 'RemnantOverseer', 'Resources');

function parseResxXml(xmlContent) {
  const map = {};
  const dataRegex = /<data\s+name="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>/g;
  let match;
  while ((match = dataRegex.exec(xmlContent)) !== null) {
    const decode = (s) =>
      s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .trim();
    const key = decode(match[1]);
    const val = decode(match[2]);
    map[key] = val;
  }
  return map;
}

async function main() {
  await fs.mkdir(BATCH_DIR, { recursive: true });

  const [gameEnXml, gameEsXml, appEnXml, appEsXml, catalogRaw] = await Promise.all([
    fs.readFile(path.join(RESX_DIR, 'GameStrings.resx'), 'utf8'),
    fs.readFile(path.join(RESX_DIR, 'GameStrings.es.resx'), 'utf8'),
    fs.readFile(path.join(RESX_DIR, 'AppStrings.resx'), 'utf8'),
    fs.readFile(path.join(RESX_DIR, 'AppStrings.es.resx'), 'utf8'),
    fs.readFile(path.join(DATA_DIR, 'catalog.merged.json'), 'utf8'),
  ]);

  const gameEn = parseResxXml(gameEnXml);
  const gameEs = parseResxXml(gameEsXml);
  const appEn = parseResxXml(appEnXml);
  const appEs = parseResxXml(appEsXml);
  const catalog = JSON.parse(catalogRaw);

  // Build comprehensive EN -> ES official Remnant 2 glossary
  const glossaryEnToEs = {
    'Ward 13': 'Base 13',
    'Root Earth': 'Tierra de Raíz',
    'The Labyrinth': 'El Laberinto',
    Labyrinth: 'Laberinto',
    Survivor: 'Superviviente',
    Veteran: 'Veterano',
    Nightmare: 'Pesadilla',
    Apocalypse: 'Apocalipsis',
    Hardcore: 'Extremo (Hardcore)',
    'World Stone': 'Piedra de Mundo',
    'Blood Moon': 'Luna de Sangre',
    'Blood Moon Altar': 'Altar de Luna de Sangre',
    Mudtooth: 'Colmillo Fangoso',
    Whispers: 'Susurros',
    Whisper: 'Susurros',
    Spark: 'Chispa',
    Bedel: 'Bedel, de los vaunnt',
    'Bedel of the Vaunnt': 'Bedel, de los vaunnt',
    'Drzyr Replicator': 'Replicador drzyr',
    Gunslinger: 'Pistolero',
  };

  for (const [key, enVal] of Object.entries(gameEn)) {
    const esVal = gameEs[key];
    if (enVal && esVal && enVal.length >= 3) {
      glossaryEnToEs[enVal] = esVal;
    }
    if (!key.includes('_') && esVal && key.length >= 3) {
      glossaryEnToEs[key] = esVal;
    }
  }

  for (const [key, enVal] of Object.entries(appEn)) {
    const esVal = appEs[key];
    if (
      (key.startsWith('Quest_') || key.startsWith('Patchwork_') || key.startsWith('Archetype_') || key.startsWith('OriginType_')) &&
      enVal &&
      esVal
    ) {
      glossaryEnToEs[enVal] = esVal;
    }
  }

  for (const item of catalog.items) {
    if (item.canonicalName && item.nameEs && item.canonicalName.length >= 3) {
      glossaryEnToEs[item.canonicalName] = item.nameEs;
    }
  }

  // Save UI glossary so Frontend and apply script can also use it for headers/vendors/difficulties
  await fs.writeFile(
    path.join(BATCH_DIR, 'glossary_en_es.json'),
    JSON.stringify(glossaryEnToEs, null, 2),
    'utf8'
  );

  // Collect all unique English strings (descriptions and howToObtainNotes)
  const uniqueEntries = [];
  const seenDescriptions = new Map();
  const seenNotes = new Map();

  for (const item of catalog.items) {
    if (item.description && item.description.trim()) {
      const txt = item.description.trim();
      if (!seenDescriptions.has(txt)) {
        const key = `desc_${seenDescriptions.size + 1}`;
        seenDescriptions.set(txt, key);
        uniqueEntries.push({
          key,
          kind: 'description',
          sampleItemEs: item.nameEs,
          en: txt,
        });
      }
    }
    if (item.howToObtainNote && item.howToObtainNote.trim()) {
      const txt = item.howToObtainNote.trim();
      if (!seenNotes.has(txt)) {
        const key = `note_${seenNotes.size + 1}`;
        seenNotes.set(txt, key);
        uniqueEntries.push({
          key,
          kind: 'howToGet',
          sampleItemEs: item.nameEs,
          en: txt,
        });
      }
    }
  }

  // Pre-compute matching glossary proper nouns for each entry to guarantee official Spanish names
  const glossaryTermsSorted = Object.entries(glossaryEnToEs)
    .filter(([en, es]) => en.length >= 4 && en.toLowerCase() !== es.toLowerCase())
    .sort((a, b) => b[0].length - a[0].length);

  for (const entry of uniqueEntries) {
    const lower = entry.en.toLowerCase();
    const hints = {};
    let count = 0;
    for (const [enTerm, esTerm] of glossaryTermsSorted) {
      if (lower.includes(enTerm.toLowerCase())) {
        hints[enTerm] = esTerm;
        count++;
        if (count >= 10) break;
      }
    }
    if (Object.keys(hints).length > 0) {
      entry.glossaryHints = hints;
    }
  }

  // Save index mapping so apply script can map keys back
  await fs.writeFile(
    path.join(BATCH_DIR, 'unique_index.json'),
    JSON.stringify(uniqueEntries, null, 2),
    'utf8'
  );

  // Split into 8 balanced batches
  const NUM_BATCHES = 8;
  const batchSize = Math.ceil(uniqueEntries.length / NUM_BATCHES);
  for (let i = 0; i < NUM_BATCHES; i++) {
    const slice = uniqueEntries.slice(i * batchSize, (i + 1) * batchSize);
    const batchName = `batch_${String(i + 1).padStart(2, '0')}.json`;
    await fs.writeFile(
      path.join(BATCH_DIR, batchName),
      JSON.stringify(slice, null, 2),
      'utf8'
    );
    console.log(`Generado ${batchName}: ${slice.length} entradas`);
  }

  console.log(`\nTotal entradas únicas preparadas: ${uniqueEntries.length}`);
  console.log(`  • Descripciones únicas : ${seenDescriptions.size}`);
  console.log(`  • Notas de obtención   : ${seenNotes.size}`);
  console.log(`  • Términos en glosario : ${Object.keys(glossaryEnToEs).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
