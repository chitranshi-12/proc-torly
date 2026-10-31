/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OmniProctor - Google Forms Question Exporter (Google Apps Script)
 * 
 * Instructions:
 * 1. Open your Google Form (edit mode).
 * 2. Click the three dots (More) -> "Script editor" (or Extensions -> Apps Script).
 * 3. Replace any existing code in Code.gs with this entire script.
 * 4. Click the Save icon (Disk), then reload your Google Form tab.
 * 5. You will see a new menu: "🛡️ OmniProctor" -> "Export Questions to JSON".
 * 6. Click it, grant permissions once, and copy the generated JSON into OmniProctor.
 */

function onOpen() {
  const ui = FormApp.getUi();
  ui.createMenu('🛡️ OmniProctor')
    .addItem('Export Questions to JSON', 'exportFormQuestions')
    .addToUi();
}

function exportFormQuestions() {
  const form = FormApp.getActiveForm();
  const items = form.getItems();
  const questions = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const type = item.getType();

    if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      const mcItem = item.asMultipleChoiceItem();
      const title = mcItem.getTitle();
      const choices = mcItem.getChoices().map(c => c.getValue());
      const points = mcItem.getPoints() || 1;

      // Detect correct choice if quiz mode is enabled
      let correctLetter = 'A';
      const letters = ['A', 'B', 'C', 'D'];
      const rawChoices = mcItem.getChoices();
      for (let j = 0; j < rawChoices.length; j++) {
        if (rawChoices[j].isCorrectAnswer && rawChoices[j].isCorrectAnswer()) {
          correctLetter = letters[j] || 'A';
          break;
        }
      }

      questions.push({
        question: title,
        optA: choices[0] || 'Option A',
        optB: choices[1] || 'Option B',
        optC: choices[2] || 'Option C',
        optD: choices[3] || 'Option D',
        correct: correctLetter,
        marks: points
      });
    } else if (type === FormApp.ItemType.CHECKBOX) {
      const cbItem = item.asCheckboxItem();
      const title = cbItem.getTitle();
      const choices = cbItem.getChoices().map(c => c.getValue());
      const points = cbItem.getPoints() || 1;

      questions.push({
        question: title,
        optA: choices[0] || 'Option A',
        optB: choices[1] || 'Option B',
        optC: choices[2] || 'Option C',
        optD: choices[3] || 'Option D',
        correct: 'A',
        marks: points
      });
    }
  }

  const jsonString = JSON.stringify({
    title: form.getTitle(),
    description: form.getDescription(),
    exportedAt: new Date().toISOString(),
    totalQuestions: questions.length,
    questions: questions
  }, null, 2);

  const htmlOutput = HtmlService.createHtmlOutput(
    '<html><body style="font-family:sans-serif; padding:15px; background:#0f172a; color:#f8fafc;">' +
    '<h3 style="margin-top:0; color:#38bdf8;">OmniProctor Form Questions Export</h3>' +
    '<p style="font-size:13px; color:#94a3b8;">Copy this JSON code and paste it directly into OmniProctor Exam Editor:</p>' +
    '<textarea id="jsonArea" style="width:100%; height:280px; background:#1e293b; color:#38bdf8; border:1px solid #475569; border-radius:6px; padding:10px; font-family:monospace; font-size:12px;">' +
    escapeHtml(jsonString) +
    '</textarea>' +
    '<div style="margin-top:15px; display:flex; justify-content:space-between;">' +
    '<button onclick="navigator.clipboard.writeText(document.getElementById(\'jsonArea\').value); alert(\'JSON copied to clipboard!\')" style="background:#2563eb; color:white; border:none; padding:8px 18px; border-radius:4px; cursor:pointer; font-weight:bold;">Copy JSON</button>' +
    '<span style="font-size:12px; color:#a1a1aa; align-self:center;">' + questions.length + ' questions extracted</span>' +
    '</div>' +
    '</body></html>'
  )
  .setWidth(600)
  .setHeight(420);

  FormApp.getUi().showModalDialog(htmlOutput, 'Export to OmniProctor');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
