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
    if (window.WanwanStudyRoom && typeof window.WanwanStudyRoom.open === 'function') {
      return window.WanwanStudyRoom.open();
    }
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
  // 3. 我们的家 & 弯弯农场 (联动共享经济服务与农场数据)
  // ====================================================
  async function showOurHomePage() {
    var existing = document.getElementById('our-home-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'our-home-page';
    page.className = 'full-page';

    var currentSubTab = 'room'; // 'room' | 'farm' | 'backpack'

    // 读取家具与农场状态
    var ecoState = window.SharedEconomyService ? await window.SharedEconomyService.getState() : { coins: 500, inventory: [] };
    var farmState = window.WanwanFarmService ? await window.WanwanFarmService.getState() : { plots: [] };
    var placedFurniture = JSON.parse(localStorage.getItem('wanwan_placed_furniture') || '["item_vinyl", "item_rug"]');

    function renderContent() {
      var html =
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
              '<span class="pl-app-badge-dev" id="home-comfort-badge"><i class="fa-solid fa-couch"></i> 舒适度 ' + (100 + placedFurniture.length * 25) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-scroll-content">' +
            // 二级导航：起居室 / 弯弯农场 / 共享背包
            '<div class="shared-tab-nav">' +
              '<button type="button" class="shared-tab-btn ' + (currentSubTab === 'room' ? 'active' : '') + '" data-tab="room"><i class="fa-solid fa-couch"></i> 起居室</button>' +
              '<button type="button" class="shared-tab-btn ' + (currentSubTab === 'farm' ? 'active' : '') + '" data-tab="farm"><i class="fa-solid fa-wheat-awn"></i> 弯弯农场</button>' +
              '<button type="button" class="shared-tab-btn ' + (currentSubTab === 'backpack' ? 'active' : '') + '" data-tab="backpack"><i class="fa-solid fa-box-open"></i> 共享背包</button>' +
            '</div>';

      if (currentSubTab === 'room') {
        html +=
          // 起居室视觉卡
          '<div class="ourhome-preview-box">' +
            '<div class="ourhome-room-visual" id="room-visual-icons">' +
              (placedFurniture.indexOf('item_vinyl') !== -1 ? '<i class="fa-solid fa-record-vinyl" title="复古黑胶机"></i>' : '') +
              (placedFurniture.indexOf('item_rug') !== -1 ? '<i class="fa-solid fa-rug" title="暖绒云朵毯"></i>' : '') +
              (placedFurniture.indexOf('item_frame') !== -1 ? '<i class="fa-solid fa-camera-retro" title="拍立得相框"></i>' : '') +
              '<i class="fa-solid fa-couch" title="主沙发"></i>' +
              '<i class="fa-solid fa-mug-hot" title="热可可"></i>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<div style="font-size:15px;font-weight:700;color:var(--c-text);">起居室 · 温馨小窝</div>' +
                '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">舒适度 ' + (100 + placedFurniture.length * 25) + ' · 窗外微风拂拂</div>' +
              '</div>' +
              '<button type="button" class="pl-btn-primary" id="home-decorate-btn">' +
                '<i class="fa-solid fa-wand-magic-sparkles"></i><span>布置家具</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // 互动家具状态
          '<div class="pl-app-section-title"><i class="fa-solid fa-shapes"></i> 已装配家具与装饰</div>' +
          '<div class="ourhome-furniture-row">' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-record-vinyl"></i></div>' +
              '<div style="font-weight:600;">复古黑胶机</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">' + (placedFurniture.indexOf('item_vinyl') !== -1 ? '✨ 摆放中 (点击播放)' : '未摆放') + '</div>' +
            '</div>' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-rug"></i></div>' +
              '<div style="font-weight:600;">暖绒云朵毯</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">' + (placedFurniture.indexOf('item_rug') !== -1 ? '✨ 摆放中' : '未摆放') + '</div>' +
            '</div>' +
            '<div class="ourhome-f-card">' +
              '<div class="ourhome-f-card-icon"><i class="fa-solid fa-camera-retro"></i></div>' +
              '<div style="font-weight:600;">拍立得相框</div>' +
              '<div style="color:var(--c-sub);font-size:10px;">' + (placedFurniture.indexOf('item_frame') !== -1 ? '✨ 摆放中' : '未摆放') + '</div>' +
            '</div>' +
          '</div>' +

          // 核心特性
          '<div class="pl-app-section-title"><i class="fa-solid fa-heart"></i> 家园互动体验</div>' +
          '<div class="pl-app-feature-grid">' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-paw"></i></div>' +
              '<div class="pl-app-feature-name">陪伴萌宠</div>' +
              '<div class="pl-app-feature-desc">小猫在沙发边打呼噜，角色会和你分工添粮。</div>' +
            '</div>' +
            '<div class="pl-app-feature-card">' +
              '<div class="pl-app-feature-icon"><i class="fa-solid fa-kitchen-set"></i></div>' +
              '<div class="pl-app-feature-name">后院果实烹饪</div>' +
              '<div class="pl-app-feature-desc">将农场收获的甜心草莓制成草莓甜点与暖汤。</div>' +
            '</div>' +
          '</div>';

      } else if (currentSubTab === 'farm') {
        html +=
          // 弯弯农场全景展板
          '<div class="pl-app-hero-card">' +
            '<div class="pl-app-hero-pill"><i class="fa-solid fa-wheat-awn"></i> 弯弯农场 · 经营工坊</div>' +
            '<div class="pl-app-hero-title">后院田园劳作与自然收获</div>' +
            '<div class="pl-app-hero-desc">耕作土地、播撒心动种子、浇灌成长。收获的鲜美作物直接入库共享背包，还可完成人生游戏日常委托并解锁成就！</div>' +
            '<div class="pl-app-hero-stats">' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-seedling"></i> 土地 4 块</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-basket-shopping"></i> 累计收获 ' + (farmState.totalHarvests || 0) + ' 次</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-section-title"><i class="fa-solid fa-seedling"></i> 耕种土地一览</div>' +
          '<div class="shared-farm-grid">' +
            farmState.plots.map(function(plot, idx) {
              var isRipe = (plot.state === 'ripe');
              var isGrowing = (plot.state === 'growing');
              var isEmpty = (plot.state === 'empty');
              var cfg = (plot.cropId && window.WanwanFarmService) ? window.WanwanFarmService.CROPS_CONFIG[plot.cropId] : null;

              var icon = '🌱';
              var title = '空闲土地 #' + (idx + 1);
              var status = '等待播种';

              if (isRipe && cfg) {
                icon = cfg.icon;
                title = cfg.name;
                status = '🎉 丰收成熟！';
              } else if (isGrowing && cfg) {
                icon = '🌿';
                title = cfg.name;
                status = '成长中…';
              }

              return (
                '<div class="farm-plot-card ' + (isRipe ? 'ripe' : '') + '">' +
                  '<div class="farm-plot-visual">' + icon + '</div>' +
                  '<div class="farm-plot-badge">' + title + '</div>' +
                  '<div class="farm-plot-status">' + status + '</div>' +
                  (isRipe ?
                    '<button type="button" class="farm-plot-btn btn-harvest" data-plot="' + idx + '"><i class="fa-solid fa-hand-holding-heart"></i> 收获入包</button>' :
                    (isGrowing ?
                      '<button type="button" class="farm-plot-btn secondary btn-water" data-plot="' + idx + '"><i class="fa-solid fa-droplet"></i> 浇水加速</button>' :
                      '<button type="button" class="farm-plot-btn btn-plant" data-plot="' + idx + '"><i class="fa-solid fa-plus"></i> 播种</button>'
                    )
                  ) +
                '</div>'
              );
            }).join('') +
          '</div>' +

          '<div class="pl-app-dev-banner" style="margin-top:14px;">' +
            '<i class="fa-solid fa-store"></i>' +
            '<div class="pl-app-dev-banner-main">' +
              '<div class="pl-app-dev-banner-title">种子不足？前往心动商城</div>' +
              '<div>可使用自习室与人生游戏赚取的金币在心动商城选购草莓、向日葵等种子。</div>' +
            '</div>' +
          '</div>';

      } else {
        // 共享背包
        var items = (ecoState.inventory || []);
        html +=
          '<div class="pl-app-hero-card">' +
            '<div class="pl-app-hero-pill"><i class="fa-solid fa-box-open"></i> 共享经济服务 · 统一背包</div>' +
            '<div class="pl-app-hero-title">全域道具与资产统一管理</div>' +
            '<div class="pl-app-hero-desc">农场收获的作物、商城兑换的家具与自习文具，全部在此唯一存档，各 App 不重复记账。</div>' +
            '<div class="pl-app-hero-stats">' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-coins"></i> 金币 ' + (ecoState.coins || 0) + '</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-gem"></i> 星愿石 ' + (ecoState.diamonds || 0) + '</div>' +
              '<div class="pl-app-stat-item"><i class="fa-solid fa-cube"></i> 道具 ' + items.length + ' 种</div>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-section-title"><i class="fa-solid fa-boxes-stacked"></i> 背包物品清单</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            (items.length === 0 ?
              '<div style="text-align:center;padding:30px;color:var(--c-sub);font-size:12px;">背包空空如也，快去商城或农场看看吧~</div>' :
              items.map(function(item) {
                return (
                  '<div class="cal-event-card">' +
                    '<div style="width:36px;height:36px;border-radius:var(--r-md);background:var(--c-surface-2);display:flex;align-items:center;justify-content:center;font-size:18px;">' +
                      (item.icon.indexOf('fa-') !== -1 ? '<i class="' + item.icon + '"></i>' : item.icon) +
                    '</div>' +
                    '<div class="cal-event-main">' +
                      '<div class="cal-event-title">' + escapeHtml(item.name) + ' <span style="font-size:11px;color:var(--c-sub);">x' + item.count + '</span></div>' +
                      '<div class="cal-event-meta">' +
                        '<span class="cal-event-source-tag">' + (item.category === 'farm_crop' ? '农场产出' : (item.category === 'seed' ? '作物种子' : '家具装饰')) + '</span>' +
                        '<span>' + escapeHtml(item.desc || '') + '</span>' +
                      '</div>' +
                    '</div>' +
                  '</div>'
                );
              }).join('')
            ) +
          '</div>';
      }

      html += '</div></div>';
      page.innerHTML = html;

      // 重新绑定事件
      bindBackBtn(page, 'our-home-page');

      // 切换标签
      page.querySelectorAll('.shared-tab-btn').forEach(function(btn) {
        btn.onclick = function() {
          currentSubTab = btn.getAttribute('data-tab');
          renderContent();
        };
      });

      // 布置家具
      var decoBtn = page.querySelector('#home-decorate-btn');
      if (decoBtn) {
        decoBtn.onclick = function() {
          openDecorateModal();
        };
      }

      // 农场收获
      page.querySelectorAll('.btn-harvest').forEach(function(btn) {
        btn.onclick = async function() {
          var pIdx = parseInt(btn.getAttribute('data-plot'), 10);
          if (window.WanwanFarmService) {
            var res = await window.WanwanFarmService.harvest(pIdx);
            if (res.success) {
              window.toast && window.toast('🎉 丰收！收获了 ' + res.crop.name + '，已直接收入共享背包！');
              farmState = await window.WanwanFarmService.getState();
              ecoState = await window.SharedEconomyService.getState();
              renderContent();
            } else {
              window.toast && window.toast(res.msg);
            }
          }
        };
      });

      // 农场浇水
      page.querySelectorAll('.btn-water').forEach(function(btn) {
        btn.onclick = async function() {
          var pIdx = parseInt(btn.getAttribute('data-plot'), 10);
          if (farmState.plots[pIdx]) {
            farmState.plots[pIdx].state = 'ripe';
            if (window.WanwanFarmService) {
              await window.WanwanFarmService.getState(); // 触发自动更新与保存
            }
            window.toast && window.toast('💧 浇水成功！作物在微风与爱意中迅速成熟了~');
            renderContent();
          }
        };
      });

      // 农场播种
      page.querySelectorAll('.btn-plant').forEach(function(btn) {
        btn.onclick = async function() {
          var pIdx = parseInt(btn.getAttribute('data-plot'), 10);
          openPlantModal(pIdx);
        };
      });
    }

    function openDecorateModal() {
      var modal = document.createElement('div');
      modal.className = 'sr-modal-backdrop';
      modal.innerHTML =
        '<div class="sr-modal-card" style="max-width:340px;">' +
          '<div class="sr-modal-header">' +
            '<div class="sr-modal-title"><i class="fa-solid fa-wand-magic-sparkles"></i> 布置小屋起居室</div>' +
            '<button type="button" class="sr-modal-close" id="dec-close">&times;</button>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--c-sub);margin-bottom:10px;">点击家具切换摆放状态，提升温馨舒适度：</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;" id="dec-list">' +
            '<label style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--c-surface-2);border-radius:var(--r-md);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<i class="fa-solid fa-record-vinyl" style="font-size:16px;"></i>' +
                '<div><div style="font-size:12px;font-weight:600;">复古黑胶机</div><div style="font-size:10px;color:var(--c-sub);">舒适度 +25</div></div>' +
              '</div>' +
              '<input type="checkbox" value="item_vinyl" ' + (placedFurniture.indexOf('item_vinyl') !== -1 ? 'checked' : '') + '>' +
            '</label>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--c-surface-2);border-radius:var(--r-md);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<i class="fa-solid fa-rug" style="font-size:16px;"></i>' +
                '<div><div style="font-size:12px;font-weight:600;">暖绒云朵毯</div><div style="font-size:10px;color:var(--c-sub);">舒适度 +25</div></div>' +
              '</div>' +
              '<input type="checkbox" value="item_rug" ' + (placedFurniture.indexOf('item_rug') !== -1 ? 'checked' : '') + '>' +
            '</label>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--c-surface-2);border-radius:var(--r-md);cursor:pointer;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<i class="fa-solid fa-camera-retro" style="font-size:16px;"></i>' +
                '<div><div style="font-size:12px;font-weight:600;">拍立得相框</div><div style="font-size:10px;color:var(--c-sub);">舒适度 +25</div></div>' +
              '</div>' +
              '<input type="checkbox" value="item_frame" ' + (placedFurniture.indexOf('item_frame') !== -1 ? 'checked' : '') + '>' +
            '</label>' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' +
            '<button type="button" class="pl-btn-primary" id="dec-save" style="padding:4px 16px;">保存布置</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);
      modal.querySelector('#dec-close').onclick = function() { modal.remove(); };
      modal.querySelector('#dec-save').onclick = function() {
        var checked = [];
        modal.querySelectorAll('input[type="checkbox"]:checked').forEach(function(ck) {
          checked.push(ck.value);
        });
        placedFurniture = checked;
        localStorage.setItem('wanwan_placed_furniture', JSON.stringify(placedFurniture));
        window.toast && window.toast('✨ 起居室布置已更新！舒适度升至 ' + (100 + placedFurniture.length * 25));
        modal.remove();
        renderContent();
      };
    }

    function openPlantModal(plotIndex) {
      var modal = document.createElement('div');
      modal.className = 'sr-modal-backdrop';
      modal.innerHTML =
        '<div class="sr-modal-card" style="max-width:320px;">' +
          '<div class="sr-modal-header">' +
            '<div class="sr-modal-title"><i class="fa-solid fa-seedling"></i> 选择播种作物</div>' +
            '<button type="button" class="sr-modal-close" id="plant-close">&times;</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<button type="button" class="cal-event-card btn-select-crop" data-crop="crop_strawberry" style="cursor:pointer;border:none;width:100%;text-align:left;">' +
              '<div style="font-size:24px;">🍓</div>' +
              '<div class="cal-event-main">' +
                '<div class="cal-event-title">甜心草莓</div>' +
                '<div class="cal-event-meta">成长期约25秒 · 收益丰厚</div>' +
              '</div>' +
            '</button>' +
            '<button type="button" class="cal-event-card btn-select-crop" data-crop="crop_sunflower" style="cursor:pointer;border:none;width:100%;text-align:left;">' +
              '<div style="font-size:24px;">🌻</div>' +
              '<div class="cal-event-main">' +
                '<div class="cal-event-title">晨光向日葵</div>' +
                '<div class="cal-event-meta">成长期约40秒 · 金色阳光</div>' +
              '</div>' +
            '</button>' +
            '<button type="button" class="cal-event-card btn-select-crop" data-crop="crop_pumpkin" style="cursor:pointer;border:none;width:100%;text-align:left;">' +
              '<div style="font-size:24px;">🎃</div>' +
              '<div class="cal-event-main">' +
                '<div class="cal-event-title">暖绒黄金南瓜</div>' +
                '<div class="cal-event-meta">成长期约60秒 · 沉甸甸丰收</div>' +
              '</div>' +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);
      modal.querySelector('#plant-close').onclick = function() { modal.remove(); };
      modal.querySelectorAll('.btn-select-crop').forEach(function(b) {
        b.onclick = async function() {
          var cId = b.getAttribute('data-crop');
          if (window.WanwanFarmService) {
            var res = await window.WanwanFarmService.plant(plotIndex, cId);
            if (res.success) {
              window.toast && window.toast('🌱 播种成功！静待作物发芽成长~');
              farmState = await window.WanwanFarmService.getState();
              modal.remove();
              renderContent();
            } else {
              window.toast && window.toast(res.msg);
            }
          }
        };
      });
    }

    renderContent();
    mountPage(page);
  }

  // ====================================================
  // 4. 成就馆 (全域成就、勋章、碎片、称号联动)
  // ====================================================
  async function showAchievementPage() {
    var existing = document.getElementById('achievement-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'achievement-page';
    page.className = 'full-page';

    var currentCategory = 'all'; // 'all' | 'bond' | 'study' | 'farm' | 'parallel'
    var achState = window.AchievementService ? await window.AchievementService.getState() : { badges: [], totalScore: 700 };

    function renderAchievement() {
      var badges = achState.badges || [];
      var filtered = badges.filter(function(b) {
        if (currentCategory === 'all') return true;
        return b.category === currentCategory;
      });
      var unlockedCount = badges.filter(function(b) { return b.unlocked; }).length;

      var html =
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
              '<span class="pl-app-badge-dev"><i class="fa-solid fa-star"></i> ' + achState.totalScore + ' 点</span>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-scroll-content">' +
            // 英雄总览
            '<div class="pl-app-hero-card">' +
              '<div class="pl-app-hero-pill"><i class="fa-solid fa-trophy"></i> 羁绊荣耀 · 里程碑</div>' +
              '<div class="pl-app-hero-title">记录相遇以来的每一座里程碑</div>' +
              '<div class="pl-app-hero-desc">自习室45分钟深度专注、农场丰收、日常陪伴与平行宇宙的每一次深情回响，都会化作荣誉徽章与珍贵记忆碎片。</div>' +
              '<div class="pl-app-hero-stats">' +
                '<div class="pl-app-stat-item"><i class="fa-solid fa-medal"></i> 已收录 ' + unlockedCount + ' / ' + badges.length + ' 枚勋章</div>' +
                '<div class="pl-app-stat-item"><i class="fa-solid fa-puzzle-piece"></i> 剧情碎片 ' + (achState.fragments ? achState.fragments.length : 3) + ' 套</div>' +
                '<div class="pl-app-stat-item"><i class="fa-solid fa-crown"></i> 佩戴头衔：' + escapeHtml(achState.equippedTitle || '初涉尘寰的旅人') + '</div>' +
              '</div>' +
            '</div>' +

            // 分类切换
            '<div class="shared-tab-nav">' +
              '<button type="button" class="shared-tab-btn ' + (currentCategory === 'all' ? 'active' : '') + '" data-cat="all">全部</button>' +
              '<button type="button" class="shared-tab-btn ' + (currentCategory === 'bond' ? 'active' : '') + '" data-cat="bond">羁绊日常</button>' +
              '<button type="button" class="shared-tab-btn ' + (currentCategory === 'study' ? 'active' : '') + '" data-cat="study">学业修养</button>' +
              '<button type="button" class="shared-tab-btn ' + (currentCategory === 'farm' ? 'active' : '') + '" data-cat="farm">田园慢活</button>' +
              '<button type="button" class="shared-tab-btn ' + (currentCategory === 'parallel' ? 'active' : '') + '" data-cat="parallel">平行宇宙</button>' +
            '</div>' +

            // 徽章橱窗网格
            '<div class="pl-app-section-title"><i class="fa-solid fa-medal"></i> 羁绊荣耀陈列橱窗</div>' +
            '<div class="achieve-badge-grid">' +
              filtered.map(function(badge) {
                var isLocked = !badge.unlocked;
                return (
                  '<div class="achieve-badge-item ' + (isLocked ? 'locked' : '') + '" data-bid="' + badge.id + '">' +
                    '<div class="achieve-badge-icon"><i class="' + badge.icon + '"></i></div>' +
                    '<div class="achieve-badge-name">' + escapeHtml(badge.name) + '</div>' +
                    '<div class="achieve-badge-desc">' + escapeHtml(badge.desc) + '</div>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +

            // 回忆碎片
            '<div class="pl-app-section-title"><i class="fa-solid fa-puzzle-piece"></i> 剧情回忆碎片</div>' +
            '<div class="pl-app-feature-grid">' +
              (achState.fragments || []).map(function(frag) {
                var isComplete = (frag.pieceCurrent >= frag.pieceTotal);
                return (
                  '<div class="pl-app-feature-card">' +
                    '<div class="pl-app-feature-icon">' + (isComplete ? '<i class="fa-solid fa-sparkles"></i>' : '<i class="fa-solid fa-puzzle-piece"></i>') + '</div>' +
                    '<div class="pl-app-feature-name">' + escapeHtml(frag.title) + ' (' + frag.pieceCurrent + '/' + frag.pieceTotal + ')</div>' +
                    '<div class="pl-app-feature-desc">' + escapeHtml(frag.desc) + '</div>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>';

      page.innerHTML = html;
      bindBackBtn(page, 'achievement-page');

      // 切换类别
      page.querySelectorAll('.shared-tab-btn').forEach(function(btn) {
        btn.onclick = function() {
          currentCategory = btn.getAttribute('data-cat');
          renderAchievement();
        };
      });

      // 点击徽章弹窗
      page.querySelectorAll('.achieve-badge-item').forEach(function(item) {
        item.onclick = function() {
          var bId = item.getAttribute('data-bid');
          var badge = badges.find(function(b) { return b.id === bId; });
          if (!badge) return;
          openBadgeModal(badge);
        };
      });
    }

    function openBadgeModal(badge) {
      var modal = document.createElement('div');
      modal.className = 'sr-modal-backdrop';
      var isUnlocked = badge.unlocked;
      modal.innerHTML =
        '<div class="sr-modal-card" style="max-width:320px;text-align:center;">' +
          '<div style="font-size:38px;margin-bottom:8px;color:' + (isUnlocked ? 'var(--c-text)' : 'var(--c-hint)') + ';">' +
            '<i class="' + badge.icon + '"></i>' +
          '</div>' +
          '<div style="font-size:16px;font-weight:700;color:var(--c-text);">' + escapeHtml(badge.name) + '</div>' +
          '<div style="font-size:11px;color:var(--c-sub);margin-top:4px;">' + (isUnlocked ? '✨ 已达成解锁 · 获得 +' + badge.points + ' 点荣誉' : '🔒 尚未达成') + '</div>' +
          '<div style="margin:14px 0;padding:10px;background:var(--c-surface-2);border-radius:var(--r-md);font-size:12px;line-height:1.5;color:var(--c-text);text-align:left;">' +
            '<div><strong>达成条件：</strong>' + escapeHtml(badge.desc) + '</div>' +
            (isUnlocked && badge.unlockedAt ? '<div style="font-size:10px;color:var(--c-sub);margin-top:4px;">达成时间：' + new Date(badge.unlockedAt).toLocaleString() + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;justify-content:center;gap:8px;">' +
            (isUnlocked ?
              '<button type="button" class="pl-btn-primary" id="btn-equip-title" style="padding:4px 16px;">佩戴对应头衔</button>' :
              '<button type="button" class="pl-btn-secondary" id="btn-modal-close" style="padding:4px 16px;">我知道了</button>'
            ) +
            (isUnlocked ? '<button type="button" class="pl-btn-secondary" id="btn-modal-close" style="padding:4px 12px;">关闭</button>' : '') +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);
      modal.querySelectorAll('#btn-modal-close').forEach(function(b) {
        b.onclick = function() { modal.remove(); };
      });
      var equipBtn = modal.querySelector('#btn-equip-title');
      if (equipBtn) {
        equipBtn.onclick = async function() {
          if (window.AchievementService) {
            await window.AchievementService.equipTitle(badge.name);
            achState.equippedTitle = badge.name;
            window.toast && window.toast('👑 已成功佩戴头衔：「' + badge.name + '」！');
            modal.remove();
            renderAchievement();
          }
        };
      }
    }

    renderAchievement();
    mountPage(page);
  }

  // ====================================================
  // 5. 时光日历 (双向编辑同步、倒计时卡区分展示 vs 彻底删除事件)
  // 唯一来源：TimeCalendarService；自动与恋爱记双向同步
  // ====================================================
  async function showTimeCalendarPage(options) {
    if (window.TimeCalendarApp && typeof window.TimeCalendarApp.open === 'function') {
      return window.TimeCalendarApp.open(options);
    }
    var existing = document.getElementById('time-calendar-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'time-calendar-page';
    page.className = 'full-page';

    var viewDate = new Date();
    var currentYear = viewDate.getFullYear();
    var currentMonth = viewDate.getMonth() + 1; // 1-12
    var selectedDayStr = getTodayStr();

    var events = window.TimeCalendarService ? await window.TimeCalendarService.getAllEvents() : [];

    function renderCalendar() {
      var countdowns = window.TimeCalendarService ? window.TimeCalendarService.getCountdownList(events) : [];

      // 计算当月日历
      var firstDayWeekday = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 是周日
      var daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

      // 提取本月有事件的日期集合
      var eventDaysMap = {};
      events.forEach(function(ev) {
        if (ev.date && ev.date.indexOf(currentYear + '-' + String(currentMonth).padStart(2, '0')) === 0) {
          var dNum = parseInt(ev.date.split('-')[2], 10);
          eventDaysMap[dNum] = true;
        }
      });

      var todayObj = new Date();
      var isThisMonth = (todayObj.getFullYear() === currentYear && todayObj.getMonth() + 1 === currentMonth);
      var todayDayNum = isThisMonth ? todayObj.getDate() : -1;

      // 过滤当前选中日期的日程
      var selectedEvents = events.filter(function(e) { return e.date === selectedDayStr; });

      var html =
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
              '<button type="button" class="pl-btn-primary" id="cal-add-event-btn" style="padding:2px 10px;font-size:11px;">+ 新建日程</button>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-scroll-content">' +
            // 月历小视窗
            '<div class="calendar-month-grid">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                  '<button type="button" class="pl-btn-secondary" id="cal-prev-month" style="padding:2px 8px;font-size:11px;"><i class="fa-solid fa-chevron-left"></i></button>' +
                  '<div style="font-weight:700;font-size:15px;color:var(--c-text);">' + currentYear + ' 年 ' + currentMonth + ' 月</div>' +
                  '<button type="button" class="pl-btn-secondary" id="cal-next-month" style="padding:2px 8px;font-size:11px;"><i class="fa-solid fa-chevron-right"></i></button>' +
                '</div>' +
                '<div style="font-size:11px;color:var(--c-sub);"><i class="fa-solid fa-link"></i> 恋爱记双向同步</div>' +
              '</div>' +
              '<div class="calendar-week-row">' +
                '<span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>' +
              '</div>' +
              '<div class="calendar-days-grid" id="cal-days-grid">';

      // 填充空白
      for (var p = 0; p < firstDayWeekday; p++) {
        html += '<div class="calendar-day-cell" style="opacity:0.2;"></div>';
      }
      // 填充当月天数
      for (var day = 1; day <= daysInMonth; day++) {
        var isToday = (day === todayDayNum);
        var hasEv = eventDaysMap[day];
        var checkStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        var isSelected = (checkStr === selectedDayStr);

        html += '<div class="calendar-day-cell ' + (isToday ? 'today ' : '') + (hasEv ? 'event ' : '') + '" data-day="' + day + '" style="' + (isSelected && !isToday ? 'outline:2px solid var(--c-accent);border-radius:50%;' : '') + '">' + day + '</div>';
      }

      html +=
              '</div>' +
            '</div>' +

            // 纪念日倒计时卡区 (showCountdown: true)
            '<div class="pl-app-section-title"><i class="fa-solid fa-stopwatch-20"></i> 心动纪念日倒数 (倒计时视窗)</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
              (countdowns.length === 0 ?
                '<div style="font-size:11px;color:var(--c-sub);padding:10px;text-align:center;">暂无倒计时展示卡片（点击日程可开启展示）</div>' :
                countdowns.map(function(ev) {
                  var daysText = (ev.countdownDays === 0 ? '✨ 今天' : (ev.countdownDays > 0 ? ev.countdownDays + ' 天后' : '已过 ' + Math.abs(ev.countdownDays) + ' 天'));
                  return (
                    '<div class="calendar-countdown-card card-interactive" data-eid="' + ev.id + '" style="cursor:pointer;">' +
                      '<div>' +
                        '<div class="calendar-countdown-title">' +
                          '<i class="' + (ev.type === 'anniversary' ? 'fa-solid fa-heart' : 'fa-solid fa-cake-candles') + '" style="margin-right:6px;color:var(--c-sub);"></i>' +
                          escapeHtml(ev.title) +
                        '</div>' +
                        '<div style="font-size:11px;color:var(--c-sub);margin-top:2px;">' +
                          '<span class="cal-event-source-tag">' + (ev.sourceApp === 'loveDiary' ? '恋爱记' : (ev.sourceApp === 'studyRoom' ? '自习室' : '时光日历')) + '</span> ' +
                          escapeHtml(ev.date) + (ev.note ? ' · ' + escapeHtml(ev.note) : '') +
                        '</div>' +
                      '</div>' +
                      '<div class="calendar-countdown-days">' + daysText + '</div>' +
                    '</div>'
                  );
                }).join('')
              ) +
            '</div>' +

            // 选中日期日程清单
            '<div class="pl-app-section-title"><i class="fa-solid fa-list-check"></i> ' + selectedDayStr + ' 日程事项</div>' +
            '<div class="calendar-events-section">' +
              (selectedEvents.length === 0 ?
                '<div style="font-size:11px;color:var(--c-sub);padding:12px;text-align:center;background:var(--c-surface);border-radius:var(--r-md);border:1px solid var(--c-border);">' +
                  '该日暂无日程安排，点击右上角「+ 新建日程」添加' +
                '</div>' :
                selectedEvents.map(function(ev) {
                  return (
                    '<div class="cal-event-card card-interactive" data-eid="' + ev.id + '" style="cursor:pointer;">' +
                      '<div class="cal-event-main">' +
                        '<div class="cal-event-title">' +
                          escapeHtml(ev.title) +
                          (ev.showCountdown ? '<span class="cal-event-source-tag" style="color:var(--c-accent);border-color:var(--c-accent);"><i class="fa-solid fa-stopwatch-20"></i> 倒计时中</span>' : '') +
                        '</div>' +
                        '<div class="cal-event-meta">' +
                          '<span class="cal-event-source-tag">' + (ev.sourceApp === 'loveDiary' ? '恋爱记' : (ev.sourceApp === 'studyRoom' ? '自习室' : '时光日历')) + '</span>' +
                          '<span>' + (ev.time || '全天') + '</span>' +
                          '<span>' + escapeHtml(ev.note || '') + '</span>' +
                        '</div>' +
                      '</div>' +
                      '<i class="fa-solid fa-angle-right" style="color:var(--c-sub);font-size:12px;"></i>' +
                    '</div>'
                  );
                }).join('')
              ) +
            '</div>' +
          '</div>' +
        '</div>';

      page.innerHTML = html;
      bindBackBtn(page, 'time-calendar-page');

      // 切换月份
      page.querySelector('#cal-prev-month').onclick = function() {
        currentMonth--;
        if (currentMonth < 1) {
          currentMonth = 12;
          currentYear--;
        }
        renderCalendar();
      };
      page.querySelector('#cal-next-month').onclick = function() {
        currentMonth++;
        if (currentMonth > 12) {
          currentMonth = 1;
          currentYear++;
        }
        renderCalendar();
      };

      // 选中天数
      page.querySelectorAll('.calendar-day-cell[data-day]').forEach(function(cell) {
        cell.onclick = function() {
          var dNum = parseInt(cell.getAttribute('data-day'), 10);
          selectedDayStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-' + String(dNum).padStart(2, '0');
          renderCalendar();
        };
      });

      // 新建日程按钮
      page.querySelector('#cal-add-event-btn').onclick = function() {
        openAddEventModal();
      };

      // 点击已有日程或倒计时卡
      page.querySelectorAll('.card-interactive').forEach(function(card) {
        card.onclick = function() {
          var eId = card.getAttribute('data-eid');
          var ev = events.find(function(e) { return e.id === eId; });
          if (ev) {
            openEventDetailModal(ev);
          }
        };
      });
    }

    // 新建日程弹窗
    function openAddEventModal() {
      var modal = document.createElement('div');
      modal.className = 'sr-modal-backdrop';
      modal.innerHTML =
        '<div class="sr-modal-card" style="max-width:340px;">' +
          '<div class="sr-modal-header">' +
            '<div class="sr-modal-title"><i class="fa-solid fa-calendar-plus"></i> 新建心动日程</div>' +
            '<button type="button" class="sr-modal-close" id="add-close">&times;</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:10px;">' +
            '<div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin-bottom:4px;">事件标题：</div>' +
              '<input type="text" id="ev-title-input" class="sr-set-input" style="width:100%;" placeholder="例如：周末图书博物馆之约">' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
              '<div style="flex:1;">' +
                '<div style="font-size:11px;color:var(--c-sub);margin-bottom:4px;">日期：</div>' +
                '<input type="date" id="ev-date-input" class="sr-set-input" style="width:100%;" value="' + selectedDayStr + '">' +
              '</div>' +
              '<div style="width:100px;">' +
                '<div style="font-size:11px;color:var(--c-sub);margin-bottom:4px;">时间：</div>' +
                '<input type="time" id="ev-time-input" class="sr-set-input" style="width:100%;" value="14:00">' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:11px;color:var(--c-sub);margin-bottom:4px;">备注或心愿：</div>' +
              '<input type="text" id="ev-note-input" class="sr-set-input" style="width:100%;" placeholder="带上一杯温红茶">' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding-top:4px;">' +
              '<input type="checkbox" id="ev-countdown-check" checked>' +
              '<span>设为倒计时卡展示 (在心动倒数榜显示)</span>' +
            '</label>' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' +
            '<button type="button" class="pl-btn-secondary" id="add-cancel">取消</button>' +
            '<button type="button" class="pl-btn-primary" id="add-submit">保存日程</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);
      modal.querySelector('#add-close').onclick = function() { modal.remove(); };
      modal.querySelector('#add-cancel').onclick = function() { modal.remove(); };
      modal.querySelector('#add-submit').onclick = async function() {
        var title = modal.querySelector('#ev-title-input').value.trim();
        var date = modal.querySelector('#ev-date-input').value;
        var time = modal.querySelector('#ev-time-input').value;
        var note = modal.querySelector('#ev-note-input').value.trim();
        var isCountdown = modal.querySelector('#ev-countdown-check').checked;

        if (!title) {
          window.toast && window.toast('请输入日程标题');
          return;
        }

        if (window.TimeCalendarService) {
          await window.TimeCalendarService.addEvent({
            title: title,
            date: date,
            time: time,
            note: note,
            showCountdown: isCountdown,
            type: 'schedule',
            sourceApp: 'timeCalendar'
          });
          events = await window.TimeCalendarService.getAllEvents();
          window.toast && window.toast('✨ 日程「' + title + '」已保存至时光日历！');
          modal.remove();
          renderCalendar();
        }
      };
    }

    // 核心规则：区分「删除事件」与「取消倒计时展示」
    function openEventDetailModal(ev) {
      var modal = document.createElement('div');
      modal.className = 'sr-modal-backdrop';
      var isCountdown = Boolean(ev.showCountdown);

      modal.innerHTML =
        '<div class="sr-modal-card" style="max-width:340px;">' +
          '<div class="sr-modal-header">' +
            '<div class="sr-modal-title"><i class="fa-solid fa-calendar-check"></i> 日程详情与操作</div>' +
            '<button type="button" class="sr-modal-close" id="dtl-close">&times;</button>' +
          '</div>' +
          '<div style="padding:10px;background:var(--c-surface-2);border-radius:var(--r-md);margin-bottom:12px;">' +
            '<div style="font-size:14px;font-weight:700;color:var(--c-text);">' + escapeHtml(ev.title) + '</div>' +
            '<div style="font-size:11px;color:var(--c-sub);margin-top:4px;">' +
              '<span>' + ev.date + ' ' + (ev.time || '') + '</span> · ' +
              '<span class="cal-event-source-tag">来源: ' + (ev.sourceApp === 'loveDiary' ? '恋爱记' : (ev.sourceApp === 'studyRoom' ? '自习室' : '时光日历')) + '</span>' +
            '</div>' +
            (ev.note ? '<div style="font-size:11px;color:var(--c-text);margin-top:6px;">' + escapeHtml(ev.note) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            // 按钮1：切换倒计时卡展示
            '<button type="button" class="pl-btn-secondary" id="btn-toggle-countdown" style="padding:8px 12px;font-size:12px;text-align:left;display:flex;align-items:center;justify-content:space-between;">' +
              '<span><i class="fa-solid fa-stopwatch-20"></i> ' + (isCountdown ? '取消倒计时展示 (保留日程)' : '设为倒计时卡展示') + '</span>' +
              '<i class="fa-solid fa-rotate"></i>' +
            '</button>' +
            // 按钮2：彻底删除事件
            '<button type="button" class="pl-btn-secondary" id="btn-delete-event" style="padding:8px 12px;font-size:12px;text-align:left;color:#d9534f;display:flex;align-items:center;justify-content:space-between;">' +
              '<span><i class="fa-solid fa-trash-can"></i> 完全删除日程事件 (彻底移除)</span>' +
              '<i class="fa-solid fa-xmark"></i>' +
            '</button>' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:14px;">' +
            '<button type="button" class="pl-btn-primary" id="dtl-done" style="padding:4px 16px;">完成</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);
      modal.querySelector('#dtl-close').onclick = function() { modal.remove(); };
      modal.querySelector('#dtl-done').onclick = function() { modal.remove(); };

      // 切换倒计时展示
      modal.querySelector('#btn-toggle-countdown').onclick = async function() {
        var nextState = !isCountdown;
        if (window.TimeCalendarService) {
          await window.TimeCalendarService.toggleCountdownDisplay(ev.id, nextState);
          events = await window.TimeCalendarService.getAllEvents();
          window.toast && window.toast(nextState ? '✨ 已设为倒计时卡展示！' : '🌿 已取消倒计时展示，日程依旧保留在日历中。');
          modal.remove();
          renderCalendar();
        }
      };

      // 彻底删除
      modal.querySelector('#btn-delete-event').onclick = function() {
        if (confirm('确认彻底删除日程「' + ev.title + '」？\n（注：若只需从倒数卡片中隐藏，请点击「取消倒计时展示」）')) {
          if (window.TimeCalendarService) {
            window.TimeCalendarService.deleteEvent(ev.id).then(async function() {
              events = await window.TimeCalendarService.getAllEvents();
              window.toast && window.toast('🗑️ 日程已彻底删除。');
              modal.remove();
              renderCalendar();
            });
          }
        }
      };
    }

    renderCalendar();
    mountPage(page);
  }

  // ====================================================
  // 6. 人生游戏 (联动自习室专注、成就馆与防刷上限)
  // 唯一来源：LifeGameService；防刷：RewardGuard 统一规则
  // ====================================================
  async function showLifeGamePage() {
    var existing = document.getElementById('life-game-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'life-game-page';
    page.className = 'full-page';

    var lifeState = window.LifeGameService ? await window.LifeGameService.getState() : { level: 3, exp: 650, stats: {} };
    var guardCtx = window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard ?
      await window.WanwanSharedHub.RewardGuard.getTodayRecord() :
      { record: { expEarned: 0, coinsEarned: 0 } };

    function renderLifeGame() {
      var reqExp = window.LifeGameService ? window.LifeGameService.getExpToNextLevel(lifeState.level) : 1000;
      var expPercent = Math.min(100, Math.round((lifeState.exp / reqExp) * 100));

      var html =
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
              '<span class="pl-app-badge-dev">LV.' + lifeState.level + ' ' + escapeHtml(lifeState.title || '见习探索者') + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-scroll-content">' +
            // 防刷透明指示条
            '<div class="lifegame-reward-guard-banner">' +
              '<div><i class="fa-solid fa-shield-halved"></i> 统一奖励与防刷上限：</div>' +
              '<div>' +
                '今日经验 <strong>' + guardCtx.record.expEarned + ' / 600</strong> · ' +
                '金币 <strong>' + guardCtx.record.coinsEarned + ' / 300</strong>' +
              '</div>' +
            '</div>' +

            // 角色RPG面板
            '<div class="lifegame-profile-card">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                  '<div style="font-size:16px;font-weight:700;color:var(--c-text);">现实状态卡 · ' + escapeHtml(lifeState.title || '见习探索者') + '</div>' +
                  '<div style="font-size:11px;color:var(--c-sub);">将自习、农场、相伴等琐事化作史诗 RPG 升级冒险</div>' +
                '</div>' +
                '<div style="font-size:20px;font-weight:800;color:var(--c-text);">LV.' + lifeState.level + '</div>' +
              '</div>' +
              '<div>' +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-sub);margin-bottom:4px;">' +
                  '<span>升级经验值 (EXP)</span><span>' + lifeState.exp + ' / ' + reqExp + '</span>' +
                '</div>' +
                '<div class="lifegame-exp-bar">' +
                  '<div class="lifegame-exp-fill" style="width:' + expPercent + '%;"></div>' +
                '</div>' +
              '</div>' +
              // 六维属性网格
              '<div class="lifegame-stats-row">' +
                '<div class="lifegame-stat-box"><div class="lifegame-stat-val">' + (lifeState.stats.INT || 74) + '</div><div class="lifegame-stat-lbl">智力 INT</div></div>' +
                '<div class="lifegame-stat-box"><div class="lifegame-stat-val">' + (lifeState.stats.CHA || 82) + '</div><div class="lifegame-stat-lbl">魅力 CHA</div></div>' +
                '<div class="lifegame-stat-box"><div class="lifegame-stat-val">' + (lifeState.stats.WIL || 68) + '</div><div class="lifegame-stat-lbl">意志 WIL</div></div>' +
                '<div class="lifegame-stat-box"><div class="lifegame-stat-val">' + (lifeState.stats.PHY || 62) + '</div><div class="lifegame-stat-lbl">体能 PHY</div></div>' +
                '<div class="lifegame-stat-box"><div class="lifegame-stat-val">' + (lifeState.stats.PER || 88) + '</div><div class="lifegame-stat-lbl">敏锐 PER</div></div>' +
                '<div class="lifegame-stat-box"><div class="lifegame-stat-val">' + (lifeState.stats.INS || 91) + '</div><div class="lifegame-stat-lbl">灵感 INS</div></div>' +
              '</div>' +
            '</div>' +

            // 悬赏任务榜
            '<div class="pl-app-section-title"><i class="fa-solid fa-scroll"></i> 今日现实日常委托 (全域联动)</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
              (lifeState.quests || []).map(function(q) {
                var isDone = q.done || (q.current >= q.target);
                var isClaimed = q.claimed;

                return (
                  '<div class="cal-event-card">' +
                    '<div class="cal-event-main">' +
                      '<div class="cal-event-title">' +
                        escapeHtml(q.title) +
                        (isClaimed ? '<span class="cal-event-source-tag" style="color:var(--c-sub);">已领奖</span>' : '') +
                      '</div>' +
                      '<div class="cal-event-meta">' +
                        '<span>' + escapeHtml(q.desc) + '</span>' +
                        '<span>进度: ' + Math.min(q.target, q.current || 0) + ' / ' + q.target + '</span>' +
                      '</div>' +
                      '<div style="font-size:10px;color:var(--c-sub);margin-top:2px;">' +
                        '奖励：+' + q.rewardExp + ' EXP · +' + q.rewardCoins + ' 金币' +
                      '</div>' +
                    '</div>' +
                    (isClaimed ?
                      '<button type="button" class="pl-btn-secondary" disabled style="opacity:0.5;font-size:11px;padding:3px 10px;">已达成</button>' :
                      (isDone ?
                        '<button type="button" class="pl-btn-primary btn-claim-quest" data-qid="' + q.id + '" style="font-size:11px;padding:3px 10px;">打卡领奖</button>' :
                        '<button type="button" class="pl-btn-secondary btn-simulate-quest" data-qid="' + q.id + '" style="font-size:11px;padding:3px 8px;">打卡推进</button>'
                      )
                    ) +
                  '</div>'
                );
              }).join('') +
            '</div>' +

            '<div class="pl-app-dev-banner" style="margin-top:14px;">' +
              '<i class="fa-solid fa-dice-d20"></i>' +
              '<div class="pl-app-dev-banner-main">' +
                '<div class="pl-app-dev-banner-title">全域真实联动结算已启用</div>' +
                '<div>陪伴自习室专注 45 分钟直接推进日常并提升智力；农场收获提升体能并奖励金币！</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      page.innerHTML = html;
      bindBackBtn(page, 'life-game-page');

      // 领奖
      page.querySelectorAll('.btn-claim-quest').forEach(function(btn) {
        btn.onclick = async function() {
          var qId = btn.getAttribute('data-qid');
          if (window.LifeGameService) {
            var res = await window.LifeGameService.claimQuest(qId);
            if (res.success) {
              window.toast && window.toast('🎉 委托达成！获得 +' + res.exp + ' EXP 与 +' + res.coins + ' 金币！');
              lifeState = res.state;
              guardCtx = await window.WanwanSharedHub.RewardGuard.getTodayRecord();
              renderLifeGame();
            } else {
              window.toast && window.toast(res.msg);
            }
          }
        };
      });

      // 手动推进测试打卡
      page.querySelectorAll('.btn-simulate-quest').forEach(function(btn) {
        btn.onclick = async function() {
          var qId = btn.getAttribute('data-qid');
          if (window.LifeGameService) {
            await window.LifeGameService.updateQuestProgress(qId, 1);
            lifeState = await window.LifeGameService.getState();
            window.toast && window.toast('✨ 推进了一次日常委托进度！');
            renderLifeGame();
          }
        };
      });
    }

    renderLifeGame();
    mountPage(page);
  }

  // ====================================================
  // 7. 心动商城 (联动共享经济账户与背包)
  // 唯一来源：SharedEconomyService
  // ====================================================
  async function showHeartbeatMallPage() {
    var existing = document.getElementById('heartbeat-mall-page');
    if (existing) existing.remove();

    var page = document.createElement('div');
    page.id = 'heartbeat-mall-page';
    page.className = 'full-page';

    var ecoState = window.SharedEconomyService ? await window.SharedEconomyService.getState() : { coins: 520, diamonds: 50 };

    var MALL_GOODS = [
      { id: 'item_vinyl', name: '复古黑胶唱机', price: 300, icon: 'fa-solid fa-record-vinyl', category: 'furniture', desc: '可布置于我们的家，舒适度+25' },
      { id: 'crop_strawberry_seed', name: '甜心草莓种子 (4包)', price: 50, icon: 'fa-solid fa-seedling', category: 'seed', desc: '可在弯弯农场后院耕作收获新鲜草莓' },
      { id: 'item_rug', name: '暖绒云朵毯', price: 200, icon: 'fa-solid fa-rug', category: 'furniture', desc: '可布置于我们的家，舒适度+25' },
      { id: 'item_sticky_notes', name: '心动便签纸 (5份)', price: 60, icon: 'fa-solid fa-note-sticky', category: 'study_tool', desc: '自习室与伴侣专属灵感便利贴' },
      { id: 'crop_sunflower_seed', name: '晨光向日葵种子 (2包)', price: 80, icon: 'fa-solid fa-sun', category: 'seed', desc: '农场种植金色花朵，收获丰厚收益' },
      { id: 'item_frame', name: '拍立得相框', price: 150, icon: 'fa-solid fa-camera-retro', category: 'furniture', desc: '记录旅行与自习名场面' }
    ];

    function renderMall() {
      var html =
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
              '<span class="pl-app-badge-dev"><i class="fa-solid fa-coins"></i> ' + (ecoState.coins || 0) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="pl-app-scroll-content">' +
            // 资产与每日签到
            '<div class="mall-assets-bar">' +
              '<div class="mall-asset-item">' +
                '<i class="fa-solid fa-coins"></i>' +
                '<span>金币：<strong>' + (ecoState.coins || 0) + '</strong></span>' +
              '</div>' +
              '<div class="mall-asset-item">' +
                '<i class="fa-solid fa-gem"></i>' +
                '<span>星愿石：<strong>' + (ecoState.diamonds || 0) + '</strong></span>' +
              '</div>' +
              '<button type="button" class="pl-btn-primary" id="mall-signin-btn">' +
                '<i class="fa-solid fa-gift"></i><span>每日迎新签到</span>' +
              '</button>' +
            '</div>' +

            // 热门货架
            '<div class="pl-app-section-title"><i class="fa-solid fa-bag-shopping"></i> 共享道具精选货架</div>' +
            '<div class="mall-shelf-grid">' +
              MALL_GOODS.map(function(good) {
                return (
                  '<div class="mall-good-card" data-gid="' + good.id + '">' +
                    '<div class="mall-good-visual"><i class="' + good.icon + '"></i></div>' +
                    '<div class="mall-good-title">' + escapeHtml(good.name) + '</div>' +
                    '<div style="font-size:10px;color:var(--c-sub);">' + escapeHtml(good.desc) + '</div>' +
                    '<div class="mall-good-bottom">' +
                      '<span class="mall-price">' + good.price + ' 金币</span>' +
                      '<button type="button" class="mall-btn-buy" data-gid="' + good.id + '">兑换入包</button>' +
                    '</div>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +

            '<div class="pl-app-dev-banner">' +
              '<i class="fa-solid fa-cart-shopping"></i>' +
              '<div class="pl-app-dev-banner-main">' +
                '<div class="pl-app-dev-banner-title">共享经济中枢统一记账</div>' +
                '<div>兑换后道具即时存入共享背包，家具可直接在「我们的家」布置，种子可在「弯弯农场」耕种！</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      page.innerHTML = html;
      bindBackBtn(page, 'heartbeat-mall-page');

      // 每日签到
      var signBtn = page.querySelector('#mall-signin-btn');
      if (signBtn) {
        signBtn.onclick = async function() {
          if (window.WanwanSharedHub && window.WanwanSharedHub.RewardGuard) {
            var eventId = 'mall_signin_' + getTodayStr();
            var guard = await window.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, 0, 50, 0);
            if (!guard.allowed) {
              window.toast && window.toast('今日签到奖励已领取过，明日再来吧~');
              return;
            }
            await window.SharedEconomyService.addCoins(guard.coinsGranted, '每日商城签到', 'mall');
            ecoState = await window.SharedEconomyService.getState();
            window.toast && window.toast('🎉 签到成功！获得 +' + guard.coinsGranted + ' 金币！');
            renderMall();
          }
        };
      }

      // 兑换购买商品
      page.querySelectorAll('.mall-btn-buy').forEach(function(btn) {
        btn.onclick = async function() {
          var gId = btn.getAttribute('data-gid');
          var good = MALL_GOODS.find(function(g) { return g.id === gId; });
          if (!good) return;

          if (window.SharedEconomyService) {
            var spendRes = await window.SharedEconomyService.spendCoins(good.price, '兑换商品：' + good.name, 'mall');
            if (!spendRes.success) {
              window.toast && window.toast(spendRes.msg);
              return;
            }

            // 放入背包
            await window.SharedEconomyService.addItem({
              itemId: good.id,
              name: good.name,
              icon: good.icon,
              category: good.category,
              desc: good.desc,
              price: good.price
            }, 1, 'mall');

            ecoState = await window.SharedEconomyService.getState();
            window.toast && window.toast('🎁 兑换成功！「' + good.name + '」已放入共享背包！');
            renderMall();
          }
        };
      });
    }

    renderMall();
    mountPage(page);
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
  if (!window.TimeCalendarApp) {
    window.showTimeCalendarPage = showTimeCalendarPage;
    window.showTimeCalendarApp = showTimeCalendarPage;
  }
  window.showLifeGamePage = showLifeGamePage;
  window.showHeartbeatMallPage = showHeartbeatMallPage;
  window.showFanCommunityPage = showFanCommunityPage;
  window.showHeartbeatLivePage = showHeartbeatLivePage;

  // 别名兼容：window.showXxxApp
  window.showBrowserApp = showBrowserPage;
  window.showStudyRoomApp = showStudyRoomPage;
  window.showOurHomeApp = showOurHomePage;
  window.showAchievementApp = showAchievementPage;
  if (!window.TimeCalendarApp) {
    window.showTimeCalendarApp = showTimeCalendarPage;
  }
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
