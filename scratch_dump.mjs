import fs from 'fs';
const content = fs.readFileSync('/Users/leonkhey/Documents/3dhome/js/furniture.js', 'utf8');

const regex = /^\s+([a-zA-Z0-9_]+):\s+\{\s*\n\s*label:\s*"([^"]+)",/gm;
let match;
const items = [];
while ((match = regex.exec(content)) !== null) {
  items.push({ key: match[1], label: match[2] });
}
console.log(JSON.stringify(items, null, 2));
