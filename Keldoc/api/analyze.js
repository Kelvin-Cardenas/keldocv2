export const config = {
  runtime: 'edge'
};

export default async function handler(req) {

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed'
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'GEMINI_API_KEY is not configured'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  try {

    const body = await req.json();

    const system = body?.system || '';

    const messages = Array.isArray(body?.messages)
      ? body.messages
      : [];

    const userMessage =
      messages?.[0]?.content || '';

    if (!userMessage) {
      return new Response(
        JSON.stringify({
          error: 'Missing user message'
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const prompt = `
${system}

${userMessage}

IMPORTANTE:

- Responde únicamente con JSON válido.
- No uses Markdown.
- No uses bloques de código.
- No agregues explicaciones antes ni después del JSON.
- Respeta exactamente la estructura JSON solicitada.
`;

    console.log('Calling Gemini...');

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 25000);

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
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
        }),

        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    const responseText = await response.text();

    console.log(
      'Gemini HTTP status:',
      response.status
    );

    if (!response.ok) {

      return new Response(
        JSON.stringify({
          error: 'Gemini API error',
          details: responseText
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const data = JSON.parse(responseText);

    let text =
      data?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;

    if (!text) {

      return new Response(
        JSON.stringify({
          error: 'Gemini returned empty response'
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    console.log('Gemini response received');

    // Eliminar Markdown si Gemini lo agrega
    text = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Validar JSON
    let parsed;

    try {

      parsed = JSON.parse(text);

    } catch (error) {

      console.error(
        'Invalid JSON from Gemini:',
        text
      );

      return new Response(
        JSON.stringify({
          error: 'Gemini returned invalid JSON',
          raw: text
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Mantener formato compatible
    // con tu frontend actual
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify(parsed)
        }
      ]
    };

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {

    console.error(
      'Analyze error:',
      error
    );

    if (error?.name === 'AbortError') {

      return new Response(
        JSON.stringify({
          error: 'Gemini request timeout'
        }),
        {
          status: 504,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error?.message || String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
