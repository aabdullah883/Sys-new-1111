'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','src','public','index.html'),'utf8');
if(!/<html[^>]+dir="rtl"/i.test(html))throw new Error('The desktop UI must remain RTL');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(Boolean);
if(!scripts.length)throw new Error('No inline application script found');
for(const [index,script] of scripts.entries())new vm.Script(script,{filename:`index-inline-${index}.js`});
console.log(`Checked RTL markup and ${scripts.length} inline script(s)`);
