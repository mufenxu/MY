import { createPasswordHash } from '../src/auth.js';

const password = process.argv[2];
if (!password) {
  console.error('用法：npm run password -- "你的管理员密码"');
  process.exitCode = 1;
} else {
  console.log(await createPasswordHash(password));
}
