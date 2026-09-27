const fs = require('fs');

let posEngine = fs.readFileSync('static/js/pos-engine.js', 'utf8');
posEngine = posEngine.replace(
  "USD: { code: 'USD', symbol: '$', name: 'USD - US Dollar ($)', position: 'BEFORE', decimals: 2 },",
  "USD: { code: 'USD', symbol: '$', name: 'USD - US Dollar ($)', position: 'BEFORE', decimals: 2, rate: 1 },"
);
posEngine = posEngine.replace(
  "KES: { code: 'KES', symbol: 'KSh ', name: 'KES - Kenyan Shilling (KSh)', position: 'BEFORE', decimals: 2 }",
  "KES: { code: 'KES', symbol: 'KSh ', name: 'KES - Kenyan Shilling (KSh)', position: 'BEFORE', decimals: 2, rate: 129 }"
);
posEngine = posEngine.replace(
  "function formatMoney(amount) {\r\n  const num = parseFloat(amount || 0);\r\n  const dec = activeCurrency.decimals;\r\n  const formattedNum = num.toLocaleString(undefined, {",
  "function formatMoney(amount) {\r\n  const num = parseFloat(amount || 0);\r\n  const converted = num * (activeCurrency.rate || 1);\r\n  const dec = activeCurrency.decimals;\r\n  const formattedNum = converted.toLocaleString(undefined, {"
);
posEngine = posEngine.replace(
  "function formatMoney(amount) {\n  const num = parseFloat(amount || 0);\n  const dec = activeCurrency.decimals;\n  const formattedNum = num.toLocaleString(undefined, {",
  "function formatMoney(amount) {\n  const num = parseFloat(amount || 0);\n  const converted = num * (activeCurrency.rate || 1);\n  const dec = activeCurrency.decimals;\n  const formattedNum = converted.toLocaleString(undefined, {"
);

posEngine = posEngine.replace(
  "  const tenderedVal = tenderedInput ? parseFloat(tenderedInput.value || 0) : 0;\n  const change = Math.max(0, tenderedVal - grandTotal);\n  if (changeEl) changeEl.innerText = formatMoney(change);",
  "  const rate = activeCurrency.rate || 1;\n  const tenderedVal = tenderedInput ? parseFloat(tenderedInput.value || 0) : 0;\n  const changeBase = Math.max(0, (tenderedVal / rate) - grandTotal);\n  if (changeEl) changeEl.innerText = formatMoney(changeBase);"
);

posEngine = posEngine.replace(
  "  const tenderedVal = tenderedInput ? parseFloat(tenderedInput.value || 0) : 0;\r\n  const change = Math.max(0, tenderedVal - grandTotal);\r\n  if (changeEl) changeEl.innerText = formatMoney(change);",
  "  const rate = activeCurrency.rate || 1;\r\n  const tenderedVal = tenderedInput ? parseFloat(tenderedInput.value || 0) : 0;\r\n  const changeBase = Math.max(0, (tenderedVal / rate) - grandTotal);\r\n  if (changeEl) changeEl.innerText = formatMoney(changeBase);"
);

posEngine = posEngine.replace(
  "  let tendered = tenderedInput ? parseFloat(tenderedInput.value) : grandTotal;\n  if (isNaN(tendered) || tendered < grandTotal) {\n    tendered = grandTotal;\n    if (tenderedInput) tenderedInput.value = grandTotal.toFixed(2);\n  }\n\n  const payload = {",
  "  const rate = activeCurrency.rate || 1;\n  let tendered = tenderedInput ? parseFloat(tenderedInput.value) / rate : grandTotal;\n  if (isNaN(tendered) || tendered < grandTotal) {\n    tendered = grandTotal;\n    if (tenderedInput) tenderedInput.value = (grandTotal * rate).toFixed(2);\n  }\n\n  const payload = {"
);

