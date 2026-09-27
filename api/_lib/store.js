import { neon } from '@neondatabase/serverless';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

/* ------------------------------------------------------------------
   Shared Neon Postgres + S3 object-storage backend for MD Reader docs.
   All credentials come from environment variables (never hardcode):

     DATABASE_URL            Neon Postgres connection string
     AWS_ENDPOINT_URL_S3     S3-compatible endpoint (Neon storage)
     AWS_ACCESS_KEY_ID       Storage credential key ID
     AWS_SECRET_ACCESS_KEY   Storage credential secret
     AWS_REGION              e.g. us-east-2
     S3_BUCKET               Bucket for markdown content (default: md-reader-docs)
------------------------------------------------------------------- */

export const BUCKET = process.env.S3_BUCKET || 'md-reader-docs';

/* Fixed module folders (seeded on first use). Displayed as
   "<code>: <name>" with the period shown as a badge. */
export const MODULE_FOLDERS = [
  { id: 'mod-ec3305', code: 'EC3305', name: 'Signals and Systems', period: 'P1' },
  { id: 'mod-is3301', code: 'IS3301', name: 'Complex Analysis and Mathematical Transforms', period: 'P2' },
  { id: 'mod-ec3203', code: 'EC3203', name: 'Electrical and Electronic Measurements', period: 'P3' },
  { id: 'mod-ec3301', code: 'EC3301', name: 'Analog Electronics', period: 'P4' },
  { id: 'mod-ec3202', code: 'EC3202', name: 'Data Structures and Algorithms', period: 'P5' },
  { id: 'mod-is3321', code: 'IS3321', name: 'Fundamentals of Management for Engineers (GPA)', period: 'P6' },
  { id: 'mod-is3322', code: 'IS3322', name: 'Society and Engineer (NGPA)', period: 'P7' },
  { id: 'mod-ec3404', code: 'EC3404', name: 'GUI Programming', period: 'P8' },
];

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  return neon(process.env.DATABASE_URL);
}

let s3Client = null;
export function getS3() {
  if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('S3 storage credentials are not configured');
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-2',
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export const s3KeyForDoc = (id) => `docs/${id}.md`;

/* Create tables + seed the 8 module folders. Idempotent — safe to run
   on every API invocation. */
export async function ensureSchema(sql) {
  await sql.query(
    `CREATE TABLE IF NOT EXISTS folders (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       code TEXT,
       period TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    []
  );
  await sql.query(
    `CREATE TABLE IF NOT EXISTS documents (
       id TEXT PRIMARY KEY,
       title TEXT NOT NULL DEFAULT 'Untitled',
       folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
       s3_key TEXT NOT NULL,
       preview TEXT NOT NULL DEFAULT '',
       word_count INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    []
  );
  await sql.query(
    `CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)`,
    []
  );
  await sql.query(
    `CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC)`,
    []
  );
  for (const f of MODULE_FOLDERS) {
    await sql.query(
      `INSERT INTO folders (id, code, name, period) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [f.id, f.code, f.name, f.period]
    );
  }
}

export async function folderExists(sql, folderId) {
  if (!folderId) return false;
  const rows = await sql.query(`SELECT id FROM folders WHERE id = $1`, [folderId]);
  return rows.length > 0;
}

export async function putContent(id, content) {
  const s3 = getS3();
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3KeyForDoc(id),
      Body: content,
      ContentType: 'text/markdown; charset=utf-8',
    })
  );
}

export async function getContent(id) {
  const s3 = getS3();
  const res = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: s3KeyForDoc(id) })
  );
  return await res.Body.transformToString('utf-8');
}

export async function deleteContent(id) {
  const s3 = getS3();
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: s3KeyForDoc(id) })
  ).catch((e) => console.error('S3 delete failed (non-fatal):', e.message));
}

export function summarize(content) {
  const text = content || '';
  return {
    preview: text.slice(0, 150),
    word_count: text.trim().split(/\s+/).filter(Boolean).length,
  };
}

export function toListing(row) {
  return {
    id: row.id,
    title: row.title,
    folder_id: row.folder_id || null,
    preview: row.preview || '',
    word_count: Number(row.word_count || 0),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : '',
  };
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function getIdFromReq(req) {
  let id = req.query?.id;
  if (!id && req.url) {
    const cleanUrl = req.url.split('?')[0];
    const match = cleanUrl.match(/\/api\/(?:docs|folders)\/([^/]+)/);
    if (match) id = decodeURIComponent(match[1]);
  }
  return id || null;
}

export function readJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}
