(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const T = {
    ja: {
      tagline:"世界を、ひとつずつ。", title:"世界地図パズル",
      intro:"形・国旗・国名を自由に切り替えて、世界の195か国を覚えよう。",
      regionLabel:"地域",countLabel:"出題数",langLabel:"言語",shapeLabel:"形",flagLabel:"国旗",nameLabel:"国名",
      reset:"新しい問題",hint:"場所のヒント",skip:"後で答える",maphelp:"地図をタップして回答",
      instructions:"国の場所をタップ。ドラッグでも回答できます。拡大・縮小や移動で、小さな国を探せます。",
      footer:"対象は国連加盟193か国とオブザーバー2か国。学習記録はこのブラウザに保存されます。地図には領土・境界の簡略表示が含まれます。",
      regions:["世界全体","アジア","ヨーロッパ","アフリカ","北米・中米・カリブ海","南米","オセアニア"],
      correct:"正解！",wrong:"別の国です。もう一度！",finish:"全問クリア！おめでとう！",
      loading:"195か国の地図を読み込んでいます…",error:"地図の読み込みに失敗しました。再読み込みしてください。",
      miss:"ミス",hintmessage:"オレンジで示した国を探してね。",empty:"この地域の国が見つかりません。",
      remain:"残り",of:"出題対象",zoomIn:"拡大",zoomOut:"縮小",zoomReset:"表示をリセット",
      noRegion:"選択した地域の国を選んでね。",notCountry:"この場所は出題対象外です。"
    },
    en: {
      tagline:"One country at a time.",title:"World Map Puzzle",
      intro:"Learn all 195 countries by showing or hiding country shapes, flags, and names.",
      regionLabel:"Region",countLabel:"Questions",langLabel:"Language",shapeLabel:"Shape",flagLabel:"Flag",nameLabel:"Name",
      reset:"New game",hint:"Location hint",skip:"Skip for now",maphelp:"Tap a country to answer",
      instructions:"Tap or drag the card onto a country. Zoom and pan to find smaller countries.",
      footer:"Includes 193 UN member states and two observer states. Progress is saved in this browser. Boundaries are simplified for learning.",
      regions:["World","Asia","Europe","Africa","North America & Caribbean","South America","Oceania"],
      correct:"Correct!",wrong:"That's another country. Try again!",finish:"All done! Congratulations!",
      loading:"Loading the 195-country map…",error:"The map could not be loaded. Please reload the page.",
      miss:"Mistakes",hintmessage:"Look for the highlighted country.",empty:"No countries found in this region.",
      remain:"Remaining",of:"Available",zoomIn:"Zoom in",zoomOut:"Zoom out",zoomReset:"Reset view",
      noRegion:"Choose a country in the selected region.",notCountry:"This area is not in the quiz."
    }
  };
  const REGIONS=["world","AS","EU","AF","NA","SA","OC"];
  const AREAS={
    AS:{center:91,w:24,e:165,s:-16,n:81},
    EU:{center:25,w:-17,e:66,s:31,n:75},
    AF:{center:17,w:-21,e:57,s:-39,n:40},
    NA:{center:-105,w:-171,e:-48,s:5,n:80},
    SA:{center:-61,w:-84,e:-31,s:-59,n:15},
    OC:{center:177,w:104,e:-133,s:-52,n:25}
  };
  const SAVE_KEY="maplet-country-puzzle-195-v2";
  let lang="ja",region="world",hintIso=null,miss=0,pos=0,topology=null;
  let allFeatures=[],countries=[],featureByIso=new Map(),countryByIso=new Map();
  let questions=[],solved=[],viewProjection=null,geoPath=null,mapLayer=null,mapSvg=null,mapZoom=null,zoomTransform=d3.zoomIdentity;
  let visible={shape:true,flag:true,name:true};
  const label=k=>T[lang][k];
  const displayName=c=>lang==="ja"?c.ja:c.en;
  const belongs=(c,r)=>r==="world"||c.continent===r;
  const now=()=>questions[pos];
  const flagFor=iso=>[...iso].map(x=>String.fromCodePoint(127397+x.charCodeAt(0))).join("");

  function updateLabels(){
    document.documentElement.lang=lang;
    for(const k of Object.keys(T[lang])){
      if($(k)&&k!=="regions")$(k).textContent=label(k);
    }
    Array.from($("region").options).forEach((opt,i)=>{opt.textContent=label("regions")[i]});
    Array.from($("count").options).forEach((opt,i)=>{opt.textContent=i===2?(lang==="ja"?"すべて":"All"):(i===0?"10":"20")+(lang==="ja"?"か国":" countries")});
    $("zoomIn").setAttribute("aria-label",label("zoomIn"));
    $("zoomOut").setAttribute("aria-label",label("zoomOut"));
    $("zoomReset").setAttribute("aria-label",label("zoomReset"));
    updateProgress();
  }
  function updateProgress(){
    const total=countries.filter(c=>belongs(c,region)).length;
    $("available").textContent=label("of")+": "+total+" / 195";
    $("progress").textContent=pos+" / "+questions.length;
    $("bar").style.width=(questions.length?100*pos/questions.length:0)+"%";
    $("mistakes").textContent=label("miss")+" "+miss;
  }
  function save(){
    try{
      localStorage.setItem(SAVE_KEY,JSON.stringify({
        lang,region,count:$("count").value,visible,queue:questions.map(c=>c.iso),
        solved,pos,miss
      }));
    }catch(e){}
  }
  function shuffle(items){
    const a=[...items];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
    return a;
  }
  function restore(){
    try{
      const v=JSON.parse(localStorage.getItem(SAVE_KEY)||"null");
      if(!v||!REGIONS.includes(v.region)||!["10","20","all"].includes(v.count)||!Array.isArray(v.queue))return false;
      const eligible=countries.filter(c=>belongs(c,v.region)).length;
      const expected=v.count==="all"?eligible:Math.min(Number(v.count),eligible);
      const valid=new Set(v.queue);
      if(v.queue.length!==expected||valid.size!==expected||!v.queue.every(iso=>countryByIso.has(iso)&&belongs(countryByIso.get(iso),v.region)))return false;
      lang=v.lang==="en"?"en":"ja";region=v.region;
      $("lang").value=lang;$("region").value=region;$("count").value=v.count;
      visible={shape:v.visible?.shape!==false,flag:v.visible?.flag!==false,name:v.visible?.name!==false};
      if(!Object.values(visible).some(Boolean))visible.name=true;
      for(const k of ["shape","flag","name"])$(k).checked=visible[k];
      questions=v.queue.map(iso=>countryByIso.get(iso));
      pos=Math.max(0,Math.min(questions.length,Number(v.pos)||0));
      solved=Array.isArray(v.solved)?v.solved.filter(iso=>valid.has(iso)).slice(0,pos):[];
      miss=Math.max(0,Number(v.miss)||0);
      return true;
    }catch(e){return false;}
  }
  function createProjection(){
    if(region==="world"){
      viewProjection=d3.geoNaturalEarth1().fitExtent([[16,14],[944,514]],{type:"Sphere"});
    } else {
      const a=AREAS[region],corners=[[a.w,a.s],[a.w,a.n],[a.e,a.s],[a.e,a.n]];
      viewProjection=d3.geoMercator().rotate([-a.center,0]).fitExtent([[24,17],[936,513]],{type:"MultiPoint",coordinates:corners});
    }
    geoPath=d3.geoPath(viewProjection);
  }
  function countryIsPlayable(f){
    return !!f.country&&belongs(f.country,region);
  }
  function clickCountry(iso){
    if(!now())return;
    const c=countryByIso.get(iso);
    if(!c){$("message").textContent=label("notCountry");return;}
    if(!belongs(c,region)){$("message").textContent=label("noRegion");return;}
    answer(iso);
  }
  function makeMap(){
    createProjection();
    const svg=d3.select(mapSvg);
    svg.selectAll("*").remove();
    mapLayer=svg.append("g").attr("class","map-layer");
    mapLayer.append("path").datum({type:"Sphere"}).attr("class","sphere").attr("d",geoPath);
    mapLayer.append("g").attr("class","country-layer").selectAll("path")
      .data(allFeatures,d=>d.iso).join("path")
      .attr("class",f=>"land"+(countryIsPlayable(f)?" playable":" reference"))
      .attr("d",geoPath)
      .attr("data-iso",f=>f.iso)
      .attr("role",f=>countryIsPlayable(f)?"button":"img")
      .attr("tabindex",f=>countryIsPlayable(f)?0:-1)
      .attr("aria-label",f=>f.country?displayName(f.country):f.properties.name)
      .on("click",(event,f)=>{event.stopPropagation();clickCountry(f.iso)})
      .on("keydown",(event,f)=>{
        if((event.key==="Enter"||event.key===" ")&&countryIsPlayable(f)){
          event.preventDefault();clickCountry(f.iso);
        }
      });

    const markCountries=countries.filter(c=>{
      if(!belongs(c,region))return false;
      const f=featureByIso.get(c.iso);
      const a=geoPath.area(f);
      return !!c.marker||a<23;
    });
    const circleGroups=mapLayer.append("g").attr("class","marker-layer").selectAll("g")
      .data(markCountries,d=>d.iso).join("g")
      .attr("class","marker-group")
      .attr("data-iso",d=>d.iso)
      .attr("role","button")
      .attr("tabindex",0)
      .attr("aria-label",d=>displayName(d))
      .attr("transform",c=>{
        const coords=c.marker?viewProjection(c.marker):geoPath.centroid(featureByIso.get(c.iso));
        c._mapPoint=coords;
        return "translate("+coords[0]+","+coords[1]+")";
      })
      .on("click",(event,d)=>{event.stopPropagation();clickCountry(d.iso)})
      .on("keydown",(event,d)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();clickCountry(d.iso)}});

    circleGroups.append("circle").attr("class","marker-dot");
    circleGroups.append("circle").attr("class","marker-hit");
    setColors();
    svg.call(mapZoom.transform,d3.zoomIdentity);
  }
  function setColors(){
    if(!mapLayer)return;
    const seen=new Set(solved);
    mapLayer.selectAll(".land").classed("done",d=>seen.has(d.iso))
      .classed("hint",d=>d.iso===hintIso);
    mapLayer.selectAll(".marker-group").classed("done",d=>seen.has(d.iso))
      .classed("hint",d=>d.iso===hintIso);
    mapLayer.selectAll(".marker-group circle.marker-dot").attr("r",6.5/zoomTransform.k);
    mapLayer.selectAll(".marker-group circle.marker-hit").attr("r",12/zoomTransform.k);
    mapLayer.selectAll(".land").attr("aria-label",f=>f.country?displayName(f.country):f.properties.name);
    mapLayer.selectAll(".marker-group").attr("aria-label",d=>displayName(d));
  }
  function selectLargestPolygon(f){
    if(f.geometry?.type!=="MultiPolygon")return f;
    const polygons=f.geometry.coordinates;
    const main=polygons.reduce((best,coords)=>{
      const size=d3.geoArea({type:"Polygon",coordinates:coords});
      return size>best.size?{coords,size}:best;
    },{coords:polygons[0],size:-1});
    return {type:"Feature",geometry:{type:"Polygon",coordinates:main.coords},properties:f.properties};
  }
  function updatePiece(){
    updateProgress();
    const c=now();
    $("hint").disabled=!c;
    $("skip").disabled=!c||pos>=questions.length-1;
    const wrap=$("shapePreview");
    wrap.replaceChildren();
    $("flagPreview").textContent=c&&visible.flag?flagFor(c.iso):"";
    $("namePreview").textContent=c&&visible.name?displayName(c):"";
    $("detail").textContent=c?label("remain")+": "+(questions.length-pos):"";
    if(!c){if(questions.length)$("message").textContent=label("finish");return;}
    if(visible.shape){
      const f=selectLargestPolygon(featureByIso.get(c.iso));
      const p=d3.geoMercator().fitExtent([[10,8],[132,84]],f);
      const preview=d3.create("svg").attr("viewBox","0 0 142 92").attr("width",142).attr("height",92);
      preview.append("path").datum(f).attr("d",d3.geoPath(p)).attr("fill","#31886b").attr("stroke","#1f5a49").attr("stroke-width",1.4);
      wrap.appendChild(preview.node());
    }
  }
  function flashWrong(iso){
    if(!mapLayer)return;
    mapLayer.selectAll("[data-iso]").filter(function(){return this.getAttribute("data-iso")===iso})
      .classed("wrong",true);
    setTimeout(()=>{if(mapLayer)mapLayer.selectAll("[data-iso]").filter(function(){return this.getAttribute("data-iso")===iso}).classed("wrong",false)},500);
  }
  function answer(iso){
    const c=now();
    if(!c)return;
    if(c.iso===iso){
      solved.push(iso);pos++;hintIso=null;
      $("message").textContent=pos===questions.length?label("finish"):label("correct");
      save();setColors();updatePiece();
    } else {
      miss++;$("message").textContent=label("wrong");
      flashWrong(iso);updateProgress();save();
    }
  }
  function newGame(){
    if(!countries.length)return;
    region=$("region").value;
    const pool=shuffle(countries.filter(c=>belongs(c,region)));
    const n=$("count").value;
    questions=n==="all"?pool:pool.slice(0,Number(n));
    pos=0;miss=0;solved=[];hintIso=null;
    $("message").textContent=questions.length?"":label("empty");
    makeMap();updatePiece();save();
  }
  function showHint(){
    const c=now();if(!c)return;
    hintIso=c.iso;$("message").textContent=label("hintmessage");setColors();
    const f=featureByIso.get(c.iso);
    const pt=c.marker?viewProjection(c.marker):geoPath.centroid(f);
    if(!pt.every(Number.isFinite))return;
    const k=Math.max(4,zoomTransform.k);
    const t=d3.zoomIdentity.translate(480-k*pt[0],265-k*pt[1]).scale(k);
    d3.select(mapSvg).transition().duration(380).call(mapZoom.transform,t);
  }
  function registerEvents(){
    $("lang").addEventListener("change",()=>{
      lang=$("lang").value;updateLabels();updatePiece();setColors();save();
    });
    for(const k of ["shape","flag","name"]){
      $(k).addEventListener("change",()=>{
        visible[k]=$(k).checked;
        if(!Object.values(visible).some(Boolean)){visible[k]=true;$(k).checked=true;}
        updatePiece();save();
      });
    }
    for(const k of ["region","count"])$(k).addEventListener("change",newGame);
    $("reset").addEventListener("click",newGame);
    $("hint").addEventListener("click",showHint);
    $("skip").addEventListener("click",()=>{
      if(!now()||pos===questions.length-1)return;
      questions.push(questions.splice(pos,1)[0]);
      hintIso=null;$("message").textContent="";
      setColors();updatePiece();save();
    });
    $("piece").addEventListener("dragstart",e=>{if(!now())e.preventDefault();else e.dataTransfer.setData("text/plain",now().iso);});
    $("map").addEventListener("dragover",e=>e.preventDefault());
    $("map").addEventListener("drop",e=>{
      e.preventDefault();
      const t=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-iso]");
      if(t)clickCountry(t.getAttribute("data-iso"));
    });
    mapSvg=$("map");
    mapZoom=d3.zoom().scaleExtent([1,22]).translateExtent([[0,0],[960,530]]).extent([[0,0],[960,530]])
      .on("zoom",e=>{
        zoomTransform=e.transform;
        if(mapLayer)mapLayer.attr("transform",zoomTransform);
        if(mapLayer){
          mapLayer.selectAll(".marker-group circle.marker-dot").attr("r",6.5/zoomTransform.k);
          mapLayer.selectAll(".marker-group circle.marker-hit").attr("r",12/zoomTransform.k);
        }
      });
    d3.select(mapSvg).call(mapZoom);
    $("zoomIn").addEventListener("click",()=>d3.select(mapSvg).transition().duration(220).call(mapZoom.scaleBy,1.6));
    $("zoomOut").addEventListener("click",()=>d3.select(mapSvg).transition().duration(220).call(mapZoom.scaleBy,1/1.6));
    $("zoomReset").addEventListener("click",()=>d3.select(mapSvg).transition().duration(220).call(mapZoom.transform,d3.zoomIdentity));
  }
  async function init(){
    registerEvents();$("message").textContent=label("loading");
    try{
      if(!window.d3||!window.topojson)throw Error("d3 or topojson is missing");
      const [mapResponse,countriesResponse]=await Promise.all([
        fetch("./world-map.json"),fetch("./countries.json")
      ]);
      if(!mapResponse.ok||!countriesResponse.ok)throw Error("Missing local map or country data");
      topology=await mapResponse.json();countries=await countriesResponse.json();
      countryByIso=new Map(countries.map(c=>[c.iso,c]));
      allFeatures=topojson.feature(topology,topology.objects.merged).features;
      for(const f of allFeatures){f.iso=f.properties.iso_a2;f.country=countryByIso.get(f.iso)||null;featureByIso.set(f.iso,f);}
      if(countries.length!==195||countryByIso.size!==195||countries.some(c=>!featureByIso.has(c.iso))){
        throw Error("The expected 195 countries are not all represented");
      }
      const restored=restore();updateLabels();
      if(restored){makeMap();updatePiece()}else newGame();
      $("message").textContent=pos===questions.length?label("finish"):"";
    }catch(error){
      console.error("Maplet map initialization failed:",error);
      $("message").textContent=label("error");
    }
  }
  init();
})();