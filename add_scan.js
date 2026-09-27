const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const oldBarcodeGroup = `<div class="form-group">
          <label class="form-label">Barcode / PLU</label>
          <input type="text" id="newBarcode" class="form-input" required placeholder="e.g. 051500022407">
        </div>`;

const newBarcodeGroup = `<div class="form-group">
          <label class="form-label">Barcode / PLU</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="newBarcode" class="form-input" required placeholder="e.g. 051500022407" style="flex: 1;">
            <button type="button" class="tool-btn btn-blue" style="padding: 0 16px;" onclick="scanToNewProduct()" title="Scan Barcode"><i class="fas fa-camera"></i> Scan</button>
          </div>
          <div id="newProductScannerWrapper" style="display: none; margin-top: 10px;">
            <div id="newProductReader"></div>
            <button type="button" class="tool-btn btn-orange" onclick="stopNewProductScanner()" style="width: 100%; margin-top: 5px; padding: 6px;">Cancel Scan</button>
          </div>
        </div>`;

html = html.replace(oldBarcodeGroup, newBarcodeGroup);

const scannerLogic = `
    let html5QrCodeNewProduct = null;
    function scanToNewProduct() {
      const readerWrap = document.getElementById('newProductScannerWrapper');
      readerWrap.style.display = 'block';
      if (!html5QrCodeNewProduct) html5QrCodeNewProduct = new Html5Qrcode("newProductReader");

      html5QrCodeNewProduct.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 100 } },
        (decodedText) => {
          playBeep(1760, 0.1);
          document.getElementById('newBarcode').value = decodedText;
          stopNewProductScanner();
          showToast('Barcode scanned!', 'success');
        },
        () => {}
      ).catch(err => {
        showToast('Camera error: ' + err, 'error');
        stopNewProductScanner();
      });
    }

    function stopNewProductScanner() {
      if (html5QrCodeNewProduct && html5QrCodeNewProduct.isScanning) {
        html5QrCodeNewProduct.stop().then(() => {
          document.getElementById('newProductScannerWrapper').style.display = 'none';
        }).catch(() => {
          document.getElementById('newProductScannerWrapper').style.display = 'none';
        });
      } else {
        document.getElementById('newProductScannerWrapper').style.display = 'none';
      }
    }
`;

html = html.replace(
  /function openAddSkuModal\(\) \{/,
  `${scannerLogic}\n\n    function openAddSkuModal() {`
);

// We should also clear the scanner if the modal is closed without scanning
html = html.replace(
  /function closeAddSkuModal\(\) \{/,
  `function closeAddSkuModal() {\n      stopNewProductScanner();`
);

fs.writeFileSync('index.html', html, 'utf8');
console.log('Added barcode scanner to Add SKU Modal.');
