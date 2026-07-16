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
  function hqDashboard(x1, x2, wallH, big, sub){
    var l=isoP(x1,0), r=isoP(x2,0), slope=(r[1]-l[1])/(r[0]-l[0]);
    var pTop=wallH+12, pBot=6;
    function pt(fx, up){ var x=l[0]+(r[0]-l[0])*fx; var y=l[1]+(x-l[0])*slope - up; return [x,y]; }
    var A=pt(0,pTop), B=pt(1,pTop), C=pt(1,pBot), D=pt(0,pBot);
    ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.lineTo(C[0],C[1]); ctx.lineTo(D[0],D[1]); ctx.closePath();
    ctx.fillStyle=HQP.dash; ctx.fill(); ctx.strokeStyle="#3a4250"; ctx.lineWidth=2; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.lineTo(C[0],C[1]); ctx.lineTo(D[0],D[1]); ctx.closePath(); ctx.clip();
    var bars=[0.5,0.75,0.4,0.9,0.6,0.8,0.48,0.7];
    for (var i=0;i<bars.length;i++){
      var fx=0.07+i*0.045, base=pt(fx, pTop-6), bh=bars[i]*15;
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
    var meterTotal=0; Object.keys(meterByAgent).forEach(function(k){ meterTotal+=meterByAgent[k]; });
    if (meterTotal>0) hqDashboard(468,636, WALLH, bigNum(meterTotal), "今日 token");
    else if (heartTotal>0) hqDashboard(468,636, WALLH, "❤ "+heartTotal, "今日心跳");
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
      ".hqh-upd{display:none}" +
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
    var working = 0;
    (data.residents || []).forEach(function(r){ if (H.roomStateFor(r).cond === "working") working++; });
    chipSet(els.chipWork, "🟢", "在岗", String(working) + "/" + (data.residents || []).length, "");
    var stats = data.stats || {};
    if (typeof stats.beats_24h === "number") chipSet(els.chipBeats, "❤", "24h", String(stats.beats_24h), "跳");
    else els.chipBeats.hidden = true;
    var br = stats.energy && stats.energy.by_resident;
    if (br && br.length){
      var sum = 0; br.forEach(function(x){ sum += (x.tokens || 0); });
      chipSet(els.chipEnergy, "⚡", "今日", H.bigNum(sum), "token");
    } else els.chipEnergy.hidden = true;
    if (data.generated_at){
      els.chipUpd.innerHTML = "";
      els.chipUpd.appendChild(document.createTextNode("更新于 "));
      els.chipUpd.appendChild(tsSpan(data.generated_at));
      els.chipUpd.hidden = false;
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
    if (me && me.tokens > 0){
      var mv = mk("div", "hqh-pmeter");
      mv.appendChild(document.createTextNode("⚡ 今日 " + H.bigNum(me.tokens) + " "));
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
  }

  function enterFull(){
    if (full) return;
    full = true;
    document.documentElement.classList.add("hq-full");
    hud.hidden = false;
    H.map.setFit("contain");
    H.map.remeasure();
    renderAll();
    if (!clockTimer){
      clockTimer = setInterval(function(){
        if (!full) return;
        els.clock.textContent = clockText();
        var tn = tone();
        if (hud.dataset.tone !== tn) hud.dataset.tone = tn;
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
    H.map.setFit("width");
    H.map.remeasure();
  }

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
