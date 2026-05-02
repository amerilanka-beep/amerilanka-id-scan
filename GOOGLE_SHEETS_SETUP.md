# Google Sheets Setup

Use this if you want every saved scan to appear in an online Google Sheet.

## Create the Sheet

1. Open Google Sheets.
2. Create a blank spreadsheet.
3. Name it `AmeriLanka ID Scans`.
4. Go to `Extensions` > `Apps Script`.
5. Delete any starter code.
6. Paste this code:

```js
const SHEET_NAME = "Scans";

function doGet() {
  getSheet();
  return ContentService
    .createTextOutput("AmeriLanka Google Sheet connection is ready.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  const sheet = getSheet();
  const data = JSON.parse(e.postData.contents || "{}");

  sheet.appendRow([
    data.savedAt || new Date().toISOString(),
    data.surname || "",
    data.givenNames || "",
    data.birthDate || "",
    data.gender || "",
    data.nationality || "",
    data.expirationDate || "",
    data.copyBox || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Saved At",
      "Surname",
      "Other Name / Given Name",
      "Birth Date",
      "Gender",
      "Nationality",
      "Expiration Date",
      "Copy Box",
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange("H:H").setWrap(true);
  }

  return sheet;
}
```

## Deploy the Script

1. Click `Deploy` > `New deployment`.
2. Choose type: `Web app`.
3. Execute as: `Me`.
4. Who has access: `Anyone`.
5. Click `Deploy`.
6. Copy the Web app URL.

## Add to Cloudflare

In Cloudflare, add a new secret:

Name:

```text
GOOGLE_SHEET_WEBHOOK_URL
```

Value: paste the Google Apps Script Web app URL.

After this, every time you press `Save` in the mobile app, the same scan will be added to the Google Sheet. The `Copy Box` column contains the exact bottom-box text in one cell.
