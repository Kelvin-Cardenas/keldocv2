export const config = {
  runtime: 'edge'
};

export default async function handler(req) {

  // ==============================
  // CORS
  // ==============================
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Solo POST
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

  // ==============================
  // Verificar API KEY
  // ==============================
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'GEMINI_API_KEY is not configured in Vercel'
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

    // ==============================
    // Leer request
    // ==============================
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

    // ==============================
    // Construir prompt
    // ==============================
    const prompt = `
${system}

${userMessage}

INSTRUCCIONES IMPORTANTES:

1. Responde únicamente con JSON válido.
2. No utilices Markdown.
3. No utilices bloques de código.
4. No agregues texto antes ni después del JSON.
5. Respeta exactamente la estructura JSON solicitada por el usuario.
6. No inventes información que no esté disponible.
`;

    // ==============================
    // Modelos de respaldo
    // ==============================
    const models = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite'
    ];

    let lastError = null;

    // ==============================
    // Intentar modelos
    // ==============================
    for (const model of models) {

      try {

        console.log(`Trying Gemini model: ${model}`);

        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const response = await fetch(url, {
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
              temperature: 0.3,
              maxOutputTokens: 1200,
              responseMimeType: 'application/json'
            }

          })
        });

        const responseText = await response.text();

        // ==============================
        // Gemini respondió correctamente
        // ==============================
        if (response.ok) {

          const data = JSON.parse(responseText);

          const text =
            data?.candidates?.[0]
              ?.content?.parts?.[0]
              ?.text;

          if (!text) {

            lastError =
              `Gemini ${model} returned an empty response`;

            continue;
          }

          console.log(
            `Gemini success using model: ${model}`
          );

          // ==============================
          // IMPORTANTE:
          // mantenemos formato Anthropic
          // para que tu frontend actual
          // no tenga que cambiar.
          // ==============================
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
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            }
          );
        }

        // ==============================
        // Gemini dio error
        // ==============================
        console.error(
          `Gemini ${model} failed:`,
          response.status,
          responseText
        );

        lastError =
          `Gemini ${model} HTTP ${response.status}: ${responseText}`;

        // ==============================
        // Si es 503 o 429,
        // probamos otro modelo
        // ==============================
        if (
          response.status === 503 ||
          response.status === 429
        ) {
          continue;
        }

        // ==============================
        // Si es 404, también probamos
        // otro modelo.
        // ==============================
        if (response.status === 404) {
          continue;
        }

        // Otros errores
        break;

      } catch (error) {

        console.error(
          `Error using Gemini ${model}:`,
          error
        );

        lastError =
          error?.message || String(error);

        continue;
      }
    }

    // ==============================
    // Todos los modelos fallaron
    // ==============================
    return new Response(
      JSON.stringify({
        error: 'All Gemini models failed',
        details: lastError
      }),
      {
        status: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {

    console.error(
      'API analyze error:',
      error
    );

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
