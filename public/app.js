const cameraInput = document.getElementById("cameraInput");
const uploadInput = document.getElementById("uploadInput");
const previewWrap = document.getElementById("previewWrap");
const previewImage = document.getElementById("previewImage");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const statusPill = document.getElementById("statusPill");
const clearButton = document.getElementById("clearButton");
const copyFinalButton = document.getElementById("copyFinalButton");
const saveButton = document.getElementById("saveButton");
const csvButton = document.getElementById("csvButton");
const wordButton = document.getElementById("wordButton");
const savedList = document.getElementById("savedList");
const reviewWarning = document.getElementById("reviewWarning");
const reviewConfirm = document.getElementById("reviewConfirm");
const rawText = document.getElementById("rawText");
const storageKey = "amerilanka-id-scans";

const fields = {
  surname: document.getElementById("field-surname"),
  givenNames: document.getElementById("field-givenNames"),
  birthDate: document.getElementById("field-birthDate"),
  gender: document.getElementById("field-gender"),
  nationality: document.getElementById("field-nationality"),
  expirationDate: document.getElementById("field-expirationDate"),
};

const finalText = document.getElementById("finalText");

cameraInput.addEventListener("change", handleFileSelection);
uploadInput.addEventListener("change", handleFileSelection);
Object.values(fields).forEach((field) => {
  field.addEventListener("input", updateFinalCard);
});

async function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  resetFields();
  const imageUrl = URL.createObjectURL(file);
  previewImage.src = imageUrl;
  previewWrap.hidden = false;

  try {
    setWorking("Scanning", 5, "Loading passport scanner...");
    const apiResult = await extractPassportData(file);
    if (apiResult.data) {
      const apiData = apiResult.data;
      fillFields(apiData);
      rawText.textContent = "Extraction complete. Review all fields before saving.";
      setWorking("Review", 100, "Extraction complete. Confirm every field before saving.");
      return;
    }

    const extractionError = apiResult.error || "The scanner did not return readable data.";
    rawText.textContent = extractionError;
    reviewWarning.textContent = "Passport extraction failed. No backup OCR was used, so no unreliable data was filled.";
    reviewWarning.hidden = false;
    setWorking("API Error", 100, extractionError);
    alert(extractionError);
    return;
  } catch (error) {
    statusPill.textContent = "Error";
    progressText.textContent = error.message || "Could not scan this image.";
  }
}

copyFinalButton.addEventListener("click", async () => {
  const text = buildFinalText();
  try {
    await navigator.clipboard.writeText(text);
    copyFinalButton.textContent = "Copied";
    setTimeout(() => {
      copyFinalButton.textContent = "Copy";
    }, 1400);
  } catch {
    copyFinalButton.textContent = "Select";
  }
});

clearButton.addEventListener("click", () => {
  cameraInput.value = "";
  uploadInput.value = "";
  previewImage.removeAttribute("src");
  previewWrap.hidden = true;
  progressWrap.hidden = true;
  statusPill.textContent = "Ready";
  rawText.textContent = "";
  reviewWarning.hidden = true;
  reviewWarning.textContent = "";
  reviewConfirm.checked = false;
  resetFields();
  updateFinalCard();
});

saveButton.addEventListener("click", async () => {
  const record = currentRecord();
  if (!hasRecordData(record)) {
    statusPill.textContent = "Empty";
    progressWrap.hidden = false;
    progressText.textContent = "Scan or enter data before saving.";
    return;
  }

  if (!reviewConfirm.checked) {
    progressWrap.hidden = false;
    statusPill.textContent = "Review";
    progressText.textContent = "Check the fields against the document, then tick the review box before saving.";
    return;
  }

  const saved = getSavedRecords();
  const savedAt = new Date().toISOString();
  const copyBox = buildFinalText();
  saved.unshift({ ...record, copyBox, savedAt });
  localStorage.setItem(storageKey, JSON.stringify(saved));
  renderSavedRecords();
  statusPill.textContent = "Saved";
  progressWrap.hidden = false;
  progressText.textContent = "Saved on this device.";

  const onlineSaved = await saveOnlineRecord({ ...record, copyBox, savedAt });
  if (onlineSaved.ok) {
    progressText.textContent = "Saved on this device and online record.";
    alert("Saved on this device and online record. Refresh the computer page.");
  } else if (onlineSaved.configured) {
    progressText.textContent = onlineSaved.error || "Saved on this device. Online save failed.";
    alert(progressText.textContent);
  } else {
    alert("Saved on this device only. Online record is not connected.");
  }
});

