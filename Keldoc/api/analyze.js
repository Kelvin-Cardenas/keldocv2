export const config = {
  runtime: 'edge'
};

export default async function handler(req) {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  // Only POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed'
      }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  try {

    const body = await req.json();

    const {
      system,
      messages
    } = body;

    if (!system || !messages) {
      return new Response(
        JSON.stringify({
          error: 'Missing system or messages'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    const userMessage =
      messages?.[0]?.content || '';

    const prompt = `
${system}

Analiza la siguiente información:

${userMessage}

IMPORTANTE:
- Responde únicamente JSON válido.
- No utilices markdown.
- No utilices bloques de código.
- No agregues texto antes ni después del JSON.
`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
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
            temperature: 0.3,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const responseText = await response.text();

    if (!response.ok) {

      return new Response(
        JSON.stringify({
          error: 'Gemini API error',
          details: responseText
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    const geminiData = JSON.parse(responseText);

    const text =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {

      return new Response(
        JSON.stringify({
          error: 'Gemini returned an empty response'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    /*
     * Adaptamos la respuesta de Gemini
     * al formato que actualmente espera tu frontend.
     */

    const result = {
      content: [
        {
          type: 'text',
          text: text
        }
      ]
    };

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (err) {

    console.error(err);

    return new Response(
      JSON.stringify({
        error: String(err.message || err)
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
