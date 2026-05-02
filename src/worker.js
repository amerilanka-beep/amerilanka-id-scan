export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/extract") {
      return handleExtract(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleExtract(request, env) {
  try {
    const openAiApiKey = env.OPENAI_API_KEY;
    const openAiModel = env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!openAiApiKey) {
      return sendJson({ error: "OpenAI API key is not set." }, 503);
    }

    const body = await request.json();
    if (!body?.imageData || !String(body.imageData).startsWith("data:image/")) {
      return sendJson({ error: "Missing image data." }, 400);
    }

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Extract passport or identity document data from this image.",
                  "Use visible fields and MRZ/passport code lines to verify each value.",
                  "Return only JSON. If a value is unclear or conflicts, use an empty string and explain in warning.",
                  "Required JSON keys in this exact order: surname, givenNames, birthDate, gender, nationality, expirationDate, warning.",
                  "Dates must be YYYY-MM-DD when possible. gender must be Male, Female, or Unspecified.",
                ].join(" "),
              },
              {
                type: "input_image",
                image_url: body.imageData,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "passport_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                surname: { type: "string" },
                givenNames: { type: "string" },
                birthDate: { type: "string" },
                gender: { type: "string" },
                nationality: { type: "string" },
                expirationDate: { type: "string" },
                warning: { type: "string" },
              },
              required: ["surname", "givenNames", "birthDate", "gender", "nationality", "expirationDate", "warning"],
            },
          },
        },
      }),
    });

    const payload = await apiResponse.json();
    if (!apiResponse.ok) {
      return sendJson({ error: payload.error?.message || "OpenAI extraction failed." }, apiResponse.status);
    }

    const extracted = JSON.parse(getResponseText(payload));
    return sendJson({
      data: normalizeExtractedData(extracted),
      model: openAiModel,
    });
  } catch (error) {
    return sendJson({ error: error.message || "Could not extract data." }, 500);
  }
}

function getResponseText(payload) {
  if (payload.output_text) return payload.output_text;
  const messages = payload.output || [];
  for (const message of messages) {
    for (const content of message.content || []) {
      if (content.text) return content.text;
    }
  }
  throw new Error("OpenAI returned no text.");
}

function normalizeExtractedData(data) {
  return {
    surname: String(data.surname || "").trim(),
    givenNames: String(data.givenNames || "").trim(),
    birthDate: String(data.birthDate || "").trim(),
    gender: String(data.gender || "").trim(),
    nationality: String(data.nationality || "").trim(),
    expirationDate: String(data.expirationDate || "").trim(),
    warning: String(data.warning || "Check every field against the document before saving.").trim(),
  };
}

function sendJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