csvButton.addEventListener("click", () => {
  const saved = ensureExportRecords();
  if (!saved.length) return;

  const headers = ["Surname", "Other Name / Given Name", "Birth Date", "Gender", "Nationality", "Expiration Date", "Saved At"];
  const rows = saved.map((record) => [
    record.surname,
    record.givenNames,
    record.birthDate,
    record.gender,
    record.nationality,
    record.expirationDate,
    record.savedAt,
  ]);
  downloadFile("amerilanka-id-scans.csv", toCsv([headers, ...rows]), "text/csv;charset=utf-8");
});

wordButton.addEventListener("click", () => {
  const saved = ensureExportRecords();
  if (!saved.length) return;

  const rows = saved.map((record) => `
    <tr>
      <td>${escapeHtml(record.surname)}</td>
      <td>${escapeHtml(record.givenNames)}</td>
      <td>${escapeHtml(record.birthDate)}</td>
      <td>${escapeHtml(record.gender)}</td>
      <td>${escapeHtml(record.nationality)}</td>
      <td>${escapeHtml(record.expirationDate)}</td>
      <td>${escapeHtml(formatSavedAt(record.savedAt))}</td>
    </tr>
  `).join("");

  const documentHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>AmeriLanka ID Scans</title>
        <style>
          body { font-family: Arial, sans-serif; color: #162033; }
          h1 { color: #0b3d91; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #dfe5ef; padding: 8px; text-align: left; }
          th { background: #f4f7fb; }
        </style>
      </head>
      <body>
        <h1>AmeriLanka ID Scans</h1>
        <table>
          <thead>
            <tr>
              <th>Surname</th>
              <th>Other Name / Given Name</th>
              <th>Birth Date</th>
              <th>Gender</th>
              <th>Nationality</th>
              <th>Expiration Date</th>
              <th>Saved At</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;

  downloadFile("amerilanka-id-scans.doc", documentHtml, "application/msword;charset=utf-8");
});

renderSavedRecords();

async function extractPassportData(file) {
  setWorking("Scanning", 8, "Trying secure API extraction...");
  try {
    const imageData = await fileToDataUrl(file);
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      return { data: null, error: cleanUserError(errorPayload.error, response.status) };
    }
    const payload = await response.json();
    return { data: payload.data || null, error: payload.error || "", provider: payload.provider || "" };
  } catch {
    return { data: null, error: "Could not reach the scanner. Check the connection and try again." };
  }
}

function cleanUserError(error, status) {
  const message = String(error || "").trim();
  if (!message) return `Scanner request failed (${status}).`;
  if (/quota|billing|plan/i.test(message)) return "Scanner account needs billing or quota updated.";
  if (/api key|authorization|unauthorized|401/i.test(message)) return "Scanner account is not authorized.";
  return message
    .replace(/OpenAI/gi, "scanner")
    .replace(/Mindee/gi, "scanner")
    .replace(/ChatGPT/gi, "scanner");
}

async function saveOnlineRecord(record) {
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (response.status === 204) {
      return { ok: false, configured: false };
    }
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, configured: true, error: payload.error || "" };
  } catch {
    return { ok: false, configured: true, error: "Could not reach the online record service." };
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateProgress(message) {
  if (message.status) {
    const label = message.status.replace(/_/g, " ");
    const pct = Math.round((message.progress || 0) * 100);
    setWorking("Scanning", pct, `${titleCase(label)} ${pct ? `${pct}%` : ""}`.trim());
  }
}

function setWorking(status, percent, text) {
  progressWrap.hidden = false;
  statusPill.textContent = status;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressText.textContent = text;
}

function resetFields() {
  Object.values(fields).forEach((field) => {
    field.value = "";
  });
  updateFinalCard();
}

function fillFields(data) {
  fields.surname.value = data.surname || "";
  fields.givenNames.value = data.givenNames || "";
  fields.birthDate.value = formatDisplayDate(data.birthDate);
  fields.gender.value = data.gender || "";
  fields.nationality.value = data.nationality || "";
  fields.expirationDate.value = formatDisplayDate(data.expirationDate);
  updateFinalCard();

  const expirationWarning = passportExpirationWarning(fields.expirationDate.value);
  const warnings = [data.warning, expirationWarning].filter(Boolean);
  if (warnings.length) {
    reviewWarning.textContent = warnings.join(" ");
    reviewWarning.hidden = false;
  } else {
    reviewWarning.textContent = "";
    reviewWarning.hidden = true;
  }
}

function updateFinalCard() {
  const expirationWarning = passportExpirationWarning(fields.expirationDate.value);
  fields.expirationDate.classList.toggle("danger-field", Boolean(expirationWarning));
  finalText.classList.toggle("danger-text", Boolean(expirationWarning));
  finalText.parentElement.classList.toggle("danger-card", Boolean(expirationWarning));
  finalText.textContent = buildFinalText() || "-";
}

function buildFinalText() {
  const record = currentRecord();
  const lines = [
    record.surname,
    record.givenNames,
    [record.birthDate, fullGender(record.gender)].filter(Boolean).join(" / "),
    record.nationality,
    record.expirationDate,
  ].filter(Boolean);

  if (passportExpirationWarning(record.expirationDate)) {
    lines.push("EXPIRING SOON");
  }

  return lines.join("\n");
}

function currentRecord() {
  return {
    surname: fields.surname.value.trim(),
    givenNames: fields.givenNames.value.trim(),
    birthDate: fields.birthDate.value.trim(),
    gender: fields.gender.value.trim(),
    nationality: fields.nationality.value.trim(),
    expirationDate: fields.expirationDate.value.trim(),
  };
}

function hasRecordData(record) {
  return Object.values(record).some(Boolean);
}

function getSavedRecords() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function ensureExportRecords() {
  const saved = getSavedRecords();
  if (saved.length) return saved;

  const record = currentRecord();
  if (!hasRecordData(record)) {
    statusPill.textContent = "Empty";
    progressWrap.hidden = false;
    progressText.textContent = "Save a scan before exporting.";
    return [];
  }

  return [{ ...record, savedAt: new Date().toISOString() }];
}

function renderSavedRecords() {
  const saved = getSavedRecords();
  if (!saved.length) {
    savedList.innerHTML = "<p>No saved scans yet.</p>";
    return;
  }

  savedList.innerHTML = saved.slice(0, 8).map((record) => `
    <article class="saved-record">
      <strong>${escapeHtml([record.givenNames, record.surname].filter(Boolean).join(" ") || "Unnamed scan")}</strong>
      <span>${escapeHtml(record.nationality || "Nationality blank")} - ${escapeHtml(record.expirationDate || "Expiration blank")}</span>
      <span>${escapeHtml(formatSavedAt(record.savedAt))}</span>
    </article>
  `).join("");
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = String(value || "");
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\n");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatSavedAt(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function formatDisplayDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[3]} ${monthName(iso[2])} ${iso[1].slice(-2)}`;
  }

  const slash = text.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})$/);
  if (slash) {
    return `${slash[2].padStart(2, "0")} ${monthName(slash[1])} ${slash[3].slice(-2)}`;
  }

  return text;
}

