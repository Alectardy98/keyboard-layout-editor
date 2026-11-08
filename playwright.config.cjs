const {defineConfig}=require('@playwright/test');
const {existsSync}=require('node:fs');
const browser=process.env.CHROME_BIN || (!process.env.CI && existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);
module.exports=defineConfig({
 testDir:'tests/browser',timeout:30000,
 use:{baseURL:'http://127.0.0.1:5189/keyboard-layout-editor/',headless:true,launchOptions:browser ? {executablePath:browser,args:['--no-sandbox']} : {}},
 webServer:{command:'node scripts/serve.mjs --port 5189 --base /keyboard-layout-editor/',url:'http://127.0.0.1:5189/keyboard-layout-editor/',reuseExistingServer:!process.env.CI}
});
