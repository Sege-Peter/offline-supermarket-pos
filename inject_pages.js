const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const navButtons = `
    <button class="tab-btn" onclick="switchTab('returns')"><i class="fas fa-undo"></i> Returns</button>
    <button class="tab-btn" onclick="switchTab('customers')"><i class="fas fa-users"></i> CRM</button>
    <button class="tab-btn" onclick="switchTab('shifts')"><i class="fas fa-user-clock"></i> Shifts</button>
`;

// Insert nav buttons before architecture
html = html.replace(
  /<button class="tab-btn" onclick="switchTab\('architecture'\)">/,
  `${navButtons}\n    <button class="tab-btn" onclick="switchTab('architecture')">`
);

const newTabs = `
    <!-- TAB: RETURNS -->
    <div id="tab-returns" class="tab-panel">
      <div style="padding: 24px; max-width: 1200px; margin: 0 auto; width: 100%;">
        <div class="settings-header-banner">
          <div>
            <h2 style="font-size: 1.3rem; color: var(--cyan-bright);"><i class="fas fa-undo"></i> Returns & Refunds</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Process customer returns, lookup receipts, and issue refunds to original tender.</p>
          </div>
        </div>
        <div class="settings-section-card" style="padding: 14px;">
          <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <input type="text" id="returnReceiptSearch" class="form-input" placeholder="Scan or enter Receipt Number (e.g. REC-...)" style="flex: 1;">
            <button class="tool-btn btn-cyan" onclick="lookupReturnReceipt()">Find Receipt</button>
          </div>
          <div id="returnReceiptDetails" style="display:none; border-top: 1px dashed var(--border); padding-top: 14px;">
            <h4 style="color: var(--orange-bright); margin-bottom: 10px;">Receipt Found</h4>
            <table class="cart-table" id="returnItemsTable">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Action</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB: CUSTOMERS / CRM -->
    <div id="tab-customers" class="tab-panel">
      <div style="padding: 24px; max-width: 1200px; margin: 0 auto; width: 100%;">
        <div class="settings-header-banner">
          <div>
            <h2 style="font-size: 1.3rem; color: var(--cyan-bright);"><i class="fas fa-users"></i> Loyalty & CRM</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Manage store members, track loyalty points, and view customer purchase history.</p>
          </div>
          <button class="btn-checkout-primary" onclick="showToast(\`CRM Module initializing...\`, 'info')">+ New Member</button>
        </div>
        <div class="settings-section-card" style="padding: 40px; text-align: center; color: var(--text-muted);">
          <i class="fas fa-id-card" style="font-size: 3rem; margin-bottom: 15px; color: var(--border);"></i>
          <p>Local Customer Database is currently empty.</p>
        </div>
      </div>
    </div>

    <!-- TAB: SHIFTS -->
    <div id="tab-shifts" class="tab-panel">
      <div style="padding: 24px; max-width: 800px; margin: 0 auto; width: 100%;">
        <div class="settings-header-banner">
          <div>
            <h2 style="font-size: 1.3rem; color: var(--cyan-bright);"><i class="fas fa-user-clock"></i> Shift Management</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Cashier clock-in/out, breaks, and timecard auditing.</p>
          </div>
        </div>
        <div class="settings-section-card" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong id="shiftUserStatus" style="color: var(--cyan-bright); font-size: 1.1rem;">Current Status: <span style="color:var(--text-muted)">Clocked Out</span></strong>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 5px;">Active Shift Duration: <span id="shiftTimeTracker">00:00:00</span></div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="tool-btn btn-cyan" onclick="toggleShiftStatus()">Clock In</button>
            <button class="tool-btn btn-orange" onclick="showToast(\`Break started. Terminal locked.\`, 'warning')">Start Break</button>
          </div>
        </div>
      </div>
    </div>
`;

// Insert panels before architecture panel
html = html.replace(
  /<!-- TAB 8: ARCHITECTURE VIEW -->/,
  `${newTabs}\n\n    <!-- TAB 8: ARCHITECTURE VIEW -->`
);

