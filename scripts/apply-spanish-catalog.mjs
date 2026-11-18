import fs from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_ROOT = 'c:\\Users\\abelz\\Workspace\\remnantFinder';
const DATA_DIR = path.join(WORKSPACE_ROOT, 'data');
const BATCH_DIR = path.join(DATA_DIR, 'translation_batches');

async function main() {
  console.log('=== Integrando Traducciones al Español en catalog.merged.json ===');

  const [uniqueIndexRaw, glossaryRaw, catalogRaw] = await Promise.all([
    fs.readFile(path.join(BATCH_DIR, 'unique_index.json'), 'utf8'),
    fs.readFile(path.join(BATCH_DIR, 'glossary_en_es.json'), 'utf8'),
    fs.readFile(path.join(DATA_DIR, 'catalog.merged.json'), 'utf8'),
  ]);

  const uniqueIndex = JSON.parse(uniqueIndexRaw);
  const glossaryEnToEs = JSON.parse(glossaryRaw);
  const catalog = JSON.parse(catalogRaw);

  const combinedTranslationsByKey = {};
  for (let i = 1; i <= 8; i++) {
    const fileName = `batch_${String(i).padStart(2, '0')}_es.json`;
    const filePath = path.join(BATCH_DIR, fileName);
    const raw = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed);
    console.log(`  • ${fileName}: ${keys.length} traducciones cargadas`);
    Object.assign(combinedTranslationsByKey, parsed);
  }

  // Build exact EN text -> ES text lookup maps
  const descEnToEs = new Map();
  const noteEnToEs = new Map();
  let missingCount = 0;

  for (const entry of uniqueIndex) {
    const esText = combinedTranslationsByKey[entry.key];
    if (!esText || !String(esText).trim()) {
      console.error(`⚠️ Falta traducción para ${entry.key} (${entry.sampleItemEs})`);
      missingCount++;
      continue;
    }
    if (entry.kind === 'description') {
      descEnToEs.set(entry.en.trim(), String(esText).trim());
    } else {
      noteEnToEs.set(entry.en.trim(), String(esText).trim());
    }
  }

  if (missingCount > 0) {
    throw new Error(`Faltan ${missingCount} traducciones en los lotes.`);
  }

  // Apply to catalog items WITHOUT modifying any internal IDs, slugs, or wikiLinks
  let updatedDescCount = 0;
  let updatedNoteCount = 0;

  for (const item of catalog.items) {
    if (item.description && item.description.trim()) {
      const es = descEnToEs.get(item.description.trim());
      if (es) {
        item.descriptionEs = es;
        updatedDescCount++;
      }
    } else {
      item.descriptionEs = '';
    }

    if (item.howToObtainNote && item.howToObtainNote.trim()) {
      const es = noteEnToEs.get(item.howToObtainNote.trim());
      if (es) {
        item.howToObtainNoteEs = es;
        item.acquisitionEs = es;
        updatedNoteCount++;
      }
    } else {
      item.howToObtainNoteEs = '';
      item.acquisitionEs = '';
    }
  }

  // Also store noteEnToEs dictionary & uiGlossaryEs in catalog so any dynamic note from RolledItemDto translates 100%
  const notesDictionaryEs = {};
  for (const [en, es] of noteEnToEs.entries()) {
    notesDictionaryEs[en] = es;
  }

  catalog.uiGlossaryEs = glossaryEnToEs;
  catalog.notesDictionaryEs = notesDictionaryEs;
  catalog.spanishTranslationGeneratedAtUtc = new Date().toISOString();

  const outPath = path.join(DATA_DIR, 'catalog.merged.json');
  await fs.writeFile(outPath, JSON.stringify(catalog, null, 2), 'utf8');

  console.log(`\n✅ Traducción integrada exitosamente en ${outPath}`);
  console.log(`   • Ítems con descriptionEs     : ${updatedDescCount}`);
  console.log(`   • Ítems con howToObtainNoteEs : ${updatedNoteCount}`);
  console.log(`   • Entradas en uiGlossaryEs    : ${Object.keys(glossaryEnToEs).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
