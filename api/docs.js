const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID || '043ce17207941f0480d17bfa7a4f8376';
const GIST_FILE = 'docs.json';

async function readDocs() {
  if (!GITHUB_TOKEN || !GIST_ID) {
    throw new Error('Storage credentials not configured');
  }

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Arsenal-Tools',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Gist API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const raw = data.files?.[GIST_FILE]?.content || '[]';
  return JSON.parse(raw);
}

async function writeDocs(docs) {
  if (!GITHUB_TOKEN || !GIST_ID) {
    throw new Error('Storage credentials not configured');
  }

  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Arsenal-Tools',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILE]: {
          content: JSON.stringify(docs, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Gist write error (${res.status}): ${errText}`);
  }

  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract ID from query param or from req.url
  let id = req.query?.id;
  if (!id && req.url) {
    const cleanUrl = req.url.split('?')[0];
    const match = cleanUrl.match(/\/api\/docs\/([^/]+)/);
    if (match) {
      id = match[1];
    }
  }

  try {
    const docs = await readDocs();

    // Single document operations
    if (id) {
      const docIndex = docs.findIndex(d => d.id === id);

      if (req.method === 'GET') {
        if (docIndex === -1) {
          return res.status(404).json({ error: 'Document not found' });
        }
        return res.status(200).json(docs[docIndex]);
      }

      if (req.method === 'PUT') {
        if (docIndex === -1) {
          return res.status(404).json({ error: 'Document not found' });
        }
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (body?.title !== undefined) docs[docIndex].title = body.title;
        if (body?.content !== undefined) docs[docIndex].content = body.content;
        docs[docIndex].updated_at = new Date().toISOString();

        await writeDocs(docs);
        return res.status(200).json(docs[docIndex]);
      }

      if (req.method === 'DELETE') {
        if (docIndex === -1) {
          return res.status(404).json({ error: 'Document not found' });
        }
        docs.splice(docIndex, 1);
        await writeDocs(docs);
        return res.status(200).json({ status: 'deleted', id });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Collection operations (/api/docs)
    if (req.method === 'GET') {
      const listing = docs.map(d => ({
        id: d.id,
        title: d.title,
        preview: (d.content || '').slice(0, 150),
        word_count: (d.content || '').trim().split(/\s+/).filter(Boolean).length,
        created_at: d.created_at || '',
        updated_at: d.updated_at || '',
      }));
      return res.status(200).json(listing);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const title = body?.title || 'Untitled';
      const content = body?.content || '';
      const now = new Date().toISOString();
      const newDoc = {
        id: crypto.randomUUID(),
        title,
        content,
        created_at: now,
        updated_at: now,
      };

      docs.unshift(newDoc);
      await writeDocs(docs);
      return res.status(201).json(newDoc);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Docs API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
