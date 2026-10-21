import assert from "node:assert/strict";
import fs from "node:fs";

const map=JSON.parse(fs.readFileSync("world-map.json","utf8"));
const countries=JSON.parse(fs.readFileSync("countries.json","utf8"));
const app=fs.readFileSync("app.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const shapes=map.objects?.merged?.geometries;
assert.equal(map.type,"Topology");
assert.ok(Array.isArray(shapes) && shapes.length>=250,"Detailed country shapes required");
assert.equal(countries.length,195,"Exactly 195 countries required");
const isoSet=new Set(countries.map(c=>c.iso));
assert.equal(isoSet.size,195,"Country ISO codes must be unique");
const required=new Set(shapes.filter(g=>g.properties?.type==="country"||g.properties?.iso_a2==="PS").map(g=>g.properties.iso_a2));
assert.equal(required.size,195,"Geographic source must describe 195 UN/observer countries");
assert.deepEqual([...isoSet].sort(),[...required].sort(),"Quiz list must exactly cover those 195 countries");
const shapeMap=new Map(shapes.map(g=>[g.properties.iso_a2,g]));
const regionCounts={AF:0,AS:0,EU:0,NA:0,SA:0,OC:0};
let micro=0;
for(const c of countries){
  assert.match(c.iso,/^[A-Z]{2}$/);
  assert.match(c.id,/^\d{3}$/);
  assert.ok(c.en&&c.ja,"Bilingual names required: "+c.iso);
  assert.ok(c.continent in regionCounts,"Unknown region: "+c.iso);
  regionCounts[c.continent]++;
  const shape=shapeMap.get(c.iso);
  assert.ok(shape,"Missing country geometry: "+c.iso);
  assert.ok(["Polygon","MultiPolygon"].includes(shape.type),"Country must have an actual shape: "+c.iso);
  assert.equal(String(shape.properties.iso_n3).padStart(3,"0"),c.id,"Numeric ISO mismatch "+c.iso);
  if(c.marker){
    micro++;
    assert.equal(c.marker.length,2,"Marker must have two coordinates");
    assert.ok(c.marker[0]>=-180&&c.marker[0]<=180&&c.marker[1]>=-90&&c.marker[1]<=90,"Invalid marker: "+c.iso);
  }
}
assert.deepEqual(regionCounts,{AF:54,AS:47,EU:44,NA:23,SA:12,OC:15});
assert.ok(micro>=24,"Tiny-country markers are missing");
assert.ok(isoSet.has("PS")&&isoSet.has("VA"),"UN observer states missing");
assert.ok(!isoSet.has("XK")&&!isoSet.has("TW")&&!isoSet.has("EH"),"Quiz must stick to its declared 195-country rule");
assert.ok(html.includes('src="./app.js"'));
assert.ok(app.includes('fetch("./world-map.json")')&&app.includes('fetch("./countries.json")'),"Country geography must be served locally");
console.log("PASS: 195 countries, six regional totals, actual shapes, bilingual names and "+micro+" microstate markers.");
