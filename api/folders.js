import {
  getSql,
  ensureSchema,
  setCors,
  getIdFromReq,
  readJsonBody,
} from './_lib/store.js';

/* ------------------------------------------------------------------
   /api/folders — folder CRUD backed by Neon Postgres.

   GET    /api/folders       -> [{id, code, name, period, doc_count, created_at}]
   POST   /api/folders       -> {name, code?, period?}
   PUT    /api/folders/:id   -> {name?, code?, period?}
   DELETE /api/folders/:id   -> deletes folder; its docs become Unfiled
------------------------------------------------------------------- */

function toFolder(row) {
  return {
    id: row.id,
    code: row.code || null,
    name: row.name,
    period: row.period || null,
    doc_count: Number(row.doc_count || 0),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
  };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = getIdFromReq(req);

  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (id) {
      if (req.method === 'PUT') {
        const body = readJsonBody(req);
        const rows = await sql.query(`SELECT * FROM folders WHERE id = $1`, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
        const updated = await sql.query(
          `UPDATE folders SET
             name = COALESCE($1, name),
             code = COALESCE($2, code),
             period = COALESCE($3, period)
           WHERE id = $4 RETURNING *`,
          [
            body.name !== undefined ? body.name : null,
            body.code !== undefined ? body.code : null,
            body.period !== undefined ? body.period : null,
            id,
          ]
        );
        const count = await sql.query(`SELECT COUNT(*) AS c FROM documents WHERE folder_id = $1`, [id]);
        return res.status(200).json(toFolder({ ...updated[0], doc_count: count[0].c }));
      }

      if (req.method === 'DELETE') {
        const rows = await sql.query(`SELECT * FROM folders WHERE id = $1`, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
        // Keep the documents — they become Unfiled instead of being destroyed.
        await sql.query(`UPDATE documents SET folder_id = NULL WHERE folder_id = $1`, [id]);
        await sql.query(`DELETE FROM folders WHERE id = $1`, [id]);
        return res.status(200).json({ status: 'deleted', id });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.method === 'GET') {
      const rows = await sql.query(
        `SELECT f.*, (SELECT COUNT(*) FROM documents d WHERE d.folder_id = f.id) AS doc_count
         FROM folders f ORDER BY f.period NULLS LAST, f.code NULLS LAST, f.name`,
        []
      );
      return res.status(200).json(rows.map(toFolder));
    }

    if (req.method === 'POST') {
      const body = readJsonBody(req);
      const name = (body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Folder name is required' });
      const inserted = await sql.query(
        `INSERT INTO folders (id, code, name, period) VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          crypto.randomUUID(),
          body.code ? String(body.code).trim() || null : null,
          name,
          body.period ? String(body.period).trim() || null : null,
        ]
      );
      return res.status(201).json(toFolder({ ...inserted[0], doc_count: 0 }));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Folders API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
