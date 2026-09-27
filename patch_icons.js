const fs = require('fs');

const replacements = [
  ['🛒', '<i class="fas fa-shopping-cart"></i>'],
  ['⚡', '<i class="fas fa-bolt"></i>'],
  ['🌐', '<i class="fas fa-globe"></i>'],
  ['🔒', '<i class="fas fa-lock"></i>'],
  ['💻', '<i class="fas fa-desktop"></i>'],
  ['📷', '<i class="fas fa-camera"></i>'],
  ['📊', '<i class="fas fa-chart-bar"></i>'],
  ['👑', '<i class="fas fa-crown"></i>'],
  ['📦', '<i class="fas fa-box"></i>'],
  ['📜', '<i class="fas fa-file-invoice"></i>'],
  ['🖨️', '<i class="fas fa-print"></i>'],
  ['⚙️', '<i class="fas fa-cog"></i>'],
  ['🏛️', '<i class="fas fa-building-columns"></i>'],
  ['📋', '<i class="fas fa-clipboard-list"></i>'],
  ['⚖️', '<i class="fas fa-scale-balanced"></i>'],
  ['⏸️', '<i class="fas fa-pause"></i>'],
  ['▶️', '<i class="fas fa-play"></i>'],
  ['🏷️', '<i class="fas fa-tag"></i>'],
  ['🔍', '<i class="fas fa-search"></i>'],
  ['💵', '<i class="fas fa-money-bill-wave"></i>'],
  ['💳', '<i class="fas fa-credit-card"></i>'],
  ['📱', '<i class="fas fa-mobile-screen"></i>'],
  ['🧾', '<i class="fas fa-receipt"></i>'],
  ['👤', '<i class="fas fa-user"></i>'],
  ['📥', '<i class="fas fa-download"></i>'],
  ['📤', '<i class="fas fa-upload"></i>'],
  ['⚠️', '<i class="fas fa-exclamation-triangle"></i>'],
  ['🏆', '<i class="fas fa-trophy"></i>'],
  ['🏪', '<i class="fas fa-store"></i>'],
  ['💱', '<i class="fas fa-exchange-alt"></i>'],
  ['🥛', '<i class="fas fa-glass-water"></i>'],
  ['🍞', '<i class="fas fa-bread-slice"></i>'],
  ['🍌', '<i class="fas fa-seedling"></i>'],
  ['🍚', '<i class="fas fa-bowl-rice"></i>'],
  ['🥤', '<i class="fas fa-cup-togo"></i>'],
  ['🍗', '<i class="fas fa-drumstick-bite"></i>'],
  ['🥚', '<i class="fas fa-egg"></i>'],
  ['🫑', '<i class="fas fa-leaf"></i>'],
  ['✕', '<i class="fas fa-times"></i>'],
  ['✅', '<i class="fas fa-check-circle"></i>'],
  ['💾', '<i class="fas fa-save"></i>']
];

function processFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [emoji, icon] of replacements) {
    // Escape emoji if necessary, though direct replaceAll should work
    content = content.split(emoji).join(icon);
  }
  fs.writeFileSync(path, content, 'utf8');
}

processFile('index.html');
processFile('static/js/pos-engine.js');
processFile('static/js/firebase-sync.js');
processFile('static/js/live-rates.js');

// Also inject FontAwesome stylesheet into index.html
let html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('font-awesome')) {
  html = html.replace(
    '<link rel="stylesheet" href="static/css/style.css">',
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n  <link rel="stylesheet" href="static/css/style.css">'
  );
  // Also fix favicon which was an SVG emoji
  html = html.replace(
    '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'><i class="fas fa-shopping-cart"></i></text></svg>">',
    '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'><!-- FA Icon --></text></svg>">'
  );
  fs.writeFileSync('index.html', html, 'utf8');
}
console.log('Icons replaced successfully.');
