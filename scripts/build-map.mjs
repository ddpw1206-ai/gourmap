// src/map-template.html 의 __DATA__ 자리에 restaurants.json 을 넣어 map/index.html 을 만듦.
// 실행: node scripts/build-map.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tpl = readFileSync(join(root, 'src', 'map-template.html'), 'utf8');
const data = JSON.parse(readFileSync(join(root, 'src', 'restaurants.json'), 'utf8'));
if (data.length !== 100) throw new Error(`업소 수가 100이 아님: ${data.length}`);
const json = JSON.stringify(data).replace(/<\//g, '<\\/'); // 스크립트 안의 </ 이스케이프
mkdirSync(join(root, 'map'), { recursive: true });
writeFileSync(join(root, 'map', 'index.html'), tpl.replace('__DATA__', () => json), 'utf8');
console.log('map/index.html 생성 완료 (업소 100곳)');
