const fs = require('fs');

function fixFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  // Find single quoted strings containing <i class
  // e.g. showToast('<i class=\'fas fa-check\'></i> success', 'success')
  // We can just convert single quoted strings that start with <i to backticks.
  content = content.replace(/'(<i class=[^>]*><\/i>[^']*)'/g, "`$1`");
  // If it was already broken like '<i class='fas...'></i>...'
  // we can just fix it by looking for showToast(' <i class='fas...'></i>... ', ...)
  content = content.replace(/showToast\('(<i class='fas[^']*'><\/i>[^']*)',\s*([^)]*)\)/g, 'showToast(`$1`, $2)');
  
  // Actually the easiest way to fix the broken syntax:
  // '<i class='fas fa-times'></i>' -> `<i class="fas fa-times"></i>`
  content = content.replace(/'<i class='(fas[^']*)'><\/i>([^']*)'/g, '`<i class="$1"></i>$2`');
  
  // Also check if any single quoted string has `<i class='` inside it.
  content = content.replace(/showToast\('([^']*)<i class='(fas[^']*)'><\/i>([^']*)'/g, 'showToast(`$1<i class="$2"></i>$3`');

  fs.writeFileSync(path, content, 'utf8');
}

fixFile('static/js/pos-engine.js');
fixFile('static/js/firebase-sync.js');
fixFile('static/js/live-rates.js');
fixFile('index.html');
