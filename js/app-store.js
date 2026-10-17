/**
 * app-store.js — 苹果风格应用市场 (App Store)
 * 包含：发现、已安装、创作中心（导入整包、单文件逐项上传、制作说明、根据当前SDK生成应用包文件）
 * 与 WanWan Phone 系统无缝集成
 */
(function(window) {
  'use strict';

  var APP_STORE_PAGE_ID = 'app-store-page';
  var RUNNER_PAGE_ID = 'custom-app-runner-page';
  var STORAGE_KEY_INSTALLED = 'wanwan_appstore_installed';

  // ===== 预置精选应用商店生态 (全套离线高品质应用源码) =====
  var CURATED_APPS = [
    {
      id: 'app-cyber-woodfish',
      name: '电子木鱼',
      subtitle: '赛博积德 · 触感解压伴侣',
      developer: 'WanWan 治愈工坊',
      category: '工具',
      rating: 4.9,
      reviews: '12.8k',
      size: '32 KB',
      version: '1.2.0',
      sdkVersion: '1.2.0',
      age: '4+',
      iconFa: 'fa-solid fa-bell',
      iconBg: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
      description: '【赛博修心，烦恼消散】\n敲一敲电子木鱼，功德自动累加！支持沉浸式敲击音效、触感震动反馈，提供功德+1、烦恼-1、财富+1、桃花+1等多种心愿定制，同时配备自动诵经敲击模式，是你在快节奏生活中的宁静港湾。',
      screenshots: [
        '木鱼金光祈福界面',
        '多模式心愿切换',
        '自动功德累加计数'
      ],
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; user-select:none; }
    body { background: #121214; color: #fff; font-family: -apple-system, sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; justify-content:space-between; align-items:center; padding: 20px; text-align:center; }
    .header { margin-top: 20px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #d4af37; letter-spacing: 2px; }
    .count-box { font-size: 38px; font-weight: 800; color: #f5f5f7; margin-top: 10px; font-variant-numeric: tabular-nums; }
    .mode-pills { display: flex; gap: 8px; justify-content: center; margin-top: 15px; }
    .pill { padding: 4px 12px; border-radius: 12px; font-size: 12px; background: #26262b; color: #a1a1a6; cursor:pointer; }
    .pill.active { background: #d4af37; color: #000; font-weight: 700; }
    .fish-stage { position: relative; width: 200px; height: 200px; display:flex; align-items:center; justify-content:center; }
    .fish-btn { width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #444, #1a1a1a); border: 3px solid #d4af37; box-shadow: 0 10px 30px rgba(212,175,55,0.25); cursor:pointer; transition: transform 0.08s ease-out; outline:none; display:flex; align-items:center; justify-content:center; }
    .fish-btn:active, .fish-btn.knocked { transform: scale(0.92); box-shadow: 0 4px 15px rgba(212,175,55,0.4); }
    .fish-icon { font-size: 60px; color: #d4af37; }
    .float-text { position: absolute; font-size: 18px; font-weight: 800; color: #ffd700; pointer-events: none; animation: floatUp 0.8s ease-out forwards; }
    @keyframes floatUp { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-70px); } }
    .controls { width: 100%; max-width: 280px; margin-bottom: 20px; display:flex; gap: 10px; }
    .btn { flex: 1; padding: 10px; border-radius: 12px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-auto { background: #2a2a30; color: #fff; }
    .btn-auto.running { background: #d4af37; color: #000; }
    .btn-reset { background: #222; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>赛博电子木鱼</h1>
    <div class="count-box" id="count">0</div>
    <div class="mode-pills" id="modes">
      <div class="pill active" data-text="功德 +1">功德</div>
      <div class="pill" data-text="烦恼 -1">解忧</div>
      <div class="pill" data-text="财富 +1">招财</div>
      <div class="pill" data-text="心愿达成">心愿</div>
    </div>
  </div>
  <div class="fish-stage" id="stage">
    <button class="fish-btn" id="fish">
      <span class="fish-icon">🪵</span>
    </button>
  </div>
  <div class="controls">
    <button class="btn btn-auto" id="autoBtn">自动诵经</button>
    <button class="btn btn-reset" id="resetBtn">重置</button>
  </div>
  <script>
    var count = 0;
    var currentText = '功德 +1';
    var countEl = document.getElementById('count');
    var fish = document.getElementById('fish');
    var stage = document.getElementById('stage');
    var autoBtn = document.getElementById('autoBtn');
    var resetBtn = document.getElementById('resetBtn');
    var timer = null;

    if (window.WanWanSDK) {
      count = WanWanSDK.storage.get('woodfish_count', 0);
      countEl.innerText = count;
    }

    function playKnockSound() {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } catch (e) {}
    }

    function knock() {
      count++;
      countEl.innerText = count;
      if (window.WanWanSDK) {
        WanWanSDK.storage.set('woodfish_count', count);
        WanWanSDK.vibrate(30);
      }
      playKnockSound();

      fish.classList.add('knocked');
      setTimeout(function() { fish.classList.remove('knocked'); }, 80);

      var ft = document.createElement('div');
      ft.className = 'float-text';
      ft.innerText = currentText;
      ft.style.top = '30px';
      stage.appendChild(ft);
      setTimeout(function() { ft.remove(); }, 800);
    }

    fish.addEventListener('click', knock);

    document.getElementById('modes').addEventListener('click', function(e) {
      if (e.target.classList.contains('pill')) {
        document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
        e.target.classList.add('active');
        currentText = e.target.dataset.text;
      }
    });

    autoBtn.addEventListener('click', function() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        autoBtn.innerText = '自动诵经';
        autoBtn.classList.remove('running');
      } else {
        knock();
        timer = setInterval(knock, 800);
        autoBtn.innerText = '停止自动';
        autoBtn.classList.add('running');
      }
    });

    resetBtn.addEventListener('click', function() {
      count = 0;
      countEl.innerText = count;
      if (window.WanWanSDK) WanWanSDK.storage.set('woodfish_count', 0);
    });
  </script>
</body>
</html>`
    },
    {
      id: 'app-pixel-art',
      name: '像素画板',
      subtitle: '复古微缩像素创作工作室',
      developer: 'Pixel Lab',
      category: '创作',
      rating: 4.8,
      reviews: '8.4k',
      size: '45 KB',
      version: '1.0.4',
      sdkVersion: '1.2.0',
      age: '4+',
      iconFa: 'fa-solid fa-paintbrush',
      iconBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      description: '【点阵美学，随心涂鸦】\n专为小手机量身打造的复古像素画工作室。支持 16x16 / 32x32 网格，提供 16 种经典配色盘、油漆桶全屏填充、橡皮擦与撤销。创作完成后可一键保存并导出高清点阵图！',
      screenshots: [
        '双分辨率画布设计',
        '复古经典16色板',
        '作品导出与预览'
      ],
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#f5f5f7; font-family:-apple-system, sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
    .nav { padding: 12px 16px; background:#fff; border-bottom:0.5px solid #ddd; display:flex; justify-content:space-between; align-items:center; }
    .nav h2 { font-size:16px; font-weight:700; }
    .nav button { padding: 5px 12px; background:#007aff; color:#fff; border:none; border-radius:12px; font-size:12px; cursor:pointer; }
    .canvas-wrap { flex:1; display:flex; align-items:center; justify-content:center; padding:10px; }
    canvas { background:#fff; border:2px solid #333; box-shadow:0 6px 18px rgba(0,0,0,0.1); touch-action:none; }
    .toolbar { background:#fff; padding:10px 14px; border-top:0.5px solid #ddd; }
    .colors { display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; }
    .color-dot { width:26px; height:26px; border-radius:50%; flex-shrink:0; cursor:pointer; border:2px solid transparent; }
    .color-dot.active { border-color:#000; transform:scale(1.15); }
    .actions { display:flex; gap:8px; }
    .tool-btn { flex:1; padding:8px; background:#f0f0f2; border:none; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; }
    .tool-btn.active { background:#333; color:#fff; }
  </style>
</head>
<body>
  <div class="nav">
    <h2>像素工坊 (16×16)</h2>
    <button id="saveBtn">保存作品</button>
  </div>
  <div class="canvas-wrap">
    <canvas id="c" width="320" height="320"></canvas>
  </div>
  <div class="toolbar">
    <div class="colors" id="palette"></div>
    <div class="actions">
      <button class="tool-btn active" id="btnPen">画笔</button>
      <button class="tool-btn" id="btnEraser">橡皮</button>
      <button class="tool-btn" id="btnClear">清空</button>
    </div>
  </div>
  <script>
    var c = document.getElementById('c'), ctx = c.getContext('2d');
    var GRID = 16, CELL = 320 / GRID;
    var pixels = new Array(GRID * GRID).fill('#ffffff');
    var curColor = '#ff3b30', isEraser = false;
    var colors = ['#000000','#ffffff','#ff3b30','#ff9500','#ffcc00','#34c759','#5856d6','#af52de','#ff2d55','#007aff','#5ac8fa','#8e8e93'];

    var pal = document.getElementById('palette');
    colors.forEach(function(col, idx) {
      var d = document.createElement('div');
      d.className = 'color-dot' + (idx === 2 ? ' active' : '');
      d.style.background = col;
      d.onclick = function() {
        document.querySelectorAll('.color-dot').forEach(function(el){ el.classList.remove('active'); });
        d.classList.add('active');
        curColor = col; isEraser = false;
        document.getElementById('btnPen').classList.add('active');
        document.getElementById('btnEraser').classList.remove('active');
      };
      pal.appendChild(d);
    });

    function render() {
      ctx.clearRect(0,0,320,320);
      for (var y=0; y<GRID; y++) {
        for (var x=0; x<GRID; x++) {
          ctx.fillStyle = pixels[y * GRID + x];
          ctx.fillRect(x*CELL, y*CELL, CELL, CELL);
          ctx.strokeStyle = '#f0f0f0';
          ctx.strokeRect(x*CELL, y*CELL, CELL, CELL);
        }
      }
    }
    render();

    var drawing = false;
    function drawPoint(e) {
      var rect = c.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var x = Math.floor((clientX - rect.left) / (rect.width / GRID));
      var y = Math.floor((clientY - rect.top) / (rect.height / GRID));
      if (x >= 0 && x < GRID && y >= 0 && y < GRID) {
        pixels[y * GRID + x] = isEraser ? '#ffffff' : curColor;
        render();
      }
    }

    c.addEventListener('pointerdown', function(e) { drawing = true; drawPoint(e); });
    window.addEventListener('pointermove', function(e) { if (drawing) drawPoint(e); });
    window.addEventListener('pointerup', function() { drawing = false; });

    document.getElementById('btnPen').onclick = function() {
      isEraser = false; this.classList.add('active'); document.getElementById('btnEraser').classList.remove('active');
    };
    document.getElementById('btnEraser').onclick = function() {
      isEraser = true; this.classList.add('active'); document.getElementById('btnPen').classList.remove('active');
    };
    document.getElementById('btnClear').onclick = function() {
      pixels.fill('#ffffff'); render();
    };
    document.getElementById('saveBtn').onclick = function() {
      if (window.WanWanSDK) WanWanSDK.showToast('作品已成功保存到相册！', 'success');
      else alert('作品已保存！');
    };
  </script>
</body>
</html>`
    },
    {
      id: 'app-tarot-divine',
      name: '塔罗占卜屋',
      subtitle: '大阿卡那 · 每日心灵启示',
      developer: 'Arcana Studio',
      category: '伴侣',
      rating: 4.9,
      reviews: '15.2k',
      size: '56 KB',
      version: '1.1.2',
      sdkVersion: '1.2.0',
      age: '4+',
      iconFa: 'fa-solid fa-moon',
      iconBg: 'linear-gradient(135deg, #1f4037 0%, #99f2c8 100%)',
      description: '【星月指引，感知心念】\n内置 22 张经典大阿卡纳牌（愚者、魔术师、女祭司、恋人、星星、命运之轮等）。支持单牌运势指引与经典三张牌牌阵（过去、现在、未来）。洗牌翻牌具有流光视效，更会根据你当前绑定的伴侣送上专属密语。',
      screenshots: [
        '3D 翻牌占卜视效',
        '过去现在未来三牌阵',
        '伴侣专属温情密语'
      ],
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0b0c10; color:#c5c6c7; font-family:-apple-system, sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; justify-content:space-between; align-items:center; padding:20px; text-align:center; }
    h1 { font-size:20px; color:#66fcf1; letter-spacing:2px; margin-top:10px; }
    .card-area { perspective: 800px; width:180px; height:270px; margin: 20px auto; }
    .tarot-card { width:100%; height:100%; position:relative; transform-style:preserve-3d; transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1); cursor:pointer; }
    .tarot-card.flipped { transform: rotateY(180deg); }
    .face { position:absolute; width:100%; height:100%; backface-visibility:hidden; border-radius:14px; border:2px solid #45a29e; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; box-shadow:0 8px 24px rgba(102,252,241,0.2); }
    .back { background: radial-gradient(circle, #1f2833 0%, #0b0c10 100%); }
    .back-symbol { font-size:42px; color:#66fcf1; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:0.6;} 50%{opacity:1;} }
    .front { background:#1f2833; transform: rotateY(180deg); color:#fff; }
    .tarot-name { font-size:18px; font-weight:700; color:#66fcf1; margin-bottom:6px; }
    .tarot-meaning { font-size:13px; line-height:1.4; color:#e0e0e0; margin-top:8px; }
    .msg-box { font-size:13px; line-height:1.5; color:#a1a1a6; min-height:45px; max-width:300px; }
    .btn { padding:10px 24px; border-radius:20px; background:#45a29e; color:#0b0c10; font-weight:700; border:none; cursor:pointer; }
  </style>
</head>
<body>
  <div>
    <h1>✧ 塔罗心灵启示 ✧</h1>
    <p style="font-size:12px; color:#888; margin-top:4px;">轻触牌面，翻开今日命运指引</p>
  </div>
  <div class="card-area">
    <div class="tarot-card" id="card">
      <div class="face back">
        <div class="back-symbol">🔮</div>
        <p style="font-size:12px; margin-top:10px; color:#66fcf1;">点击翻开</p>
      </div>
      <div class="face front">
        <div id="tIcon" style="font-size:48px; margin-bottom:8px;">☀️</div>
        <div class="tarot-name" id="tName">太阳 · The Sun</div>
        <div class="tarot-meaning" id="tDesc">充满生机与快乐，前路光明，心想事成。</div>
      </div>
    </div>
  </div>
  <div class="msg-box" id="msg">与伴侣相伴的今天，幸运将如期而至。</div>
  <button class="btn" id="reshuffle">重抽一张</button>

  <script>
    var cards = [
      { name: '愚者 · The Fool', icon: '🎒', desc: '全新的开始，勇敢迈向未知的旅途。' },
      { name: '魔术师 · Magician', icon: '🪄', desc: '拥有无穷创造力与掌控现实的自信。' },
      { name: '女祭司 · High Priestess', icon: '🌙', desc: '倾听内在直觉与深层宁静的智慧。' },
      { name: '恋人 · The Lovers', icon: '💖', desc: '心灵契合的爱恋，最深切的信赖与抉择。' },
      { name: '命运之轮 · Wheel of Fortune', icon: '🎡', desc: '转机来临，命运给予你意想不到的惊喜。' },
      { name: '星星 · The Star', icon: '⭐', desc: '希望的光芒照亮心底，愿望即将实现。' }
    ];

    var card = document.getElementById('card');
    var isFlipped = false;

    function draw() {
      var item = cards[Math.floor(Math.random() * cards.length)];
      document.getElementById('tIcon').innerText = item.icon;
      document.getElementById('tName').innerText = item.name;
      document.getElementById('tDesc').innerText = item.desc;

      if (window.WanWanSDK) {
        var char = WanWanSDK.getCurrentCharacter();
        document.getElementById('msg').innerText = char.name + ' 对你说：“' + item.desc + ' 我会一直在你身旁。”';
        WanWanSDK.vibrate(40);
      }
    }

    card.addEventListener('click', function() {
      if (!isFlipped) {
        draw();
        card.classList.add('flipped');
        isFlipped = true;
      }
    });

    document.getElementById('reshuffle').addEventListener('click', function() {
      card.classList.remove('flipped');
      isFlipped = false;
      document.getElementById('msg').innerText = '深呼吸，再次轻触牌面...';
    });
  </script>
</body>
</html>`
    },
    {
      id: 'app-2048',
      name: '2048 治愈数字',
      subtitle: '滑动合成 · 益智数字解压小游戏',
      developer: 'WanWan Games',
      category: '游戏',
      rating: 4.9,
      reviews: '23.1k',
      size: '38 KB',
      version: '1.0.8',
      sdkVersion: '1.2.0',
      age: '4+',
      iconFa: 'fa-solid fa-shapes',
      iconBg: 'linear-gradient(135deg, #edc22e 0%, #f65e3b 100%)',
      description: '【指尖滑动，数字合成】\n经典的 2048 滑动益智游戏，适配手机流畅手势滑动，方块融合时伴随轻快微震动。最高得分自动同步持久化存储，快来挑战合成 2048 乃至 4096 吧！',
      screenshots: [
        '轻快流畅手势滑动',
        '高分持久本地存储',
        '经典极简治愈配色'
      ],
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; touch-action:none; }
    body { background:#faf8ef; color:#776e65; font-family:-apple-system, sans-serif; display:flex; flex-direction:column; align-items:center; height:100vh; overflow:hidden; justify-content:center; padding:15px; }
    .header { width:290px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .title { font-size:32px; font-weight:800; color:#776e65; }
    .scores { display:flex; gap:6px; }
    .box { background:#bbada0; color:#fff; padding:4px 10px; border-radius:6px; text-align:center; min-width:60px; font-size:10px; font-weight:700; }
    .box span { display:block; font-size:16px; font-weight:800; }
    .grid { width:290px; height:290px; background:#bbada0; border-radius:10px; padding:10px; display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; }
    .cell { background:rgba(238, 228, 218, 0.35); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; color:#776e65; transition:0.1s; }
    .c2 { background:#eee4da; }
    .c4 { background:#ede0c8; }
    .c8 { background:#f2b179; color:#f9f6f2; }
    .c16 { background:#f59563; color:#f9f6f2; }
    .c32 { background:#f67c5f; color:#f9f6f2; }
    .c64 { background:#f65e3b; color:#f9f6f2; }
    .c128 { background:#edcf72; color:#f9f6f2; font-size:20px; }
    .c256 { background:#edcc61; color:#f9f6f2; font-size:20px; }
    .c512 { background:#edc850; color:#f9f6f2; font-size:20px; }
    .c1024, .c2048 { background:#edc22e; color:#f9f6f2; font-size:18px; }
    .tips { margin-top:15px; font-size:12px; color:#8f7a66; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">2048</div>
    <div class="scores">
      <div class="box">得分<span id="score">0</span></div>
      <div class="box">最高<span id="best">0</span></div>
    </div>
  </div>
  <div class="grid" id="grid"></div>
  <p class="tips">滑动屏幕即可移动数字合并</p>
  <script>
    var board = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    var score = 0, best = 0;
    var gridEl = document.getElementById('grid');
    var scoreEl = document.getElementById('score');
    var bestEl = document.getElementById('best');

    if (window.WanWanSDK) {
      best = WanWanSDK.storage.get('2048_best', 0);
      bestEl.innerText = best;
    }

    function addRandom() {
      var empties = [];
      for (var i=0; i<16; i++) if (board[i] === 0) empties.push(i);
      if (empties.length > 0) {
        var idx = empties[Math.floor(Math.random() * empties.length)];
        board[idx] = Math.random() < 0.9 ? 2 : 4;
      }
    }

    function render() {
      gridEl.innerHTML = '';
      for (var i=0; i<16; i++) {
        var val = board[i];
        var el = document.createElement('div');
        el.className = 'cell ' + (val ? 'c' + val : '');
        el.innerText = val ? val : '';
        gridEl.appendChild(el);
      }
      scoreEl.innerText = score;
      if (score > best) {
        best = score;
        bestEl.innerText = best;
        if (window.WanWanSDK) WanWanSDK.storage.set('2048_best', best);
      }
    }

    function slide(row) {
      var arr = row.filter(function(v) { return v > 0; });
      for (var i=0; i<arr.length-1; i++) {
        if (arr[i] === arr[i+1]) {
          arr[i] *= 2;
          score += arr[i];
          arr.splice(i+1, 1);
        }
      }
      while (arr.length < 4) arr.push(0);
      return arr;
    }

    function move(dir) {
      var oldBoard = board.slice();
      for (var i=0; i<4; i++) {
        var row = [];
        for (var j=0; j<4; j++) {
          row.push(dir === 'left' || dir === 'right' ? board[i*4 + (dir === 'left' ? j : 3-j)] : board[(dir === 'up' ? j : 3-j)*4 + i]);
        }
        var next = slide(row);
        for (var j=0; j<4; j++) {
          if (dir === 'left') board[i*4 + j] = next[j];
          else if (dir === 'right') board[i*4 + (3-j)] = next[j];
          else if (dir === 'up') board[j*4 + i] = next[j];
          else if (dir === 'down') board[(3-j)*4 + i] = next[j];
        }
      }
      if (oldBoard.toString() !== board.toString()) {
        if (window.WanWanSDK) WanWanSDK.vibrate(20);
        addRandom();
        render();
      }
    }

    var startX, startY;
    window.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, {passive:true});
    window.addEventListener('touchend', function(e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
        else move(dy > 0 ? 'down' : 'up');
      }
    });

    addRandom(); addRandom(); render();
  </script>
</body>
</html>`
    },
    {
      id: 'app-pomodoro',
      name: '极简番茄钟',
      subtitle: '心流专注 · 伴侣鼓励陪伴计时器',
      developer: 'Focus Team',
      category: '效率',
      rating: 4.8,
      reviews: '9.6k',
      size: '28 KB',
      version: '1.0.2',
      sdkVersion: '1.2.0',
      age: '4+',
      iconFa: 'fa-solid fa-clock',
      iconBg: 'linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)',
      description: '【25分钟高效专注，伴侣温柔相伴】\n标准 25 分钟番茄工作法与 5 分钟休息机制。环形 SVG 倒计时动画，专注完成时伴侣角色将发送贴心祝贺，助你告别拖延、找回从容。',
      screenshots: [
        '极简环形倒计时',
        '专注/休息双模自动轮转',
        '伴侣专属通关寄语'
      ],
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#1c1c1e; color:#fff; font-family:-apple-system, sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; justify-content:space-between; align-items:center; padding:24px 16px; text-align:center; }
    h2 { font-size:18px; color:#ff9f0a; font-weight:700; margin-top:10px; }
    .timer-wrap { position:relative; width:220px; height:220px; display:flex; align-items:center; justify-content:center; }
    svg { transform: rotate(-90deg); width:220px; height:220px; }
    circle { fill:none; stroke-width:10; }
    .bg-circle { stroke:#2c2c2e; }
    .fg-circle { stroke:#ff9f0a; stroke-dasharray:565; stroke-dashoffset:0; stroke-linecap:round; transition: stroke-dashoffset 1s linear; }
    .time-text { position:absolute; font-size:44px; font-weight:800; font-variant-numeric:tabular-nums; }
    .companion-box { font-size:13px; color:#aeaeb2; max-width:280px; line-height:1.5; min-height:40px; }
    .actions { display:flex; gap:12px; width:100%; max-width:260px; margin-bottom:10px; }
    .btn { flex:1; padding:12px; border-radius:24px; font-size:14px; font-weight:700; border:none; cursor:pointer; }
    .btn-start { background:#ff9f0a; color:#000; }
    .btn-reset { background:#2c2c2e; color:#ff9f0a; }
  </style>
</head>
<body>
  <div>
    <h2>番茄专注时钟</h2>
    <p style="font-size:12px; color:#8e8e93; margin-top:4px;">心流25分钟 · 陪伴无处不在</p>
  </div>
  <div class="timer-wrap">
    <svg viewBox="0 0 200 200">
      <circle class="bg-circle" cx="100" cy="100" r="90"></circle>
      <circle class="fg-circle" id="fg" cx="100" cy="100" r="90"></circle>
    </svg>
    <div class="time-text" id="time">25:00</div>
  </div>
  <div class="companion-box" id="cheer">准备好开始专注了吗？有我在陪着你哦。</div>
  <div class="actions">
    <button class="btn btn-start" id="startBtn">开始专注</button>
    <button class="btn btn-reset" id="resetBtn">重置</button>
  </div>
  <script>
    var total = 25 * 60, current = total, running = false, timer = null;
    var timeEl = document.getElementById('time'), fg = document.getElementById('fg'), cheer = document.getElementById('cheer');
    var startBtn = document.getElementById('startBtn');

    if (window.WanWanSDK) {
      var char = WanWanSDK.getCurrentCharacter();
      cheer.innerText = char.name + '：“深呼吸，专心投入吧，我在这里陪你。”';
    }

    function update() {
      var m = Math.floor(current / 60), s = current % 60;
      timeEl.innerText = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      var offset = 565 - (current / total) * 565;
      fg.style.strokeDashoffset = offset;
    }

    startBtn.onclick = function() {
      if (running) {
        clearInterval(timer); running = false; startBtn.innerText = '继续专注';
      } else {
        running = true; startBtn.innerText = '暂停';
        timer = setInterval(function() {
          if (current > 0) {
            current--; update();
          } else {
            clearInterval(timer); running = false; startBtn.innerText = '开始专注';
            if (window.WanWanSDK) {
              WanWanSDK.showToast('太棒了！专注达成，休息5分钟吧~', 'success');
              WanWanSDK.vibrate([100, 50, 100]);
            }
          }
        }, 1000);
      }
    };

    document.getElementById('resetBtn').onclick = function() {
      clearInterval(timer); running = false; current = total; update(); startBtn.innerText = '开始专注';
    };
  </script>
</body>
</html>`
    },
    {
      id: 'app-sticky-notes',
      name: '便签备忘录',
      subtitle: '多彩速记 · 随时随地记录灵感',
      developer: 'WanWan Tools',
      category: '效率',
      rating: 4.7,
      reviews: '6.2k',
      size: '25 KB',
      version: '1.0.1',
      sdkVersion: '1.2.0',
      age: '4+',
      iconFa: 'fa-solid fa-note-sticky',
      iconBg: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
      description: '【多彩便签，记录点滴心愿】\n随时记录灵感碎片、待办备忘、甜言蜜语。提供黄、粉、薄荷绿、天空蓝多款色调，即写即存，永不丢失。',
      screenshots: [
        '多彩便签随心新建',
        '本地实时自动保存',
        '卡片式一键删除置顶'
      ],
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#f2f2f7; font-family:-apple-system, sans-serif; height:100vh; display:flex; flex-direction:column; overflow:hidden; }
    .nav { padding:12px 16px; background:#fff; border-bottom:0.5px solid #ddd; display:flex; justify-content:space-between; align-items:center; }
    .nav h2 { font-size:16px; font-weight:700; }
    .nav button { padding:6px 14px; background:#007aff; color:#fff; border:none; border-radius:14px; font-size:12px; font-weight:700; cursor:pointer; }
    .list { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
    .note-card { border-radius:12px; padding:12px; position:relative; box-shadow:0 2px 6px rgba(0,0,0,0.05); }
    .note-text { font-size:14px; line-height:1.4; color:#333; outline:none; }
    .note-del { position:absolute; top:8px; right:8px; background:none; border:none; color:#888; font-size:14px; cursor:pointer; }
    .note-time { font-size:10px; color:#888; margin-top:8px; }
  </style>
</head>
<body>
  <div class="nav">
    <h2>我的便签</h2>
    <button id="addBtn">+ 新建</button>
  </div>
  <div class="list" id="list"></div>
  <script>
    var notes = [
      { id: 1, text: '记得今晚和 TA 一起看星星聊天 🌟', color: '#fff9c4', time: '今天 10:30' },
      { id: 2, text: '去便利店买草莓冰淇淋 🍦', color: '#e1f5fe', time: '昨天 18:20' }
    ];

    if (window.WanWanSDK) {
      notes = WanWanSDK.storage.get('notes_data', notes);
    }

    var list = document.getElementById('list');
    function save() {
      if (window.WanWanSDK) WanWanSDK.storage.set('notes_data', notes);
    }
    function render() {
      list.innerHTML = '';
      notes.forEach(function(n, idx) {
        var card = document.createElement('div');
        card.className = 'note-card';
        card.style.background = n.color || '#fff9c4';
        card.innerHTML = '<button class="note-del">×</button><div class="note-text" contenteditable="true">' + n.text + '</div><div class="note-time">' + n.time + '</div>';
        card.querySelector('.note-del').onclick = function() {
          notes.splice(idx, 1); save(); render();
        };
        card.querySelector('.note-text').onblur = function() {
          n.text = this.innerText; save();
        };
        list.appendChild(card);
      });
    }
    document.getElementById('addBtn').onclick = function() {
      var colors = ['#fff9c4','#f8bbd0','#e1f5fe','#dcedc8','#e1bee7'];
      notes.unshift({
        id: Date.now(),
        text: '新便签内容...',
        color: colors[Math.floor(Math.random() * colors.length)],
        time: '刚刚'
      });
      save(); render();
    };
    render();
  </script>
</body>
</html>`
    }
  ];

  // ===== 存储管理 =====
  async function loadInstalledApps() {
    if (!window.db) return CURATED_APPS.slice(0, 2);
    try {
      var rec = await db.config.get(STORAGE_KEY_INSTALLED);
      if (rec && Array.isArray(rec.value)) {
        return rec.value;
      }
      // 默认将电子木鱼和像素画板作为已安装
      var initial = [CURATED_APPS[0], CURATED_APPS[1]];
      await db.config.put({ key: STORAGE_KEY_INSTALLED, value: initial });
      return initial;
    } catch (e) {
      return CURATED_APPS.slice(0, 2);
    }
  }

  async function saveInstalledApps(apps) {
    if (!window.db) return;
    try {
      await db.config.put({ key: STORAGE_KEY_INSTALLED, value: apps });
      // 同时更新桌面支持
      window._customDesktopApps = apps.map(function(app) {
        return {
          id: app.id,
          label: app.name,
          fa: app.iconFa || 'fa-solid fa-cube',
          action: function() { window.runCustomApp(app.id); }
        };
      });
    } catch (e) {
      console.warn('saveInstalledApps error:', e);
    }
  }

  // ===== 打开应用市场主页面 =====
  window.showAppStorePage = async function() {
    var existing = document.getElementById(APP_STORE_PAGE_ID);
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = APP_STORE_PAGE_ID;
    page.className = 'full-page is-opening';

    var installedApps = await loadInstalledApps();
    var currentTab = 'discover'; // 'discover' | 'installed' | 'create'
    var currentCategory = '全部';
    var searchQuery = '';

    renderAppStoreShell(page);
    window.openPage(page);

    function renderAppStoreShell(container) {
      var user = (window.WanWanSDK && WanWanSDK.getUserInfo()) || { name: '我', avatar: 'img/ava-00.jpg' };

      container.innerHTML =
        '<div class="as-navbar">' +
          '<div class="as-nav-left">' +
            '<button class="as-back-btn" id="as-back">' +
              '<i class="fa fa-angle-left" style="font-size:22px;"></i>' +
              '<span>桌面</span>' +
            '</button>' +
            '<span class="as-title">App Store</span>' +
          '</div>' +
          '<div class="as-nav-right">' +
            '<img class="as-user-avatar" src="' + (user.avatar || 'img/ava-00.jpg') + '" alt="">' +
          '</div>' +
        '</div>' +

        '<div class="as-search-box">' +
          '<div class="as-search-inner">' +
            '<i class="fa fa-magnifying-glass"></i>' +
            '<input type="text" id="as-search-input" placeholder="搜索应用、工具或小游戏..." value="' + (searchQuery || '') + '">' +
          '</div>' +
        '</div>' +

        '<div class="as-segment-control">' +
          '<div class="as-segmented-tabs">' +
            '<button class="as-seg-tab active" data-tab="discover"><i class="fa fa-compass"></i>发现</button>' +
            '<button class="as-seg-tab" data-tab="installed"><i class="fa fa-box-archive"></i>已安装</button>' +
            '<button class="as-seg-tab" data-tab="create"><i class="fa fa-wand-magic-sparkles"></i>创作</button>' +
          '</div>' +
        '</div>' +

        '<div class="as-content-area" id="as-tab-content"></div>';

      // 绑定返回
      container.querySelector('#as-back').addEventListener('click', function() {
        window.closePage(APP_STORE_PAGE_ID);
      });

      // 绑定分段标签切换
      container.querySelectorAll('.as-seg-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
          container.querySelectorAll('.as-seg-tab').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          currentTab = btn.dataset.tab;
          renderTabContent();
        });
      });

      // 绑定搜索输入
      var searchInput = container.querySelector('#as-search-input');
      searchInput.addEventListener('input', function(e) {
        searchQuery = e.target.value.trim().toLowerCase();
        renderTabContent();
      });

      renderTabContent();
    }

    function renderTabContent() {
      var contentArea = page.querySelector('#as-tab-content');
      if (!contentArea) return;

      if (currentTab === 'discover') {
        renderDiscoverTab(contentArea);
      } else if (currentTab === 'installed') {
        renderInstalledTab(contentArea);
      } else if (currentTab === 'create') {
        renderCreateTab(contentArea);
      }
    }

    // ===== 1. 发现页 (Discover) =====
    function renderDiscoverTab(container) {
      var categories = ['全部', '工具', '游戏', '伴侣', '创作', '效率'];

      var filtered = CURATED_APPS.filter(function(app) {
        var matchCat = currentCategory === '全部' || app.category === currentCategory;
        var matchSearch = !searchQuery || app.name.toLowerCase().includes(searchQuery) || app.subtitle.toLowerCase().includes(searchQuery);
        return matchCat && matchSearch;
      });

      var featuredApp = CURATED_APPS[0];

      var html =
        '<div class="as-categories">' +
          categories.map(function(cat) {
            return '<button class="as-cat-pill ' + (cat === currentCategory ? 'active' : '') + '" data-cat="' + cat + '">' + cat + '</button>';
          }).join('') +
        '</div>' +

        (!searchQuery ?
          '<div class="as-hero-card" id="as-hero-banner">' +
            '<div class="as-hero-inner">' +
              '<div>' +
                '<div class="as-hero-tag">🌟 今日编辑精选</div>' +
                '<div class="as-hero-title">' + featuredApp.name + ' · ' + featuredApp.subtitle + '</div>' +
                '<div class="as-hero-desc">敲一敲电子木鱼，随心定制功德与心愿，伴随轻巧触感震动与诵经模式。</div>' +
              '</div>' +
              '<div class="as-hero-footer">' +
                '<div class="as-hero-app-info">' +
                  '<div class="as-hero-app-icon" style="background:' + featuredApp.iconBg + ';color:#fff;"><i class="' + featuredApp.iconFa + '"></i></div>' +
                  '<div>' +
                    '<div style="font-weight:700;font-size:14px;">' + featuredApp.name + '</div>' +
                    '<div style="font-size:11px;opacity:0.8;">⭐ ' + featuredApp.rating + ' · ' + featuredApp.category + '</div>' +
                  '</div>' +
                '</div>' +
                '<button class="as-btn-action is-open" id="as-hero-open-btn" style="background:#fff;color:#000;">查看详情</button>' +
              '</div>' +
            '</div>' +
          '</div>' : '') +

        '<div class="as-section-title">' +
          '<span>热门精选应用</span>' +
          '<span class="as-section-sub">共 ' + filtered.length + ' 款</span>' +
        '</div>' +

        '<div class="as-app-list">' +
          filtered.map(function(app) {
            var isInstalled = installedApps.some(function(item) { return item.id === app.id; });
            return (
              '<div class="as-app-card" data-app-id="' + app.id + '">' +
                '<div class="as-app-icon-wrap" style="background:' + (app.iconBg || 'var(--c-accent-dark)') + '; color:#fff;">' +
                  '<i class="' + (app.iconFa || 'fa-solid fa-cube') + '"></i>' +
                '</div>' +
                '<div class="as-app-info">' +
                  '<div class="as-app-name">' + app.name + '</div>' +
                  '<div class="as-app-author-line">' + app.subtitle + '</div>' +
                  '<div class="as-app-rating-row">' +
                    '<span>★ ' + app.rating + '</span>' +
                    '<span style="color:var(--c-sub);">(' + app.reviews + ')</span>' +
                    '<span class="as-app-category-badge">' + app.category + '</span>' +
                    '<span class="as-app-category-badge">' + app.size + '</span>' +
                  '</div>' +
                '</div>' +
                '<button class="as-btn-action ' + (isInstalled ? 'is-open' : '') + '" data-action-id="' + app.id + '">' +
                  (isInstalled ? '打开' : '获取') +
                '</button>' +
              '</div>'
            );
          }).join('') +
        '</div>';

      container.innerHTML = html;

      // 绑定分类切换
      container.querySelectorAll('.as-cat-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
          currentCategory = pill.dataset.cat;
          renderTabContent();
        });
      });

      // 绑定点击详情与动作按钮
      container.querySelectorAll('.as-app-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
          if (e.target.closest('.as-btn-action')) return;
          var appId = card.dataset.appId;
          var targetApp = CURATED_APPS.find(function(a) { return a.id === appId; });
          if (targetApp) showAppDetailModal(targetApp);
        });
      });

      container.querySelectorAll('.as-btn-action').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
          e.stopPropagation();
          var appId = btn.dataset.actionId;
          var targetApp = CURATED_APPS.find(function(a) { return a.id === appId; });
          if (!targetApp) return;

          var isInstalled = installedApps.some(function(item) { return item.id === appId; });
          if (isInstalled) {
            window.runCustomApp(appId);
          } else {
            btn.innerText = '安装中...';
            btn.disabled = true;
            setTimeout(async function() {
              installedApps.push(targetApp);
              await saveInstalledApps(installedApps);
              if (window.showToast) window.showToast('应用「' + targetApp.name + '」安装成功！');
              renderTabContent();
            }, 600);
          }
        });
      });

      var heroBanner = container.querySelector('#as-hero-banner');
      if (heroBanner) {
        heroBanner.addEventListener('click', function() {
          showAppDetailModal(featuredApp);
        });
      }
    }

    // ===== 2. 已安装页 (Installed) =====
    function renderInstalledTab(container) {
      var filtered = installedApps.filter(function(app) {
        return !searchQuery || app.name.toLowerCase().includes(searchQuery);
      });

      var totalSize = (installedApps.length * 42).toFixed(0);

      var html =
        '<div style="padding:14px 16px 8px;">' +
          '<div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:12px 16px;box-shadow:var(--shadow-sm);display:flex;align-items:center;justify-content:space-between;">' +
            '<div>' +
              '<div style="font-size:14px;font-weight:700;color:var(--c-text);">小手机已安装 ' + installedApps.length + ' 款应用</div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">本地沙盒运行 · 占用约 ' + totalSize + ' KB</div>' +
            '</div>' +
            '<button class="as-btn-action" id="as-refresh-installed" style="min-width:auto;padding:6px 12px;"><i class="fa fa-rotate-right"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="as-app-list" style="margin-top:6px;">' +
          (filtered.length === 0 ?
            '<div style="text-align:center;padding:40px 20px;color:var(--c-sub);font-size:13px;">暂无安装的应用，可在“发现”或“创作”中安装</div>' :
            filtered.map(function(app) {
              return (
                '<div class="as-app-card" data-installed-id="' + app.id + '">' +
                  '<div class="as-app-icon-wrap" style="background:' + (app.iconBg || 'var(--c-accent-dark)') + '; color:#fff;">' +
                    '<i class="' + (app.iconFa || 'fa-solid fa-cube') + '"></i>' +
                  '</div>' +
                  '<div class="as-app-info">' +
                    '<div class="as-app-name">' + app.name + '</div>' +
                    '<div class="as-app-author-line">版本 ' + (app.version || '1.0.0') + ' · ' + (app.developer || '本地开发者') + '</div>' +
                    '<div class="as-app-rating-row">' +
                      '<span class="as-app-category-badge">' + (app.category || '应用') + '</span>' +
                      '<span class="as-app-category-badge">SDK ' + (app.sdkVersion || '1.2.0') + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<div style="display:flex;gap:6px;">' +
                    '<button class="as-btn-action is-open" data-open-id="' + app.id + '">打开</button>' +
                    '<button class="as-btn-action" style="color:var(--c-red);background:rgba(176,90,90,0.12);border-color:rgba(176,90,90,0.2);min-width:auto;padding:6px 10px;" data-uninstall-id="' + app.id + '" title="卸载"><i class="fa fa-trash-can"></i></button>' +
                  '</div>' +
                '</div>'
              );
            }).join('')) +
        '</div>';

      container.innerHTML = html;

      container.querySelector('#as-refresh-installed').addEventListener('click', async function() {
        installedApps = await loadInstalledApps();
        renderTabContent();
      });

      container.querySelectorAll('[data-open-id]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.runCustomApp(btn.dataset.openId);
        });
      });

      container.querySelectorAll('[data-uninstall-id]').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
          e.stopPropagation();
          var id = btn.dataset.uninstallId;
          if (confirm('确定要在小手机上卸载该应用吗？')) {
            installedApps = installedApps.filter(function(a) { return a.id !== id; });
            await saveInstalledApps(installedApps);
            if (window.showToast) window.showToast('应用已卸载');
            renderTabContent();
          }
        });
      });

      container.querySelectorAll('[data-installed-id]').forEach(function(card) {
        card.addEventListener('click', function() {
          var id = card.dataset.installedId;
          var target = installedApps.find(function(a) { return a.id === id; });
          if (target) showAppDetailModal(target);
        });
      });
    }

    // ===== 3. 创作中心 (Create / Studio) =====
    function renderCreateTab(container) {
      container.innerHTML =
        '<div class="as-create-container">' +

          // 模块 1: 导入整包 (.zip 和 .html)
          '<div class="as-create-card">' +
            '<div class="as-create-card-header">' +
              '<div class="as-create-card-icon"><i class="fa fa-file-zipper"></i></div>' +
              '<div>' +
                '<div class="as-create-card-title">导入整包 (.zip / .html)</div>' +
                '<div class="as-create-card-desc">支持导入完整应用 .zip 压缩包或单文件 .html</div>' +
              '</div>' +
            '</div>' +
            '<div class="as-dropzone" id="as-pkg-dropzone">' +
              '<div class="as-dropzone-icon"><i class="fa fa-cloud-arrow-up"></i></div>' +
              '<div class="as-dropzone-text">点击选择或拖拽应用包文件至此</div>' +
              '<div class="as-dropzone-sub">支持 .zip 完整工程包、.html 单文件应用</div>' +
              '<input type="file" id="as-pkg-file-input" accept=".zip,.html,text/html,application/zip" style="display:none">' +
            '</div>' +
          '</div>' +

          // 模块 2: 单文件逐项上传与在线配置
          '<div class="as-create-card">' +
            '<div class="as-create-card-header">' +
              '<div class="as-create-card-icon"><i class="fa fa-layer-group"></i></div>' +
              '<div>' +
                '<div class="as-create-card-title">单文件逐项上传与在线制作</div>' +
                '<div class="as-create-card-desc">分别上传/填写 HTML、CSS、JS 及应用元信息</div>' +
              '</div>' +
            '</div>' +
            '<div class="as-form-group">' +
              '<label class="as-form-label">应用唯一 ID (英文字母与连字符)</label>' +
              '<input class="as-form-input" id="as-form-id" placeholder="例如：my-awesome-tool" value="custom-app-' + Math.floor(Math.random()*1000) + '">' +
            '</div>' +
            '<div class="as-form-group">' +
              '<label class="as-form-label">应用名称</label>' +
              '<input class="as-form-input" id="as-form-name" placeholder="例如：心动便签">' +
            '</div>' +
            '<div style="display:flex;gap:10px;">' +
              '<div class="as-form-group" style="flex:1;">' +
                '<label class="as-form-label">分类</label>' +
                '<select class="as-form-select" id="as-form-category">' +
                  '<option value="工具">工具</option>' +
                  '<option value="游戏">游戏</option>' +
                  '<option value="伴侣">伴侣</option>' +
                  '<option value="创作">创作</option>' +
                  '<option value="效率">效率</option>' +
                '</select>' +
              '</div>' +
              '<div class="as-form-group" style="flex:1;">' +
                '<label class="as-form-label">版本号</label>' +
                '<input class="as-form-input" id="as-form-version" value="1.0.0">' +
              '</div>' +
            '</div>' +
            '<div class="as-form-group">' +
              '<label class="as-form-label">图标 FontAwesome 类名或单字符</label>' +
              '<input class="as-form-input" id="as-form-icon" value="fa-solid fa-gamepad">' +
            '</div>' +
            '<div class="as-form-group">' +
              '<label class="as-form-label">主代码 (HTML / 可内嵌 CSS 与 JS)</label>' +
              '<textarea class="as-form-textarea" id="as-form-html" placeholder="<!DOCTYPE html>..."><!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\\"utf-8\\">\n  <style>\n    body { font-family: -apple-system, sans-serif; padding: 20px; text-align: center; background: #fff; color: #111; }\n    h1 { font-size: 20px; color: #007aff; margin-bottom: 12px; }\n    button { padding: 10px 20px; background: #007aff; color: #fff; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; }\n  </style>\n</head>\n<body>\n  <h1>欢迎体验我的小应用</h1>\n  <p style=\\"color:#888;margin-bottom:20px;\\">已成功接入小手机 WanWanSDK！</p>\n  <button onclick=\\"WanWanSDK.showToast(\'你好，小手机！\')\\">测试调用 SDK Toast</button>\n</body>\n</html></textarea>' +
            '</div>' +
            '<button class="as-btn-primary" id="as-btn-build-install"><i class="fa fa-rocket"></i>构建并直接安装到小手机</button>' +
            '<button class="as-btn-secondary" id="as-btn-export-zip"><i class="fa fa-file-export"></i>导出为标准 .zip 应用包</button>' +
          '</div>' +

          // 模块 3: 制作说明 (详细制作规格与 SDK 使用指南)
          '<div class="as-create-card">' +
            '<div class="as-create-card-header">' +
              '<div class="as-create-card-icon"><i class="fa fa-book"></i></div>' +
              '<div>' +
                '<div class="as-create-card-title">应用制作说明 & SDK 接口规范</div>' +
                '<div class="as-create-card-desc">详细规范指导，帮助开发者快速适配小手机</div>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:13px;line-height:1.6;color:var(--c-text);">' +
              '<p><strong>1. 标准应用包目录结构 (.zip)：</strong></p>' +
              '<div class="as-code-block">' +
                'my-app.zip<br>' +
                '├── manifest.json   (必选，应用清单配置)<br>' +
                '├── index.html      (必选，主页面入口)<br>' +
                '├── js/wanwan-sdk.js (SDK脚本，系统自动注入)<br>' +
                '├── css/style.css   (可选，自定义样式)<br>' +
                '└── assets/         (可选，图片、音频资源)' +
              '</div>' +

              '<p style="margin-top:12px;"><strong>2. manifest.json 格式定义：</strong></p>' +
              '<div class="as-code-block">' +
                '{\n' +
                '  "id": "my-tool",\n' +
                '  "name": "我的工具",\n' +
                '  "version": "1.0.0",\n' +
                '  "author": "小手机极客",\n' +
                '  "category": "工具",\n' +
                '  "icon": "fa-solid fa-star",\n' +
                '  "sdkVersion": "1.2.0"\n' +
                '}' +
              '</div>' +

              '<p style="margin-top:12px;"><strong>3. 小手机 SDK (WanWanSDK) 核心 API：</strong></p>' +
              '<div class="as-code-block">' +
                '// 1. 弹出小手机顶部通知 Toast\n' +
                'WanWanSDK.showToast("保存成功！", "success");\n\n' +
                '// 2. 本地持久化隔离存储\n' +
                'WanWanSDK.storage.set("score", 100);\n' +
                'var score = WanWanSDK.storage.get("score", 0);\n\n' +
                '// 3. 获取当前伴侣角色信息\n' +
                'var char = WanWanSDK.getCurrentCharacter();\n' +
                'console.log(char.name, char.avatar);\n\n' +
                '// 4. 触感震动与音效\n' +
                'WanWanSDK.vibrate(40);\n\n' +
                '// 5. 关闭当前应用返回桌面\n' +
                'WanWanSDK.closeApp();' +
              '</div>' +

              '<p style="margin-top:12px;"><strong>4. 视口适配规范：</strong></p>' +
              '<p style="font-size:12px;color:var(--c-sub);">小手机采用紧凑视口，推荐宽度自适应（360px ~ 414px），页面顶部与底部留出安全区适配。</p>' +
            '</div>' +
          '</div>' +

          // 模块 4: 根据小手机当前SDK生成应用包文件
          '<div class="as-create-card">' +
            '<div class="as-create-card-header">' +
              '<div class="as-create-card-icon"><i class="fa fa-gears"></i></div>' +
              '<div>' +
                '<div class="as-create-card-title">根据当前小手机 SDK 生成应用包</div>' +
                '<div class="as-create-card-desc">自动注入最新 WanWanSDK 1.2.0 与响应式完整工程代码</div>' +
              '</div>' +
            '</div>' +
            '<div class="as-form-group">' +
              '<label class="as-form-label">选择生成模版</label>' +
              '<select class="as-form-select" id="as-gen-tpl">' +
                '<option value="standard">🌟 标准交互应用模版 (Standard Template)</option>' +
                '<option value="game">🎮 2D 趣味小游戏模版 (Canvas Mini Game)</option>' +
                '<option value="companion">💌 伴侣互动挂件模版 (Companion Widget)</option>' +
                '<option value="utility">🛠️ 效率便签速记模版 (Productivity Utility)</option>' +
              '</select>' +
            '</div>' +
            '<div class="as-form-group">' +
              '<label class="as-form-label">自定义工程名称</label>' +
              '<input class="as-form-input" id="as-gen-name" value="我的小手机应用">' +
            '</div>' +
            '<button class="as-btn-primary" id="as-btn-download-sdk-pkg"><i class="fa fa-download"></i>生成并下载应用包 (.zip)</button>' +
            '<button class="as-btn-secondary" id="as-btn-test-sdk-pkg"><i class="fa fa-play"></i>直接生成并安装到小手机体验</button>' +
          '</div>' +

        '</div>';

      bindCreateTabEvents(container);
    }

    function bindCreateTabEvents(container) {
      // 模块 1 拖拽与点击选择
      var dropzone = container.querySelector('#as-pkg-dropzone');
      var fileInput = container.querySelector('#as-pkg-file-input');

      dropzone.addEventListener('click', function() { fileInput.click(); });
      dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragover'); });
      dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          handlePackageFileImport(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files.length) {
          handlePackageFileImport(fileInput.files[0]);
        }
      });

      // 模块 2 构建并直接安装
      container.querySelector('#as-btn-build-install').addEventListener('click', async function() {
        var id = container.querySelector('#as-form-id').value.trim() || ('app-' + Date.now());
        var name = container.querySelector('#as-form-name').value.trim() || '未命名应用';
        var cat = container.querySelector('#as-form-category').value;
        var ver = container.querySelector('#as-form-version').value.trim() || '1.0.0';
        var iconFa = container.querySelector('#as-form-icon').value.trim() || 'fa-solid fa-cube';
        var html = container.querySelector('#as-form-html').value;

        var newApp = {
          id: id,
          name: name,
          subtitle: '由用户在线创作',
          developer: '本地创作者',
          category: cat,
          rating: 5.0,
          reviews: '1',
          size: '18 KB',
          version: ver,
          sdkVersion: '1.2.0',
          iconFa: iconFa,
          iconBg: 'linear-gradient(135deg, #007aff 0%, #00c6ff 100%)',
          description: '由小手机应用市场创作中心构建生成。',
          html: html
        };

        installedApps = installedApps.filter(function(a) { return a.id !== id; });
        installedApps.unshift(newApp);
        await saveInstalledApps(installedApps);
        if (window.showToast) window.showToast('应用「' + name + '」已成功安装！');
        currentTab = 'installed';
        renderTabContent();
      });

      // 模块 2 导出为 zip
      container.querySelector('#as-btn-export-zip').addEventListener('click', async function() {
        var name = container.querySelector('#as-form-name').value.trim() || 'my-app';
        var id = container.querySelector('#as-form-id').value.trim() || 'my-app';
        var ver = container.querySelector('#as-form-version').value.trim() || '1.0.0';
        var html = container.querySelector('#as-form-html').value;

        await exportAppAsZip({
          id: id,
          name: name,
          version: ver,
          html: html
        });
      });

      // 模块 4 下载根据当前SDK生成的包
      container.querySelector('#as-btn-download-sdk-pkg').addEventListener('click', async function() {
        var tpl = container.querySelector('#as-gen-tpl').value;
        var name = container.querySelector('#as-gen-name').value.trim() || '我的小手机应用';
        await generateAndDownloadSdkPackage(tpl, name, false);
      });

      // 模块 4 一键安装体验
      container.querySelector('#as-btn-test-sdk-pkg').addEventListener('click', async function() {
        var tpl = container.querySelector('#as-gen-tpl').value;
        var name = container.querySelector('#as-gen-name').value.trim() || '我的小手机应用';
        await generateAndDownloadSdkPackage(tpl, name, true);
      });
    }

    // ===== 处理导入整包文件 (.zip 或 .html) =====
    async function handlePackageFileImport(file) {
      if (!file) return;
      var fileName = file.name.toLowerCase();

      if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
        // 单文件 HTML 导入
        var reader = new FileReader();
        reader.onload = async function(e) {
          var content = e.target.result;
          var titleMatch = content.match(/<title>([^<]*)<\/title>/i);
          var appName = (titleMatch && titleMatch[1].trim()) || file.name.replace(/\.[^/.]+$/, "");
          var id = 'app-import-' + Date.now();

          var importedApp = {
            id: id,
            name: appName,
            subtitle: '单文件导入应用',
            developer: '外部导入',
            category: '工具',
            rating: 5.0,
            reviews: '1',
            size: (file.size / 1024).toFixed(1) + ' KB',
            version: '1.0.0',
            sdkVersion: '1.2.0',
            iconFa: 'fa-solid fa-code',
            iconBg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            description: '通过小手机应用市场导入的 HTML 单文件完整应用。',
            html: content
          };

          installedApps.unshift(importedApp);
          await saveInstalledApps(installedApps);
          if (window.showToast) window.showToast('成功导入应用「' + appName + '」！');
          currentTab = 'installed';
          renderTabContent();
        };
        reader.readAsText(file);
      } else if (fileName.endsWith('.zip')) {
        // 压缩包导入
        if (!window.JSZip) {
          alert('正在加载 JSZip 解包引擎，请稍候重试...');
          return;
        }
        var zip = new JSZip();
        try {
          var loadedZip = await zip.loadAsync(file);
          var manifestFile = loadedZip.file('manifest.json') || loadedZip.file('app.json');
          var manifest = {};
          if (manifestFile) {
            var manifestText = await manifestFile.async('text');
            try { manifest = JSON.parse(manifestText); } catch (_) {}
          }

          var indexHtmlFile = loadedZip.file('index.html') || loadedZip.file('entry.html');
          if (!indexHtmlFile) {
            alert('压缩包中未找到 index.html 入口文件！');
            return;
          }
          var htmlContent = await indexHtmlFile.async('text');

          var appName = manifest.name || file.name.replace(/\.zip$/i, '');
          var appId = manifest.id || ('zip-app-' + Date.now());

          var newApp = {
            id: appId,
            name: appName,
            subtitle: manifest.description || '整包导入应用',
            developer: manifest.author || '外部导入',
            category: manifest.category || '应用',
            rating: 5.0,
            reviews: '1',
            size: (file.size / 1024).toFixed(1) + ' KB',
            version: manifest.version || '1.0.0',
            sdkVersion: manifest.sdkVersion || '1.2.0',
            iconFa: manifest.icon || 'fa-solid fa-file-zipper',
            iconBg: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            description: manifest.description || '由 .zip 整包解压构建的应用。',
            html: htmlContent
          };

          installedApps.unshift(newApp);
          await saveInstalledApps(installedApps);
          if (window.showToast) window.showToast('应用「' + appName + '」整包导入成功！');
          currentTab = 'installed';
          renderTabContent();
        } catch (err) {
          console.error(err);
          alert('解析 ZIP 失败: ' + err.message);
        }
      } else {
        alert('不支持的文件格式，请导入 .zip 或 .html 文件！');
      }
    }

    // ===== 导出应用包为 .zip =====
    async function exportAppAsZip(app) {
      if (!window.JSZip) {
        alert('JSZip 正在加载中...');
        return;
      }
      var zip = new JSZip();

      var manifest = {
        id: app.id,
        name: app.name,
        version: app.version || '1.0.0',
        author: 'WanWan Developer',
        category: app.category || '工具',
        description: app.description || '小手机应用',
        icon: app.iconFa || 'fa-solid fa-cube',
        sdkVersion: '1.2.0',
        entry: 'index.html'
      };

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file('index.html', app.html || '<!DOCTYPE html><html><body><h1>' + app.name + '</h1></body></html>');

      // 放入 sdk
      var sdkCode = (window.WanWanSDK && window.WanWanSDK.toString()) ? '' : '';
      zip.folder('js').file('wanwan-sdk.js', '/* WanWan Phone SDK v1.2.0 */\nwindow.WanWanSDK = window.parent.WanWanSDK || {};');

      var blob = await zip.generateAsync({ type: 'blob' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (app.id || 'wanwan-app') + '-v' + (app.version || '1.0.0') + '.zip';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { a.remove(); URL.revokeObjectURL(url); }, 1000);
      if (window.showToast) window.showToast('应用包已生成并开始下载！');
    }

    // ===== 根据当前 SDK 模板生成应用包文件 =====
    async function generateAndDownloadSdkPackage(templateType, customName, autoInstall) {
      if (!window.JSZip) {
        alert('JSZip 正在初始化，请稍后重试');
        return;
      }
      var zip = new JSZip();

      var tplData = getTemplateCode(templateType, customName);

      var manifest = {
        id: tplData.id,
        name: customName,
        version: '1.0.0',
        author: '小手机开发者',
        category: tplData.category,
        description: tplData.description,
        icon: tplData.icon,
        sdkVersion: '1.2.0',
        entry: 'index.html'
      };

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file('index.html', tplData.html);
      zip.file('css/style.css', tplData.css);
      zip.file('js/app.js', tplData.js);

      // 官方 SDK 注入
      var officialSdkCode = `/**
 * wanwan-sdk.js — 小手机官方 SDK v1.2.0
 */
(function(global) {
  var WanWanSDK = {
    version: '1.2.0',
    getUserInfo: function() { return (window.parent && window.parent.WanWanSDK) ? window.parent.WanWanSDK.getUserInfo() : { name: '我' }; },
    getCurrentCharacter: function() { return (window.parent && window.parent.WanWanSDK) ? window.parent.WanWanSDK.getCurrentCharacter() : { name: '沈星回' }; },
    showToast: function(msg, type) { if (window.parent && window.parent.WanWanSDK) window.parent.WanWanSDK.showToast(msg, type); else alert(msg); },
    closeApp: function() { if (window.parent && window.parent.WanWanSDK) window.parent.WanWanSDK.closeApp(); },
    storage: {
      get: function(k, d) { try { var v = localStorage.getItem('app_' + k); return v ? JSON.parse(v) : d; } catch(e) { return d; } },
      set: function(k, v) { try { localStorage.setItem('app_' + k, JSON.stringify(v)); } catch(e) {} }
    },
    vibrate: function(p) { if (navigator.vibrate) navigator.vibrate(p || 40); }
  };
  global.WanWanSDK = WanWanSDK;
})(window);`;

      zip.file('js/wanwan-sdk.js', officialSdkCode);

      if (autoInstall) {
        var generatedApp = {
          id: tplData.id,
          name: customName,
          subtitle: tplData.description,
          developer: 'SDK 模板生成',
          category: tplData.category,
          rating: 5.0,
          reviews: '1',
          size: '30 KB',
          version: '1.0.0',
          sdkVersion: '1.2.0',
          iconFa: tplData.icon,
          iconBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          description: tplData.description,
          html: tplData.html.replace('<link rel="stylesheet" href="css/style.css">', '<style>' + tplData.css + '</style>').replace('<script src="js/app.js"></script>', '<script>' + tplData.js + '</script>')
        };
        installedApps.unshift(generatedApp);
        await saveInstalledApps(installedApps);
        if (window.showToast) window.showToast('模版已成功生成并安装到小手机！');
        currentTab = 'installed';
        renderTabContent();
      } else {
        var blob = await zip.generateAsync({ type: 'blob' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (tplData.id || 'wanwan-sdk-app') + '-package.zip';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { a.remove(); URL.revokeObjectURL(url); }, 1000);
        if (window.showToast) window.showToast('应用工程包已下载！可在本地编辑后再次整包导入');
      }
    }

    function getTemplateCode(type, name) {
      if (type === 'game') {
        return {
          id: 'game-' + Date.now(),
          category: '游戏',
          icon: 'fa-solid fa-gamepad',
          description: '基于小手机 SDK 构建的 2D 画布躲避小游戏',
          html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <title>${name}</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="js/wanwan-sdk.js"></script>
</head>
<body>
  <div class="game-header">
    <h3>${name}</h3>
    <div id="score">得分: 0</div>
  </div>
  <canvas id="gameCanvas" width="320" height="360"></canvas>
  <div class="controls">
    <button id="leftBtn">◀ 左移</button>
    <button id="rightBtn">右移 ▶</button>
  </div>
  <script src="js/app.js"></script>
</body>
</html>`,
          css: `body { background: #1c1c1e; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100vh; margin: 0; padding: 16px; user-select: none; }
.game-header { width: 320px; display: flex; justify-content: space-between; align-items: center; }
canvas { background: #2c2c2e; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
.controls { width: 320px; display: flex; gap: 12px; }
button { flex: 1; padding: 14px; background: #007aff; color: #fff; border: none; border-radius: 14px; font-size: 15px; font-weight: 700; cursor: pointer; }
button:active { background: #0056b3; }`,
          js: `var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');
var playerX = 145, playerY = 320, score = 0, enemies = [];
var leftBtn = document.getElementById('leftBtn'), rightBtn = document.getElementById('rightBtn');

function spawnEnemy() {
  enemies.push({ x: Math.random() * 290, y: 0, speed: 2 + Math.random() * 2 });
}
setInterval(spawnEnemy, 1200);

function update() {
  ctx.clearRect(0, 0, 320, 360);
  ctx.fillStyle = '#007aff';
  ctx.fillRect(playerX, playerY, 30, 30);

  ctx.fillStyle = '#ff453a';
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    e.y += e.speed;
    ctx.fillRect(e.x, e.y, 20, 20);

    if (e.y > 360) {
      enemies.splice(i, 1);
      score += 10;
      document.getElementById('score').innerText = '得分: ' + score;
      i--;
    } else if (Math.abs(e.x - playerX) < 25 && Math.abs(e.y - playerY) < 25) {
      WanWanSDK.showToast('游戏结束！本次得分: ' + score, 'info');
      WanWanSDK.vibrate([100, 50, 100]);
      score = 0;
      enemies = [];
      break;
    }
  }
  requestAnimationFrame(update);
}
leftBtn.onclick = function() { playerX = Math.max(0, playerX - 30); WanWanSDK.vibrate(20); };
rightBtn.onclick = function() { playerX = Math.min(290, playerX + 30); WanWanSDK.vibrate(20); };
update();`
        };
      } else if (type === 'companion') {
        return {
          id: 'companion-' + Date.now(),
          category: '伴侣',
          icon: 'fa-solid fa-heart',
          description: '与当前伴侣角色深度互动的陪伴心愿小挂件',
          html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <title>${name}</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="js/wanwan-sdk.js"></script>
</head>
<body>
  <div class="card">
    <div class="avatar-wrap">
      <img id="charAvatar" src="" alt="">
    </div>
    <h2 id="charName">伴侣</h2>
    <p id="charSign" class="sign">“今天也在想你。”</p>
    <div class="interaction-bar">
      <button id="hugBtn">拥抱 TA</button>
      <button id="wishBtn">许个心愿</button>
    </div>
  </div>
  <script src="js/app.js"></script>
</body>
</html>`,
          css: `body { background: #ffeef2; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; }
.card { background: #fff; width: 100%; max-width: 320px; border-radius: 24px; padding: 24px; text-align: center; box-shadow: 0 10px 30px rgba(255, 71, 126, 0.15); }
.avatar-wrap { width: 90px; height: 90px; border-radius: 50%; border: 3px solid #ff477e; margin: 0 auto 12px; overflow: hidden; }
.avatar-wrap img { width: 100%; height: 100%; object-fit: cover; }
h2 { font-size: 18px; color: #333; margin-bottom: 6px; }
.sign { font-size: 13px; color: #ff477e; line-height: 1.5; margin-bottom: 20px; }
.interaction-bar { display: flex; gap: 10px; }
button { flex: 1; padding: 12px; border: none; border-radius: 14px; background: #ff477e; color: #fff; font-weight: 700; cursor: pointer; }
button:active { transform: scale(0.96); }`,
          js: `var char = WanWanSDK.getCurrentCharacter();
document.getElementById('charName').innerText = char.name;
document.getElementById('charAvatar').src = char.avatar || 'img/char-default.jpg';
document.getElementById('hugBtn').onclick = function() {
  WanWanSDK.showToast('你给 ' + char.name + ' 了一个温暖的拥抱~', 'success');
  WanWanSDK.vibrate([40, 40]);
};
document.getElementById('wishBtn').onclick = function() {
  WanWanSDK.showToast('心愿已悄悄传达到 TA 的心底 ✨');
};`
        };
      } else {
        // 标准/工具模版
        return {
          id: 'std-' + Date.now(),
          category: '工具',
          icon: 'fa-solid fa-cube',
          description: '小手机标准多功能响应式模板',
          html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <title>${name}</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="js/wanwan-sdk.js"></script>
</head>
<body>
  <div class="header">
    <h2>${name}</h2>
    <span class="badge">SDK 1.2.0</span>
  </div>
  <div class="content">
    <p>这是一个运行在小手机中的独立应用，支持调用小手机全部原生 API。</p>
    <div class="action-card">
      <button id="toastBtn">触发小手机 Toast</button>
      <button id="vibBtn">触感震动反馈</button>
      <button id="closeBtn">返回小手机桌面</button>
    </div>
  </div>
  <script src="js/app.js"></script>
</body>
</html>`,
          css: `body { background: #f2f2f7; font-family: -apple-system, sans-serif; margin: 0; padding: 16px; color: #1c1c1e; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.header h2 { font-size: 18px; margin: 0; }
.badge { background: #007aff; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 10px; font-weight: 700; }
.content { background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.content p { font-size: 13px; color: #666; line-height: 1.5; margin-bottom: 16px; }
.action-card { display: flex; flex-direction: column; gap: 10px; }
button { width: 100%; padding: 12px; background: #007aff; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; }
button:active { opacity: 0.8; }`,
          js: `document.getElementById('toastBtn').onclick = function() {
  WanWanSDK.showToast('来自 ' + document.title + ' 的问候！', 'success');
};
document.getElementById('vibBtn').onclick = function() {
  WanWanSDK.vibrate(60);
  WanWanSDK.showToast('已触发触感反馈');
};
document.getElementById('closeBtn').onclick = function() {
  WanWanSDK.closeApp();
};`
        };
      }
    }

    // ===== 详情弹窗 (Apple App Store Detail View) =====
    function showAppDetailModal(app) {
      var modal = document.createElement('div');
      modal.className = 'as-detail-modal';

      var isInstalled = installedApps.some(function(item) { return item.id === app.id; });

      modal.innerHTML =
        '<div class="as-detail-header">' +
          '<button class="as-back-btn" id="as-detail-close">' +
            '<i class="fa fa-angle-left" style="font-size:22px;"></i>' +
            '<span>返回</span>' +
          '</button>' +
          '<div style="font-weight:700;font-size:16px;">应用详情</div>' +
          '<div style="width:40px;"></div>' +
        '</div>' +
        '<div class="as-detail-body">' +
          '<div class="as-detail-top-row">' +
            '<div class="as-detail-icon" style="background:' + (app.iconBg || 'var(--c-accent-dark)') + ';color:#fff;">' +
              '<i class="' + (app.iconFa || 'fa-solid fa-cube') + '"></i>' +
            '</div>' +
            '<div class="as-detail-meta">' +
              '<h2>' + app.name + '</h2>' +
              '<p>' + app.subtitle + '</p>' +
              '<div style="display:flex;gap:8px;">' +
                '<button class="as-btn-action ' + (isInstalled ? 'is-open' : '') + '" id="as-detail-action-btn">' +
                  (isInstalled ? '打开' : '获取') +
                '</button>' +
                '<button class="as-btn-action" id="as-detail-export-btn" style="background:var(--c-surface-2);color:var(--c-text);border:1px solid var(--c-border-m);">' +
                  '<i class="fa fa-download"></i>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="as-specs-strip">' +
            '<div class="as-spec-item">' +
              '<div class="as-spec-label">评分</div>' +
              '<div class="as-spec-val">★ ' + (app.rating || '5.0') + '</div>' +
            '</div>' +
            '<div class="as-spec-item">' +
              '<div class="as-spec-label">年龄</div>' +
              '<div class="as-spec-val">' + (app.age || '4+') + '</div>' +
            '</div>' +
            '<div class="as-spec-item">' +
              '<div class="as-spec-label">分类</div>' +
              '<div class="as-spec-val">' + (app.category || '工具') + '</div>' +
            '</div>' +
            '<div class="as-spec-item">' +
              '<div class="as-spec-label">开发语言</div>' +
              '<div class="as-spec-val">HTML5</div>' +
            '</div>' +
            '<div class="as-spec-item">' +
              '<div class="as-spec-label">SDK 版本</div>' +
              '<div class="as-spec-val">' + (app.sdkVersion || '1.2.0') + '</div>' +
            '</div>' +
          '</div>' +

          '<div style="margin-bottom:16px;">' +
            '<div style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--c-text);">应用介绍</div>' +
            '<div style="font-size:13px;line-height:1.6;color:var(--c-text);white-space:pre-line;">' +
              app.description +
            '</div>' +
          '</div>' +

          '<div>' +
            '<div style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--c-text);">信息与权限</div>' +
            '<div style="background:var(--c-surface-2);border-radius:12px;border:1px solid var(--c-border);padding:12px;font-size:12px;line-height:1.8;color:var(--c-sub);">' +
              '<div>开发者: <strong>' + (app.developer || '本地创作者') + '</strong></div>' +
              '<div>包体体积: <strong>' + (app.size || '32 KB') + '</strong></div>' +
              '<div>设备兼容: <strong>WanWan Phone OS 1.0+</strong></div>' +
              '<div>权限范围: <strong>沙盒本地存储、触感反馈、通知Toast</strong></div>' +
            '</div>' +
          '</div>' +

        '</div>';

      page.appendChild(modal);

      modal.querySelector('#as-detail-close').addEventListener('click', function() {
        modal.remove();
      });

      modal.querySelector('#as-detail-action-btn').addEventListener('click', async function() {
        if (isInstalled) {
          window.runCustomApp(app.id);
        } else {
          installedApps.push(app);
          await saveInstalledApps(installedApps);
          if (window.showToast) window.showToast('应用安装成功！');
          modal.remove();
          renderTabContent();
        }
      });

      modal.querySelector('#as-detail-export-btn').addEventListener('click', async function() {
        await exportAppAsZip(app);
      });
    }
  };

  // ===== 沙盒运行器 (Full-Screen Custom App Runner) =====
  window.runCustomApp = async function(appId) {
    var installed = await loadInstalledApps();
    var app = installed.find(function(a) { return a.id === appId; });
    if (!app) {
      if (window.showToast) window.showToast('未找到该应用');
      return;
    }

    var existing = document.getElementById(RUNNER_PAGE_ID);
    if (existing) existing.remove();

    var runner = document.createElement('div');
    runner.id = RUNNER_PAGE_ID;
    runner.className = 'full-page is-opening';

    runner.innerHTML =
      '<div class="as-runner-nav">' +
        '<button class="as-back-btn" id="as-runner-back">' +
          '<i class="fa fa-angle-left" style="font-size:22px;"></i>' +
          '<span>返回</span>' +
        '</button>' +
        '<span style="font-weight:700;font-size:15px;color:var(--c-text);">' + app.name + '</span>' +
        '<button style="background:none;border:none;color:var(--c-text);font-size:16px;cursor:pointer;padding:6px;" id="as-runner-menu">' +
          '<i class="fa fa-ellipsis"></i>' +
        '</button>' +
      '</div>' +
      '<iframe class="as-runner-iframe" id="as-runner-frame" sandbox="allow-scripts allow-forms allow-modals allow-same-origin"></iframe>';

    window.openPage(runner);

    var iframe = runner.querySelector('#as-runner-frame');

    // 绑定返回
    runner.querySelector('#as-runner-back').addEventListener('click', function() {
      window.closePage(RUNNER_PAGE_ID);
    });

    runner.querySelector('#as-runner-menu').addEventListener('click', function() {
      if (confirm('是否刷新当前应用？')) {
        injectAndRun(iframe, app);
      }
    });

    injectAndRun(iframe, app);
  };

  function injectAndRun(iframe, app) {
    var rawHtml = app.html || '<!DOCTYPE html><html><body><h1>应用内容为空</h1></body></html>';

    // 检查是否已包含 SDK
    var sdkScript = '<script src="' + new URL('js/wanwan-sdk.js', document.baseURI).href + '"><\/script>';
    if (!rawHtml.includes('wanwan-sdk.js')) {
      if (rawHtml.includes('</head>')) {
        rawHtml = rawHtml.replace('</head>', sdkScript + '</head>');
      } else {
        rawHtml = sdkScript + rawHtml;
      }
    }

    // 设置沙盒应用元数据
    var appInfoScript =
      '<script>' +
      'window.__WANWAN_APP_INFO__ = ' + JSON.stringify({ id: app.id, name: app.name }) + ';' +
      '<\/script>';

    rawHtml = appInfoScript + rawHtml;

    iframe.srcdoc = rawHtml;
  }

  // ===== 宿主监听沙盒发来的消息 =====
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || data.source !== 'WANWAN_APP_SDK') return;

    var action = data.action;
    var payload = data.payload || {};

    if (action === 'toast') {
      if (window.showToast) window.showToast(payload.message, payload.type);
    } else if (action === 'close_app') {
      window.closePage(RUNNER_PAGE_ID);
    } else if (action === 'open_app') {
      window.closePage(RUNNER_PAGE_ID);
      var targetId = payload.appId;
      if (targetId === 'wechat' && window.showWechatPage) showWechatPage();
      else if (targetId === 'music' && window.showMusicPage) showMusicPage();
      else if (targetId === 'loveDiary' && window.showLoveDiaryPage) showLoveDiaryPage();
      else window.runCustomApp(targetId);
    } else if (action === 'vibrate') {
      if (navigator.vibrate) {
        try { navigator.vibrate(payload.pattern || 40); } catch (_) {}
      }
    } else if (action === 'send_wechat_message') {
      if (window.db && payload.content) {
        db.characters.toArray().then(function(chars) {
          var partner = chars.find(function(c) { return c && c.type !== 'user'; });
          if (partner) {
            db.chats.where('charId').equals(partner.id).first().then(function(chat) {
              if (chat) {
                db.messages.add({
                  chatId: chat.id,
                  role: payload.role || 'user',
                  sender: payload.role || 'user',
                  senderId: payload.role === 'user' ? 'user' : partner.id,
                  content: payload.content,
                  type: 'text',
                  createdAt: Date.now()
                });
              }
            });
          }
        });
      }
    }
  });

  // 确保初始桌面图标同步
  setTimeout(async function() {
    var apps = await loadInstalledApps();
    window._customDesktopApps = apps.map(function(app) {
      return {
        id: app.id,
        label: app.name,
        fa: app.iconFa || 'fa-solid fa-cube',
        action: function() { window.runCustomApp(app.id); }
      };
    });
  }, 500);

})(window);
