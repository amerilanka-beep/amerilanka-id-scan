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
    if (env.MINDEE_API_KEY) {
      return handleMindeeExtract(request, env);
    }

    const openAiApiKey = env.OPENAI_API_KEY;
    const openAiModel = env.OPENAI_MODEL || "gpt-4.1";

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
                  "Extract passport or identity document data from this image for travel office data entry.",
                  "Important: prioritize the visible passport fields, not the MRZ. Sri Lankan names can be long and the MRZ may compress, truncate, or split them.",
                  "The task is OCR and exact data extraction from the printed passport fields. Read carefully at high detail.",
                  "Read Surname and Given names/Other names from the printed visible field labels on the passport page.",
                  "Use the MRZ/passport code lines only as a secondary backup for dates, nationality, gender, and to cross-check names. Do not replace a longer visible name with a shorter MRZ version.",
                  "Names may contain multiple words and long Sri Lankan name parts. Preserve the full visible spelling and spacing as much as possible.",
                  "Do not leave name fields blank if there is readable visible-field evidence. Give the best possible reading from the visible fields.",
                  "If a name is blurry, partly hidden, or conflicts with MRZ, still return your best visible-field reading and explain the uncertainty in warning.",
                  "If the image is too blurry to read, say so in warning, but still return the best visible reading you can support.",
                  "Do not output document numbers, issue dates, addresses, places of birth, authority, or any extra fields.",
                  "Return only JSON. If any value is unclear or conflicts, return the best likely value and explain in warning.",
                  "Required JSON keys in this exact order: surname, givenNames, birthDate, gender, nationality, expirationDate, warning.",
                  "Dates must be YYYY-MM-DD when possible. gender must be Male, Female, or Unspecified.",
                ].join(" "),
              },
              {
                type: "input_image",
                image_url: body.imageData,
                detail: "high",
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
      provider: "openai",
      model: openAiModel,
    });
  } catch (error) {
    return sendJson({ error: error.message || "Could not extract data." }, 500);
  }
}

async function handleMindeeExtract(request, env) {
  const body = await request.json();
  if (!body?.imageData || !String(body.imageData).startsWith("data:image/")) {
    return sendJson({ error: "Missing image data." }, 400);
  }

  const { blob, filename } = dataUrlToBlob(body.imageData);
  const formData = new FormData();
  formData.append("document", blob, filename);

  const apiResponse = await fetch("https://api.mindee.net/v1/products/mindee/passport/v1/predict", {
    method: "POST",
    headers: {
      "Authorization": `Token ${env.MINDEE_API_KEY}`,
    },
    body: formData,
  });

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    return sendJson({ error: payload.api_request?.error?.message || payload.error || "Mindee extraction failed." }, apiResponse.status);
  }

  return sendJson({
    data: normalizeMindeePassport(payload),
    provider: "mindee",
    model: "passport-v1",
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/^data:(.+);base64$/)?.[1] || "image/jpeg";
  const extension = mime.includes("png") ? "png" : "jpg";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    blob: new Blob([bytes], { type: mime }),
    filename: `passport.${extension}`,
  };
}

function normalizeMindeePassport(payload) {
  const prediction = payload.document?.inference?.prediction || {};
  const surname = fieldValue(prediction, ["surnames", "surname"]);
  const givenNames = fieldValue(prediction, ["given_names", "givenNames", "given_names_1"]);
  const birthDate = fieldValue(prediction, ["date_of_birth", "birth_date", "birthDate"]);
  const gender = normalizeGender(fieldValue(prediction, ["sex", "gender"]));
  const nationality = fieldValue(prediction, ["nationality", "country"]);
  const expirationDate = fieldValue(prediction, ["date_of_expiry", "expiry_date", "expiration_date", "expirationDate"]);
  const lowConfidence = confidenceWarnings(prediction, {
    surnames: "surname",
    given_names: "given names",
    date_of_birth: "birth date",
    sex: "gender",
    nationality: "nationality",
    date_of_expiry: "expiration date",
  });

  return {
    surname,
    givenNames,
    birthDate,
    gender,
    nationality,
    expirationDate,
    warning: lowConfidence || "Mindee Passport OCR result. Check every field against the document before saving.",
  };
}

function fieldValue(prediction, keys) {
  for (const key of keys) {
    const field = prediction[key];
    const value = extractValue(field);
    if (value) return value;
  }
  return "";
}

function extractValue(field) {
  if (!field) return "";
  if (typeof field === "string") return field.trim();
  if (Array.isArray(field)) return field.map(extractValue).filter(Boolean).join(" ");
  if (Array.isArray(field.values)) return field.values.map(extractValue).filter(Boolean).join(" ");
  if (field.value !== undefined && field.value !== null) return String(field.value).trim();
  if (field.raw_value !== undefined && field.raw_value !== null) return String(field.raw_value).trim();
  return "";
}

function confidenceWarnings(prediction, fieldLabels) {
  const weak = [];
  for (const [key, label] of Object.entries(fieldLabels)) {
    const confidence = prediction[key]?.confidence;
    if (typeof confidence === "number" && confidence < 0.8) {
      weak.push(label);
    }
  }
  if (!weak.length) return "";
  return `Mindee marked these fields lower confidence: ${weak.join(", ")}. Check every field before saving.`;
}

function normalizeGender(value) {
  const gender = String(value || "").trim().toUpperCase();
  if (gender === "M" || gender === "MALE") return "Male";
  if (gender === "F" || gender === "FEMALE") return "Female";
  if (gender === "X" || gender === "OTHER" || gender === "UNSPECIFIED") return "Unspecified";
  return value || "";
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