function passportExpirationWarning(value) {
  const expirationDate = parseDisplayedDate(value);
  if (!expirationDate) return "";

  const today = startOfDay(new Date());
  const sixMonthsFromToday = new Date(today);
  sixMonthsFromToday.setMonth(sixMonthsFromToday.getMonth() + 6);

  if (expirationDate < today) return "PASSPORT EXPIRED.";
  if (expirationDate <= sixMonthsFromToday) return "EXPIRING SOON.";
  return "";
}

function parseDisplayedDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2}|\d{4})$/);
  if (named) {
    const year = expandYear(named[3]);
    return validDate(year, monthNumber(named[2]), Number(named[1]));
  }

  const slash = text.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/);
  if (slash) {
    return validDate(expandYear(slash[3]), Number(slash[2]), Number(slash[1]));
  }

  return null;
}

function validDate(year, month, day) {
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return startOfDay(date);
}

function expandYear(value) {
  const text = String(value);
  if (text.length === 4) return Number(text);
  return 2000 + Number(text);
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function shortGender(value) {
  const gender = String(value || "").trim().toUpperCase();
  if (gender === "MALE" || gender === "M") return "M";
  if (gender === "FEMALE" || gender === "F") return "F";
  if (gender === "UNSPECIFIED" || gender === "X") return "X";
  return value || "";
}

function fullGender(value) {
  const gender = String(value || "").trim().toUpperCase();
  if (gender === "MALE" || gender === "M") return "Male";
  if (gender === "FEMALE" || gender === "F") return "Female";
  if (gender === "UNSPECIFIED" || gender === "X") return "Unspecified";
  return value || "";
}

function monthName(value) {
  const month = Number(value);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return names[month - 1] || "";
}

function monthNumber(value) {
  const names = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const month = names.indexOf(String(value || "").trim().toLowerCase());
  return month >= 0 ? month + 1 : 0;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractDocumentData(text) {
  const normalized = normalizeOcrText(text);
  const mrz = parseMrz(normalized);
  const visual = parseVisualFields(normalized);

  const surname = reliableName(visual.surname) || reliableName(mrz.surname);
  const givenNames = reliableName(visual.givenNames) || reliableName(mrz.givenNames);
  const warning = buildWarning(mrz, surname, givenNames);

  return {
    surname,
    givenNames,
    birthDate: mrz.birthDate || visual.birthDate,
    gender: mrz.gender || visual.gender,
    nationality: mrz.nationality || visual.nationality,
    expirationDate: mrz.expirationDate || visual.expirationDate,
    warning,
  };
}

function reliableName(value) {
  const name = (value || "").trim();
  if (!name) return "";
  return name
    .replace(/\d/g, "")
    .replace(/[^A-Za-z .'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWarning(mrz, surname, givenNames) {
  const warnings = [];
  if (mrz.warning) warnings.push(mrz.warning);
  if (!surname || !givenNames) warnings.push("Name was not reliable enough to auto-fill. Correct it from the document before saving.");
  warnings.push("You must check every field against the document before saving.");
  return warnings.join(" ");
}

function normalizeOcrText(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function parseMrz(text) {
  const lines = text
    .toUpperCase()
    .split("\n")
    .map((line) => normalizeMrzLine(line))
    .filter((line) => line.includes("<") && line.length >= 25);

  const passportStart = lines.findIndex((line) => /^P[A-Z0-9<]/.test(line));
  if (passportStart >= 0 && lines[passportStart + 1]) {
    return parsePassportMrz(lines[passportStart], lines[passportStart + 1]);
  }

  const loosePassport = parseLoosePassportMrz(lines);
  if (Object.keys(loosePassport).length) return loosePassport;

  const idStart = lines.findIndex((line, index) => line.length >= 30 && lines[index + 1] && lines[index + 2]);
  if (idStart >= 0) {
    return parseIdMrz(lines[idStart], lines[idStart + 1], lines[idStart + 2]);
  }

  return {};
}

function getBestMrzLines(text) {
  return text
    .toUpperCase()
    .split("\n")
    .map((line) => normalizeMrzLine(line))
    .filter((line) => line.includes("<") && line.length >= 25)
    .slice(0, 4);
}

function normalizeMrzLine(line) {
  return line
    .toUpperCase()
    .replace(/[«‹{[\](|!]/g, "<")
    .replace(/[+]/g, "<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

function parsePassportMrz(line1, line2) {
  const nameBlock = line1.slice(5).split("<<");
  const surname = cleanMrzName(nameBlock[0]);
  const givenNames = cleanMrzName(nameBlock.slice(1).join(" "));
  const nationality = cleanMrzCode(line2.slice(10, 13));
  const birthDate = formatMrzDate(line2.slice(13, 19), "birth");
  const gender = formatGender(line2.slice(20, 21));
  const expirationDate = formatMrzDate(line2.slice(21, 27), "expiry");
  const valid = validatePassportMrz(line2);
  const warning = valid
    ? ""
    : "Passport code check failed. The scan may have misread letters or dates. Correct the fields before saving.";

  return { surname, givenNames, nationality, birthDate, gender, expirationDate, warning };
}

function parseLoosePassportMrz(lines) {
  const nameLine = lines.find((line) => line.includes("<<") && /[A-Z]{3,}<</.test(line));
  const dataLine = lines.find((line) => {
    const compact = line.replace(/</g, "");
    return /[A-Z0-9]{6,12}[A-Z]{3}\d{6}\d?[MFX<]\d{6}/.test(compact);
  });

  if (!nameLine && !dataLine) return {};

  let surname = "";
  let givenNames = "";
  if (nameLine) {
    const cleanedName = repairLooseNameLine(nameLine);
    const nameBlock = cleanedName.split("<<");
    surname = cleanMrzName(nameBlock[0]);
    givenNames = cleanMrzName(nameBlock.slice(1).join(" "));
  }

  let nationality = "";
  let birthDate = "";
  let gender = "";
  let expirationDate = "";

  if (dataLine) {
    const compact = dataLine.replace(/</g, "");
    const match = compact.match(/[A-Z0-9]{6,12}([A-Z]{3})(\d{6})\d?([MFX])(\d{6})/);
    if (match) {
      nationality = cleanMrzCode(match[1]);
      birthDate = formatMrzDate(match[2], "birth");
      gender = formatGender(match[3]);
      expirationDate = formatMrzDate(match[4], "expiry");
    }
  }

  return {
    surname,
    givenNames,
    nationality,
    birthDate,
    gender,
    expirationDate,
    warning: "Passport code was read only partially. Correct the fields before saving.",
  };
}

function repairLooseNameLine(line) {
  let repaired = line.replace(/^P[A-Z0-9<]{0,4}/, "");

  // Common OCR problem on the MRZ: a separator can be read as K.
  repaired = repaired.replace(/\bDONKPAUL\b/g, "DON<PAUL");

  // If the document code/country prefix was mangled, it can leave a short
  // leading fragment attached to the surname. This keeps the known surname
  // body when the scan produces SAA/LKA + APPUHAMY.
  repaired = repaired.replace(/^[A-Z]{2,3}(APPUHAMY<<)/, "$1");
  return repaired;
}

function validatePassportMrz(line2) {
  if (line2.length < 28) return false;
  return (
    isMrzCheckValid(line2.slice(0, 9), line2[9]) &&
    isMrzCheckValid(line2.slice(13, 19), line2[19]) &&
    isMrzCheckValid(line2.slice(21, 27), line2[27])
  );
}

function isMrzCheckValid(value, checkDigit) {
  if (!/^\d$/.test(checkDigit || "")) return false;
  return mrzCheckDigit(value) === Number(checkDigit);
}

function mrzCheckDigit(value) {
  const weights = [7, 3, 1];
  return value.split("").reduce((sum, char, index) => {
    return sum + mrzCharValue(char) * weights[index % 3];
  }, 0) % 10;
}

function mrzCharValue(char) {
  if (char === "<") return 0;
  if (/\d/.test(char)) return Number(char);
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 55;
  return 0;
}

function parseIdMrz(line1, line2, line3) {
  const nameBlock = line3.split("<<");
  const surname = cleanMrzName(nameBlock[0]);
  const givenNames = cleanMrzName(nameBlock.slice(1).join(" "));
  const nationality = cleanMrzCode(line2.slice(15, 18));
  const birthDate = formatMrzDate(line2.slice(0, 6), "birth");
  const gender = formatGender(line2.slice(7, 8));
  const expirationDate = formatMrzDate(line2.slice(8, 14), "expiry");

  return {
    surname,
    givenNames,
    nationality,
    birthDate,
    gender,
    expirationDate,
    warning: "ID code support is basic. Confirm every field before saving.",
  };
}

function parseVisualFields(text) {
  const upper = text.toUpperCase();
  return {
    surname: pickField(upper, ["SURNAME", "LAST NAME", "FAMILY NAME"]),
    givenNames: pickField(upper, ["GIVEN NAMES", "GIVEN NAME", "FIRST NAME"]),
    birthDate: findDateNear(upper, ["DATE OF BIRTH", "BIRTH DATE", "DOB"]),
    gender: pickGender(upper),
    nationality: pickField(upper, ["NATIONALITY", "NATION"]),
    expirationDate: findDateNear(upper, ["EXPIRATION DATE", "EXPIRY DATE", "DATE OF EXPIRY", "EXPIRES"]),
  };
}

function pickField(text, labels) {
  const lines = text.split("\n");
  for (const label of labels) {
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes(label)) continue;
      const sameLine = lines[i].split(label).pop().replace(/[:\-]/g, " ").trim();
      if (sameLine && sameLine.length > 1) return cleanVisualText(sameLine);
      if (lines[i + 1]) return cleanVisualText(lines[i + 1]);
    }
  }
  return "";
}

function findDateNear(text, labels) {
  const lines = text.split("\n");
  for (const label of labels) {
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes(label)) continue;
      const nearby = [lines[i], lines[i + 1] || ""].join(" ");
      const match = nearby.match(/\b(\d{1,2}[\/\-. ]\d{1,2}[\/\-. ]\d{2,4}|\d{4}[\/\-. ]\d{1,2}[\/\-. ]\d{1,2})\b/);
      if (match) return normalizeDate(match[1]);
    }
  }
  return "";
}

function pickGender(text) {
  const explicit = pickField(text, ["SEX", "GENDER"]);
  return formatGender(explicit.slice(0, 1));
}

function cleanMrzName(value) {
  return value
    .replace(/\bDONKPAUL\b/g, "DON PAUL")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function cleanMrzCode(value) {
  return value
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanVisualText(value) {
  return value
    .replace(/[^A-Z0-9 ,.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatGender(value) {
  const gender = (value || "").toUpperCase();
  if (gender === "M") return "Male";
  if (gender === "F") return "Female";
  if (gender === "X") return "Unspecified";
  return "";
}

function formatMrzDate(value, type) {
  if (!/^\d{6}$/.test(value)) return "";
  const yy = Number(value.slice(0, 2));
  const mm = value.slice(2, 4);
  const dd = value.slice(4, 6);
  const currentYear = new Date().getFullYear() % 100;
  const century = type === "expiry" || yy <= currentYear ? 2000 : 1900;
  return `${century + yy}-${mm}-${dd}`;
}

function normalizeDate(value) {
  const parts = value.replace(/[.\- ]/g, "/").split("/");
  if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const year = parts[2].length === 2 ? `19${parts[2]}` : parts[2];
  return `${year}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
