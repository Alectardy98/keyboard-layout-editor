// Build a self-contained static site. No Bower, global CLIs or runtime CDN loads.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import jison from 'jison';
import stylus from 'stylus';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
async function copy(source,target){await fs.mkdir(path.dirname(path.join(out,target)),{recursive:true});await fs.copyFile(path.join(root,source),path.join(out,target));}
for(const file of ['kb.html','kb.js','extensions.js','serial.js','render.js','vial-document.js','site-config.js','oauth.html','oauth.js','favicon.ico','nub.png','colors.json','keys.json','pickers.json','switches.json','README.md','CHANGELOG.md','CONTRIB.md','LICENSE.md'])await copy(file,file);
await copy('kb.html','index.html');
// Only the public client ID and exchange-service URL are embedded in the site.
const publicConfig = {};
if(process.env.KLE_GITHUB_CLIENT_ID) publicConfig.githubClientId = process.env.KLE_GITHUB_CLIENT_ID;
if(process.env.KLE_GITHUB_AUTH_ENDPOINT) {
 const endpoint = new URL(process.env.KLE_GITHUB_AUTH_ENDPOINT);
 if(endpoint.protocol !== 'https:') throw Error('OAuth exchange service must use HTTPS.');
 publicConfig.githubAuthEndpoint = endpoint.href;
}
if(Object.keys(publicConfig).length) await fs.appendFile(path.join(out,'site-config.js'), '\nObject.assign(window.KLE_CONFIG, '+JSON.stringify(publicConfig)+');\n');
for(const folder of ['bg','samples','fonts'])await fs.cp(path.join(root,folder),path.join(out,folder),{recursive:true});
for(const file of ['layouts.json','backgrounds.json']){
 let text=await fs.readFile(path.join(root,file),'utf8');
 if(file==='layouts.json')text=text.replaceAll('"/samples/','"samples/');
 else text=text.replaceAll("'/bg/","'bg/");
 await fs.writeFile(path.join(out,file),text);
}
const files={
 'jquery/dist/jquery.min.js':'js/jquery.min.js',
 'angular/angular.min.js':'js/angular.min.js',
 'angular-sanitize/angular-sanitize.min.js':'js/angular-sanitize.min.js',
 'angular-cookies/angular-cookies.min.js':'js/angular-cookies.min.js',
 'angular-ui-ace/src/ui-ace.js':'js/ui-ace.min.js',
 'angular-native-dragdrop/draganddrop.js':'js/draganddrop.js',
 'angular-bootstrap-colorpicker/js/bootstrap-colorpicker-module.min.js':'js/bootstrap-colorpicker-module.min.js',
 'angular-bootstrap-colorpicker/css/colorpicker.min.css':'css/colorpicker.min.css',
 'ng-file-upload/dist/ng-file-upload.min.js':'js/ng-file-upload.min.js',
 'bootstrap/dist/css/bootstrap.min.css':'css/bootstrap.min.css',
 'font-awesome/css/font-awesome.min.css':'css/font-awesome.min.css',
 'marked/marked.min.js':'js/marked.min.js',
 'file-saver/FileSaver.min.js':'js/FileSaver.min.js',
 'dot/doT.min.js':'js/doT.min.js',
 'html2canvas/dist/html2canvas.min.js':'js/html2canvas.min.js',
 'hint.css/hint.min.css':'css/hint.min.css'
};
for(const[source,target]of Object.entries(files))await copy('node_modules/'+source,target);
// Keep the redistribution notices accompanying the packaged libraries.
const packageInfo=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
for(const name of Object.keys(packageInfo.dependencies)) {
 const directory=path.join(root,'node_modules',name);
 for(const file of await fs.readdir(directory)) {
  if(/^(licen[cs]e|copying|notice)([.-]|$)/i.test(file) && (await fs.stat(path.join(directory,file))).isFile())
   await copy('node_modules/'+name+'/'+file,'third-party-notices/'+name+'/'+file);
 }
}
for(const module of ['bootstrap/dist/fonts','font-awesome/fonts'])await fs.cp(path.join(root,'node_modules',module),path.join(out,'fonts'),{recursive:true});
for(const file of ['ace.js','mode-css.js','mode-json.js','mode-markdown.js','theme-textmate.js','ext-searchbox.js','worker-css.js','worker-json.js'])await copy('node_modules/ace-builds/src-min-noconflict/'+file,'js/'+file);
await copy('js/color.js','js/color.js');
let utils='';
for(const module of ['keypress','event'])utils+=await fs.readFile(path.join(root,`node_modules/angular-ui-utils/modules/${module}/${module}.js`),'utf8')+'\n';
utils+="angular.module('ui.utils',['ui.keypress','ui.event']);\n";
await fs.writeFile(path.join(out,'js/ui-utils.min.js'),utils);
for(const name of ['jsonl','cssparser']){
 const grammar=await fs.readFile(path.join(root,name+'.y'),'utf8');
 const code=new jison.Parser(grammar).generate({moduleName:name});
 await fs.writeFile(path.join(out,'js',name+'.min.js'),code);
 // Original Jasmine tests import these ignored generated parser files.
 await fs.mkdir(path.join(root,'js'),{recursive:true});await fs.writeFile(path.join(root,'js',name+'.js'),code);
}
const css=await stylus.render(await fs.readFile(path.join(root,'kb.css'),'utf8'),{filename:path.join(root,'kb.styl'),compress:true});
await fs.writeFile(path.join(out,'css/kb.css'),css);
let fontCss=await fs.readFile(path.join(root,'kbd-webfont.css'),'utf8');
fontCss=fontCss.replace(/src:\s*url\([^;]+;/g,"src: url('../fonts/kbd-webfont.woff') format('woff');");
await fs.writeFile(path.join(out,'css/kbd-webfont.css'),fontCss);
const assets=JSON.parse(await fs.readFile(path.join(root,'scripts/vendor-lock.json'),'utf8'));
await fs.mkdir(path.join(root,'.vendor-cache'),{recursive:true});
for(const asset of assets){
 const cached=path.join(root,'.vendor-cache',asset.sha256);let data;
 try{data=await fs.readFile(cached);}catch(e){if(e.code!=='ENOENT')throw e;
  const response=await fetch(asset.url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Cannot fetch '+asset.url+': '+response.status);
  data=Buffer.from(await response.arrayBuffer());
 }
 if(crypto.createHash('sha256').update(data).digest('hex')!==asset.sha256)throw Error('Build input checksum mismatch: '+asset.url);
 await fs.writeFile(cached,data);await fs.mkdir(path.dirname(path.join(out,asset.target)),{recursive:true});await fs.writeFile(path.join(out,asset.target),data);
}
await fs.writeFile(path.join(out,'.nojekyll'),'');
console.log('Built dist/: Vial/KLE editor, local runtime assets and project-relative URLs.');
