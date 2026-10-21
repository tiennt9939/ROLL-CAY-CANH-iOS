const fs=require('fs'), assert=require('assert');
const java=fs.readFileSync('app/src/main/java/com/quanlycay/apk/MainActivity.java','utf8');
assert(java.includes('statusCode == 10'), 'Drive OAuth error code 10 must be identified');
assert(java.includes('DEVELOPER_ERROR'), 'Drive OAuth message must call out DEVELOPER_ERROR');
assert(java.includes('com.quanlycay.apk'), 'Drive OAuth message must show Android package');
console.log('Drive OAuth error 10 diagnostic test: PASS');
