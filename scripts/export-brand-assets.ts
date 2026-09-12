import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { BRAND } from '../src/lib/brand';

async function main() {
  const mark = `<path fill="${BRAND.green}" d="${BRAND.bookmark}"/><path fill="${BRAND.blue}" d="${BRAND.pick}"/>`;
  const symbol = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark}</svg>`;
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BRAND.blue}"/><g transform="translate(116 110) scale(2.8)"><path fill="${BRAND.mint}" d="${BRAND.bookmark}"/><path fill="#FFFFFF" d="${BRAND.pick}"/></g></svg>`;
  await mkdir('public/brand', { recursive: true });
  await writeFile('public/brand/knupick-symbol.svg', symbol);
  await writeFile('public/icons/icon.svg', icon);
  for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
    await sharp(Buffer.from(icon)).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  }
  await sharp(Buffer.from(icon)).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
  await sharp(Buffer.from(icon)).resize(32, 32).png().toFile('public/favicon.png');
  console.log('Exported B / Campus Link symbol, favicon and PWA icons from shared geometry.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
