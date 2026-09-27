import {
  getSql,
  ensureSchema,
  folderExists,
  putContent,
  getContent,
  deleteContent,
  summarize,
  toListing,
  setCors,
  getIdFromReq,
  readJsonBody,
} from './_lib/store.js';

/* ------------------------------------------------------------------
   /api/docs — Markdown document CRUD backed by Neon Postgres
   (metadata) + S3-compatible object storage (markdown content).

   GET    /api/docs            -> metadata listing [{id,title,folder_id,preview,word_count,...}]
   GET    /api/docs/:id        -> full document {… , content}
   POST   /api/docs            -> {id?, title, content, folder_id?, new_folder_name?}
                                  Creates `new_folder_name` folder when supplied.
                                  Reuses client-supplied id (idempotent).
   PUT    /api/docs/:id        -> {title?, content?, folder_id?}
   DELETE /api/docs/:id        -> deletes DB row + S3 object
------------------------------------------------------------------- */

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = getIdFromReq(req);

  try {
    const sql = getSql();
    await ensureSchema(sql);

    /* ---------- Single document ---------- */
    if (id) {
      if (req.method === 'GET') {
        const rows = await sql.query(`SELECT * FROM documents WHERE id = $1`, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        const content = await getContent(id);
        return res.status(200).json({ ...toListing(rows[0]), content });
      }

      if (req.method === 'PUT') {
        const body = readJsonBody(req);
        const rows = await sql.query(`SELECT * FROM documents WHERE id = $1`, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });

        let folderId = rows[0].folder_id;
        if (body.folder_id !== undefined) {
          if (body.folder_id && !(await folderExists(sql, body.folder_id))) {
            return res.status(400).json({ error: 'Folder not found' });
          }
          folderId = body.folder_id || null;
        }

        const title = body.title !== undefined ? body.title : rows[0].title;
        let preview = rows[0].preview;
        let wordCount = rows[0].word_count;
        if (body.content !== undefined) {
          await putContent(id, body.content);
          const s = summarize(body.content);
          preview = s.preview;
          wordCount = s.word_count;
        }

        const updated = await sql.query(
          `UPDATE documents SET title = $1, folder_id = $2, preview = $3,
            word_count = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
          [title, folderId, preview, wordCount, id]
        );
        const content = body.content !== undefined ? body.content : await getContent(id);
        return res.status(200).json({ ...toListing(updated[0]), content });
      }

      if (req.method === 'DELETE') {
        const rows = await sql.query(`SELECT id FROM documents WHERE id = $1`, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        await sql.query(`DELETE FROM documents WHERE id = $1`, [id]);
        await deleteContent(id);
        return res.status(200).json({ status: 'deleted', id });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    /* ---------- Collection ---------- */
    if (req.method === 'GET') {
      const rows = await sql.query(
        `SELECT * FROM documents ORDER BY updated_at DESC`,
        []
      );
      return res.status(200).json(rows.map(toListing));
    }

    if (req.method === 'POST') {
      const body = readJsonBody(req);
      const content = body.content || '';
      const title = body.title || 'Untitled';
      const now = new Date().toISOString();

      // Resolve target folder: create a new one on the fly when requested.
      let folderId = body.folder_id || null;
      if (body.new_folder_name && body.new_folder_name.trim()) {
        const name = body.new_folder_name.trim();
        const created = await sql.query(
          `INSERT INTO folders (id, name) VALUES ($1, $2) RETURNING id`,
          [crypto.randomUUID(), name]
        );
        folderId = created[0].id;
      } else if (folderId && !(await folderExists(sql, folderId))) {
        return res.status(400).json({ error: 'Folder not found' });
      }

      const { preview, word_count } = summarize(content);

      // Idempotent: reuse client-supplied id so retries never duplicate.
      const providedId = typeof body.id === 'string' && body.id ? body.id : null;
      if (providedId) {
        const existing = await sql.query(`SELECT * FROM documents WHERE id = $1`, [providedId]);
        if (existing.length > 0) {
          await putContent(providedId, content);
          const updated = await sql.query(
            `UPDATE documents SET title = $1, folder_id = $2, preview = $3,
              word_count = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
            [title, folderId ?? existing[0].folder_id, preview, word_count, providedId]
          );
          return res.status(200).json({ ...toListing(updated[0]), content });
        }
      }

      const newId = providedId || crypto.randomUUID();
      const key = `docs/${newId}.md`;
      await putContent(newId, content);
      const inserted = await sql.query(
        `INSERT INTO documents (id, title, folder_id, s3_key, preview, word_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
        [newId, title, folderId, key, preview, word_count, now]
      );
      return res.status(201).json({ ...toListing(inserted[0]), content });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Docs API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
