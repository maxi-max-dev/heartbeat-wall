/* ============================================================================
   hq.js — 「总部」等距皮外挂层
   约定(镜像闸门强制):本文件不写死门牌、不含任何身份字符串;要显示门牌一律
   运行时读 #home-name 元素。由 index.html 在主脚本之前同步加载,主引擎通过
   window.__HB_EXT__ 接缝调用:
     makeSkin(T) → 返回皮肤定义(注册进引擎 SKINS);T 是引擎工具箱
   本文件缺席或报错时,主站自动回落三套内置皮,零依赖。
   ============================================================================ */
(function(){
  "use strict";

  /* ---------------- 引擎工具箱(makeSkin 时注入) ---------------- */
  var T = null, ctx = null, canvas = null;
  var DPR = 1, WW = 640, WH = 430;
  var ZONES = null, AGENT_CATEGORY = null, bigNum = null;
  function S(){ return T.scale(); }
  function OFF(){ return T.offset(); }

  /* ---------------- 等距投影与调色板(与原内置版逐字一致) ---------------- */
  var ISO_K = 0.52;
  var ISO_CX = 0;      /* makeSkin 里按 WW 计算 */
  var ISO_CY = 128;
  var HQ_TH = "day", HQ_NOW = null;
  var hqCache = null, hqCacheKey = "";
  function isoP(wx, wy){ return [ISO_CX + (wx - wy) * ISO_K, ISO_CY + (wx + wy) * ISO_K * 0.5]; }
  function isoUnproject(px, py){
    var a = (px - ISO_CX) / ISO_K;
    var b = (py - ISO_CY) / (ISO_K * 0.5);
    return [(a + b) / 2, (b - a) / 2];
  }
  var HQP = {
    bg1:"#f3f6fa", bg2:"#e4e9f0",
    floor:"#f1f4f8", floorAlt:"#eaeef4", floorEdge:"#d7dce3", edgeR:"#d3d8e0", edgeF:"#c7cdd6",
    glass:"rgba(206,224,236,0.42)", glassTop:"rgba(150,180,205,0.55)",
    wood:"#cdb79a", woodDark:"#b39c7c",
    robotBody:"#f6f8fb", robotShade:"#dfe5ee", robotFace:"#23282f",
    dash:"#20252e", dashGlow:"#5ad0a0", shadow:"rgba(70,90,120,0.16)"
  };
  var HQ_ZONE = {
    green:  {soft:"rgba(124,197,154,0.16)", dot:"#57b985", edge:"rgba(90,170,120,0.5)"},
    blue:   {soft:"rgba(130,170,220,0.14)", dot:"#6f9fda", edge:"rgba(110,150,205,0.5)"},
    yellow: {soft:"rgba(232,193,78,0.15)",  dot:"#e0a83a", edge:"rgba(200,165,70,0.5)"},
    red:    {soft:"rgba(232,115,92,0.14)",  dot:"#e0735c", edge:"rgba(205,105,85,0.5)"},
    purple: {soft:"rgba(182,154,224,0.16)", dot:"#9a76d6", edge:"rgba(150,120,200,0.5)"}
  };
  var CAT_ZONE = {
    "造物":"green", "备份":"green",
    "情报":"blue", "采集":"blue", "瞭望":"blue",
    "牧场":"yellow", "值守":"yellow",
    "外勤":"red",
    "管家":"purple", "占卜":"purple"
  };
  function hqZoneOf(agent){ return HQ_ZONE[CAT_ZONE[AGENT_CATEGORY[agent]] || "blue"]; }
  function hqRoundRect(x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  }
  function hqEmoji(x, y, e, sz){
    ctx.font = sz + "px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  function hqDiamondPath(x0, y0, x1, y1){
    var a=isoP(x0,y0), b=isoP(x1,y0), c=isoP(x1,y1), d=isoP(x0,y1);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.closePath();
  }
  function hqFloor(){
    hqDiamondPath(0,0,WW,WH); ctx.fillStyle=HQP.floor; ctx.fill();
    ctx.save(); hqDiamondPath(0,0,WW,WH); ctx.clip();
    var CELL=40;
    for (var gy=0; gy<WH; gy+=CELL){
      for (var gx=0; gx<WW; gx+=CELL){
        if (((gx/CELL)+(gy/CELL)) % 2){
          var a=isoP(gx,gy), b=isoP(gx+CELL,gy), c=isoP(gx+CELL,gy+CELL), d=isoP(gx,gy+CELL);
          ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.closePath();
          ctx.fillStyle=HQP.floorAlt; ctx.fill();
        }
      }
    }
    ctx.restore();
    hqDiamondPath(0,0,WW,WH); ctx.strokeStyle=HQP.floorEdge; ctx.lineWidth=1.5; ctx.stroke();
  }
  function hqFloorEdge(){
    var T2=13, p1=isoP(WW,0), p2=isoP(WW,WH), p3=isoP(0,WH);
    ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.lineTo(p2[0],p2[1]+T2); ctx.lineTo(p1[0],p1[1]+T2); ctx.closePath();
    ctx.fillStyle=HQP.edgeR; ctx.fill();
    ctx.beginPath(); ctx.moveTo(p2[0],p2[1]); ctx.lineTo(p3[0],p3[1]); ctx.lineTo(p3[0],p3[1]+T2); ctx.lineTo(p2[0],p2[1]+T2); ctx.closePath();
    ctx.fillStyle=HQP.edgeF; ctx.fill();
  }
  function hqZoneBlock(z, zone){
    var a=isoP(z.x,z.y), b=isoP(z.x+z.w,z.y), c=isoP(z.x+z.w,z.y+z.h), d=isoP(z.x,z.y+z.h);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.closePath();
    ctx.fillStyle=zone.soft; ctx.fill();
    ctx.strokeStyle=zone.edge; ctx.lineWidth=1.6; ctx.setLineDash([6,5]); ctx.stroke(); ctx.setLineDash([]);
  }
  function hqGlassWall(x1, y1, x2, y2, hz){
    var b1=isoP(x1,y1), b2=isoP(x2,y2), t1=[b1[0],b1[1]-hz], t2=[b2[0],b2[1]-hz];
    ctx.beginPath(); ctx.moveTo(b1[0],b1[1]); ctx.lineTo(b2[0],b2[1]); ctx.lineTo(t2[0],t2[1]); ctx.lineTo(t1[0],t1[1]); ctx.closePath();
    var gg=ctx.createLinearGradient(t1[0],t1[1],b1[0],b1[1]);
    gg.addColorStop(0,HQP.glassTop); gg.addColorStop(1,HQP.glass); ctx.fillStyle=gg; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.5)"; ctx.lineWidth=1.2;
    for (var k=0.1; k<1; k+=0.12){
      var bx=b1[0]+(b2[0]-b1[0])*k, by=b1[1]+(b2[1]-b1[1])*k;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx,by-hz); ctx.stroke();
    }
    ctx.strokeStyle=HQP.wood; ctx.lineWidth=4; ctx.lineJoin="round";
    ctx.beginPath(); ctx.moveTo(t1[0],t1[1]); ctx.lineTo(t2[0],t2[1]); ctx.stroke();
    ctx.strokeStyle=HQP.woodDark; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(b1[0],b1[1]); ctx.lineTo(t1[0],t1[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b2[0],b2[1]); ctx.lineTo(t2[0],t2[1]); ctx.stroke();
    ctx.strokeStyle=HQP.woodDark; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(b1[0],b1[1]); ctx.lineTo(b2[0],b2[1]); ctx.stroke();
  }
  function hqIsoBox(wx, wy, ww, wd, hz, topC, leftC, rightC){
    var t0=isoP(wx,wy), t1=isoP(wx+ww,wy), t2=isoP(wx+ww,wy+wd), t3=isoP(wx,wy+wd);
    ctx.beginPath(); ctx.moveTo(t0[0],t0[1]-hz); ctx.lineTo(t1[0],t1[1]-hz); ctx.lineTo(t2[0],t2[1]-hz); ctx.lineTo(t3[0],t3[1]-hz); ctx.closePath();
    ctx.fillStyle=topC; ctx.fill();
    ctx.beginPath(); ctx.moveTo(t3[0],t3[1]-hz); ctx.lineTo(t2[0],t2[1]-hz); ctx.lineTo(t2[0],t2[1]); ctx.lineTo(t3[0],t3[1]); ctx.closePath();
    ctx.fillStyle=leftC; ctx.fill();
    ctx.beginPath(); ctx.moveTo(t1[0],t1[1]-hz); ctx.lineTo(t2[0],t2[1]-hz); ctx.lineTo(t2[0],t2[1]); ctx.lineTo(t1[0],t1[1]); ctx.closePath();
    ctx.fillStyle=rightC; ctx.fill();
  }
  function hqPlant(wx, wy){
    var p=isoP(wx,wy);
    ctx.fillStyle=HQP.shadow; ctx.beginPath(); ctx.ellipse(p[0],p[1],12,6,0,0,6.283); ctx.fill();
    hqIsoBox(wx-6,wy-6,12,12,9,"#e6d5ba","#d8c3a6","#c8b193");
    var cx=p[0], cy=p[1]-15;
    ctx.fillStyle="#4a8a5c"; ctx.beginPath(); ctx.ellipse(cx-4,cy+2,9,11,-0.2,0,6.283); ctx.fill();
    ctx.fillStyle="#5fa872"; ctx.beginPath(); ctx.ellipse(cx+3,cy,10,13,0.25,0,6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx-2,cy-6,8,10,0,0,6.283); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(cx+2,cy-4,4,6,0.2,0,6.283); ctx.fill();
  }
  function hqDesk(dx, dy, lit){
    var w=54, d=26;
    hqIsoBox(dx-w/2, dy-d, w, d, 16, "#fbfcfe","#e4e8ef","#d6dbe4");
    var s=isoP(dx, dy-d+5), sx=s[0], sy=s[1]-16;
    ctx.fillStyle="#c3c9d2"; ctx.fillRect(sx-2,sy-3,4,6);
    ctx.fillStyle="#2b313a"; hqRoundRect(sx-15,sy-24,30,21,3); ctx.fill();
    if (lit){
      var sg=ctx.createLinearGradient(sx-12,sy-21,sx+12,sy-6);
      sg.addColorStop(0,"#7de3b4"); sg.addColorStop(1,"#4bbd8a"); ctx.fillStyle=sg;
    } else ctx.fillStyle="#39414c";
    hqRoundRect(sx-12,sy-21,24,15,2); ctx.fill();
    if (lit){
      ctx.fillStyle="rgba(255,255,255,0.85)";
      ctx.fillRect(sx-8,sy-11,4,4); ctx.fillRect(sx-2,sy-13,4,6); ctx.fillRect(sx+4,sy-10,3,3);
      ctx.fillStyle="rgba(255,255,255,0.4)"; ctx.fillRect(sx-8,sy-18,15,1.5); ctx.fillRect(sx-8,sy-15,9,1.5);
      if (HQ_TH!=="day"){ ctx.fillStyle="rgba(120,230,180,0.16)"; ctx.beginPath(); ctx.ellipse(sx,sy-13,24,15,0,0,6.283); ctx.fill(); }
    }
  }
  function hqDashboard(x1, x2, wallH, big, sub, barsArr){
    var l=isoP(x1,0), r=isoP(x2,0), slope=(r[1]-l[1])/(r[0]-l[0]);
    var pTop=wallH+12, pBot=6;
    function pt(fx, up){ var x=l[0]+(r[0]-l[0])*fx; var y=l[1]+(x-l[0])*slope - up; return [x,y]; }
    var A=pt(0,pTop), B=pt(1,pTop), C=pt(1,pBot), D=pt(0,pBot);
    ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.lineTo(C[0],C[1]); ctx.lineTo(D[0],D[1]); ctx.closePath();
    ctx.fillStyle=HQP.dash; ctx.fill(); ctx.strokeStyle="#3a4250"; ctx.lineWidth=2; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.lineTo(C[0],C[1]); ctx.lineTo(D[0],D[1]); ctx.closePath(); ctx.clip();
    var bars = barsArr || [];   /* 真实占比柱(各接表居民),没有真数就不画 */
    for (var i=0;i<bars.length;i++){
      var fx=0.07+i*0.045, base=pt(fx, pTop-6), bh=Math.max(2, bars[i]*15);
      ctx.fillStyle=HQP.dashGlow; ctx.fillRect(base[0], base[1], 5, bh);
    }
    ctx.fillStyle="#8fe8c4"; ctx.font="bold 13px -apple-system,Menlo,monospace"; ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    ctx.shadowColor="rgba(90,208,160,0.7)"; ctx.shadowBlur = (HQ_TH==="night") ? 9 : 0;
    var np=pt(0.05, pBot+16); ctx.fillText(big, np[0]+4, np[1]); ctx.shadowBlur=0;
    ctx.fillStyle="rgba(143,232,196,0.55)"; ctx.font="8px -apple-system,'PingFang SC',sans-serif";
    var sp=pt(0.06, pBot+5); ctx.fillText(sub, sp[0]+5, sp[1]);
    ctx.restore();
  }
  function hqTrophyCabinet(wx, wy){
    var trophyUnlocked = T.trophyUnlocked();
    if (trophyUnlocked == null) return;
    var H=54, D=34;
    hqIsoBox(wx, wy, 14, D, H, "#f1eaf7","#cfbfe4","#bfaed9");
    var f0=isoP(wx,wy), f1=isoP(wx,wy+D);
    function face(fy, up){ var x=f0[0]+(f1[0]-f0[0])*fy; var y=f0[1]+(f1[1]-f0[1])*fy - up; return [x,y]; }
    for (var r=0;r<3;r++){
      var up=12+r*15, s0=face(0.08,up), s1=face(0.92,up);
      ctx.strokeStyle="rgba(120,90,160,0.55)"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(s0[0],s0[1]); ctx.lineTo(s1[0],s1[1]); ctx.stroke();
      for (var c=0;c<2;c++){
        var g=face(0.28+c*0.42, up), tx=g[0], ty=g[1]-2;
        ctx.fillStyle="#eac24c"; ctx.beginPath(); ctx.moveTo(tx-4,ty-10); ctx.quadraticCurveTo(tx,ty-1,tx+4,ty-10); ctx.closePath(); ctx.fill();
        ctx.fillRect(tx-1,ty-10,2,5); ctx.fillRect(tx-4,ty-5,8,2);
      }
    }
    var bp=face(0.5, H+7), txt="🏆 "+trophyUnlocked;
    ctx.font="bold 10px -apple-system,'PingFang SC',sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
    var w=ctx.measureText(txt).width+10;
    ctx.fillStyle="rgba(60,40,90,0.82)"; hqRoundRect(bp[0]-w/2, bp[1]-8, w, 15, 7); ctx.fill();
    ctx.fillStyle="#ffe9b0"; ctx.fillText(txt, bp[0], bp[1]);
    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
  }
  function hqAchStack(agent, z){
    var cat=AGENT_CATEGORY[agent]; if (!cat) return;
    var n=T.achByCategory()[cat]||0; if (n<=0) return;
    var zone=hqZoneOf(agent), p=isoP(z.x+z.w*0.72, z.y+z.h*0.42), cap=Math.min(n,6);
    for (var i=0;i<cap;i++){
      var col=i%3, row=Math.floor(i/3), bx=p[0]-8+col*7, by=p[1]-row*6;
      ctx.fillStyle=zone.dot; ctx.fillRect(bx-2.5,by-2.5,5,5);
      ctx.fillStyle="rgba(255,255,255,0.4)"; ctx.fillRect(bx-2.5,by-2.5,2,2);
    }
    var txt="×"+n;
    ctx.font="bold 9px -apple-system,sans-serif"; ctx.textAlign="left"; ctx.textBaseline="middle";
    var w=ctx.measureText(txt).width+7;
    ctx.fillStyle="rgba(30,30,40,0.7)"; hqRoundRect(p[0]+10, p[1]-8, w, 13, 5); ctx.fill();
    ctx.fillStyle="#fff"; ctx.fillText(txt, p[0]+14, p[1]-1); ctx.textBaseline="alphabetic";
  }
  function hqRobot(a){
    var p=isoP(a.x, a.y), x=p[0], y=p[1], now=HQ_NOW;
    var zone=hqZoneOf(a.agent), color=zone.dot;
    var alpha=(a.cond==="tidy")?0.55:1;
    var bob=(now!==null && a.cond==="resting" && a.moving) ? Math.sin(now/160+a.phase)*1.5 : 0;
    ctx.save(); ctx.globalAlpha=alpha; y+=bob;
    ctx.fillStyle=HQP.shadow; ctx.beginPath(); ctx.ellipse(x,y,14,6,0,0,6.283); ctx.fill();
    var by=y-6;
    ctx.fillStyle=HQP.robotShade; hqRoundRect(x-14,by-23,28,25,12); ctx.fill();
    ctx.fillStyle=(a.cond==="tidy")?"#e4e9f0":HQP.robotBody; hqRoundRect(x-14,by-25,28,25,12); ctx.fill();
    ctx.fillStyle=color; hqRoundRect(x-14,by-9,28,5,2.5); ctx.fill();
    ctx.fillStyle=HQP.robotBody;
    ctx.beginPath(); ctx.ellipse(x-14,by-13,4,6,-0.2,0,6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+14,by-13,4,6,0.2,0,6.283); ctx.fill();
    var hy=by-35;
    ctx.fillStyle=HQP.robotShade; ctx.beginPath(); ctx.arc(x,hy+1.5,14,0,6.283); ctx.fill();
    ctx.fillStyle=(a.cond==="tidy")?"#e4e9f0":HQP.robotBody; ctx.beginPath(); ctx.arc(x,hy,14,0,6.283); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.ellipse(x-5,hy-6,4,3,-0.4,0,6.283); ctx.fill();
    ctx.strokeStyle=HQP.robotShade; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,hy-14); ctx.lineTo(x,hy-20); ctx.stroke();
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,hy-22,3,0,6.283); ctx.fill();
    var faceRed=(a.cond==="mess");
    ctx.fillStyle=faceRed?"#3a2226":HQP.robotFace; hqRoundRect(x-10,hy-8,20,16,7); ctx.fill();
    var eyeC=faceRed?"#ff9a86":"#6fe8bd";
    var blink=(now!==null && a.cond!=="sleeping" && Math.floor(now/220+a.phase*3)%20===0);
    ctx.fillStyle=eyeC;
    if (a.cond==="sleeping" || blink){
      ctx.fillRect(x-6,hy+0.5,4,1.6); ctx.fillRect(x+2,hy+0.5,4,1.6);
    } else {
      ctx.beginPath(); ctx.arc(x-4,hy+1,2.3,0,6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(x+4,hy+1,2.3,0,6.283); ctx.fill();
      if (a.cond==="working"){ ctx.fillStyle="rgba(255,140,120,0.5)"; ctx.beginPath(); ctx.arc(x-7,hy+5,1.8,0,6.283); ctx.fill(); ctx.beginPath(); ctx.arc(x+7,hy+5,1.8,0,6.283); ctx.fill(); }
    }
    ctx.restore();
    if (a.cond==="sleeping"){
      ctx.fillStyle="rgba(120,140,170,0.55)"; hqRoundRect(x-9,y-3,18,5,2); ctx.fill();
      ctx.fillStyle="#7fd6a0"; ctx.fillRect(x-6,y-2,4,3);
      ctx.fillStyle="rgba(150,170,200,0.9)"; hqEmoji(x+13,hy-14,"💤",11);
    }
    if (a.cond==="mess"){ ctx.fillStyle="#e8b34a"; hqEmoji(x,hy-24,"⚠️",12); }
  }
  function hqPillAt(x, y, dot, label){
    var cw=canvas.width/DPR, fs=cw<520?10:11;
    ctx.font="bold "+fs+"px -apple-system,'PingFang SC',sans-serif";
    var tw=ctx.measureText(label).width, w=tw+24, h=fs+9;
    x=Math.min(Math.max(x, w/2+3), cw-w/2-3);
    ctx.save(); ctx.shadowColor="rgba(60,80,110,0.22)"; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
    ctx.fillStyle="#ffffff"; hqRoundRect(x-w/2,y-h/2,w,h,h/2); ctx.fill(); ctx.restore();
    ctx.fillStyle=dot; ctx.beginPath(); ctx.arc(x-w/2+11,y,4,0,6.283); ctx.fill();
    ctx.fillStyle="#20252c"; ctx.textAlign="left"; ctx.textBaseline="middle"; ctx.fillText(label, x-w/2+19, y+0.5);
    ctx.textBaseline="alphabetic";
    ctx.strokeStyle="rgba(120,140,165,0.3)"; ctx.lineWidth=1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(x,y+h/2); ctx.lineTo(x,y+h/2+10); ctx.stroke(); ctx.setLineDash([]);
    return x;
  }
  function hqLabels(){
    var sc=S(), o=OFF(), meterByAgent=T.meters(), actors=T.actors();
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cw=canvas.width/DPR, narrow=cw<520;   /* 窄屏精简:只留部门药丸,电表/名牌/气泡在别处已有 */
    Object.keys(ZONES).forEach(function(agent){
      var z=ZONES[agent], zone=hqZoneOf(agent), p=isoP(z.x+z.w/2, z.y+4);
      var px2=p[0]*sc+o[0], py2=(p[1]-34)*sc+o[1];
      var pc=hqPillAt(px2, py2, zone.dot, z.name);
      if (!narrow && meterByAgent[agent]>0){
        ctx.font="bold 8.5px -apple-system,'PingFang SC',sans-serif";
        var mt="⚡"+bigNum(meterByAgent[agent]), mw=ctx.measureText(mt).width+10;
        var mx=Math.min(Math.max(pc, mw/2+3), cw-mw/2-3);
        ctx.fillStyle="rgba(34,26,14,0.85)"; hqRoundRect(mx-mw/2, py2+11, mw, 13, 4); ctx.fill();
        ctx.fillStyle="#ffce7a"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(mt, mx, py2+18);
        ctx.textAlign="left"; ctx.textBaseline="alphabetic";
      }
    });
    if (!narrow){
      ctx.font="9px -apple-system,'PingFang SC',sans-serif"; ctx.textAlign="center";
      actors.forEach(function(a){
        if (a.cond!=="resting") return;
        var p=isoP(a.x, a.y), sx=p[0]*sc+o[0], sy=(p[1]-56)*sc+o[1];
        var w=ctx.measureText(a.agent).width+8;
        ctx.fillStyle="rgba(255,255,255,0.92)"; hqRoundRect(sx-w/2, sy-8, w, 13, 6); ctx.fill();
        ctx.fillStyle="#3a424e"; ctx.textBaseline="middle"; ctx.fillText(a.agent, sx, sy-1); ctx.textBaseline="alphabetic";
      });
      var rec=actors.filter(function(a){ return a.agent==="门房"; })[0];
      if (rec){ var rp=isoP(rec.x, rec.y); hqBubble(rp[0]*sc+o[0]+14, (rp[1]-80)*sc+o[1], "欢迎回来 👋"); }
    }
    ctx.restore(); ctx.setTransform(DPR*sc, 0, 0, DPR*sc, DPR*o[0], DPR*o[1]);
  }
  function hqLightPools(){
    var actors=T.actors();
    ctx.globalCompositeOperation="lighter";
    actors.forEach(function(a){
      var r=a.cond==="working"?60:(a.cond==="resting"?40:0); if (!r) return;
      var p=isoP(a.x, a.y), pulse=(HQ_NOW!==null && a.cond==="working")?(1+0.08*Math.sin(HQ_NOW/300+a.phase)):1;
      var cx=p[0], cy=p[1]-6, g=ctx.createRadialGradient(cx,cy,0,cx,cy,r*pulse);
      g.addColorStop(0,"rgba(255,190,110,0.24)"); g.addColorStop(0.55,"rgba(255,180,95,0.09)"); g.addColorStop(1,"rgba(255,180,95,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(cx,cy,r*pulse,r*pulse*0.62,0,0,6.283); ctx.fill();
    });
    ctx.globalCompositeOperation="source-over";
  }
  function hqParticles(){
    var particles=T.particles();
    for (var i=0;i<particles.length;i++){
      var p=particles[i], k=Math.max(0,p.life/p.max), q=isoP(p.x,p.y);
      ctx.globalAlpha=k;
      if (p.t==="ring"){ ctx.strokeStyle=p.c; ctx.lineWidth=1.4; ctx.beginPath(); ctx.ellipse(q[0],q[1],p.r,p.r*0.5,0,0,6.283); ctx.stroke(); }
      else if (p.t==="steam"){ ctx.globalAlpha=1; ctx.fillStyle="rgba("+p.c+","+(k*0.45)+")"; ctx.beginPath(); ctx.arc(q[0],q[1],p.r,0,6.283); ctx.fill(); }
      else { ctx.fillStyle=p.c; ctx.fillRect(q[0]-1.5,q[1]-2.5,3,3); }
    }
    ctx.globalAlpha=1;
  }
  function hqBubble(px2, py2, text){
    ctx.font="11px -apple-system,'PingFang SC',sans-serif";
    var w=ctx.measureText(text).width+18, x=px2, y=py2;
    ctx.save(); ctx.shadowColor="rgba(60,80,110,0.22)"; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
    ctx.fillStyle="#ffffff"; hqRoundRect(x,y,w,24,12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+8,y+21); ctx.lineTo(x+3,y+32); ctx.lineTo(x+18,y+22); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle="#2a2f37"; ctx.textAlign="left"; ctx.textBaseline="middle"; ctx.fillText(text, x+9, y+12);
    ctx.textBaseline="alphabetic";
  }
  function hqDrawStatic(th){
    /* 背景铺满整块画布(全屏 contain 模式下含信箱边),再在世界坐标里画楼层 */
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    var g=ctx.createLinearGradient(0,0,0,ctx.canvas.height);
    if (th==="night"){ g.addColorStop(0,"#2a3550"); g.addColorStop(1,"#1c2438"); }
    else if (th==="dusk"){ g.addColorStop(0,"#f0e2d8"); g.addColorStop(1,"#e0cdc0"); }
    else { g.addColorStop(0,HQP.bg1); g.addColorStop(1,HQP.bg2); }
    ctx.fillStyle=g; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.restore();
    hqFloorEdge(); hqFloor();
    if (th!=="day"){ ctx.save(); hqDiamondPath(0,0,WW,WH); ctx.clip(); ctx.fillStyle= th==="night"?"rgba(26,40,74,0.34)":"rgba(150,70,25,0.10)"; ctx.fill(); ctx.restore(); }
    Object.keys(ZONES).forEach(function(agent){ hqZoneBlock(ZONES[agent], hqZoneOf(agent)); });
    var WALLH=56;
    hqGlassWall(0,0, WW,0, WALLH);
    hqGlassWall(0,0, 0,WH, WALLH);
    var meterByAgent=T.meters(), heartTotal=T.heartTotal();
    var meterTotal=0, mvals=[];
    Object.keys(meterByAgent).forEach(function(k){ meterTotal+=meterByAgent[k]; mvals.push(meterByAgent[k]); });
    mvals.sort(function(a,b){ return b-a; });
    var mmax=Math.max.apply(null, mvals.concat([1]));
    if (meterTotal>0) hqDashboard(468,636, WALLH, bigNum(meterTotal), "全家今日 token", mvals.map(function(v){ return v/mmax; }));
    else if (heartTotal>0) hqDashboard(468,636, WALLH, "❤ "+heartTotal, "今日心跳", []);
  }
  function hqBuildCache(th){
    if (!hqCache) hqCache=document.createElement("canvas");
    if (hqCache.width!==canvas.width || hqCache.height!==canvas.height){ hqCache.width=canvas.width; hqCache.height=canvas.height; }
    var real=ctx; ctx=hqCache.getContext("2d");
    var sc=S(), o=OFF();
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,hqCache.width,hqCache.height);
    ctx.setTransform(DPR*sc,0,0,DPR*sc,DPR*o[0],DPR*o[1]);
    HQ_TH=th; hqDrawStatic(th);
    ctx=real;
  }
  function hqScene(th, now){
    HQ_TH=th; HQ_NOW=now;
    var sc=S(), o=OFF();
    var meterByAgent=T.meters(), heartTotal=T.heartTotal(), trophyUnlocked=T.trophyUnlocked(), actors=T.actors(), particles=T.particles();
    var meterTotal=0; Object.keys(meterByAgent).forEach(function(k){ meterTotal+=meterByAgent[k]; });
    var key=th+"|"+canvas.width+"|"+meterTotal+"|"+heartTotal;
    if (key!==hqCacheKey){ hqBuildCache(th); hqCacheKey=key; }
    ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(hqCache,0,0); ctx.setTransform(DPR*sc,0,0,DPR*sc,DPR*o[0],DPR*o[1]);
    var condBy={}; actors.forEach(function(a){ condBy[a.agent]=a.cond; });
    var items=[];
    Object.keys(ZONES).forEach(function(agent){
      var z=ZONES[agent];
      items.push({d:z.desk[0]+z.desk[1]-13, fn:(function(zz,ag){ return function(){ hqDesk(zz.desk[0], zz.desk[1], condBy[ag]==="working"); }; })(z,agent)});
      items.push({d:z.x+z.w*0.72+z.y+z.h*0.42, fn:(function(zz,ag){ return function(){ hqAchStack(ag,zz); }; })(z,agent)});
    });
    if (trophyUnlocked!=null) items.push({d:398+330, fn:function(){ hqTrophyCabinet(398,330); }});
    var plants=[[320,150],[250,240],[400,210],[96,100],[544,110],[300,300],[430,360],[150,250]];
    plants.forEach(function(pt){ items.push({d:pt[0]+pt[1], fn:(function(q){ return function(){ hqPlant(q[0],q[1]); }; })(pt)}); });
    actors.forEach(function(a){ items.push({d:a.x+a.y+0.5, fn:(function(ac){ return function(){ hqRobot(ac); }; })(a)}); });
    items.sort(function(p,q){ return p.d-q.d; });
    for (var i=0;i<items.length;i++) items[i].fn();
    if (particles.length) hqParticles();
    if (th!=="day") hqLightPools();
    hqLabels();
  }

  /* ---------------- 接缝出口 ---------------- */
  function makeSkin(toolkit){
    T = toolkit;
    canvas = T.canvas;
    ctx = canvas.getContext("2d");
    DPR = T.dpr; WW = T.world.WW; WH = T.world.WH;
    ZONES = T.zones; AGENT_CATEGORY = T.agentCategory; bigNum = T.bigNum;
    ISO_CX = WW / 2 - 105 * ISO_K;
    return { id:"hq", name:"总部", icon:"🏢", scene:hqScene, unproject:isoUnproject, project:isoP };
  }

  /* ==========================================================================
     全屏总控台 HUD(initHud 注入页面工具箱 H 后生效)
     真值纪律:所有信息静态同步渲染,不依赖 rAF;时间戳挂 data-ts 由页面 tick 自刷。
     门牌只读 #home-name(镜像端换牌后的 DOM),绝不读数据里的中性名。
     ========================================================================== */
  var H = null, hud = null, full = false, panelAgent = null;
  var els = {}, clockTimer = null;

  var DOT = { working:"#57b985", resting:"#e0a83a", mess:"#e0735c", sleeping:"#8b98a8", tidy:"#8b98a8" };
  function zoneDot(agent){
    if (AGENT_CATEGORY && CAT_ZONE[AGENT_CATEGORY[agent]]) return HQ_ZONE[CAT_ZONE[AGENT_CATEGORY[agent]]].dot;
    return "#6f9fda";
  }
  function tone(){
    var h = H.hourNow();
    return (h >= 6 && h < 16) ? "day" : (h >= 16 && h < 19) ? "dusk" : "night";
  }
  function doorName(){
    var n = document.getElementById("home-name");
    return n ? n.textContent : "";
  }
  function clockText(){
    var d = new Date();
    return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
  }
  function mk(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function tsSpan(iso, cls){
    var s = mk("span", cls || "");
    s.setAttribute("data-ts", iso);
    s.textContent = H.relTime(iso);
    return s;
  }
  function stripIds(node){
    if (node.removeAttribute) node.removeAttribute("id");
    var withId = node.querySelectorAll ? node.querySelectorAll("[id]") : [];
    for (var i = 0; i < withId.length; i++) withId[i].removeAttribute("id");
    return node;
  }

  var HUD_CSS = "" +
    "html.hq-full,html.hq-full body{height:100%;overflow:hidden}" +
    "html.hq-full .wrap{max-width:none;padding:0}" +
    "html.hq-full .wrap>*{display:none}" +
    "html.hq-full .wrap>.scene-card{display:block;margin:0}" +
    "html.hq-full .scene-card .map-frame{position:fixed;inset:0;border:none;border-radius:0;box-shadow:none;background:transparent;z-index:40}" +
    "html.hq-full .scene-caption,html.hq-full .scene-hint,html.hq-full .theme-switch,html.hq-full .peek{display:none}" +
    "#hq-hud{position:fixed;inset:0;z-index:50;pointer-events:none;" +
      "--hp-bg:rgba(255,255,255,.9);--hp-bg2:rgba(244,248,252,.85);--hp-tx:#242b35;--hp-dim:#5a6675;--hp-bd:rgba(120,140,165,.3);--hp-sh:0 4px 18px rgba(40,60,90,.16)}" +
    "#hq-hud[data-tone=\"night\"]{--hp-bg:rgba(21,29,47,.92);--hp-bg2:rgba(30,40,62,.88);--hp-tx:#e8eefb;--hp-dim:#9fb0c8;--hp-bd:rgba(140,165,200,.28);--hp-sh:0 4px 18px rgba(0,0,10,.4)}" +
    "#hq-hud[data-tone=\"dusk\"]{--hp-bg:rgba(252,244,238,.92);--hp-bg2:rgba(246,235,226,.88);--hp-tx:#3a2f28;--hp-dim:#7a6a5c;--hp-bd:rgba(170,140,110,.32)}" +
    "#hq-hud[hidden]{display:none}" +
    "#hq-hud .hqh-pe{pointer-events:auto}" +
    "#hq-hud button{font-family:inherit}" +
    ".hqh-card{background:var(--hp-bg);border:1px solid var(--hp-bd);border-radius:12px;box-shadow:var(--hp-sh);color:var(--hp-tx)}" +
    ".hqh-top{position:absolute;top:10px;left:12px;right:12px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}" +
    ".hqh-door{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;font-weight:800;font-size:14px}" +
    ".hqh-chip{display:inline-flex;align-items:center;gap:5px;padding:7px 11px;font-size:12px;color:var(--hp-dim)}" +
    ".hqh-chip b{color:var(--hp-tx);font-variant-numeric:tabular-nums;font-size:12.5px}" +
    ".hqh-weak{color:#e0735c;border-color:rgba(224,115,92,.5)}" +
    ".hqh-clock{font-variant-numeric:tabular-nums;font-weight:700;color:var(--hp-tx)}" +
    ".hqh-skin{margin-left:auto;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--hp-tx)}" +
    ".hqh-skin:hover{border-color:#e0a83a}" +
    ".hqh-rail{position:absolute;left:12px;top:62px;bottom:66px;width:178px;display:flex;flex-direction:column;gap:3px;overflow-y:auto;padding:8px}" +
    ".hqh-res{display:flex;align-items:center;gap:8px;background:transparent;border:1px solid transparent;border-radius:10px;padding:6px 8px;cursor:pointer;color:var(--hp-tx);font-size:12.5px;text-align:left;width:100%}" +
    ".hqh-res:hover{border-color:var(--hp-bd);background:var(--hp-bg2)}" +
    ".hqh-res.on{border-color:#e0a83a;background:var(--hp-bg2)}" +
    ".hqh-res .e{font-size:16px;flex:none}" +
    ".hqh-res .tx{display:flex;flex-direction:column;min-width:0}" +
    ".hqh-res .n{font-weight:700;white-space:nowrap}" +
    ".hqh-res .m{font-size:10px;color:var(--hp-dim);font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".hqh-res .d{width:8px;height:8px;border-radius:50%;margin-left:auto;flex:none}" +
    ".hqh-bottom{position:absolute;left:202px;right:72px;bottom:12px;display:flex;align-items:baseline;gap:8px;padding:9px 14px;font-size:12.5px;overflow:hidden;white-space:nowrap}" +
    ".hqh-hint{position:absolute;left:202px;bottom:52px;padding:5px 10px;font-size:10.5px;color:var(--hp-dim);border-radius:9px}" +
    ".hqh-hint[hidden]{display:none}" +
    ".hqh-bottom .fd{width:7px;height:7px;border-radius:50%;flex:none;align-self:center}" +
    ".hqh-bottom .ft{color:var(--hp-dim);font-size:11.5px;flex:none}" +
    ".hqh-bottom .fx{overflow:hidden;text-overflow:ellipsis}" +
    ".hqh-actions{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:7px}" +
    "#hq-hud.panel-on .hqh-actions{right:356px}" +
    ".hqh-act{width:44px;height:44px;border-radius:12px;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}" +
    ".hqh-act:hover{border-color:#e0a83a}" +
    ".hqh-act[hidden]{display:none}" +
    ".hqh-panel{position:absolute;top:62px;right:12px;bottom:66px;width:332px;overflow-y:auto;padding:14px 16px}" +
    ".hqh-panel[hidden]{display:none}" +
    ".hqh-ph{display:flex;align-items:center;gap:9px;padding-bottom:10px;border-bottom:1px dashed var(--hp-bd);margin-bottom:10px}" +
    ".hqh-ph .pe{font-size:26px}" +
    ".hqh-ph .pn{font-weight:800;font-size:16px}" +
    ".hqh-ph .pr{font-size:11.5px;color:var(--hp-dim)}" +
    ".hqh-ph .px{margin-left:auto;background:none;border:none;color:var(--hp-dim);font-size:15px;cursor:pointer;padding:4px 6px}" +
    ".hqh-pstat{display:flex;align-items:center;gap:7px;font-size:13px;margin:2px 0 8px}" +
    ".hqh-pstat .d{width:8px;height:8px;border-radius:50%}" +
    ".hqh-plabel{font-size:10.5px;color:var(--hp-dim);font-weight:700;letter-spacing:.04em;margin:12px 0 5px}" +
    ".hqh-pach{font-size:12px;color:#b8860b;font-weight:600}" +
    "#hq-hud[data-tone=\"night\"] .hqh-pach{color:#e8c86a}" +
    ".hqh-pmeter{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}" +
    ".hqh-pmeter .un{font-weight:400;font-size:11px;color:var(--hp-dim)}" +
    ".hqh-bars{display:flex;align-items:flex-end;gap:2px;height:34px;margin-top:4px}" +
    ".hqh-bars i{flex:1;background:var(--hp-dim);opacity:.85;border-radius:1px;min-height:2px}" +
    ".hqh-bars i.z{opacity:.18}" +
    ".hqh-ev{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}" +
    ".hqh-ev li{display:flex;gap:7px;align-items:baseline;font-size:12.5px}" +
    ".hqh-ev .d{width:6px;height:6px;border-radius:50%;flex:none;position:relative;top:-1px}" +
    ".hqh-ev .t{color:var(--hp-dim);font-size:11px;flex:none}" +
    ".hqh-empty{font-size:12px;color:var(--hp-dim)}" +
    ".hqh-menu{position:absolute;top:58px;right:12px;display:flex;flex-direction:column;gap:3px;padding:7px}" +
    ".hqh-menu[hidden]{display:none}" +
    ".hqh-menu button{display:flex;align-items:center;gap:8px;background:transparent;border:1px solid transparent;border-radius:9px;padding:7px 12px;font-size:13px;color:var(--hp-tx);cursor:pointer;text-align:left}" +
    ".hqh-menu button:hover{background:var(--hp-bg2);border-color:var(--hp-bd)}" +
    ".hqh-menu button.on{border-color:#e0a83a}" +
    ".hqh-overlay{position:absolute;inset:0;background:rgba(8,12,22,.5);display:flex;align-items:center;justify-content:center;padding:22px}" +
    ".hqh-overlay[hidden]{display:none}" +
    ".hqh-sheet{background:#241b12;border:1px solid #3c2f24;border-radius:14px;max-width:720px;width:100%;max-height:84vh;overflow-y:auto;padding:16px 18px;color:#f5ead9;box-shadow:0 12px 40px rgba(0,0,0,.5)}" +
    ".hqh-sheet-head{display:flex;align-items:center;margin-bottom:8px}" +
    ".hqh-sheet-head b{font-size:14px}" +
    ".hqh-sheet-head button{margin-left:auto;background:none;border:none;color:#8a7561;font-size:15px;cursor:pointer;padding:4px 6px}" +
    ".hqh-sheet section{margin-bottom:0}" +
    "@media (max-width:640px){" +
      ".hqh-top{gap:4px}" +
      ".hqh-door{padding:6px 10px;font-size:12.5px}" +
      ".hqh-chip{padding:5px 8px;font-size:10.5px}" +
      ".hqh-upd:not(.hqh-weak){display:none}" +
      ".hqh-skin{padding:6px 9px;font-size:11.5px}" +
      ".hqh-rail{left:8px;right:8px;top:86px;bottom:auto;width:auto;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:6px;gap:4px}" +
      ".hqh-res{flex:none;width:auto;padding:5px 8px}" +
      ".hqh-res .m{display:none}" +
      ".hqh-res .d{margin-left:2px}" +
      ".hqh-panel{left:8px;right:8px;top:auto;bottom:0;width:auto;max-height:62vh;border-radius:14px 14px 0 0}" +
      ".hqh-bottom{left:8px;right:64px;font-size:11px;padding:7px 10px}" +
      ".hqh-actions{gap:5px}" +
      "#hq-hud.panel-on .hqh-actions{display:none}" +
      ".hqh-act{width:38px;height:38px;font-size:16px;border-radius:10px}" +
      ".hqh-menu{top:auto;bottom:60px;right:58px}" +
    "}";

  function buildHud(){
    var st = document.createElement("style");
    st.textContent = HUD_CSS;
    document.head.appendChild(st);

    hud = mk("div"); hud.id = "hq-hud"; hud.hidden = true;

    var top = mk("div", "hqh-top");
    els.door = mk("span", "hqh-door hqh-card hqh-pe");
    els.doorTxt = mk("b"); els.door.appendChild(document.createTextNode("🏢 ")); els.door.appendChild(els.doorTxt);
    els.clockChip = mk("span", "hqh-chip hqh-card hqh-pe");
    els.clock = mk("span", "hqh-clock", clockText());
    els.clockChip.appendChild(els.clock);
    els.chipWork = mk("span", "hqh-chip hqh-card hqh-pe");
    els.chipBeats = mk("span", "hqh-chip hqh-card hqh-pe");
    els.chipEnergy = mk("span", "hqh-chip hqh-card hqh-pe");
    els.chipUpd = mk("span", "hqh-chip hqh-card hqh-pe hqh-upd");
    els.skinBtn = mk("button", "hqh-skin hqh-card hqh-pe", "🎨 换个家");
    els.skinBtn.type = "button";
    els.skinBtn.addEventListener("click", function(){ els.menu.hidden = !els.menu.hidden; });
    top.appendChild(els.door); top.appendChild(els.clockChip);
    top.appendChild(els.chipWork); top.appendChild(els.chipBeats);
    top.appendChild(els.chipEnergy); top.appendChild(els.chipUpd);
    top.appendChild(els.skinBtn);
    hud.appendChild(top);

    els.rail = mk("div", "hqh-rail hqh-card hqh-pe");
    hud.appendChild(els.rail);

    els.bottom = mk("div", "hqh-bottom hqh-card hqh-pe");
    hud.appendChild(els.bottom);

    els.hint = mk("span", "hqh-hint hqh-card hqh-pe",
      ("ontouchstart" in window) ? "🧭 单指转 · 双指缩" : "🧭 拖动环视 · 滚轮缩放");
    els.hint.hidden = true;
    hud.appendChild(els.hint);

    var acts = mk("div", "hqh-actions");
    function actBtn(icon, label, fn){
      var b = mk("button", "hqh-act hqh-card hqh-pe", icon);
      b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
      b.addEventListener("click", fn);
      acts.appendChild(b);
      return b;
    }
    els.actTrophy = actBtn("🏆", "荣誉柜", function(){ openOverlay("trophy"); });
    els.actEnergy = actBtn("⚡", "今日电表", function(){ openOverlay("energy"); });
    els.actLog    = actBtn("📜", "家庭日志", function(){ openOverlay("log"); });
    els.actFrames = actBtn("🖼", "墙上的画框", function(){ openOverlay("frames"); });
    hud.appendChild(acts);

    els.panel = mk("div", "hqh-panel hqh-card hqh-pe");
    els.panel.hidden = true;
    hud.appendChild(els.panel);

    els.menu = mk("div", "hqh-menu hqh-card hqh-pe");
    els.menu.hidden = true;
    hud.appendChild(els.menu);

    els.overlay = mk("div", "hqh-overlay hqh-pe");
    els.overlay.hidden = true;
    var sheet = mk("div", "hqh-sheet");
    var shead = mk("div", "hqh-sheet-head");
    els.sheetTitle = mk("b");
    var sx = mk("button", null, "✕"); sx.type = "button"; sx.setAttribute("aria-label", "关上");
    sx.addEventListener("click", closeOverlay);
    shead.appendChild(els.sheetTitle); shead.appendChild(sx);
    els.sheetBody = mk("div");
    sheet.appendChild(shead); sheet.appendChild(els.sheetBody);
    els.overlay.appendChild(sheet);
    els.overlay.addEventListener("click", function(e){ if (e.target === els.overlay) closeOverlay(); });
    hud.appendChild(els.overlay);

    document.body.appendChild(hud);

    document.addEventListener("keydown", function(e){
      if (!full || e.key !== "Escape") return;
      if (!els.overlay.hidden) closeOverlay();
      else if (!els.menu.hidden) els.menu.hidden = true;
      else if (!els.panel.hidden) closePanel();
    });
  }

  /* ---------- 渲染:全部真值,数据缺席就诚实说缺席 ---------- */
  function chipSet(chip, icon, label, strong, tail){
    chip.innerHTML = "";
    chip.appendChild(document.createTextNode(icon + " " + label + " "));
    var b = mk("b", null, strong);
    chip.appendChild(b);
    if (tail) chip.appendChild(document.createTextNode(" " + tail));
    chip.hidden = false;
  }
  function renderTop(data){
    els.doorTxt.textContent = doorName();
    els.clock.textContent = clockText();
    if (!data){
      chipSet(els.chipWork, "📡", "", "信号弱", "");
      els.chipBeats.hidden = true; els.chipEnergy.hidden = true; els.chipUpd.hidden = true;
      return;
    }
    /* 页面级弱信号标记(拿着旧数据断流中):跟着亮出来,别装一切正常 */
    var lu = document.getElementById("last-updated");
    var weak = !!(lu && lu.classList.contains("weak"));
    var working = 0;
    (data.residents || []).forEach(function(r){ if (H.roomStateFor(r).cond === "working") working++; });
    chipSet(els.chipWork, "🟢", "在岗", String(working) + "/" + (data.residents || []).length, "");
    var stats = data.stats || {};
    if (typeof stats.beats_24h === "number") chipSet(els.chipBeats, "❤", "24h", String(stats.beats_24h), "跳");
    else els.chipBeats.hidden = true;
    var br = stats.energy && stats.energy.by_resident;
    if (br && br.length){
      var sum = 0; br.forEach(function(x){ sum += (x.tokens || 0); });
      chipSet(els.chipEnergy, "⚡", "全家今日", H.bigNum(sum), "token");
    } else els.chipEnergy.hidden = true;
    if (data.generated_at){
      els.chipUpd.innerHTML = "";
      els.chipUpd.appendChild(document.createTextNode((weak ? "📡 信号弱 · " : "") + "更新于 "));
      els.chipUpd.appendChild(tsSpan(data.generated_at));
      els.chipUpd.hidden = false;
      els.chipUpd.classList.toggle("hqh-weak", weak);
    } else els.chipUpd.hidden = true;
  }
  function renderRail(data){
    els.rail.innerHTML = "";
    if (!data){
      els.rail.appendChild(mk("div", "hqh-empty", "信号弱,名册读不出来"));
      return;
    }
    var br = (data.stats && data.stats.energy && data.stats.energy.by_resident) || [];
    var meterOf = {};
    br.forEach(function(x){ if (x.tokens > 0) meterOf[x.agent] = x.tokens; });
    (data.residents || []).forEach(function(r){
      var st = H.roomStateFor(r);
      var b = mk("button", "hqh-res" + (panelAgent === r.agent && !els.panel.hidden ? " on" : ""));
      b.type = "button";
      b.title = st.label;
      b.appendChild(mk("span", "e", r.emoji || ""));
      var tx = mk("span", "tx");
      tx.appendChild(mk("span", "n", r.agent));
      if (meterOf[r.agent]) tx.appendChild(mk("span", "m", "⚡" + H.bigNum(meterOf[r.agent])));
      b.appendChild(tx);
      var d = mk("i", "d"); d.style.background = DOT[st.cond] || DOT.tidy;
      b.appendChild(d);
      b.addEventListener("click", function(){ togglePanel(r.agent); });
      els.rail.appendChild(b);
    });
  }
  function renderBottom(data){
    els.bottom.innerHTML = "";
    if (!data){
      els.bottom.appendChild(mk("span", "hqh-empty", "信号断了一小会儿,听不见家里的心跳"));
      return;
    }
    var groups = H.buildFeedGroups(data.heartbeats || []);
    if (!groups.length){
      els.bottom.appendChild(mk("span", "hqh-empty", "这窗口期还没有心跳"));
      return;
    }
    var g = groups[0], newest = g.items[0];
    var d = mk("i", "fd");
    d.style.background = g.status === "failed" ? "#e0735c" : (g.status === "running" ? "#57b985" : "#e0a83a");
    els.bottom.appendChild(d);
    els.bottom.appendChild(tsSpan(newest.started_at, "ft"));
    els.bottom.appendChild(mk("span", "fx", g.items.length === 1 ? H.voiceFor(newest) : H.voiceForGroup(g)));
  }

  /* ---------- 个人面板 ---------- */
  function togglePanel(agent){
    if (panelAgent === agent && !els.panel.hidden){ closePanel(); return; }
    panelAgent = agent;
    renderPanel(agent);
    els.panel.hidden = false;
    hud.classList.add("panel-on");
    renderRail(H.getData());
  }
  function closePanel(){
    els.panel.hidden = true;
    hud.classList.remove("panel-on");
    panelAgent = null;
    renderRail(H.getData());
  }
  function renderPanel(agent){
    var p = els.panel;
    p.innerHTML = "";
    var data = H.getData();
    var r = data && (data.residents || []).filter(function(x){ return x.agent === agent; })[0];
    var head = mk("div", "hqh-ph");
    head.appendChild(mk("span", "pe", (r && r.emoji) || ""));
    var nWrap = mk("span");
    nWrap.appendChild(mk("div", "pn", agent));
    nWrap.appendChild(mk("div", "pr", r ? ((r.role || "") + (r.category && r.category !== r.role ? " · " + r.category : "")) : ""));
    head.appendChild(nWrap);
    var x = mk("button", "px", "✕"); x.type = "button"; x.setAttribute("aria-label", "关上");
    x.addEventListener("click", closePanel);
    head.appendChild(x);
    head.style.borderLeft = "3px solid " + zoneDot(agent);
    head.style.paddingLeft = "8px";
    p.appendChild(head);
    if (!r){
      p.appendChild(mk("div", "hqh-empty", "信号弱,这位住户的档案暂时读不出来"));
      return;
    }
    var st = H.roomStateFor(r);
    var stat = mk("div", "hqh-pstat");
    var d = mk("i", "d"); d.style.background = DOT[st.cond] || DOT.tidy;
    stat.appendChild(d);
    stat.appendChild(mk("span", null, st.label));
    if (st.ts){
      stat.appendChild(document.createTextNode(" · "));
      if (st.tsMode === "dur"){
        var du = mk("span"); du.setAttribute("data-dur", st.ts); du.textContent = H.durText(st.ts);
        stat.appendChild(du);
      } else stat.appendChild(tsSpan(st.ts));
    }
    p.appendChild(stat);

    var achTxt = H.achSentenceFor(agent);
    if (achTxt){
      p.appendChild(mk("div", "hqh-plabel", "今日成就"));
      p.appendChild(mk("div", "hqh-pach", achTxt));
    }

    p.appendChild(mk("div", "hqh-plabel", "电表"));
    var br = (data.stats && data.stats.energy && data.stats.energy.by_resident) || [];
    var me = br.filter(function(x){ return x.agent === agent; })[0];
    if (me){
      /* 接了表读数为 0 也是真读数,别谎报「没接表」 */
      var mv = mk("div", "hqh-pmeter");
      mv.appendChild(document.createTextNode("⚡ 今日 " + H.bigNum(me.tokens || 0) + " "));
      mv.appendChild(mk("span", "un", "token"));
      p.appendChild(mv);
    } else {
      p.appendChild(mk("div", "hqh-empty", "这间屋还没接上电表,只看得到心跳"));
    }

    var beats = (data.heartbeats || []).filter(function(b){ return b.agent === agent; });
    p.appendChild(mk("div", "hqh-plabel", "近 24 小时心跳"));
    var buckets = new Array(24).fill(0), nowMs = Date.now(), got = 0;
    beats.forEach(function(b){
      var t = new Date(b.started_at).getTime();
      if (isNaN(t)) return;
      var ago = Math.floor((nowMs - t) / 3600000);
      if (ago >= 0 && ago < 24){ buckets[23 - ago]++; got++; }
    });
    if (got){
      var bars = mk("div", "hqh-bars");
      var mx = Math.max.apply(null, buckets);
      for (var i = 0; i < 24; i++){
        var bar = mk("i", buckets[i] ? "" : "z");
        bar.style.height = buckets[i] ? Math.max(12, Math.round(buckets[i] / mx * 100)) + "%" : "2px";
        bar.title = (23 - i === 0 ? "这一小时" : (23 - i) + " 小时前") + ":" + buckets[i] + " 次";
        bars.appendChild(bar);
      }
      p.appendChild(bars);
    } else {
      p.appendChild(mk("div", "hqh-empty", "近 24 小时没有心跳记录"));
    }

    p.appendChild(mk("div", "hqh-plabel", "最近动静"));
    var list = mk("ul", "hqh-ev");
    var shown = beats.slice(0, 7);
    if (!shown.length){
      p.appendChild(mk("div", "hqh-empty", "这窗口期还没有记录,屋里收拾得很干净"));
    } else {
      shown.forEach(function(b){
        var li = mk("li");
        var dd = mk("i", "d");
        dd.style.background = b.status === "failed" ? "#e0735c" : (b.status === "running" ? "#57b985" : "#e0a83a");
        li.appendChild(dd);
        li.appendChild(tsSpan(b.started_at, "t"));
        li.appendChild(mk("span", null, b.status === "running" ? "正在忙着,还没收工" : H.voiceCore(b)));
        list.appendChild(li);
      });
      p.appendChild(list);
    }
  }

  /* ---------- 浮层:直接克隆页面既有区块(链接/文案自动跟随镜像换牌) ---------- */
  function openOverlay(kind){
    var body = els.sheetBody;
    body.innerHTML = "";
    var src = null, title = "";
    if (kind === "trophy"){ src = document.getElementById("trophy-section"); title = "🏆 荣誉柜"; }
    else if (kind === "energy"){ src = document.querySelector('section[aria-label="今日电表"]'); title = "⚡ 今日电表"; }
    else if (kind === "log"){ src = document.querySelector('section[aria-label="家庭日志"]'); title = "📜 家庭日志"; }
    else if (kind === "frames"){ src = document.querySelector('section[aria-label="墙上的画框"]'); title = "🖼 墙上的画框"; }
    if (!src) return;
    var clone = stripIds(src.cloneNode(true));
    clone.hidden = false;
    body.appendChild(clone);
    if (kind === "frames"){
      var rp = document.querySelector(".repo-link");
      if (rp) body.appendChild(stripIds(rp.cloneNode(true)));
    }
    els.sheetTitle.textContent = title;
    els.menu.hidden = true;
    els.overlay.hidden = false;
  }
  function closeOverlay(){ els.overlay.hidden = true; }

  /* ---------- 换皮菜单:代理点击页面原生切换按钮(localStorage/aria 全由原逻辑管) ---------- */
  function renderMenu(){
    els.menu.innerHTML = "";
    var themes = H.map.themeList();
    var cur = H.map.theme();
    var realBtns = document.querySelectorAll("#theme-switch .theme-btn");
    themes.forEach(function(t, i){
      var b = mk("button", t.id === cur ? "on" : "", t.icon + " " + t.name);
      b.type = "button";
      b.addEventListener("click", function(){
        els.menu.hidden = true;
        if (t.id === cur) return;
        if (realBtns[i]) realBtns[i].click();
        else H.map.setTheme(t.id);
      });
      els.menu.appendChild(b);
    });
  }

  function renderAll(){
    if (!full) return;
    var data = H.getData();
    hud.dataset.tone = tone();
    renderTop(data);
    renderRail(data);
    renderBottom(data);
    renderMenu();
    var ts = document.getElementById("trophy-section");
    els.actTrophy.hidden = !(ts && !ts.hidden);
    if (panelAgent && !els.panel.hidden) renderPanel(panelAgent);
    if (D3.ready && D3.wanted){ d3Sync(); d3Tone(); }
  }

  function enterFull(){
    if (full) return;
    full = true;
    document.documentElement.classList.add("hq-full");
    hud.hidden = false;
    H.map.setFit("contain");
    H.map.remeasure();
    renderAll();
    d3Activate();
    if (!clockTimer){
      clockTimer = setInterval(function(){
        if (!full) return;
        /* 30s 全量重渲:断流时状态也按 last_beat_at 自然老化(在岗→歇→睡),不冻结在旧真值 */
        renderAll();
      }, 30000);
    }
  }
  function exitFull(){
    if (!full) return;
    full = false;
    document.documentElement.classList.remove("hq-full");
    hud.hidden = true;
    closePanel();
    closeOverlay();
    els.menu.hidden = true;
    d3Deactivate();
    H.map.setFit("width");
    H.map.remeasure();
  }

  /* ==========================================================================
     3D 总部(v3):three.js 真三维环视。进 hq 皮时懒加载自托管 three.min.js,
     建好后盖在 2D 画布上(2D 等距=真值首帧+WebGL 不可用时的永久兜底)。
     真值纪律不变:机器人状态/电表/大屏数字全来自共享数据,动画只是氛围。
     本模块同样零身份串;大屏与药丸文字全部来自数据与 registry 房名。
     ========================================================================== */
  /* roundRect 兜底(老 Safari):画不了圆角就画方角,不至于整个 3D 报废 */
  if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h){ this.rect(x, y, w, h); return this; };
  }
  var D3 = { wanted:false, loading:false, ready:false, failed:false,
             renderer:null, scene:null, camera:null, controls:null, canvas:null,
             raf:null, robots:{}, screens:{}, pills:{}, dash:null, dashCtx:null, dashTex:null,
             lights:{}, toneNow:"", sprites:{}, clock0:0, interacted:false, pt:null };
  var W2X = function(x){ return x - 320; }, W2Z = function(y){ return y - 215; };
  var Z3HEX = { green:{tint:0x7cc59a, dot:0x57b985}, blue:{tint:0x82aadc, dot:0x6f9fda},
                yellow:{tint:0xe8c14e, dot:0xe0a83a}, red:{tint:0xe8735c, dot:0xe0735c},
                purple:{tint:0xb69ae0, dot:0x9a76d6} };
  function z3Of(agent){ return Z3HEX[CAT_ZONE[AGENT_CATEGORY[agent]] || "blue"]; }

  function d3Activate(){
    D3.wanted = true;
    if (D3.failed || !T) return;                 /* 兜底:留在 2D 等距 */
    if (D3.ready){ d3Show(); return; }
    if (D3.loading) return;
    D3.loading = true;
    if (window.THREE){ d3Boot(); return; }
    var s = document.createElement("script");
    s.src = "three.min.js";
    s.onload = d3Boot;
    s.onerror = function(){
      /* 瞬时网络失败允许重试(下次再进 hq 皮时),连败 3 次才永久落 2D */
      s.remove();
      D3.loading = false;
      D3.failN = (D3.failN || 0) + 1;
      if (D3.failN >= 3) D3.failed = true;
    };
    document.head.appendChild(s);
  }
  function d3Boot(){
    try { d3Build(); D3.ready = true; }
    catch(e){ D3.failed = true; }
    D3.loading = false;
    if (D3.ready && D3.wanted && full) d3Show();
  }
  function d3Show(){
    D3.canvas.style.display = "block";
    var m = document.getElementById("map");
    if (m) m.style.display = "none";             /* 2D 停画省电,IntersectionObserver 会自动停它的 rAF */
    var hint = document.querySelector(".hqh-hint");
    if (hint) hint.hidden = false;
    d3Resize(); d3Tone(); d3Sync(); d3Loop();
  }
  function d3Deactivate(){
    D3.wanted = false;
    if (D3.raf){ cancelAnimationFrame(D3.raf); D3.raf = null; }
    if (D3.canvas) D3.canvas.style.display = "none";
    var m = document.getElementById("map");
    if (m) m.style.display = "";
    var hint = document.querySelector(".hqh-hint");
    if (hint) hint.hidden = true;
  }

  /* ---------- 小工具:canvas 纹理精灵(药丸/气泡/表情) ---------- */
  function d3CanvasTex(w, h, draw){
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }
  function d3PillSprite(name, dotHex, meterTxt){
    var tex = d3CanvasTex(512, 128, function(g, w, h){
      g.clearRect(0, 0, w, h);
      g.font = "bold 44px -apple-system,'PingFang SC',sans-serif";
      var tw = g.measureText(name).width;
      var mw = 0;
      if (meterTxt){ g.font = "bold 30px -apple-system,'PingFang SC',sans-serif"; mw = g.measureText(meterTxt).width + 26; }
      var pw = Math.min(w - 8, 44 + tw + 14 + mw + 20), px = (w - pw) / 2;
      g.fillStyle = "rgba(30,40,55,.14)";
      g.beginPath(); g.roundRect(px + 3, 26, pw, 76, 38); g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath(); g.roundRect(px, 22, pw, 76, 38); g.fill();
      g.fillStyle = "#" + ("000000" + dotHex.toString(16)).slice(-6);
      g.beginPath(); g.arc(px + 30, 60, 11, 0, 6.283); g.fill();
      g.fillStyle = "#20252c"; g.textBaseline = "middle";
      g.font = "bold 44px -apple-system,'PingFang SC',sans-serif";
      g.fillText(name, px + 50, 62);
      if (meterTxt){
        g.fillStyle = "rgba(34,26,14,.88)";
        g.beginPath(); g.roundRect(px + 50 + tw + 12, 36, mw, 48, 12); g.fill();
        g.fillStyle = "#ffce7a"; g.font = "bold 30px -apple-system,'PingFang SC',sans-serif";
        g.fillText(meterTxt, px + 50 + tw + 24, 62);
      }
    });
    return tex;
  }
  function d3TextBubble(text){
    return d3CanvasTex(512, 128, function(g, w, h){
      g.font = "bold 40px -apple-system,'PingFang SC',sans-serif";
      var tw = g.measureText(text).width, pw = tw + 60, px = (w - pw) / 2;
      g.fillStyle = "rgba(30,40,55,.14)"; g.beginPath(); g.roundRect(px + 3, 26, pw, 72, 34); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(px, 22, pw, 72, 34); g.fill();
      g.beginPath(); g.moveTo(px + 40, 92); g.lineTo(px + 26, 116); g.lineTo(px + 66, 94); g.closePath(); g.fill();
      g.fillStyle = "#2a2f37"; g.textBaseline = "middle"; g.fillText(text, px + 30, 60);
    });
  }
  function d3EmojiTex(emoji){
    return d3CanvasTex(128, 128, function(g){
      g.font = "88px -apple-system,'PingFang SC',sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(emoji, 64, 70);
    });
  }
  function d3Sprite(tex, sw, sh){
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(sw, sh, 1);
    return sp;
  }

  /* ---------- 建场景 ---------- */
  function d3Build(){
    var frame = document.querySelector(".map-frame");
    var r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    D3.renderer = r;
    D3.canvas = r.domElement;
    D3.canvas.style.cssText = "position:absolute;inset:0;display:none;touch-action:none";
    frame.appendChild(D3.canvas);

    var sc = new THREE.Scene();
    D3.scene = sc;
    var cam = new THREE.PerspectiveCamera(38, 16 / 9, 1, 4000);
    cam.position.set(430, 470, 560);
    D3.camera = cam;
    var ctl = new THREE.OrbitControls(cam, D3.canvas);
    ctl.target.set(-30, 10, -14);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.minDistance = 240; ctl.maxDistance = 1100;
    ctl.maxPolarAngle = 1.32; ctl.minPolarAngle = 0.12;
    ctl.autoRotate = true; ctl.autoRotateSpeed = 0.5;
    ctl.addEventListener("start", function(){ D3.interacted = true; ctl.autoRotate = false; });
    /* inStep 防双渲染:step 里 update() 会同步派发 change,不能再叠一次 render */
    ctl.addEventListener("change", function(){ if (D3.raf === null && !D3.inStep) d3Render(); });
    D3.controls = ctl;

    /* 灯光(强度随昼夜调) */
    D3.lights.hemi = new THREE.HemisphereLight(0xf8fbff, 0xd8dde6, 1.0);
    D3.lights.dir = new THREE.DirectionalLight(0xffffff, 0.5);
    D3.lights.dir.position.set(300, 520, 240);
    sc.add(D3.lights.hemi); sc.add(D3.lights.dir);
    D3.lights.workBy = {};

    var WOOD = 0xcdb79a, WOODD = 0xb39c7c;
    var matWood = new THREE.MeshLambertMaterial({ color: WOOD });
    var matWoodD = new THREE.MeshLambertMaterial({ color: WOODD });
    var matGlass = new THREE.MeshLambertMaterial({ color: 0xbfd6e6, transparent: true, opacity: 0.26, side: THREE.DoubleSide });
    var matWhite = new THREE.MeshLambertMaterial({ color: 0xf6f8fb });

    /* 地板:厚板 + 棋盘格顶面 */
    var slabMats = [];
    for (var si = 0; si < 6; si++) slabMats.push(new THREE.MeshLambertMaterial({ color: si === 2 ? 0xf1f4f8 : 0xc9d0da }));
    var slab = new THREE.Mesh(new THREE.BoxGeometry(720, 16, 500), slabMats);
    slab.position.y = -8;
    sc.add(slab);
    var checker = d3CanvasTex(512, 512, function(g){
      g.fillStyle = "#f1f4f8"; g.fillRect(0, 0, 512, 512);
      g.fillStyle = "#e8edf3";
      for (var cy = 0; cy < 8; cy++) for (var cx = 0; cx < 8; cx++)
        if ((cx + cy) % 2) g.fillRect(cx * 64, cy * 64, 64, 64);
    });
    checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
    checker.repeat.set(9, 6.2);
    var top = new THREE.Mesh(new THREE.PlaneGeometry(720, 500), new THREE.MeshLambertMaterial({ map: checker }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.15;
    sc.add(top);

    /* 外围两面高玻璃墙(北+西)+ 木框 */
    function tallWall(cx, cz, len, rotY){
      var gp = new THREE.Group();
      var glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 104), matGlass);
      glass.position.y = 52; gp.add(glass);
      var beam = new THREE.Mesh(new THREE.BoxGeometry(len, 7, 7), matWood);
      beam.position.y = 106; gp.add(beam);
      var base = new THREE.Mesh(new THREE.BoxGeometry(len, 5, 5), matWoodD);
      base.position.y = 2.5; gp.add(base);
      for (var mx = -len / 2; mx <= len / 2; mx += 60){
        var mull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 104, 2.4), matWoodD);
        mull.position.set(mx, 52, 0); gp.add(mull);
      }
      gp.position.set(cx, 0, cz); gp.rotation.y = rotY;
      sc.add(gp);
    }
    tallWall(0, -250, 720, 0);
    tallWall(-360, 0, 500, Math.PI / 2);

    /* 分区色块 + 矮玻璃隔断(南侧留门) */
    Object.keys(ZONES).forEach(function(agent){
      var z = ZONES[agent], zc = z3Of(agent);
      var cx = W2X(z.x + z.w / 2), cz = W2Z(z.y + z.h / 2);
      var tint = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h),
        new THREE.MeshLambertMaterial({ color: zc.tint, transparent: true, opacity: 0.13 }));
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(cx, 0.4, cz);
      tint.userData.agent = agent;
      sc.add(tint);
      D3.pills["tint_" + agent] = tint;
      var eg = new THREE.EdgesGeometry(new THREE.PlaneGeometry(z.w - 2, z.h - 2));
      var line = new THREE.LineSegments(eg, new THREE.LineDashedMaterial({ color: zc.dot, dashSize: 6, gapSize: 5, transparent: true, opacity: 0.6 }));
      line.computeLineDistances();
      line.rotation.x = -Math.PI / 2; line.position.set(cx, 0.6, cz);
      sc.add(line);
      /* 矮隔断 */
      function lowWall(x1, z1, x2, z2){
        var len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 8) return;
        var g2 = new THREE.Group();
        var pane = new THREE.Mesh(new THREE.PlaneGeometry(len, 26), matGlass);
        pane.position.y = 13; g2.add(pane);
        var rail = new THREE.Mesh(new THREE.BoxGeometry(len, 3.2, 3.2), matWood);
        rail.position.y = 27; g2.add(rail);
        g2.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
        g2.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        sc.add(g2);
      }
      var x0 = W2X(z.x), x1 = W2X(z.x + z.w), z0 = W2Z(z.y), z1 = W2Z(z.y + z.h);
      lowWall(x0, z0, x1, z0);                       /* 北 */
      lowWall(x0, z1, x0, z0);                       /* 西 */
      lowWall(x1, z1, x1, z0);                       /* 东 */
      var doorW = 34, mid = (x0 + x1) / 2;           /* 南墙留门 */
      lowWall(x0, z1, mid - doorW / 2, z1);
      lowWall(mid + doorW / 2, z1, x1, z1);

      /* 大办公桌 + 大屏幕 */
      var dx = W2X(z.desk[0]), dz = W2Z(z.desk[1]);
      var desk = new THREE.Group();
      var dtop = new THREE.Mesh(new THREE.BoxGeometry(64, 5, 30), matWhite);
      dtop.position.y = 24; desk.add(dtop);
      var leg1 = new THREE.Mesh(new THREE.BoxGeometry(5, 24, 26), new THREE.MeshLambertMaterial({ color: 0xdfe4ec }));
      leg1.position.set(-26, 12, 0); desk.add(leg1);
      var leg2 = leg1.clone(); leg2.position.x = 26; desk.add(leg2);
      var mon = new THREE.Mesh(new THREE.BoxGeometry(44, 28, 3.6), new THREE.MeshLambertMaterial({ color: 0x2b313a }));
      mon.position.set(0, 42, -8); desk.add(mon);
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(38, 22),
        new THREE.MeshLambertMaterial({ color: 0x39414c, emissive: 0x000000 }));
      scr.position.set(0, 42, -6.1); desk.add(scr);
      var stand = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshLambertMaterial({ color: 0xc3c9d2 }));
      stand.position.set(0, 28, -8); desk.add(stand);
      desk.position.set(dx, 0, dz);
      sc.add(desk);
      D3.screens[agent] = scr;

      /* 休息垫(睡觉位) */
      var mat = new THREE.Mesh(new THREE.BoxGeometry(30, 2.6, 18), new THREE.MeshLambertMaterial({ color: 0xdfe7f2 }));
      mat.position.set(W2X(z.bed[0]), 1.3, W2Z(z.bed[1]));
      sc.add(mat);

      /* 房间药丸(billboard,大号) */
      var pill = d3Sprite(d3PillSprite(z.name, zc.dot, null), 96, 24);
      pill.position.set(cx, 62, cz);
      sc.add(pill);
      D3.pills[agent] = pill;
    });

    /* 盆栽(大号) */
    var plantSpots = [[320, 150], [250, 240], [400, 210], [96, 100], [544, 110], [300, 300], [430, 360], [150, 250]];
    plantSpots.forEach(function(p){
      var g3 = new THREE.Group();
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 11, 12), new THREE.MeshLambertMaterial({ color: 0xc8a27a }));
      pot.position.y = 5.5; g3.add(pot);
      var f1 = new THREE.Mesh(new THREE.SphereGeometry(11, 14, 12), new THREE.MeshLambertMaterial({ color: 0x4a8a5c }));
      f1.position.set(-3, 18, 1); g3.add(f1);
      var f2 = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 12), new THREE.MeshLambertMaterial({ color: 0x5fa872 }));
      f2.position.set(4, 23, -2); g3.add(f2);
      var f3 = new THREE.Mesh(new THREE.SphereGeometry(7.5, 14, 12), new THREE.MeshLambertMaterial({ color: 0x5fa872 }));
      f3.position.set(-1, 29, 0); g3.add(f3);
      g3.position.set(W2X(p[0]), 0, W2Z(p[1]));
      sc.add(g3);
    });

    /* 荣誉柜(客厅旁,带真数角标) */
    var tc = new THREE.Group();
    var cab = new THREE.Mesh(new THREE.BoxGeometry(22, 54, 34), new THREE.MeshLambertMaterial({ color: 0xefe8f6 }));
    cab.position.y = 27; tc.add(cab);
    for (var sh = 0; sh < 2; sh++){
      var shelf = new THREE.Mesh(new THREE.BoxGeometry(23, 1.4, 35), new THREE.MeshLambertMaterial({ color: 0xcfbfe4 }));
      shelf.position.y = 18 + sh * 16; tc.add(shelf);
      for (var tj = 0; tj < 2; tj++){
        var cup = new THREE.Group();
        var bowl = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8, 0, 6.283, 0, 1.7), new THREE.MeshLambertMaterial({ color: 0xeac24c }));
        bowl.rotation.x = Math.PI; bowl.position.y = 5; cup.add(bowl);
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 4, 8), new THREE.MeshLambertMaterial({ color: 0xd8b13c }));
        stem.position.y = 2; cup.add(stem);
        cup.position.set(0, 19.4 + sh * 16, -8 + tj * 16);
        tc.add(cup);
      }
    }
    tc.position.set(W2X(398), 0, W2Z(330));
    sc.add(tc);
    D3.sprites.trophy = d3Sprite(d3TextBubble("🏆 —"), 66, 16.5);
    D3.sprites.trophy.position.set(W2X(398), 66, W2Z(330));
    sc.add(D3.sprites.trophy);

    /* 挂墙大屏(北墙,真数) */
    var dashBox = new THREE.Mesh(new THREE.BoxGeometry(340, 140, 7), new THREE.MeshLambertMaterial({ color: 0x171b22 }));
    dashBox.position.set(230, 88, -245);
    sc.add(dashBox);
    var dashCv = document.createElement("canvas");
    dashCv.width = 1024; dashCv.height = 416;
    D3.dashCtx = dashCv.getContext("2d");
    D3.dashTex = new THREE.CanvasTexture(dashCv);
    D3.dashTex.minFilter = THREE.LinearFilter;
    var dashScr = new THREE.Mesh(new THREE.PlaneGeometry(330, 132),
      new THREE.MeshBasicMaterial({ map: D3.dashTex }));
    dashScr.position.set(230, 88, -241.2);
    sc.add(dashScr);

    /* 欢迎气泡(门厅) */
    D3.sprites.hello = d3Sprite(d3TextBubble("欢迎回来 👋"), 78, 19.5);
    D3.sprites.hello.position.set(W2X(252), 74, W2Z(352));
    sc.add(D3.sprites.hello);

    /* 十位机器人(大圆白,参考图形体) */
    Object.keys(ZONES).forEach(function(agent){ d3MakeRobot(agent); });

    /* 点选:按下→抬起位移小才算点 */
    D3.pt = { x: 0, y: 0 };
    D3.canvas.addEventListener("pointerdown", function(e){ D3.pt.x = e.clientX; D3.pt.y = e.clientY; });
    D3.canvas.addEventListener("pointerup", function(e){
      if (Math.hypot(e.clientX - D3.pt.x, e.clientY - D3.pt.y) > 7) return;
      var agent = d3PickAt(e.clientX, e.clientY);
      if (agent) togglePanel(agent);
    });

    window.addEventListener("resize", function(){ if (D3.ready && full) d3Resize(); });
    D3.clock0 = (typeof performance !== "undefined" ? performance.now() : 0);

    /* 验收用调试钩子(只读场景,不碰数据) */
    window.__hq3d = {
      get ready(){ return D3.ready; },
      setView: function(azDeg, elDeg, dist){
        var az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
        D3.camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
        D3.controls.update(); d3Render();
      },
      render: function(){ d3Render(); },
      pickAt: function(x, y){ return d3PickAt(x, y); },
      project: function(agent){
        var r0 = D3.robots[agent]; if (!r0) return null;
        var v = r0.g.position.clone(); v.y += 20; v.project(D3.camera);
        var rect = D3.canvas.getBoundingClientRect();
        return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - (v.y + 1) / 2) * rect.height];
      }
    };
  }

  function d3MakeRobot(agent){
    var zc = z3Of(agent);
    var g = new THREE.Group();
    var matBody = new THREE.MeshLambertMaterial({ color: 0xf6f8fb });
    var shadow = new THREE.Mesh(new THREE.CircleGeometry(15, 20),
      new THREE.MeshBasicMaterial({ color: 0x46506a, transparent: true, opacity: 0.16, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.5;
    g.add(shadow);
    var pivot = new THREE.Group();                  /* 躺下时只旋转 pivot,影子留地上 */
    g.add(pivot);
    var body = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 20), matBody);
    body.scale.set(1, 1.18, 0.95); body.position.y = 17;
    pivot.add(body);
    var bandMat = new THREE.MeshLambertMaterial({ color: zc.dot });
    var band = new THREE.Mesh(new THREE.CylinderGeometry(12.1, 12.8, 3.6, 20), bandMat);
    band.position.y = 9.5; pivot.add(band);
    var armL = new THREE.Mesh(new THREE.SphereGeometry(4.2, 12, 10), matBody);
    armL.position.set(-14.3, 16, 0); pivot.add(armL);
    var armR = armL.clone(); armR.position.x = 14.3; pivot.add(armR);
    var faceMat = new THREE.MeshLambertMaterial({ color: 0x23282f });
    var face = new THREE.Mesh(new THREE.SphereGeometry(9.6, 18, 14), faceMat);
    face.scale.set(1, 0.82, 0.5); face.position.set(0, 22, 8.6);
    pivot.add(face);
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0x6fe8bd });
    var eyeL = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 8), eyeMat);
    eyeL.position.set(-3.6, 23, 12.6); pivot.add(eyeL);
    var eyeR = eyeL.clone(); eyeR.position.x = 3.6; pivot.add(eyeR);
    var antMat = new THREE.MeshLambertMaterial({ color: 0xd6dbe4 });
    var ant = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 6, 8), antMat);
    ant.position.y = 35.5; pivot.add(ant);
    var antTipMat = new THREE.MeshLambertMaterial({ color: zc.dot });
    var antTip = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), antTipMat);
    antTip.position.y = 39.5; pivot.add(antTip);
    var zz = d3Sprite(d3EmojiTex("💤"), 16, 16); zz.position.y = 44; zz.visible = false; g.add(zz);
    var warn = d3Sprite(d3EmojiTex("⚠️"), 15, 15); warn.position.y = 46; warn.visible = false; g.add(warn);
    g.userData.agent = agent;
    body.userData.agent = agent;
    D3.scene.add(g);
    D3.robots[agent] = { g: g, pivot: pivot, body: body, eyeMat: eyeMat, zz: zz, warn: warn,
                         mats: [matBody, bandMat, faceMat, antMat, antTipMat, eyeMat], phase: 0 };
  }

  function d3PickAt(cx, cy){
    var rect = D3.canvas.getBoundingClientRect();
    var v = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    var rc = new THREE.Raycaster();
    rc.setFromCamera(v, D3.camera);
    var bodies = Object.keys(D3.robots).map(function(a){ return D3.robots[a].body; });
    var hit = rc.intersectObjects(bodies, false)[0];
    if (hit) return hit.object.userData.agent;
    var tints = Object.keys(ZONES).map(function(a){ return D3.pills["tint_" + a]; });
    hit = rc.intersectObjects(tints, false)[0];
    return hit ? hit.object.userData.agent : null;
  }

  /* ---------- 真值同步:状态/电表/大屏/奖杯,全来自共享数据 ---------- */
  function d3Sync(){
    if (!D3.ready) return;
    var actors = T.actors(), meters = T.meters(), condBy = {};
    actors.forEach(function(a){ condBy[a.agent] = a; });
    Object.keys(D3.robots).forEach(function(agent){
      var r = D3.robots[agent], a = condBy[agent], z = ZONES[agent];
      /* 没有这位居民的真值就不演戏:整组隐藏(诚实空房),别把「没数据」画成「躺平」 */
      r.g.visible = !!a;
      if (!a){ r.cond = null; return; }
      var cond = a.cond;
      var px, pz;
      if (cond === "working"){ px = W2X(z.desk[0]); pz = W2Z(z.desk[1]) + 31; }
      else if (cond === "mess"){ px = W2X(z.desk[0]) + 26; pz = W2Z(z.desk[1]) + 36; }
      else if (cond === "resting"){ px = W2X(a.x); pz = W2Z(a.y); }
      else { px = W2X(z.bed[0]); pz = W2Z(z.bed[1]); }
      r.g.position.set(px, 0, pz);
      r.phase = a.phase || 0;
      r.cond = cond;
      var lying = (cond === "sleeping" || cond === "tidy");
      r.pivot.rotation.x = lying ? -1.35 : 0;
      r.pivot.rotation.y = 0;               /* resting 的摇摆由动画帧接管,状态切换先归零防残留 */
      r.pivot.position.y = lying ? 6 : 0;
      r.g.rotation.y = (cond === "working" || cond === "mess") ? Math.PI : 0;  /* 干活面朝桌上大屏 */
      r.eyeMat.color.setHex(cond === "mess" ? 0xff9a86 : (lying ? 0x2e3742 : 0x6fe8bd));
      r.zz.visible = cond === "sleeping";
      r.warn.visible = cond === "mess";
      var op = cond === "tidy" ? 0.55 : 1;
      r.mats.forEach(function(m){ m.transparent = op < 1; m.opacity = op; });
      if (D3.screens[agent]){
        var lit = cond === "working";
        D3.screens[agent].material.color.setHex(lit ? 0x5fd6a2 : 0x39414c);
        D3.screens[agent].material.emissive.setHex(lit ? 0x2e8f68 : 0x000000);
      }
      if (D3.pills[agent]){
        var mtxt = meters[agent] > 0 ? "⚡" + bigNum(meters[agent]) : null;
        if (r._pillTxt !== (z.name + "|" + mtxt)){
          r._pillTxt = z.name + "|" + mtxt;
          D3.pills[agent].material.map.dispose();
          D3.pills[agent].material.map = d3PillSprite(z.name, z3Of(agent).dot, mtxt);
          D3.pills[agent].material.needsUpdate = true;
          D3.pills[agent].scale.set(mtxt ? 118 : 96, mtxt ? 29.5 : 24, 1);
        }
      }
    });
    /* 挂墙大屏:数字=全家今日总和;柱条=各接表居民的真实占比(不再摆装饰假图) */
    var meterTotal = 0, vals = [];
    Object.keys(meters).forEach(function(k){ meterTotal += meters[k]; vals.push(meters[k]); });
    vals.sort(function(a, b){ return b - a; });
    var big = meterTotal > 0 ? bigNum(meterTotal) : (T.heartTotal() > 0 ? "❤ " + T.heartTotal() : "—");
    var sub = meterTotal > 0 ? "全家今日 token" : "今日心跳";
    var g = D3.dashCtx;
    g.fillStyle = "#20252e"; g.fillRect(0, 0, 1024, 416);
    var vmax = Math.max.apply(null, vals.concat([1]));
    for (var i = 0; i < vals.length; i++){
      var bh = Math.max(10, vals[i] / vmax * 130);
      g.fillStyle = "#5ad0a0"; g.fillRect(60 + i * 62, 200 - bh, 30, bh);
    }
    g.fillStyle = "#8fe8c4"; g.font = "bold 120px Menlo,monospace"; g.textBaseline = "alphabetic";
    g.fillText(big, 56, 360);
    var bw = g.measureText(big).width;
    g.fillStyle = "rgba(143,232,196,.6)"; g.font = "44px -apple-system,'PingFang SC',sans-serif";
    g.fillText(sub, 56 + bw + 30, 356);
    D3.dashTex.needsUpdate = true;
    /* 奖杯角标 */
    var tu = T.trophyUnlocked();
    if (D3.sprites.trophy){
      if (D3._tuTxt !== tu){
        D3._tuTxt = tu;
        D3.sprites.trophy.visible = tu != null;
        if (tu != null){
          D3.sprites.trophy.material.map.dispose();
          D3.sprites.trophy.material.map = d3TextBubble("🏆 " + tu);
          D3.sprites.trophy.material.needsUpdate = true;
        }
      }
    }
    d3WorkLights();   /* 夜灯跟着 working 集合直播,不吃快照 */
    if (D3.raf === null) d3Render();
  }

  /* 夜间工位灯=真值直播:每次同步按 working 集合增删,不吃快照(灯亮=此刻真有人干活) */
  function d3WorkLights(){
    if (!D3.ready) return;
    var sc = D3.scene, by = D3.lights.workBy || (D3.lights.workBy = {});
    var want = {};
    if (D3.toneNow === "night"){
      T.actors().forEach(function(a){ if (a.cond === "working" && ZONES[a.agent]) want[a.agent] = true; });
    }
    Object.keys(by).forEach(function(agent){
      if (!want[agent]){ sc.remove(by[agent]); delete by[agent]; }
    });
    Object.keys(want).forEach(function(agent){
      if (by[agent]) return;
      var z = ZONES[agent];
      var pl = new THREE.PointLight(0xffc37a, 0.85, 150, 1.6);
      pl.position.set(W2X(z.desk[0]), 46, W2Z(z.desk[1]) + 10);
      sc.add(pl); by[agent] = pl;
    });
  }
  function d3Tone(){
    if (!D3.ready) return;
    var tn = tone();
    if (D3.toneNow === tn) return;
    D3.toneNow = tn;
    var sc = D3.scene;
    if (tn === "night"){
      sc.background = new THREE.Color(0x1c2438);
      sc.fog = new THREE.Fog(0x1c2438, 1100, 2100);
      D3.lights.hemi.color.setHex(0x51628c); D3.lights.hemi.groundColor.setHex(0x1a2233);
      D3.lights.hemi.intensity = 0.75;
      D3.lights.dir.color.setHex(0x9fb2dd); D3.lights.dir.intensity = 0.22;
    } else if (tn === "dusk"){
      sc.background = new THREE.Color(0xecdcd0);
      sc.fog = new THREE.Fog(0xecdcd0, 1100, 2100);
      D3.lights.hemi.color.setHex(0xffe9d5); D3.lights.hemi.groundColor.setHex(0xcdbcae);
      D3.lights.hemi.intensity = 0.95;
      D3.lights.dir.color.setHex(0xffd9b0); D3.lights.dir.intensity = 0.42;
    } else {
      sc.background = new THREE.Color(0xe9eef5);
      sc.fog = new THREE.Fog(0xe9eef5, 1200, 2200);
      D3.lights.hemi.color.setHex(0xf8fbff); D3.lights.hemi.groundColor.setHex(0xd8dde6);
      D3.lights.hemi.intensity = 1.0;
      D3.lights.dir.color.setHex(0xffffff); D3.lights.dir.intensity = 0.5;
    }
    d3WorkLights();
    if (D3.raf === null) d3Render();
  }

  function d3Resize(){
    var frame = document.querySelector(".map-frame");
    var w = frame.clientWidth || 1, h = frame.clientHeight || 1;
    D3.renderer.setSize(w, h);
    D3.camera.aspect = w / h;
    D3.camera.updateProjectionMatrix();
    if (!D3.interacted){
      /* 用户还没接管镜头:竖屏自动拉远一档,整层楼装得下 */
      var dist = (w / h < 0.8) ? 1020 : 850;
      var dir = D3.camera.position.clone().sub(D3.controls.target).normalize();
      D3.camera.position.copy(D3.controls.target.clone().add(dir.multiplyScalar(dist)));
      D3.controls.update();
    }
    if (D3.raf === null) d3Render();
  }
  function d3Render(){ if (D3.ready) D3.renderer.render(D3.scene, D3.camera); }
  function d3Loop(){
    if (D3.raf){ cancelAnimationFrame(D3.raf); D3.raf = null; }
    var reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]reduce\b/.test(location.search); } catch(e){}
    if (reduced || document.hidden){
      /* 静态真值帧,交互靠 change 事件重画;按需渲染下阻尼/自转没有收敛循环,必须关掉 */
      D3.controls.enableDamping = false;
      D3.controls.autoRotate = false;
      d3Render(); D3.raf = null; return;
    }
    D3.controls.enableDamping = true;
    D3.controls.autoRotate = !D3.interacted;
    var step = function(){
      D3.raf = null;
      if (!full || !D3.wanted || document.hidden) { d3Render(); return; }
      var now = performance.now();
      Object.keys(D3.robots).forEach(function(r0){
        var r = D3.robots[r0];
        if (r.cond === "working") r.pivot.position.y = Math.abs(Math.sin(now / 300 + r.phase)) * 1.6;
        else if (r.cond === "resting") r.pivot.rotation.y = Math.sin(now / 900 + r.phase) * 0.22;
      });
      D3.inStep = true;
      D3.controls.update();
      D3.inStep = false;
      d3Render();
      D3.raf = requestAnimationFrame(step);
    };
    D3.raf = requestAnimationFrame(step);
  }
  document.addEventListener("visibilitychange", function(){
    if (D3.ready && D3.wanted && full && !document.hidden){ d3Resize(); }   /* 后台建的 1×1 画布在此自愈 */
    if (D3.ready && D3.wanted && full) d3Loop();
  });

  function initHud(toolkit){
    H = toolkit;
    buildHud();
    if (H.map.theme() === "hq") enterFull();
  }

  window.__HB_EXT__ = {
    makeSkin: makeSkin,
    initHud: initHud,
    onTheme: function(id){ if (!H || !hud) return; if (id === "hq") enterFull(); else exitFull(); },
    onData: function(){ if (full) renderAll(); },
    pick: function(agent){ if (!full) return false; togglePanel(agent); return true; }
  };
})();
