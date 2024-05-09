export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'K', 'M', 'G', 'T'];

  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(k)));

  return Math.round(100 * (bytes / Math.pow(k, i))) / 100 + '' + sizes[i];
}
export function formatNumber(number) {
  if (number >= 1000000000) {
    return (number / 1000000000).toFixed(1) + 'B';
  } else if (number >= 1000000) {
    return (number / 1000000).toFixed(1) + 'M';
  } else if (number >= 1000) {
    return (number / 1000).toFixed(1) + 'K';
  } else {
    return number.toString();
  }
}
import dayjs from "dayjs";
export function parseTime(date) {
  return dayjs(date).format('YYYY/MM/DD HH:mm:ss')
}


// const crypto = require('crypto-js');
import { SHA256, enc } from 'crypto-js';

const generateRandomString = length => Array.from({ length }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[(Math.random() * 62) | 0]).join('');

export function proxyEncode(ip, user) {

  const key = "&&4sg123g[]/~"
  user = user || generateRandomString(6)
  const input_string = ip + user + key
  const password = SHA256(input_string).toString(enc.Hex);
  return { user, password }

  //原生node  ‘crypto’
  // const hash = crypto.createHash('sha256');
  // const key = "&&4sg123g[]/~"
  // user = user || generateRandomString(6)
  // const input_string = ip + user + key

  // hash.update(input_string);
  // const password = hash.digest('hex')
  // // console.log(password=='2203749c794a18b21269b45b4e82443083f882290a701ca005e438a9b1964ae3')
  // return { user, password }
}