// Inject simple JS logic for the new tabs
const jsLogic = `
    // --- NEW TAB LOGIC ---
    function lookupReturnReceipt() {
      const q = document.getElementById('returnReceiptSearch').value.trim();
      const sale = salesHistory.find(s => s.receipt_number === q);
      const detailDiv = document.getElementById('returnReceiptDetails');
      if (!sale) {
        detailDiv.style.display = 'none';
        return showToast(\`Receipt \${q} not found\`, 'error');
      }
      detailDiv.style.display = 'block';
      const tbody = document.querySelector('#returnItemsTable tbody');
      tbody.innerHTML = '';
      sale.items.forEach(item => {
        tbody.innerHTML += \`<tr>
          <td>\${item.name}</td>
          <td>\${item.quantity} \${item.unit_of_measure}</td>
          <td>\${formatMoney(item.price)}</td>
          <td><button class="tool-btn btn-orange" style="padding: 4px 10px; font-size: 0.75rem;" onclick="showToast(\\\`Refunded \${formatMoney(item.price)} to \${sale.payment_method}\\\`, 'success')">Refund Item</button></td>
        </tr>\`;
      });
    }

    let isClockedIn = false;
    let shiftInterval;
    let shiftSeconds = 0;
    function toggleShiftStatus() {
      const statusEl = document.getElementById('shiftUserStatus');
      const timeEl = document.getElementById('shiftTimeTracker');
      const btn = event.currentTarget;
      if (isClockedIn) {
        clearInterval(shiftInterval);
        isClockedIn = false;
        statusEl.innerHTML = 'Current Status: <span style="color:var(--text-muted)">Clocked Out</span>';
        btn.innerText = 'Clock In';
        btn.className = 'tool-btn btn-cyan';
        showToast(\`Shift ended. Total time: \${timeEl.innerText}\`, 'info');
        shiftSeconds = 0;
        timeEl.innerText = '00:00:00';
      } else {
        isClockedIn = true;
        statusEl.innerHTML = 'Current Status: <span style="color:var(--green-success)">Clocked In Active</span>';
        btn.innerText = 'Clock Out';
        btn.className = 'tool-btn btn-orange';
        showToast(\`Shift started for \${currentUser.full_name}\`, 'success');
        shiftInterval = setInterval(() => {
          shiftSeconds++;
          const h = String(Math.floor(shiftSeconds / 3600)).padStart(2, '0');
          const m = String(Math.floor((shiftSeconds % 3600) / 60)).padStart(2, '0');
          const s = String(shiftSeconds % 60).padStart(2, '0');
          timeEl.innerText = \`\${h}:\${m}:\${s}\`;
        }, 1000);
      }
    }
`;

html = html.replace(
  /function toggleCameraScanner\(\) \{[\s\S]*?\}\s*<\/script>/,
  `function toggleCameraScanner() {
      const reader = document.getElementById('reader');
      const btn = document.getElementById('toggleCameraBtn');
      const fb = document.getElementById('cameraFeedback');

      if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

      if (isCameraRunning) {
        html5QrCode.stop().then(() => {
          reader.style.display = 'none';
          btn.innerText = 'Start Camera';
          btn.className = 'tool-btn btn-cyan';
          fb.innerText = 'Camera stopped.';
          isCameraRunning = false;
        });
      } else {
        reader.style.display = 'block';
        fb.innerText = 'Initializing camera...';
        html5QrCode.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 280, height: 160 } },
          (decodedText) => {
            playBeep(1760, 0.1);
            fb.innerText = \`Detected Barcode: \${decodedText}\`;
            lookupBarcode(decodedText);
          },
          () => {}
        ).then(() => {
          btn.innerText = 'Stop Camera';
          btn.className = 'tool-btn btn-orange';
          fb.innerText = 'Scanning... Align barcode in the reticle.';
          isCameraRunning = true;
        }).catch(err => {
          fb.innerText = 'Camera error: ' + err;
        });
      }
    }
${jsLogic}
  </script>`
);

fs.writeFileSync('index.html', html, 'utf8');
console.log('Injected missing pages and logic.');
