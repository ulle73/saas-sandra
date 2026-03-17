import fs from 'fs';
import path from 'path';

function findIcons(dir, icons = new Set()) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findIcons(fullPath, icons);
    } else if (fullPath.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const regex = /<span [^>]*className="[^"]*material-symbols-outlined[^"]*"[^>]*>([^<]+)<\/span>/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        icons.add(match[1].trim());
      }
    }
  }
  return icons;
}

const allIcons = new Set();
findIcons('c:/dev/saas-sandra/pages', allIcons);
findIcons('c:/dev/saas-sandra/components', allIcons);
console.log(Array.from(allIcons).sort());
