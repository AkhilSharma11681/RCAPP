const fs = require('fs');

const svg192 = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="#0a0a0f"/>
  <circle cx="72" cy="96" r="50" fill="#7c3aed" opacity="0.9"/>
  <circle cx="120" cy="96" r="50" fill="#2563eb" opacity="0.9"/>
</svg>`;

const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#0a0a0f"/>
  <circle cx="190" cy="256" r="135" fill="#7c3aed" opacity="0.9"/>
  <circle cx="322" cy="256" r="135" fill="#2563eb" opacity="0.9"/>
</svg>`;

fs.writeFileSync('public/icon-192.svg', svg192);
fs.writeFileSync('public/icon-512.svg', svg512);
console.log('SVG icons created!');
