import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const root=process.cwd();
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".md":"text/markdown; charset=utf-8"};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const file=path.join(root,pathname==="/"?"/index.html":pathname);
  if(!file.startsWith(root+"/")||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);res.end("Not found");return;
  }
  res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream"});
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser;
try {
  browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelectorAll("path.land.playable").length===195,{timeout:45000});
  const data=JSON.parse(fs.readFileSync("countries.json","utf8"));
  const names=new Map(data.map(c=>[c.ja,c.iso]));
  assert.equal(await page.locator("path.land.playable").count(),195);
  assert.equal(await page.locator("#available").innerText(),"出題対象: 195 / 195");
  assert.ok((await page.locator("#shapePreview svg").count())===1,"First shape preview must appear");
  assert.ok((await page.locator("#flagPreview").innerText()).length>0,"Flag must appear");
  assert.ok((await page.locator("#namePreview").innerText()).length>0,"Name must appear");

  const counts={AS:47,EU:44,AF:54,NA:23,SA:12,OC:15};
  await page.locator("#count").selectOption("all");
  for(const [r,n] of Object.entries(counts)){
    await page.locator("#region").selectOption(r);
    assert.equal(await page.locator("path.land.playable").count(),n,r+" playable paths");
    assert.equal((await page.locator("#progress").innerText()).trim(),"0 / "+n,r+" full quiz");
    assert.equal(await page.locator("#available").innerText(),"出題対象: "+n+" / 195");
    const malformed=await page.locator(".marker-group[transform*=NaN]").count();
    assert.equal(malformed,0,r+" invalid marker coordinates");
  }
  await page.locator("#region").selectOption("EU");
  assert.equal(await page.locator('.marker-group[data-iso="VA"]').count(),1,"Vatican City should have a clickable marker");
  await page.locator("#region").selectOption("OC");
  assert.equal(await page.locator('.marker-group[data-iso="KI"]').count(),1,"Kiribati marker should exist");
  await page.locator("#zoomIn").click();
  await page.locator("#zoomReset").click();
  await page.locator("#lang").selectOption("en");
  assert.equal((await page.locator("#title").innerText()).trim(),"World Map Puzzle");
  await page.locator("#lang").selectOption("ja");

  await page.locator("#region").selectOption("world");
  await page.locator("#count").selectOption("10");
  for(let i=1;i<=10;i++){
    const japanese=(await page.locator("#namePreview").innerText()).trim();
    const iso=names.get(japanese);
    assert.ok(iso,"Unmapped active prompt: "+japanese);
    await page.locator('path.land.playable[data-iso="'+iso+'"]').dispatchEvent("click");
    assert.equal((await page.locator("#progress").innerText()).trim(),i+" / 10","Progress after correct placement "+i);
  }
  assert.match(await page.locator("#message").innerText(),/全問クリア/);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelectorAll("path.land.playable").length===195,{timeout:45000});
  assert.equal((await page.locator("#progress").innerText()).trim(),"10 / 10","Completion should persist after reload");
  await page.locator("#shape").uncheck();
  await page.locator("#name").uncheck();
  assert.equal((await page.locator("#shapePreview svg").count()),0);
  assert.equal((await page.locator("#namePreview").innerText()).trim(),"");
  assert.equal((await page.locator("#flagPreview").innerText()).length>0,true);
  assert.deepEqual(errors,[],"Browser errors");
  console.log("PASS: 195 selectable countries; six region totals; microstate markers; language, flags, shape, zoom, 10 correct answers and reload.");
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
