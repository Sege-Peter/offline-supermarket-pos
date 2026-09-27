const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add the "Scan Item" button to the Catalog tab banner
const catalogBannerOld = `          <button class="btn-checkout-primary" style="padding: 10px 18px; font-size: 0.9rem;" onclick="requireAdmin(openAddSkuModal, 'Adding New Product')">+ Add New SKU</button>`;
const catalogBannerNew = `          <div style="display: flex; gap: 10px;">
            <button class="tool-btn btn-blue" style="padding: 10px 18px; font-size: 0.9rem;" onclick="scanInventoryItem()"><i class="fas fa-camera"></i> Scan Item</button>
            <button class="btn-checkout-primary" style="padding: 10px 18px; font-size: 0.9rem;" onclick="requireAdmin(openAddSkuModal, 'Adding New Product')">+ Add New SKU</button>
          </div>
          <div id="inventoryScannerWrapper" style="display: none; position: absolute; right: 24px; top: 80px; width: 300px; background: var(--bg-panel); border: 1px solid var(--cyan-primary); padding: 10px; border-radius: 8px; z-index: 999; box-shadow: 0 4px 20px rgba(0,0,0,0.8);">
            <div id="inventoryReader"></div>
            <button class="tool-btn btn-orange" style="width: 100%; margin-top: 10px;" onclick="stopInventoryScanner()">Cancel Scan</button>
          </div>`;

html = html.replace(catalogBannerOld, catalogBannerNew);

// 2. Add the JS Logic for `scanInventoryItem()`
const inventoryScannerJs = `
    let html5QrCodeInventory = null;
    function scanInventoryItem() {
      requireAdmin(() => {
        const wrap = document.getElementById('inventoryScannerWrapper');
        wrap.style.display = 'block';
        if (!html5QrCodeInventory) html5QrCodeInventory = new Html5Qrcode("inventoryReader");

        html5QrCodeInventory.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            playBeep(1760, 0.1);
            stopInventoryScanner();
            handleInventoryScan(decodedText.trim());
          },
          () => {}
        ).catch(err => {
          showToast('Camera error: ' + err, 'error');
          stopInventoryScanner();
        });
      }, "Inventory Management");
    }

    function stopInventoryScanner() {
      if (html5QrCodeInventory && html5QrCodeInventory.isScanning) {
        html5QrCodeInventory.stop().then(() => {
          document.getElementById('inventoryScannerWrapper').style.display = 'none';
        }).catch(() => {
          document.getElementById('inventoryScannerWrapper').style.display = 'none';
        });
      } else {
        document.getElementById('inventoryScannerWrapper').style.display = 'none';
      }
    }

    function handleInventoryScan(barcode) {
      const idx = products.findIndex(p => String(p.barcode) === barcode);
      if (idx !== -1) {
        // Item exists, adjust stock
        adjustStockPrompt(idx);
      } else {
        // Item does not exist, open Add New SKU modal and prefill barcode
        openAddSkuModal();
        document.getElementById('newBarcode').value = barcode;
        showToast('New barcode detected. Please enter product details.', 'info');
      }
    }
`;

html = html.replace(
  /function adjustStockPrompt\(idx\) \{/,
  `${inventoryScannerJs}\n\n    function adjustStockPrompt(idx) {`
);

fs.writeFileSync('index.html', html, 'utf8');
console.log('Added scan to add inventory logic.');
