/* One-time migration: copy documents from the legacy GitHub Gist store
   into Neon Postgres (metadata) + S3 object storage (content),
   assigning each document to one of the 8 module folders.

   Required env vars (DO NOT commit them to git):
     DATABASE_URL, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID,
     AWS_SECRET_ACCESS_KEY, AWS_REGION (optional), S3_BUCKET (optional),
     GIST_ID (optional, defaults to the legacy docs gist)

   Run from the Arsenal-Tools directory:
     DATABASE_URL="..." AWS_ENDPOINT_URL_S3="..." AWS_ACCESS_KEY_ID="..." \
     AWS_SECRET_ACCESS_KEY="..." node scripts/migrate-gist-to-neon.mjs
*/
import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ensureSchema } from '../api/_lib/store.js';

const GIST_ID = process.env.GIST_ID || '043ce17207941f0480d17bfa7a4f8376';
const BUCKET = process.env.S3_BUCKET || 'md-reader-docs';

/* Verified classification of the 26 legacy documents (by gist doc id). */
const FOLDER_BY_ID = {
  // EC3301 Analog Electronics (P4)
  e2e7764c: 'mod-ec3301', '145f0aa0': 'mod-ec3301', '528442fa': 'mod-ec3301',
  '5115df85': 'mod-ec3301', '711c229f': 'mod-ec3301', bc352e6e: 'mod-ec3301',
  d3e7dd7a: 'mod-ec3301', '6d6b099c': 'mod-ec3301',
  // EC3202 Data Structures and Algorithms (P5)
  cfa0a6cc: 'mod-ec3202', '6a0496c0': 'mod-ec3202', '456b66b3': 'mod-ec3202',
  '58beb403': 'mod-ec3202', '9658be71': 'mod-ec3202', '2ae23cea': 'mod-ec3202',
  b1804b01: 'mod-ec3202', '88a3e168': 'mod-ec3202', '1b6d0fba': 'mod-ec3202',
  // EC3305 Signals and Systems (P1)
  '5795c79d': 'mod-ec3305', '564ab6bc': 'mod-ec3305', '9f03ec59': 'mod-ec3305',
  // IS3301 Complex Analysis and Mathematical Transforms (P2)
  '1fbb4ca1': 'mod-is3301', '803ee84c': 'mod-is3301',
  // IS3321 Fundamentals of Management for Engineers (P6)
  '232429ed': 'mod-is3321', '1f3f164b': 'mod-is3321', '1b4448c7': 'mod-is3321',
  '3dfe6df7': 'mod-is3321',
};

function guessFolder(doc) {
  const hay = `${doc.title || ''}\n${(doc.content || '').slice(0, 800)}`.toLowerCase();
  if (/ee\s?3301|analog|rectifier|clipper|zener|diode|power suppl/.test(hay)) return 'mod-ec3301';
  if (/data structure|linked list|hash table|binary search tree|\bbst\b|stacks? and queues?|\bc\+\+ memory/.test(hay)) return 'mod-ec3202';
  if (/signals and systems|continuous and discrete|periodicity/.test(hay)) return 'mod-ec3305';
  if (/complex (function|analysis)|conformal mapping|real function & sequence/.test(hay)) return 'mod-is3301';
  if (/management|organizational|strategic management|industrial revolution/.test(hay)) return 'mod-is3321';
  if (/gui programming|measurement/.test(hay)) return null;
  return null;
}

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const sql = neon(process.env.DATABASE_URL);

await ensureSchema(sql);
console.log('Schema ready (tables + 8 module folders).');

const gistRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  headers: { 'User-Agent': 'Arsenal-Tools' },
});
if (!gistRes.ok) throw new Error(`Gist fetch failed: ${gistRes.status}`);
const gist = await gistRes.json();
const docs = JSON.parse(gist.files?.['docs.json']?.content || '[]');
console.log(`Found ${docs.length} legacy documents in gist.`);

let migrated = 0;
for (const doc of docs) {
  const content = doc.content || '';
  const prefix = String(doc.id || '').slice(0, 8);
  const folderId = FOLDER_BY_ID[prefix] || guessFolder(doc) || null;
  const preview = content.slice(0, 150);
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `docs/${doc.id}.md`,
    Body: content,
    ContentType: 'text/markdown; charset=utf-8',
  }));

  await sql.query(
    `INSERT INTO documents (id, title, folder_id, s3_key, preview, word_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, folder_id = EXCLUDED.folder_id,
       s3_key = EXCLUDED.s3_key, preview = EXCLUDED.preview,
       word_count = EXCLUDED.word_count, updated_at = EXCLUDED.updated_at`,
    [
      doc.id,
      doc.title || 'Untitled',
      folderId,
      `docs/${doc.id}.md`,
      preview,
      wordCount,
      doc.created_at || new Date().toISOString(),
      doc.updated_at || new Date().toISOString(),
    ]
  );
  migrated++;
  console.log(`  [${migrated}/${docs.length}] ${folderId || 'unfiled'} :: ${(doc.title || '').slice(0, 60)}`);
}

console.log(`Done. Migrated ${migrated} documents into Neon + S3 bucket "${BUCKET}".`);
