async function fetchLiveExchangeRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.rates) {
      let updated = false;
      Object.keys(CURRENCIES).forEach(code => {
        if (data.rates[code]) {
          CURRENCIES[code].rate = data.rates[code];
          updated = true;
        }
      });
      if (updated) {
        console.log(`<i class="fas fa-check-circle"></i> Real-time currency rates updated successfully.`);
        // Re-render UI to reflect new rates
        if (typeof renderCart === 'function') renderCart();
        if (typeof renderCatalog === 'function') renderCatalog();
        
        // Update price chips in UI
        document.querySelectorAll('.chip-price').forEach(el => {
          const raw = parseFloat(el.dataset.price);
          if (!isNaN(raw)) el.innerText = formatMoney(raw);
        });
      }
    }
  } catch (err) {
    console.warn(`<i class="fas fa-exclamation-triangle"></i> Could not fetch live exchange rates. Using fallback/offline rates.`, err);
  }
}

// Hook into online event and initialization
window.addEventListener('online', fetchLiveExchangeRates);
setTimeout(fetchLiveExchangeRates, 1000); // Fetch shortly after load
