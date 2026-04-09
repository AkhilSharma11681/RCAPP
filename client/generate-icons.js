const sharp = require('sharp');

const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="120" fill="#0a0a0f"/>
  <circle cx="180" cy="256" r="130" fill="#7c3aed" opacity="0.9"/>
  <circle cx="332" cy="256" r="130" fill="#2563eb" opacity="0.9"/>
</svg>`);

sharp(svg).resize(192,192).png().toFile('public/icon-192.png', () => console.log('192 done'));
sharp(svg).resize(512,512).png().toFile('public/icon-512.png', () => console.log('512 done'));
