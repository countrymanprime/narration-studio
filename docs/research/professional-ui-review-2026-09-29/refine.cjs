const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'prototype.js');let s=fs.readFileSync(file,'utf8');
s=s.replace("badge('14 total')","badge('4 total')").replace("badge('6 need pickup','bad')","badge('3 to review','warn')").replace('1 of 7','1 of 4');
s=s.replace('00:08.4 · Misread</h2>','00:12.4 · Misread</h2>');
s=s.replace('Alice was beginning to get very tired of sitting by her sister on the bank, and of having <mark>nothing to do</mark>.</p><div class="eyebrow">HEARD</div>','…when suddenly a White Rabbit with <mark>pink eyes</mark> ran close by her.</p><div class="eyebrow">HEARD</div>');
s=s.replace('“…and of having <mark>nothing to say</mark>.”</p><div class="actions">','“…when suddenly a white rabbit with <mark>pale eyes</mark> ran close by her.”</p><div class="actions">');
s=s.replace('<div class="range"></div></div>`).join','<div class="range" style="--point:${a===\'Median pitch\'?67:a===\'Speaking rate\'?55:48}%"></div></div>`).join');
fs.writeFileSync(file,s);const build=path.join(__dirname,'build-gallery.cjs');fs.writeFileSync(build,fs.readFileSync(build,'utf8').replace("x==='2 of 7'","x==='2 of 4'"));
