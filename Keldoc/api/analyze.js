export default async function handler(req, res) {

  // =========================
  // CORS
  // =========================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY no está configurada'
      });
    }

    const body = req.body || {};

    const system = body.system || '';

    const messages = Array.isArray(body.messages)
      ? body.messages
      : [];

    const userMessage =
      messages?.[0]?.content || '';

    if (!userMessage) {
      return res.status(400).json({
        error: 'No se recibió el mensaje'
      });
    }

    // =========================
    // PROMPT
    // =========================

    const prompt = `
${system}

${userMessage}

IMPORTANTE:

- Responde únicamente con JSON válido.
- No utilices Markdown.
- No utilices bloques de código.
- No agregues texto antes ni después del JSON.
- Respeta exactamente la estructura JSON solicitada.
`;

    console.log('Enviando solicitud a Gemini...');

    // =========================
    // GEMINI
    // =========================

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },

        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const responseText = await response.text();

    console.log(
      'Gemini status:',
      response.status
    );

    // =========================
    // ERROR GEMINI
    // =========================

    if (!response.ok) {

      console.error(
        'Gemini error:',
        responseText
      );

      return res.status(response.status).json({
        error: 'Gemini API error',
        details: responseText
      });
    }

    // =========================
    // PROCESAR RESPUESTA
    // =========================

    const data = JSON.parse(responseText);

    let text =
      data?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;

    if (!text) {

      return res.status(502).json({
        error: 'Gemini devolvió una respuesta vacía'
      });
    }

    console.log('Respuesta recibida de Gemini');

    // Quitar Markdown
    text = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // =========================
    // VALIDAR JSON
    // =========================

    let parsed;

    try {

      parsed = JSON.parse(text);

    } catch (error) {

      console.error(
        'JSON inválido:',
        text
      );

      return res.status(502).json({
        error: 'Gemini devolvió JSON inválido',
        raw: text
      });
    }

    // =========================
    // RESPUESTA COMPATIBLE
    // CON TU FRONTEND
    // =========================

    return res.status(200).json({

      content: [
        {
          type: 'text',
          text: JSON.stringify(parsed)
        }
      ]

    });

  } catch (error) {

    console.error(
      'ERROR ANALYZE:',
      error
    );

    return res.status(500).json({
      error: 'Error interno',
      details: error?.message || String(error)
    });
  }
}
