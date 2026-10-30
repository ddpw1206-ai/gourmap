// 주소 94개를 네이버 클라우드 Geocoding API로 좌표 변환해 map/places.json에 저장함. 키를 가진 사용자 PC에서 1회 실행함.
// 실행: node --env-file=.env scripts/geocode.mjs   (.env 에 NCP_KEY_ID, NCP_KEY 두 줄을 둠. 이 파일은 공유·배포 금지)
// 옵션: --force  이미 변환한 주소도 다시 호출함
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'restaurants.json');
const OUT = join(root, 'map', 'places.json');
const REVIEW = join(root, 'scripts', 'needs_review.json');
const MANUAL = join(root, 'scripts', 'manual-coords.json'); // 사람이 고른 좌표: { "주소": { "lat": 37.5, "lng": 127.0, "note": "근거" } }
const ENDPOINT = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const BOUNDS = { latMin: 37.4, latMax: 37.72, lngMin: 126.76, lngMax: 127.19 }; // PRD의 대략 검증 범위

const keyId = process.env.NCP_KEY_ID, key = process.env.NCP_KEY;
if (!keyId || !key) {
  console.error('환경 변수 NCP_KEY_ID, NCP_KEY 가 필요함. (.env 에 두고 node --env-file=.env 로 실행)');
  process.exit(1);
}
const force = process.argv.includes('--force');
const readJson = (p, fallback) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;

const rows = readJson(SRC, []);
const addrs = [...new Set(rows.map(r => r.addr))];
const prev = readJson(OUT, { places: {} });
const manual = readJson(MANUAL, {});
const places = { ...prev.places };
const review = [];
const inSeoul = (lat, lng) => lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lng >= BOUNDS.lngMin && lng <= BOUNDS.lngMax;

async function geocode(query) {
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: { 'x-ncp-apigw-api-key-id': keyId, 'x-ncp-apigw-api-key': key, Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let called = 0;
for (const addr of addrs) {
  if (manual[addr]) { // 수동 보정이 있으면 API 호출 없이 우선 적용함
    places[addr] = { lat: manual[addr].lat, lng: manual[addr].lng, manual: true };
    continue;
  }
  if (places[addr] && !force) continue;
  try {
    const json = await geocode(addr);
    called++;
    const list = json.addresses || [];
    if (list.length !== 1) { review.push({ addr, reason: list.length ? '결과 여러 건' : '결과 없음', candidates: list.map(a => ({ road: a.roadAddress, jibun: a.jibunAddress, lat: +a.y, lng: +a.x })) }); continue; }
    const a = list[0], lat = +a.y, lng = +a.x;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSeoul(lat, lng)) { review.push({ addr, reason: '서울 범위 밖 또는 숫자 아님', candidates: [{ road: a.roadAddress, lat, lng }] }); continue; }
    places[addr] = { lat, lng, road: a.roadAddress || '' };
  } catch (e) {
    review.push({ addr, reason: `호출 실패: ${e.message}` });
    if (/HTTP 40[13]/.test(e.message)) { console.error('인증 실패(401/403). 키와 서비스 신청 상태를 확인함.'); break; }
  }
  await new Promise(r => setTimeout(r, 150));
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: 'NAVER Cloud Geocoding', places }, null, 1), 'utf8');
writeFileSync(REVIEW, JSON.stringify(review, null, 2), 'utf8');

const missing = addrs.filter(a => !places[a]);
console.log(`고유 주소 ${addrs.length}개 중 ${addrs.length - missing.length}개 저장 (이번 호출 ${called}회)`);
console.log(`확인 필요 ${review.length}건 → scripts/needs_review.json`);
if (missing.length) console.log(`좌표 없음 ${missing.length}건. 후보를 골라 scripts/manual-coords.json 에 적고 다시 실행함.`);
else console.log('좌표 게이트 1단계 통과(변환 실패 0건). 다음: 10곳을 네이버지도와 눈으로 대조함.');
