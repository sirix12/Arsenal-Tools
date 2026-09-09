function validQuestion(question) {
  return question
    && typeof question.question === 'string'
    && Array.isArray(question.options)
    && question.options.length >= 2
    && typeof question.correctAnswer === 'string'
    && question.options.includes(question.correctAnswer)
    && typeof question.explanation === 'string';
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const source = request.body?.source;
  if (typeof source !== 'string' || !source.trim()) {
    return response.status(400).json({ error: 'Quiz text is required' });
  }
  if (source.length > 100_000) {
    return response.status(413).json({ error: 'Quiz text must not exceed 100,000 characters' });
  }

  const { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT } = process.env;
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_DEPLOYMENT) {
    return response.status(503).json({ error: 'Quiz conversion is not configured' });
  }

  try {
    const azureResponse = await fetch(
      `${AZURE_OPENAI_ENDPOINT.replace(/\/$/, '')}/openai/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'api-key': AZURE_OPENAI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AZURE_OPENAI_DEPLOYMENT,
          stream: true,
          reasoning_effort: 'minimal',
          max_completion_tokens: 16000,
          messages: [
            {
              role: 'system',
              content: 'Convert the pasted quiz into JSON Lines. Return exactly one complete JSON object per line, with no Markdown or other text. Each object must contain question, code, language, options, correctAnswer, and explanation. Use empty strings for code and language when they do not apply. Each correctAnswer must exactly match an option. Preserve every question from the input, including quizzes with up to 50 questions. Correct damaged copied mathematical notation instead of preserving it literally: use Unicode superscripts and × for multiplication. In graph-complexity questions, rewrite O(V2) as O(V²), O(E2) as O(E²), V×V=V2 as V×V = V², and duplicated raised/base text such as V V as V² when context indicates a power.',
            },
            { role: 'user', content: source },
          ],
        }),
      },
    );
    if (!azureResponse.ok || !azureResponse.body) {
      return response.status(502).json({ error: 'Quiz conversion service rejected the request' });
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
    });

    const decoder = new TextDecoder();
    let azureBuffer = '';
    let quizBuffer = '';
    const send = event => response.write(`data: ${JSON.stringify(event)}\n\n`);
    const emittedQuestions = new Set();
    const emitQuestionObjects = () => {
      const starts = [];
      let inString = false;
      let escaping = false;

      for (let index = 0; index < quizBuffer.length; index++) {
        const character = quizBuffer[index];
        if (inString) {
          if (escaping) escaping = false;
          else if (character === '\\') escaping = true;
          else if (character === '"') inString = false;
          continue;
        }
        if (character === '"') {
          inString = true;
        } else if (character === '{') {
          starts.push(index);
        } else if (character === '}' && starts.length) {
          const object = quizBuffer.slice(starts.pop(), index + 1);
          try {
            const question = JSON.parse(object);
            const key = JSON.stringify(question);
            if (validQuestion(question) && !emittedQuestions.has(key)) {
              emittedQuestions.add(key);
              send({ type: 'question', question });
            }
          } catch {
            // Ignore malformed model objects and continue receiving later output.
          }
        }
      }
    };

    for await (const chunk of azureResponse.body) {
      azureBuffer += decoder.decode(chunk, { stream: true });
      const lines = azureBuffer.split('\n');
      azureBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          quizBuffer += JSON.parse(data).choices?.[0]?.delta?.content ?? '';
          emitQuestionObjects();
        } catch {
          // Ignore non-content Azure stream events.
        }
      }
    }

    emitQuestionObjects();
    send({ type: 'complete' });
    response.end();
  } catch {
    if (response.headersSent) {
      response.write(`data: ${JSON.stringify({ type: 'error', error: 'Quiz generation failed' })}\n\n`);
      return response.end();
    }
    return response.status(502).json({ error: 'Quiz generation failed' });
  }
}