posEngine = posEngine.replace(
  "  let tendered = tenderedInput ? parseFloat(tenderedInput.value) : grandTotal;\r\n  if (isNaN(tendered) || tendered < grandTotal) {\r\n    tendered = grandTotal;\r\n    if (tenderedInput) tenderedInput.value = grandTotal.toFixed(2);\r\n  }\r\n\r\n  const payload = {",
  "  const rate = activeCurrency.rate || 1;\r\n  let tendered = tenderedInput ? parseFloat(tenderedInput.value) / rate : grandTotal;\r\n  if (isNaN(tendered) || tendered < grandTotal) {\r\n    tendered = grandTotal;\r\n    if (tenderedInput) tenderedInput.value = (grandTotal * rate).toFixed(2);\r\n  }\r\n\r\n  const payload = {"
);

posEngine = posEngine.replace(
  "  showToast(`[OFFLINE MODE] Saved receipt ${receiptNo}`, \"success\");",
  "  showToast(`[OFFLINE MODE] Saved receipt ${receiptNo}`, \"success\");\n  if(window.backupSaleToFirebase) window.backupSaleToFirebase({receipt_number: receiptNo, items: payload.cart, total: total, amount_tendered: payload.amount_tendered});"
);

fs.writeFileSync('static/js/pos-engine.js', posEngine, 'utf8');

let indexHtml = fs.readFileSync('index.html', 'utf8');
indexHtml = indexHtml.replace(
  "<!-- Core Scripts -->",
  "<!-- Firebase SDKs -->\n  <script src=\"https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js\"></script>\n  <script src=\"https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js\"></script>\n  <!-- Core Scripts -->"
);
indexHtml = indexHtml.replace(
  "<script src=\"static/js/pos-engine.js\"></script>",
  "<script src=\"static/js/pos-engine.js\"></script>\n  <script src=\"static/js/firebase-sync.js\"></script>"
);
indexHtml = indexHtml.replace(
  "function quickTender(amt) {\n      const input = document.getElementById('tenderedInput');\n      if (input) {\n        input.value = amt.toFixed(2);",
  "function quickTender(amt) {\n      const input = document.getElementById('tenderedInput');\n      if (input) {\n        input.value = (amt * (activeCurrency.rate || 1)).toFixed(2);"
);
indexHtml = indexHtml.replace(
  "function quickTender(amt) {\r\n      const input = document.getElementById('tenderedInput');\r\n      if (input) {\r\n        input.value = amt.toFixed(2);",
  "function quickTender(amt) {\r\n      const input = document.getElementById('tenderedInput');\r\n      if (input) {\r\n        input.value = (amt * (activeCurrency.rate || 1)).toFixed(2);"
);
indexHtml = indexHtml.replace(
  "function exactTender() {\n      const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);\n      const taxable = Math.max(0, subtotal - activeDiscount);\n      const total = taxable * 1.08;\n      const input = document.getElementById('tenderedInput');\n      if (input) {\n        input.value = total.toFixed(2);",
  "function exactTender() {\n      const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);\n      const taxable = Math.max(0, subtotal - activeDiscount);\n      const total = taxable * 1.08;\n      const input = document.getElementById('tenderedInput');\n      if (input) {\n        input.value = (total * (activeCurrency.rate || 1)).toFixed(2);"
);
indexHtml = indexHtml.replace(
  "function exactTender() {\r\n      const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);\r\n      const taxable = Math.max(0, subtotal - activeDiscount);\r\n      const total = taxable * 1.08;\r\n      const input = document.getElementById('tenderedInput');\r\n      if (input) {\r\n        input.value = total.toFixed(2);",
  "function exactTender() {\r\n      const subtotal = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);\r\n      const taxable = Math.max(0, subtotal - activeDiscount);\r\n      const total = taxable * 1.08;\r\n      const input = document.getElementById('tenderedInput');\r\n      if (input) {\r\n        input.value = (total * (activeCurrency.rate || 1)).toFixed(2);"
);
fs.writeFileSync('index.html', indexHtml, 'utf8');
