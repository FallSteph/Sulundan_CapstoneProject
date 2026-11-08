const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const extractor = new WordExtractor();
const { extractRevisionHistory } = require('./utils/extractor/revisionHistory');

async function testAll() {
  const dir = path.join(__dirname, 'uploads');
  const files = fs.readdirSync(dir).filter(f => !fs.statSync(path.join(dir, f)).isDirectory());
  for (const f of files) {
    const fp = path.join(dir, f);
    try {
      let text = '';
      try {
        const doc = await extractor.extract(fp);
        text = doc.getBody() || '';
      } catch (e) {
        const res = await mammoth.extractRawText({ path: fp });
        text = res.value || '';
      }
      const res = extractRevisionHistory(text);
      console.log('FILE:', f, 'Result:', JSON.stringify(res));
      if (res.missing) {
        console.log('--- FAILED FILE SAMPLE LINES ---');
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        lines.forEach((l, idx) => {
          if (/revision|history|date|prepared|reviewed|approved/i.test(l)) {
            console.log(`  Line ${idx}: ${l}`);
          }
        });
      }
    } catch (err) {
      console.error(f, err.message);
    }
  }
}
testAll();
