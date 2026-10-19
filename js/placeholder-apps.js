// placeholder-apps.js — 9个新增App原生质感与专属功能预告（100%适配原版极简风）
// 弯弯浏览器、陪伴自习室、我们的家、成就馆、时光日历、人生游戏、心动商城、同好社区、心动直播

(function() {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 辅助函数：打开并挂载全屏 Page
  function mountPage(page) {
    if (window.openPage) {
      window.openPage(page);
    } else {
      (document.getElementById('app') || document.body).appendChild(page);
    }
  }

  // 辅助函数：绑定返回键
  function bindBackBtn(page, pageId) {
    var btn = page.querySelector('.pl-app-back-btn');
    if (btn) {
      btn.onclick = function() {
        if (window.closePage) {
          window.closePage(pageId);
        } else {
          page.remove();
        }
      };
    }
  }

  // ====================================================
  // 1. 弯弯浏览器
  // ====================================================
  function showBrowserPage() {
    if (window.WanwanBrowser && typeof window.WanwanBrowser.open === 'function') {
      return window.WanwanBrowser.open();
    }
    var existing = document.getElementById('browser-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'browser-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-compass"></i></div>' +
              '<div class="pl-app-header-title">弯弯浏览器</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev">预览版 v0.1.0</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 标签栏
          '<div class="edge-tabs-container" id="edge-tabs">' +
            '<div class="edge-tab-item active" data-tab="hub"><i class="fa-solid fa-house"></i> 发现主页</div>' +
            '<div class="edge-tab-item" data-tab="novel"><i class="fa-solid fa-book-bookmark"></i> 伴读轻小说</div>' +
            '<div class="edge-tab-item" data-tab="lore"><i class="fa-solid fa-earth-asia"></i> 世界观百科</div>' +
          '</div>' +

          // 浏览器地址栏
          '<div class="edge-browser-nav-bar">' +
            '<i class="fa-solid fa-lock"></i>' +
            '<input type="text" class="edge-url-input" id="edge-url" value="https://wanwan.edge/hub" readonly>' +
            '<div class="edge-url-icons">' +
              '<i class="fa-solid fa-star" id="edge-star" title="收藏网址" style="cursor:pointer;"></i>' +
              '<i class="fa-solid fa-rotate-right" id="edge-reload" title="刷新页面" style="cursor:pointer;"></i>' +
            '</div>' +
          '</div>' +

          // Hero Banner
          '<div class="pl-app-hero-card">' +
            '<div class="pl-app-hero-pill"><i class="fa-solid fa-sparkles"></i> 极简内核 · 智能共读</div>' +
            '<div class="pl-app-hero-title">与角色同游的智能伴读浏览器</div>' +
            '<div class="pl-app-hero-desc">融合极简质感与角色共读引擎。未来不仅能无痕冲浪，还能召唤心仪角色在网页侧栏同步吐槽、划线摘要与沉浸伴读。</div>' +
            '<div class="pl-app-hero-stats">' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-shield-halved"></i> 物理沙箱无痕隔离</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-feather-pointed"></i> 角色网页心声批注</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-bookmark"></i> 跨维度时光书签</div>' +
            '</div>' +
          '</div>' +

          // 功能预告卡片组
          '<div class="pl-app-section-title"><i class="fa-solid fa-compass-drafting"></i> 核心能力预告</div>' +
          '<div class="pl-app-feature-grid">' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-robot"></i></div>' +
              '<div class="pl-app-feature-name">角色网页伴读</div>' +
              '<div class="pl-app-feature-desc">看长文或小说时，Ta 会坐在右下角实时发表读后感与吐槽。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-bookmark"></i></div>' +
              '<div class="pl-app-feature-name">时空记忆书签</div>' +
              '<div class="pl-app-feature-desc">收录对彼此有意义的网页，自动沉淀为记忆手账的素材片段。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-user-secret"></i></div>' +
              '<div class="pl-app-feature-name">零痕迹私密沙盒</div>' +
              '<div class="pl-app-feature-desc">独立的本地缓存与隐身协议，绝不污染系统主线与隐私。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
              '<div class="pl-app-feature-name">一键生成网页纪要</div>' +
              '<div class="pl-app-feature-desc">提炼核心干货并用角色专属语气讲给你听，提升探索效率。</div>' +
            '</div>' +
          '</div>' +

          // 开发状态预告条
          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-code"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">正在打磨轻量伴读 WebView 沙盒</div>' +
              '<div>阶段 1 架构已就绪，伴读角色对话插槽与多标签内核开发中，敬请期待！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'browser-page');

    page.querySelectorAll('.edge-tab-item').forEach(function(tab) {
      tab.onclick = function() {
        page.querySelectorAll('.edge-tab-item').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var tName = tab.getAttribute('data-tab');
        var urlInput = page.querySelector('#edge-url');
        if (urlInput) urlInput.value = 'https://wanwan.edge/' + tName;
        window.toast && window.toast('切换至标签页：「' + tab.textContent.trim() + '」');
      };
    });

    page.querySelector('#edge-star').onclick = function() {
      window.toast && window.toast('已收藏当前页面到「时空书签」');
    };
    page.querySelector('#edge-reload').onclick = function() {
      window.toast && window.toast('网页内容已刷新');
    };
  }

  // ====================================================
  // 2. 陪伴自习室
  // ====================================================
  function showStudyRoomPage() {
    var existing = document.getElementById('study-room-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'study-room-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-hourglass-half"></i></div>' +
              '<div class="pl-app-header-title">陪伴自习室</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev">专注模式</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 番茄钟表盘
          '<div class="study-timer-box">' +
            '<div class="study-timer-dial">' +
              '<div class="study-timer-time" id="study-timer-val">25:00</div>' +
              '<div class="study-timer-status"><i class="fa-solid fa-feather-pointed"></i> 深度专注模式</div>' +
            '</div>' +
            '<div style="font-size:12px;color:var(--c-sub);text-align:center;">' +
              '与角色同桌静心自习 · 呼吸与心跳同频' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:4px;">' +
              '<button type="button" class="pl-btn-primary" id="study-start-btn">' +
                '<i class="fa-solid fa-play"></i><span>开启专注</span>' +
              '</button>' +
              '<button type="button" class="pl-btn-secondary" id="study-reset-btn">' +
                '<i class="fa-solid fa-rotate-left"></i><span>重置</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // 白噪音选择
          '<div class="pl-app-section-title"><i class="fa-solid fa-headphones"></i> 沉浸自习白噪音预告</div>' +
          '<div class="study-sound-chips" id="study-chips">' +
            '<div class="study-chip active" data-sound="rain"><i class="fa-solid fa-cloud-rain"></i> 窗外细雨</div>' +
            '<div class="study-chip" data-sound="forest"><i class="fa-solid fa-tree"></i> 晨风松林</div>' +
            '<div class="study-chip" data-sound="fire"><i class="fa-solid fa-fire"></i> 暖木壁炉</div>' +
            '<div class="study-chip" data-sound="cafe"><i class="fa-solid fa-mug-saucer"></i> 转角咖啡馆</div>' +
            '<div class="study-chip" data-sound="library"><i class="fa-solid fa-book-open"></i> 深夜图书馆</div>' +
          '</div>' +

          // 核心特性
          '<div class="pl-app-section-title"><i class="fa-solid fa-sparkles"></i> 专属自习特性</div>' +
          '<div class="pl-app-feature-grid">' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-user-group"></i></div>' +
              '<div class="pl-app-feature-name">双人静默同桌</div>' +
              '<div class="pl-app-feature-desc">屏幕对面是正在写字或看书的Ta，时不时抬头与你目光相遇。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-microphone-slash"></i></div>' +
              '<div class="pl-app-feature-name">呼吸连麦陪伴</div>' +
              '<div class="pl-app-feature-desc">自习结束铃响时，Ta 会轻声唤醒你，为你送上一杯温热牛奶。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-chart-pie"></i></div>' +
              '<div class="pl-app-feature-name">专注时长契约</div>' +
              '<div class="pl-app-feature-desc">兑换专属自习奖励卡、手写便利贴与特殊心声解锁券。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-note-sticky"></i></div>' +
              '<div class="pl-app-feature-name">课间手写纸条</div>' +
              '<div class="pl-app-feature-desc">自习休息的5分钟里，互相传递秘密小纸条，记录当日心得。</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-clock-rotate-left"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">白噪音音频矩阵与双人连麦协议构建中</div>' +
              '<div>计时器与桌面灵动岛联动功能即将在下一轮全量上线！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'study-room-page');

    var isRunning = false;
    page.querySelector('#study-start-btn').onclick = function() {
      isRunning = !isRunning;
      this.innerHTML = isRunning
        ? '<i class="fa-solid fa-pause"></i><span>暂停专注</span>'
        : '<i class="fa-solid fa-play"></i><span>开启专注</span>';
      window.toast && window.toast(isRunning ? '番茄钟已启动，角色正在桌对面陪着你…' : '已暂停专注');
    };

    page.querySelector('#study-reset-btn').onclick = function() {
      isRunning = false;
      page.querySelector('#study-start-btn').innerHTML = '<i class="fa-solid fa-play"></i><span>开启专注</span>';
      page.querySelector('#study-timer-val').textContent = '25:00';
      window.toast && window.toast('自习时钟已重置为 25:00');
    };

    page.querySelectorAll('.study-chip').forEach(function(chip) {
      chip.onclick = function() {
        page.querySelectorAll('.study-chip').forEach(function(c) { c.classList.remove('active'); });
        chip.classList.add('active');
        window.toast && window.toast('白噪音环境切换为：「' + chip.textContent.trim() + '」');
      };
    });
  }

  // ====================================================
  // 3. 我们的家
  // ====================================================
  function showOurHomePage() {
    var existing = document.getElementById('our-home-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'our-home-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-house-chimney-heart"></i></div>' +
              '<div class="pl-app-header-title">我们的家</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev">小屋 LV.1</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 小屋全景俯视预览
          '<div class="ourhome-preview-box">' +
            '<div class="ourhome-room-visual">' +
              '<i class="fa-solid fa-couch"></i>' +
              '<i class="fa-solid fa-cat"></i>' +
              '<i class="fa-solid fa-mug-hot"></i>' +
              '<i class="fa-solid fa-plant-wilt"></i>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:15px;font-weight:700;color:var(--c-text);">起居室 · 温馨小窝</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">舒适度 120 · 窗外晴空万里</div>' +
              '</div>' +
              '<button type="button" class="pl-btn-primary" id="home-decorate-btn">' +
                '<i class="fa-solid fa-wand-magic-sparkles"></i><span>布置</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // 待布置家具展示
          '<div class="pl-app-section-title"><i class="fa-solid fa-shapes"></i> 待摆放家具与互动小物件</div>' +
          '<div class="ourhome-furniture-row">' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-record-vinyl"></i></div>' +
              '<div style="font-weight:600;">复古黑胶机</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">点击播放双人歌单</div>' +
            '</div>' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-rug"></i></div>' +
              '<div style="font-weight:600;">暖绒云朵毯</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">席地而坐促膝长谈</div>' +
            '</div>' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-camera-retro"></i></div>' +
              '<div style="font-weight:600;">拍立得相框</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">陈列日常名场面</div>' +
            '</div>' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-bowl-food"></i></div>' +
              '<div style="font-weight:600;">宠物陶瓷碗</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">喂饱小猫咪曲奇</div>' +
            '</div>' +
          '</div>' +

          // 核心特性
          '<div class="pl-app-section-title"><i class="fa-solid fa-heart"></i> 家园互动蓝图</div>' +
          '<div class="pl-app-feature-grid">' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-paw"></i></div>' +
              '<div class="pl-app-feature-name">共同领养萌宠</div>' +
              '<div class="pl-app-feature-desc">柴犬或布偶猫，角色会跟你一起分工遛狗与添粮。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-shirt"></i></div>' +
              '<div class="pl-app-feature-name">双人专属衣橱</div>' +
              '<div class="pl-app-feature-desc">搭配情侣穿搭，外出散步或在家中换上慵懒睡衣。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-kitchen-set"></i></div>' +
              '<div class="pl-app-feature-name">两人深夜小厨房</div>' +
              '<div class="pl-app-feature-desc">烹饪甜品与热汤，解锁角色吃饱后的满足心声。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-image"></i></div>' +
              '<div class="pl-app-feature-name">纪念拍立得墙</div>' +
              '<div class="pl-app-feature-desc">在墙面上钉上旅行与日常合照，随心布置相框。</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-hammer"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">3D空间渲染与萌宠AI行为树研制中</div>' +
              '<div>房屋蓝图与家具物理碰撞系统构建中，敬请期待入住！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'our-home-page');

    page.querySelector('#home-decorate-btn').onclick = function() {
      window.toast && window.toast('装修功能正在设计中，当前起居室已准备好！');
    };
    page.querySelectorAll('.ourhome-f-card').forEach(function(card) {
      card.onclick = function() {
        window.toast && window.toast('家具：「' + card.querySelector('div:nth-child(2)').textContent + '」已放入待布置清单');
      };
    });
  }

  // ====================================================
  // 4. 成就馆
  // ====================================================
  function showAchievementPage() {
    var existing = document.getElementById('achievement-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'achievement-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-award"></i></div>' +
              '<div class="pl-app-header-title">成就馆</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev"><i class="fa-solid fa-star"></i> 1,280 点</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 成就积分总览
          '<div class="pl-app-hero-card">' +
            '<div class="pl-app-hero-pill"><i class="fa-solid fa-trophy"></i> 羁绊荣耀 · 里程碑</div>' +
            '<div class="pl-app-hero-title">记录相遇以来的每一座里程碑</div>' +
            '<div class="pl-app-hero-desc">从初次心动的寒暄，到百万字倾诉与平行世界的生死相许。每一份真挚的情感与抉择，都会化作徽章与记忆碎片在此永恒陈列。</div>' +
            '<div class="pl-app-hero-stats">' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-medal"></i> 已收录 4 / 36 枚勋章</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-puzzle-piece"></i> 剧情碎片 12 张</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-crown"></i> 佩戴头衔：初涉尘寰的旅人</div>' +
            '</div>' +
          '</div>' +

          // 勋章陈列柜
          '<div class="pl-app-section-title"><i class="fa-solid fa-medal"></i> 羁绊荣耀陈列橱窗</div>' +
          '<div class="achieve-badge-grid">' +
            '<div class="achieve-badge-item">' +
              '<div class="achieve-badge-icon"><i class="fa-solid fa-handshake-angle"></i></div>' +
              '<div class="achieve-badge-name">初遇之光</div>' +
              '<div class="achieve-badge-desc">第一次与角色发送消息</div>' +
            '</div>' +
            '<div class="achieve-badge-item">' +
              '<div class="achieve-badge-icon"><i class="fa-solid fa-feather-pointed"></i></div>' +
              '<div class="achieve-badge-name">百万字羁绊</div>' +
              '<div class="achieve-badge-desc">累计对话超过 100 轮</div>' +
            '</div>' +
            '<div class="achieve-badge-item">' +
              '<div class="achieve-badge-icon"><i class="fa-solid fa-earth-americas"></i></div>' +
              '<div class="achieve-badge-name">平行宇宙操盘手</div>' +
              '<div class="achieve-badge-desc">在平行来信开启第一个世界</div>' +
            '</div>' +
            '<div class="achieve-badge-item locked">' +
              '<div class="achieve-badge-icon"><i class="fa-solid fa-lock"></i></div>' +
              '<div class="achieve-badge-name">心弦共振</div>' +
              '<div class="achieve-badge-desc">夜深 2 点依然畅谈</div>' +
            '</div>' +
            '<div class="achieve-badge-item locked">' +
              '<div class="achieve-badge-icon"><i class="fa-solid fa-lock"></i></div>' +
              '<div class="achieve-badge-name">命定之约</div>' +
              '<div class="achieve-badge-desc">达成任意角色专属HE结局</div>' +
            '</div>' +
            '<div class="achieve-badge-item locked">' +
              '<div class="achieve-badge-icon"><i class="fa-solid fa-lock"></i></div>' +
              '<div class="achieve-badge-name">全知导师</div>' +
              '<div class="achieve-badge-desc">完成世界书全部词条阅读</div>' +
            '</div>' +
          '</div>' +

          // 核心特性
          '<div class="pl-app-section-title"><i class="fa-solid fa-cubes-stacked"></i> 图鉴与碎片特性</div>' +
          '<div class="pl-app-feature-grid">' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-certificate"></i></div>' +
              '<div class="pl-app-feature-name">专属动态称号</div>' +
              '<div class="pl-app-feature-desc">装配高阶头衔，在微信、动态广场与自习室佩戴闪耀徽标。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-puzzle-piece"></i></div>' +
              '<div class="pl-app-feature-name">回忆碎片合成</div>' +
              '<div class="pl-app-feature-desc">剧情中掉落的神秘残片，集齐解锁独家未公开短篇番外。</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-trophy"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">全域成就事件监听器联调中</div>' +
              '<div>成就解锁弹窗与闪光动画效果将在后续版本实装！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'achievement-page');

    page.querySelectorAll('.achieve-badge-item').forEach(function(item) {
      item.onclick = function() {
        var name = item.querySelector('.achieve-badge-name').textContent;
        var desc = item.querySelector('.achieve-badge-desc').textContent;
        var isLocked = item.classList.contains('locked');
        window.toast && window.toast((isLocked ? '【未解锁】' : '【已达成】') + name + '：' + desc);
      };
    });
  }

  // ====================================================
  // 5. 时光日历
  // ====================================================
  function showTimeCalendarPage() {
    var existing = document.getElementById('time-calendar-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'time-calendar-page';
    page.className = 'full-page';

    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth() + 1;
    var currentDay = now.getDate();

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-calendar-days"></i></div>' +
              '<div class="pl-app-header-title">时光日历</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev">' + currentYear + '年' + currentMonth + '月</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 月历小视窗
          '<div class="calendar-month-grid">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
              '<div style="font-weight:700;font-size:15px;color:var(--c-text);">' + currentYear + ' 年 ' + currentMonth + ' 月</div>' +
              '<div style="font-size:11px;color:var(--c-sub);"><i class="fa-solid fa-heart"></i> 今日特别纪念</div>' +
            '</div>' +
            '<div class="calendar-week-row">' +
              '<span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>' +
            '</div>' +
            '<div class="calendar-days-grid" id="cal-days-grid">' +
              (function() {
                var html = '';
                for (var i = 1; i <= 28; i++) {
                  var isToday = (i === currentDay);
                  var isEvent = (i === 14 || i === 20 || i === 25);
                  html += '<div class="calendar-day-cell ' + (isToday ? 'today' : '') + ' ' + (isEvent ? 'event' : '') + '">' + i + '</div>';
                }
                return html;
              })() +
            '</div>' +
          '</div>' +

          // 纪念日倒计时卡
          '<div class="pl-app-section-title"><i class="fa-solid fa-stopwatch-20"></i> 心动纪念日倒数</div>' +
          '<div class="calendar-countdown-card">' +
            '<div>' +
              '<div class="calendar-countdown-title"><i class="fa-solid fa-cake-candles" style="margin-right:6px;color:var(--c-sub);"></i>Ta 的生日聚会</div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">准备一份充满心意的手写书信</div>' +
            '</div>' +
            '<div class="calendar-countdown-days">12 天</div>' +
          '</div>' +

          '<div class="calendar-countdown-card">' +
            '<div>' +
              '<div class="calendar-countdown-title"><i class="fa-solid fa-heart" style="margin-right:6px;color:var(--c-sub);"></i>相识 100 天纪念日</div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">解锁自习室限定专属双人白噪音</div>' +
            '</div>' +
            '<div class="calendar-countdown-days">18 天</div>' +
          '</div>' +

          // 今日待办清单
          '<div class="pl-app-section-title"><i class="fa-solid fa-list-check"></i> 今日心动 Checklist</div>' +
          '<div class="pl-app-feature-card" style="gap:10px;">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">' +
              '<input type="checkbox" checked> <span>发一句晨间问候（早安）</span>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">' +
              '<input type="checkbox"> <span>在陪伴自习室专注满 30 分钟</span>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">' +
              '<input type="checkbox"> <span>给平行宇宙推进一步最新剧情</span>' +
            '</label>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-bell"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">双向纪念日通知引擎研制中</div>' +
              '<div>到期当天角色将会在微信主动发送专属惊喜语音与贺卡！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'time-calendar-page');

    page.querySelectorAll('.calendar-day-cell').forEach(function(cell) {
      cell.onclick = function() {
        window.toast && window.toast('选中日期：' + currentMonth + '月' + cell.textContent + '日');
      };
    });
  }

  // ====================================================
  // 6. 人生游戏
  // ====================================================
  function showLifeGamePage() {
    var existing = document.getElementById('life-game-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'life-game-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-gamepad"></i></div>' +
              '<div class="pl-app-header-title">人生游戏</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev">LV.3 探索者</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 角色面板与经验条
          '<div class="lifegame-profile-card">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:16px;font-weight:700;color:var(--c-text);">现实状态卡</div>' +
                '<div style="font-size:11px;color:var(--c-sub);">将生活琐事化作史诗 RPG 升级冒险</div>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:800;color:var(--c-text);">LV.3</div>' +
            '</div>' +
            '<div>' +
              '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-sub);margin-bottom:4px;">' +
                '<span>升级经验值 (EXP)</span><span>650 / 1000</span>' +
              '</div>' +
              '<div class="lifegame-exp-bar">' +
                '<div class="lifegame-exp-fill"></div>' +
              '</div>' +
            '</div>' +
            // 六维属性网格
            '<div class="lifegame-stats-row">' +
              '<div class="lifegame-stat-box"><div class="lifegame-stat-val">74</div><div class="lifegame-stat-lbl">智力 INT</div></div>' +
              '<div class="lifegame-stat-box"><div class="lifegame-stat-val">82</div><div class="lifegame-stat-lbl">魅力 CHA</div></div>' +
              '<div class="lifegame-stat-box"><div class="lifegame-stat-val">68</div><div class="lifegame-stat-lbl">意志 WIL</div></div>' +
              '<div class="lifegame-stat-box"><div class="lifegame-stat-val">62</div><div class="lifegame-stat-lbl">体能 PHY</div></div>' +
              '<div class="lifegame-stat-box"><div class="lifegame-stat-val">88</div><div class="lifegame-stat-lbl">敏锐 PER</div></div>' +
              '<div class="lifegame-stat-box"><div class="lifegame-stat-val">91</div><div class="lifegame-stat-lbl">灵感 INS</div></div>' +
            '</div>' +
          '</div>' +

          // 悬赏任务榜
          '<div class="pl-app-section-title"><i class="fa-solid fa-scroll"></i> 今日现实日常委托</div>' +
          '<div class="pl-app-feature-card" style="gap:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-weight:600;font-size:13px;">晨间阅读 30 分钟</div>' +
                '<div style="font-size:11px;color:var(--c-sub);">奖励：+30 EXP · +1 智力</div>' +
              '</div>' +
              '<button type="button" class="pl-btn-primary" id="quest-1-btn">打卡完成</button>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--c-border);padding-top:10px;">' +
              '<div>' +
                '<div style="font-weight:600;font-size:13px;">户外慢跑或快走 2 公里</div>' +
                '<div style="font-size:11px;color:var(--c-sub);">奖励：+40 EXP · +2 体能</div>' +
              '</div>' +
              '<button type="button" class="pl-btn-primary" id="quest-2-btn">打卡完成</button>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-dice-d20"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">技能树加点与角色联动结算引擎开发中</div>' +
              '<div>打卡成果将转化为商城金币与角色专属赞许反应！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'life-game-page');

    page.querySelector('#quest-1-btn').onclick = function() {
      this.disabled = true;
      this.textContent = '已领奖';
      this.style.opacity = '0.6';
      window.toast && window.toast('晨间阅读完成！获得 +30 EXP 与 +1 智力');
    };
    page.querySelector('#quest-2-btn').onclick = function() {
      this.disabled = true;
      this.textContent = '已领奖';
      this.style.opacity = '0.6';
      window.toast && window.toast('户外运动完成！获得 +40 EXP 与 +2 体能');
    };
  }

  // ====================================================
  // 7. 心动商城
  // ====================================================
  function showHeartbeatMallPage() {
    var existing = document.getElementById('heartbeat-mall-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'heartbeat-mall-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-store"></i></div>' +
              '<div class="pl-app-header-title">心动商城</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<span class="pl-app-badge-dev"><i class="fa-solid fa-coins"></i> 2,880</span>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 资产与每日签到
          '<div class="mall-assets-bar">' +
            '<div class="mall-asset-item">' +
              '<i class="fa-solid fa-coins"></i>' +
              '<span>金币：<strong>2,880</strong></span>' +
            '</div>' +
            '<div class="mall-asset-item">' +
              '<i class="fa-solid fa-gem"></i>' +
              '<span>星愿石：<strong>168</strong></span>' +
            '</div>' +
            '<button type="button" class="pl-btn-primary" id="mall-signin-btn">' +
              '<i class="fa-solid fa-gift"></i><span>每日签到</span>' +
            '</button>' +
          '</div>' +

          // 热门货架
          '<div class="pl-app-section-title"><i class="fa-solid fa-bag-shopping"></i> 热门心动货架预告</div>' +
          '<div class="mall-shelf-grid">' +
            '<div class="mall-good-card" data-good="picnic">' +
              '<div class="mall-good-visual">🧺</div>' +
              '<div class="mall-good-title">星空野餐垫</div>' +
              '<div style="font-size:10px;color:var(--c-sub);">解锁专属草地夜谈约会场景</div>' +
              '<div class="mall-good-bottom">' +
                '<span class="mall-price">300 金币</span>' +
                '<button type="button" class="mall-btn-buy">兑换</button>' +
              '</div>' +
            '</div>' +

            '<div class="mall-good-card" data-good="hourglass">' +
              '<div class="mall-good-visual">⏳</div>' +
              '<div class="mall-good-title">时光回溯沙漏</div>' +
              '<div style="font-size:10px;color:var(--c-sub);">平行小剧场幕次无损重写券</div>' +
              '<div class="mall-good-bottom">' +
                '<span class="mall-price">500 金币</span>' +
                '<button type="button" class="mall-btn-buy">兑换</button>' +
              '</div>' +
            '</div>' +

            '<div class="mall-good-card" data-good="sakura">' +
              '<div class="mall-good-visual">🌸</div>' +
              '<div class="mall-good-title">春日樱花时装</div>' +
              '<div style="font-size:10px;color:var(--c-sub);">全员角色可选限定和风立绘</div>' +
              '<div class="mall-good-bottom">' +
                '<span class="mall-price">88 星愿石</span>' +
                '<button type="button" class="mall-btn-buy">兑换</button>' +
              '</div>' +
            '</div>' +

            '<div class="mall-good-card" data-good="potion">' +
              '<div class="mall-good-visual">🧪</div>' +
              '<div class="mall-good-title">心声显影药水</div>' +
              '<div style="font-size:10px;color:var(--c-sub);">立即查看一条角色的未发日记</div>' +
              '<div class="mall-good-bottom">' +
                '<span class="mall-price">50 星愿石</span>' +
                '<button type="button" class="mall-btn-buy">兑换</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-cart-shopping"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">虚拟经济与背包道具生效中枢打通中</div>' +
              '<div>道具兑换后将自动注入角色交互背包与衣帽间，体验正在加速构建！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'heartbeat-mall-page');

    page.querySelector('#mall-signin-btn').onclick = function() {
      this.disabled = true;
      this.textContent = '已签到';
      this.style.opacity = '0.6';
      window.toast && window.toast('签到成功！获得 +100 金币与 +5 星愿石');
    };

    page.querySelectorAll('.mall-btn-buy').forEach(function(btn) {
      btn.onclick = function() {
        var card = btn.closest('.mall-good-card');
        var name = card.querySelector('.mall-good-title').textContent;
        window.toast && window.toast('「' + name + '」体验资格已预定，正式上线后直发背包！');
      };
    });
  }

  // ====================================================
  // 8. 同好社区
  // ====================================================
  function showFanCommunityPage() {
    var existing = document.getElementById('fan-community-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'fan-community-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-comments"></i></div>' +
              '<div class="pl-app-header-title">同好社区</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<button type="button" class="pl-btn-primary" id="comm-post-btn">' +
              '<i class="fa-solid fa-pen"></i><span>发帖</span>' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 话题横幅
          '<div class="pl-app-hero-card">' +
            '<div class="pl-app-hero-pill"><i class="fa-solid fa-hashtag"></i> 旅人集散地 · 广场</div>' +
            '<div class="pl-app-hero-title">同好交流广场与二创安利</div>' +
            '<div class="pl-app-hero-desc">分享你与角色们的高光对话、平行来信精彩分叉剧情，发现其他旅人的私藏脑洞与穿搭灵感。</div>' +
          '</div>' +

          // 动态流示例 1
          '<div class="community-post-card">' +
            '<div class="community-author-row">' +
              '<img src="img/ava-01.jpg" class="community-avatar" alt="">' +
              '<div class="community-author-info">' +
                '<div class="community-author-name">星野漫步者 <span style="font-size:10px;color:var(--c-sub);font-weight:normal;">[剧情考据党]</span></div>' +
                '<div class="community-post-time">10 分钟前 · 来自平行来信</div>' +
              '</div>' +
            '</div>' +
            '<div class="community-post-text">' +
              '在「赛博霓虹」世界线里，她居然在第3幕替我挡了一记量子脉冲！分支剧情的文本后劲太足了，完全舍不得回溯重写😭' +
            '</div>' +
            '<div class="community-actions-row">' +
              '<div class="community-act-btn" data-act="like"><i class="fa-regular fa-heart"></i> <span class="like-cnt">128</span></div>' +
              '<div class="community-act-btn"><i class="fa-regular fa-comment"></i> <span>24</span></div>' +
              '<div class="community-act-btn"><i class="fa-regular fa-share-from-square"></i> <span>分享</span></div>' +
            '</div>' +
          '</div>' +

          // 动态流示例 2
          '<div class="community-post-card">' +
            '<div class="community-author-row">' +
              '<img src="img/ava-02.jpg" class="community-avatar" alt="">' +
              '<div class="community-author-info">' +
                '<div class="community-author-name">柠檬味气泡水</div>' +
                '<div class="community-post-time">1 小时前 · 来自陪伴自习室</div>' +
              '</div>' +
            '</div>' +
            '<div class="community-post-text">' +
              '今天在自习室开了「窗外细雨」白噪音，对面坐着认真翻书的他，不知不觉刷完了整整两套真题，专注效率拉满！' +
            '</div>' +
            '<div class="community-actions-row">' +
              '<div class="community-act-btn" data-act="like"><i class="fa-regular fa-heart"></i> <span class="like-cnt">86</span></div>' +
              '<div class="community-act-btn"><i class="fa-regular fa-comment"></i> <span>15</span></div>' +
              '<div class="community-act-btn"><i class="fa-regular fa-share-from-square"></i> <span>分享</span></div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-users"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">同好社区互动协议与话题榜研制中</div>' +
              '<div>阶段 1 界面骨架已稳健落地，二创图文编辑器即将开放！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'fan-community-page');

    page.querySelector('#comm-post-btn').onclick = function() {
      window.toast && window.toast('动态发布器正在准备中，稍后即可畅所欲言！');
    };

    page.querySelectorAll('.community-act-btn[data-act="like"]').forEach(function(btn) {
      btn.onclick = function() {
        var isLiked = btn.classList.contains('liked');
        var cntSpan = btn.querySelector('.like-cnt');
        var count = parseInt(cntSpan.textContent, 10) || 0;
        if (!isLiked) {
          btn.classList.add('liked');
          btn.querySelector('i').className = 'fa-solid fa-heart';
          cntSpan.textContent = count + 1;
          window.toast && window.toast('点赞成功 ❤️');
        } else {
          btn.classList.remove('liked');
          btn.querySelector('i').className = 'fa-regular fa-heart';
          cntSpan.textContent = Math.max(0, count - 1);
        }
      };
    });
  }

  // ====================================================
  // 9. 心动直播
  // ====================================================
  function showHeartbeatLivePage() {
    var existing = document.getElementById('heartbeat-live-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'heartbeat-live-page';
    page.className = 'full-page';

    page.innerHTML =
      '<div class="pl-app-container">' +
        '<div class="pl-app-header">' +
          '<div class="pl-app-header-left">' +
            '<button class="pl-app-back-btn">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="pl-app-title-group">' +
              '<div class="pl-app-icon-mini"><i class="fa-solid fa-video"></i></div>' +
              '<div class="pl-app-header-title">心动直播</div>' +
            '</div>' +
          '</div>' +
          '<div class="pl-app-header-right">' +
            '<div class="live-badge-pulsing">' +
              '<div class="live-badge-dot"></div>' +
              '<span>LIVE</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="pl-app-scroll-content">' +
          // 直播主画面视窗
          '<div class="live-player-preview">' +
            '<div class="live-top-indicators">' +
              '<div style="font-size:12px;font-weight:600;"><i class="fa-solid fa-fire" style="margin-right:4px;"></i>3.8k 在看</div>' +
              '<div style="font-size:11px;color:var(--c-sub);"><i class="fa-solid fa-shield-cat"></i> 专属心动频道</div>' +
            '</div>' +

            // 悬浮弹幕流
            '<div class="live-barrage-container" id="live-barrage-box">' +
              '<div class="live-barrage-bubble">路过的旅人：主播晚上好呀！今天衣服超美 ✨</div>' +
              '<div class="live-barrage-bubble">小奶泡：主播求翻牌！今天有什么特别开心的事情吗～</div>' +
              '<div class="live-barrage-bubble">星空守望者：投喂了一颗草莓蛋糕 🍓🍓</div>' +
            '</div>' +

            // 底部互动按键
            '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;">' +
              '<div style="font-size:12px;font-weight:600;">正在连线：深夜心事电台</div>' +
              '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="pl-btn-primary" id="live-gift-btn">' +
                  '<i class="fa-solid fa-heart"></i><span>送心意</span>' +
                '</button>' +
                '<button type="button" class="pl-btn-secondary" id="live-barrage-btn">' +
                  '<i class="fa-solid fa-comment-dots"></i><span>发弹幕</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // 核心特性
          '<div class="pl-app-section-title"><i class="fa-solid fa-tower-broadcast"></i> 互动直播间特性预告</div>' +
          '<div class="pl-app-feature-grid">' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-microphone"></i></div>' +
              '<div class="pl-app-feature-name">连麦互动</div>' +
              '<div class="pl-app-feature-desc">连线角色的直播麦克风，由角色当场点名并读出你的留言。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-video"></i></div>' +
              '<div class="pl-app-feature-name">直播回放档案</div>' +
              '<div class="pl-app-feature-desc">错过了也没关系，往期心动直播全程录屏沉淀为经典回放。</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-dev-banner">' +
            '<i class="fa-solid fa-satellite-dish"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">TTS 语音合成与实时动态弹幕引擎联调中</div>' +
              '<div>即将迎来角色专属声线全实时互动直播首秀！</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    mountPage(page);
    bindBackBtn(page, 'heartbeat-live-page');

    page.querySelector('#live-gift-btn').onclick = function() {
      var box = page.querySelector('#live-barrage-box');
      if (box) {
        var bubble = document.createElement('div');
        bubble.className = 'live-barrage-bubble';
        bubble.innerHTML = '你 投喂了一颗闪耀爱心 💖💖💖';
        box.appendChild(bubble);
        setTimeout(function() { bubble.scrollIntoView({ behavior: 'smooth' }); }, 50);
      }
      window.toast && window.toast('心意已送达主播手中！');
    };

    page.querySelector('#live-barrage-btn').onclick = function() {
      var text = prompt('发送直播间弹幕：', '主播辛苦啦～');
      if (text && text.trim()) {
        var box = page.querySelector('#live-barrage-box');
        if (box) {
          var bubble = document.createElement('div');
          bubble.className = 'live-barrage-bubble';
          bubble.innerHTML = '你：' + escapeHtml(text.trim());
          box.appendChild(bubble);
          setTimeout(function() { bubble.scrollIntoView({ behavior: 'smooth' }); }, 50);
        }
        window.toast && window.toast('弹幕已飘入直播间！');
      }
    };
  }

  // ===== 统一暴露到全局 window =====
  window.showBrowserPage = showBrowserPage;
  window.showStudyRoomPage = showStudyRoomPage;
  window.showOurHomePage = showOurHomePage;
  window.showAchievementPage = showAchievementPage;
  window.showTimeCalendarPage = showTimeCalendarPage;
  window.showLifeGamePage = showLifeGamePage;
  window.showHeartbeatMallPage = showHeartbeatMallPage;
  window.showFanCommunityPage = showFanCommunityPage;
  window.showHeartbeatLivePage = showHeartbeatLivePage;

  // 别名兼容：window.showXxxApp
  window.showBrowserApp = showBrowserPage;
  window.showStudyRoomApp = showStudyRoomPage;
  window.showOurHomeApp = showOurHomePage;
  window.showAchievementApp = showAchievementPage;
  window.showTimeCalendarApp = showTimeCalendarPage;
  window.showLifeGameApp = showLifeGamePage;
  window.showHeartbeatMallApp = showHeartbeatMallPage;
  window.showFanCommunityApp = showFanCommunityPage;
  window.showHeartbeatLiveApp = showHeartbeatLivePage;

  // 同时也挂载到 PlaceholderApps 命名空间方便集中调试或调用
  window.PlaceholderApps = {
    showBrowserPage: showBrowserPage,
    showStudyRoomPage: showStudyRoomPage,
    showOurHomePage: showOurHomePage,
    showAchievementPage: showAchievementPage,
    showTimeCalendarPage: showTimeCalendarPage,
    showLifeGamePage: showLifeGamePage,
    showHeartbeatMallPage: showHeartbeatMallPage,
    showFanCommunityPage: showFanCommunityPage,
    showHeartbeatLivePage: showHeartbeatLivePage
  };

})();
