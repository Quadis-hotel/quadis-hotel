const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const targetDir = path.join(__dirname, 'public/images');
const files = [];
walkDir(targetDir, p => {
  if (/\.(png|jpe?g)$/i.test(p)) files.push(p);
});

console.log(`Found ${files.length} images to optimize.`);

async function processFiles() {
  for (const file of files) {
    const ext = path.extname(file);
    if (ext === '.webp') continue;
    
    const newFile = file.replace(/\.(png|jpe?g)$/i, '.webp');
    console.log(`Optimizing ${file} -> ${newFile}`);
    try {
      await sharp(file)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(newFile);
      fs.unlinkSync(file); // remove original
    } catch(e) {
      console.error(`Failed to optimize ${file}: ${e.message}`);
    }
  }
}

processFiles().then(() => {
  console.log('Optimization complete.');
});
