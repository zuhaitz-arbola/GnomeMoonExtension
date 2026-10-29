import * as lunar from './lunar.js';
const lat = 40;
const lon = -3;
const d = new Date();
const data = lunar.getLunarData(lat, lon, d);
console.log(JSON.stringify(data, null, 2));
