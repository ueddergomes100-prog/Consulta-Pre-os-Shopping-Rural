const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

async function generate() {
  const publicDir = path.resolve(__dirname, '../frontend/public');
  const destination = path.join(publicDir, 'pwa');
  await fs.mkdir(destination, { recursive: true });
  const logo = path.join(publicDir, 'shopping-rural.png');
  async function icon(size, padding, file) {
    const content = await sharp(logo).resize(size - padding * 2, size - padding * 2, { fit: 'inside' }).png().toBuffer();
    const result = await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
      .composite([{ input: content, gravity: 'centre' }]).png().toBuffer();
    await fs.writeFile(path.join(destination, file), result);
    return result;
  }
  await icon(192, 12, 'icon-192.png');
  await icon(512, 32, 'icon-512.png');
  await icon(512, 80, 'icon-maskable-512.png');
  const png = await icon(256, 16, 'icon-256.png');
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(destination, 'shopping-rural.ico'), Buffer.concat([header, png]));
  console.log('Ícones do catálogo gerados a partir da logo original.');
}
generate().catch((error) => { console.error(error.message); process.exitCode = 1; });
