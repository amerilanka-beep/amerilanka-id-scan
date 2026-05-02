import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4173);
const root = process.cwd();
const openAiApiKey = process.env.OPENAI_API_KEY || "";
const openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/extract") {
      await handleExtract(request, response);
      return;
    }

    const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = normalize(join(root, requestedPath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`AmeriLanka ID Scan running at http://localhost:${port}`);
});

async function handleExtract(request, response) {
  if (!openAiApiKey) {
    sendJson(response, 503, {
      error: "OpenAI API key is not set. Using browser OCR fallback.",
    });
    return;
  }

  const body = await readJsonBody(request, 12 * 1024 * 1024);
  if (!body?.imageData || !String(body.imageData).startsWith("data:image/")) {
    sendJson(response, 400, { error: "Missing image data." });
    return;
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
                "Extract identity document/passport data from this image.",
                "Return only JSON. Use the visible fields and MRZ/passport code lines to verify.",
                "If a field is not readable or conflicts, use an empty string and add a warning.",
                "Required JSON keys in this exact order: surname, givenNames, birthDate, gender, nationality, expirationDate, warning.",
                "Dates must be YYYY-MM-DD when possible. gender should be Male, Female, or Unspecified.",
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
    sendJson(response, apiResponse.status, {
      error: payload.error?.message || "OpenAI extraction failed.",
    });
    return;
  }

  const text = getResponseText(payload);
  const extracted = JSON.parse(text);
  sendJson(response, 200, {
    data: normalizeExtractedData(extracted),
    model: openAiModel,
  });
}

function readJsonBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request is too large."));
        request.destroy();
        return;
      }
      raw += chunk;
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
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

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}
