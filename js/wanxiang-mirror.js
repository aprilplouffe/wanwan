// js/wanxiang-mirror.js — 弯弯小手机｜万象镜 V3.0 (会呼吸的小镇)
// 基于 V2.4 增量升级：
// 1. 小镇时段氛围系统：真实时段与手动昼夜预览严格解耦、非 AI 固定欢迎语、黄昏轻滤镜与随时恢复当前时间
// 2. Char 主动邀约与防打扰系统：仅在前台触发、双冷却、静默 7 天过期、小镇来信查看与「小镇生活与邀约」设置
// 3. 季节生活事件：春/夏/秋/冬四季节限时互动（不破坏花园采集与游乐场收费边界）、跨年冬季归属与季节纪念去重
// 4. 跨地点真实经历联动：严格按 charId 过滤已落盘且未取消/未退款记录，分离提示词层次且绝不自动改写长期记忆与 IF 世界

(function(global) {
  'use strict';

  var PAGE_ID = 'wanxiang-mirror-page';
  var STORAGE_KEYS = {
    STATE: 'wanxiang_mirror_state_v1',
    GACHA: 'wanxiang_mirror_gacha_v1',
    CHAR_LOGS: 'wanxiang_mirror_char_logs_v1',
    MEMENTOS: 'wanxiang_mirror_mementos_v1',
    UI_V21: 'wanxiang_mirror_ui_v21',
    GARDEN_V22: 'wanxiang_mirror_garden_v22',
    LAKESIDE_V22: 'wanxiang_mirror_lakeside_v22',
    COMPANION_V22: 'wanxiang_mirror_companion_v22',
    PARK_V23: 'wanxiang_mirror_park_v23',
    CLAW_V23: 'wanxiang_mirror_claw_v23',
    FERRIS_V23: 'wanxiang_mirror_ferris_v23',
    CAROUSEL_V23: 'wanxiang_mirror_carousel_v23',
    STATION_V24: 'wanxiang_mirror_station_v24',
    JOURNEYS_V24: 'wanxiang_mirror_journeys_v24',
    LIFE_V30: 'wanxiang_mirror_life_v30',
    INVITATIONS_V30: 'wanxiang_mirror_invitations_v30'
  };

  var MAP_WIDTH = 1024;
  var MAP_HEIGHT = 1536;
  var MIN_SCALE = 1.0;
  var MAX_SCALE = 2.0;
  var DRAG_THRESHOLD_PX = 8;

  // 时段与地图素材映射 (保留 4 时段视觉接口，不用深色遮罩冒充夜景)
  var TIME_PERIODS = {
    morning: {
      key: 'morning',
      label: '清晨',
      range: '05:00–10:59',
      src: 'img/map-morning.png',
      note: '晨光微暖，小镇刚苏醒'
    },
    day: {
      key: 'day',
      label: '白昼',
      range: '11:00–16:59',
      src: 'img/map-afternoon.png',
      note: '晴空明亮，建筑轮廓清晰'
    },
    dusk: {
      key: 'dusk',
      label: '黄昏',
      range: '17:00–19:59',
      src: 'img/map-morning.png',
      fallbackAlt: 'img/map.png',
      note: '暮色晚霞（已预留独立黄昏底图接口）'
    },
    night: {
      key: 'night',
      label: '夜晚',
      range: '20:00–04:59',
      src: 'img/map-evening.png',
      note: '星月灯火，小镇夜色温柔'
    }
  };

  // V3.0 真实时段定义（与手动昼夜视觉预览解耦）
  var TIME_SLOTS_V30 = {
    morning: {
      key: 'morning',
      label: '清晨',
      range: '05:00–10:59',
      icon: 'fa-solid fa-sun',
      note: '晨露未散，花香轻轻飘过石板街'
    },
    afternoon: {
      key: 'afternoon',
      label: '午后',
      range: '11:00–16:59',
      icon: 'fa-solid fa-cloud-sun',
      note: '阳光温软，露台与花园都正好逛一逛'
    },
    dusk: {
      key: 'dusk',
      label: '黄昏',
      range: '17:00–19:59',
      icon: 'fa-solid fa-sunset',
      note: '暮色染上屋檐，晚风与路灯正准备接班'
    },
    night: {
      key: 'night',
      label: '夜晚',
      range: '20:00–04:59',
      icon: 'fa-solid fa-moon',
      note: '星光亮起，小镇留着一盏轻柔的晚灯'
    }
  };

  // V3.0 每时段 >=5 条非 AI 固定欢迎语（零网络延迟）
  var WELCOME_GREETINGS = {
    morning: [
      '早安，喷泉边的露水刚被晨风吹散，今天先去哪条小路走走？',
      '清晨的镜中小镇很安静，面包炉与手冲咖啡的香气刚好飘出来。',
      '早上的光线清亮温和，适合去四季花园看看新开的早花。',
      '天色刚亮起来，商店街的小门牌正一格格翻成“营业中”。',
      '早安呀，星纹喷泉在朝阳里泛着微光，祝你今天有个轻松的好心情。'
    ],
    afternoon: [
      '午后的太阳暖洋洋的，咖啡馆露台的遮阳伞下正留着空座。',
      '下午好，湖面被微风吹出细碎波光，很适合慢慢散一会儿步。',
      '正午过后的小镇脚步慢了下来，想先逛小铺还是去扭蛋屋？',
      '午后风里带着淡淡青草味，不妨找位同行 Char 一起走一段。',
      '阳光正好，四季花园的花影和湖畔栈道都很适合拍一张留影。'
    ],
    dusk: [
      '傍晚的天边染上一点橘粉暮色，小镇的路灯快要一盏盏亮起了。',
      '黄昏的风变得凉爽了些，湖畔步道和摩天轮正是最温柔的时候。',
      '暮色把尖顶屋檐描出浅金边，今天想在哪里停下歇口气？',
      '晚霞慢悠悠地往湖面西边沉，星光游乐场的彩灯已经开始预热。',
      '忙碌一天后的傍晚，来镜心广场吹吹晚风也很舒服。'
    ],
    night: [
      '夜色落下来了，万象镜和星辰摩天轮都点起了暖黄小灯。',
      '晚上好，夜晚的小镇节奏放得很轻，不用赶时间，慢慢逛就好。',
      '星光下的镜心广场很安宁，列车站的钟表也在轻声走着。',
      '夜风微凉，适合去咖啡馆坐一会儿，或搭一班安静的夜行列车。',
      '今夜灯火温柔，如果有些累了，就在小镇里挑个喜欢的角落歇歇吧。'
    ]
  };

  // V3.0 Char 主动邀约冷却与静默过期配置
  var INVITATION_COOLDOWNS = {
    low: {
      charMs: 7 * 24 * 60 * 60 * 1000,   // 默认低频：单 Char 7 天
      globalMs: 72 * 60 * 60 * 1000      // 默认低频：全局 72 小时
    },
    standard: {
      charMs: 72 * 60 * 60 * 1000,       // 常规：单 Char 72 小时
      globalMs: 24 * 60 * 60 * 1000      // 常规：全局 24 小时
    },
    expiryMs: 7 * 24 * 60 * 60 * 1000    // 未处理静默 7 天过期
  };

  // V3.0 主动邀约非 AI 确定性模板（严格限定 9 大现有地点）
  var INVITATION_TEMPLATES = [
    {
      id: 'inv_cafe_morning_tea',
      locationId: 'afternoon_cafe',
      locationName: '午后咖啡馆',
      preferredSlots: ['morning', 'afternoon'],
      preferredSeasons: ['spring', 'autumn', 'winter'],
      baseText: '刚才路过露台，觉得窗边那个晒得到太阳的位子很不错，有空的话一起坐一会儿？'
    },
    {
      id: 'inv_garden_bloom',
      locationId: 'four_seasons_garden',
      locationName: '四季花园',
      preferredSlots: ['morning', 'afternoon'],
      preferredSeasons: ['spring', 'summer'],
      baseText: '凉亭旁边新开了不少花，顺便看看今天能采到什么颜色，要不要一起去花园逛逛？'
    },
    {
      id: 'inv_lakeside_breeze',
      locationId: 'lakeside_walk',
      locationName: '湖畔步道',
      preferredSlots: ['afternoon', 'dusk'],
      preferredSeasons: ['spring', 'autumn'],
      baseText: '湖面上的风吹过来很舒服，白鹅也慢悠悠游过栈道了，想不想沿湖散个小步？'
    },
    {
      id: 'inv_plaza_fountain',
      locationId: 'mirror_plaza',
      locationName: '镜心广场',
      preferredSlots: ['morning', 'dusk', 'night'],
      preferredSeasons: ['winter', 'autumn', 'spring'],
      baseText: '星纹喷泉这会儿的灯光挺好看的，如果正好在小镇里，来广场碰个面吧。'
    },
    {
      id: 'inv_park_lights',
      locationId: 'starlight_park',
      locationName: '星光游乐场',
      preferredSlots: ['dusk', 'night'],
      preferredSeasons: ['summer', 'autumn'],
      baseText: '游乐场那边的灯串已经亮起来了，不赶时间的话，要不要去看看抓娃娃机或摩天轮？'
    },
    {
      id: 'inv_shop_stroll',
      locationId: 'shopping_street',
      locationName: '心动商店街',
      preferredSlots: ['afternoon', 'dusk'],
      preferredSeasons: ['winter', 'spring'],
      baseText: '商店街橱窗里新摆了几样小东西，路过的时候顺眼看了一下，想和你一起挑挑看。'
    }
  ];

  // V3.0 四季节生活事件（每季 1 个，复用现有地点，不破坏既有采集/收费边界）
  var SEASONAL_EVENTS_V30 = {
    spring: {
      seasonId: 'spring',
      seasonLabel: '春季',
      eventId: 'spring_flower_day',
      locationId: 'four_seasons_garden',
      locationName: '四季花园',
      title: '春日花信日',
      subtitle: '四季花园限季轻量互动 · 免费参与，不影响每日采花限额',
      icon: 'fa-solid fa-seedling',
      prompt: '春风把樱花瓣和淡淡青草香一起吹进凉亭，阳光落在喷泉水面上晃出细碎的光。你和同行伙伴站在花圃边，打算怎样留住今天的春意？',
      options: [
        {
          id: 'A',
          label: '接住几片飘落的春日花瓣放进书签夹层',
          outcome: '两片完整的淡粉花瓣安静躺进随身小纸夹里，风吹过凉亭风铃轻轻作响。',
          fallbackReply: '这样收起来的话，以后翻开本子还能记得今天花园里的风。'
        },
        {
          id: 'B',
          label: '坐在白纱凉亭长椅上辨认远处花圃的新芽',
          outcome: '你们顺着石板小径挨个认出刚冒头的新绿与花苞，记下了这一季最早的颜色。',
          fallbackReply: '慢慢看过去才发现每块花圃都在抽芽，春天确实已经在身旁了。'
        },
        {
          id: 'C',
          label: '在喷泉边许一个关于今年春天的小小心愿',
          outcome: '水珠被微风带起又落下，你们相视一笑，把轻巧的心意留在这片晴空下。',
          fallbackReply: '不用说得很复杂，顺顺利利度过这个春天就很好了。'
        }
      ]
    },
    summer: {
      seasonId: 'summer',
      seasonLabel: '夏季',
      eventId: 'summer_starlight_evening',
      locationId: 'starlight_park',
      locationName: '星光游乐场',
      title: '夏夜星灯会',
      subtitle: '星光游乐场限季轻量互动 · 仅记录季节陪伴，不免费跳过收费游乐项目',
      icon: 'fa-solid fa-star',
      prompt: '夏夜晚风吹散白天的暑气，游乐场入口挂起一长串暖黄小星灯，远处的彩灯与树梢蝉鸣温柔交织。你们想在灯影下做什么？',
      options: [
        {
          id: 'A',
          label: '在星灯拱门下分吃一支冰凉海盐汽水棒冰',
          outcome: '清冽微甜的气泡味化在夏夜空气里，指尖沾了一点沁凉水汽。',
          fallbackReply: '晚上吹着风吃这个最解暑，比白天舒服多了。'
        },
        {
          id: 'B',
          label: '抬头数数灯串间隙露出的夏季亮星',
          outcome: '避开最亮的一排霓虹灯后，夏夜天幕上的几颗星星清晰安静地闪着光。',
          fallbackReply: '虽然灯火很热闹，抬头还是能找到好几颗很亮的星星呢。'
        },
        {
          id: 'C',
          label: '沿着亮灯石砖道听一场夏夜风铃合奏',
          outcome: '廊檐下挂满玻璃风铃，晚风拂过时发出清脆而松弛的叮咚声。',
          fallbackReply: '这串玻璃风铃听着真凉快，站在这里就不想挪步了。'
        }
      ]
    },
    autumn: {
      seasonId: 'autumn',
      seasonLabel: '秋季',
      eventId: 'autumn_leaf_walk',
      locationId: 'lakeside_walk',
      locationName: '湖畔步道',
      title: '秋叶湖畔漫步',
      subtitle: '湖畔步道限季轻量互动 · 沿湖拾叶与秋风对话',
      icon: 'fa-solid fa-leaf',
      prompt: '秋风把岸边的银杏与红叶吹落到木栈道上，湖面平静得像一片浅金色画布，白鹅沿着睡莲边慢悠悠划开波纹。你们决定如何走这一段？',
      options: [
        {
          id: 'A',
          label: '一起挑一枚边缘最整齐的金色银杏叶',
          outcome: '你挑中一枚带小扇面纹路的金黄叶片，放在掌心刚好照见秋日斜阳。',
          fallbackReply: '这片叶子颜色很匀称，收好当今天散步的小信物吧。'
        },
        {
          id: 'B',
          label: '踩着落叶的沙沙声慢慢走到木船码头边',
          outcome: '鞋尖踩过干爽落叶发出轻脆声响，木船随水波轻轻摇晃两下。',
          fallbackReply: '秋天就是听着踩落叶的声音，走再慢也不觉得无聊。'
        },
        {
          id: 'C',
          label: '靠在栈道木栏杆上看水鸟绕过红叶倒影',
          outcome: '天光和水色都透着清爽秋意，这一段安静的并肩时间显得格外漫长温柔。',
          fallbackReply: '湖水映着岸上的秋叶，怎么看都像现成的明信片。'
        }
      ]
    },
    winter: {
      seasonId: 'winter',
      seasonLabel: '冬季',
      eventId: 'winter_warm_lights',
      locationId: 'mirror_plaza',
      locationName: '镜心广场',
      title: '冬日暖灯聚会',
      subtitle: '镜心广场限季轻量互动 · 跨年冬季延续归属，零强绑定奖励',
      icon: 'fa-solid fa-snowflake',
      prompt: '冬日空气清冷透亮，镜心广场四周点起了暖橘色小串灯与灯笼，万象镜底座被映出一圈温暖光晕。你们决定怎样度过这片冬日灯影？',
      options: [
        {
          id: 'A',
          label: '各自捧一杯热饮在喷泉暖灯旁暖暖手',
          outcome: '升腾起的白雾和广场暖橘灯火混在一起，冻得微红的指尖很快暖和起来。',
          fallbackReply: '冬天站在这种暖黄的灯光旁边，手心暖了整个人都会放松下来。'
        },
        {
          id: 'B',
          label: '对着鎏金万象镜哈出白气画个小笑脸',
          outcome: '镜框边短暂浮现一圈雾气图案，很快又被广场轻轻流动的微风吹散。',
          fallbackReply: '哈哈，虽然几秒就散掉了，但刚才那一笔还挺可爱的。'
        },
        {
          id: 'C',
          label: '在广场钟声轻响时互相道一句“冬安”',
          outcome: '整点轻响掠过广场石砖，寒冷天气里多了一句被稳稳记住的问候。',
          fallbackReply: '冬安，无论外头多冷，来到这里总会觉得灯是亮着的。'
        }
      ]
    }
  };

  // 九大地点统一配置 (基于 img/map.png 与分时段地图实际构图归一化百分比)
  var LOCATIONS = [
    {
      id: 'mirror_plaza',
      name: '镜心广场',
      tagline: '小镇中央 · 星纹喷泉与鎏金万象镜',
      status: 'basic_open',
      openLabel: '基础开放',
      icon: 'fa-solid fa-compass',
      brief: '小镇正中的星纹喷泉与鎏金万象镜，光影流转间汇聚今日奇遇与消息。',
      pinX: 50,
      pinY: 44,
      box: { left: 34, top: 29, width: 32, height: 30 },
      primaryActionLabel: '进入广场',
      features: [
        { id: 'plaza_wish', label: '喷泉许愿', sub: '每日祈愿领金币', icon: 'fa-solid fa-droplet', available: true },
        { id: 'plaza_notice', label: '小镇公告', sub: '查看今日导览', icon: 'fa-solid fa-scroll', available: true },
        { id: 'plaza_chat', label: '广场聊天', sub: '和同行 Char 聊聊', icon: 'fa-solid fa-comment-dots', available: true },
        { id: 'plaza_guide', label: '快捷导览', sub: '直达已开放地点', icon: 'fa-solid fa-signs-post', available: true }
      ]
    },
    {
      id: 'shopping_street',
      name: '心动商店街',
      tagline: '粉色尖顶商铺 · 礼物与生活好物',
      status: 'open',
      openLabel: '已开放',
      icon: 'fa-solid fa-store',
      brief: '沿石阶排开的粉色尖顶商铺，涵盖礼物、生活好物、穿搭与奇遇道具，汇集万象镜商店街全品类货架。',
      pinX: 16,
      pinY: 43,
      box: { left: 2, top: 29, width: 30, height: 26 },
      primaryActionLabel: '逛逛商店街',
      features: [
        { id: 'shop_gift', label: '礼物屋', sub: '赠予同行 Char', icon: 'fa-solid fa-gift', available: true },
        { id: 'shop_life', label: '生活馆', sub: '家具与农场种子', icon: 'fa-solid fa-seedling', available: true },
        { id: 'shop_style', label: '穿搭铺', sub: '配饰与日常好物', icon: 'fa-solid fa-shirt', available: true },
        { id: 'shop_prop', label: '奇遇道具店', sub: '手账与探索小物', icon: 'fa-solid fa-wand-sparkles', available: true }
      ],
      secondaryFeatures: [
        { id: 'shop_bag', label: '我的背包', sub: '查看或赠送已购道具', icon: 'fa-solid fa-box-open', available: true },
        { id: 'shop_signin', label: '每日迎新签到', sub: '领取今日万象镜补贴', icon: 'fa-solid fa-calendar-check', available: true }
      ]
    },
    {
      id: 'afternoon_cafe',
      name: '午后咖啡馆',
      tagline: '花藤洋伞露台 · 轻量双人约会',
      status: 'open',
      openLabel: '已开放',
      icon: 'fa-solid fa-mug-hot',
      brief: '花藤攀满屋檐的露天洋伞咖啡馆，适合点杯热饮、分吃甜点，与同行 Char 悠闲聊天留影。',
      pinX: 18,
      pinY: 74,
      box: { left: 2, top: 59, width: 34, height: 28 },
      primaryActionLabel: '推门入座',
      features: [
        { id: 'cafe_drink', label: '点单饮品', sub: '现磨咖啡与花果茶', icon: 'fa-solid fa-mug-saucer', available: true },
        { id: 'cafe_dessert', label: '分享甜点', sub: '双人份甜品时光', icon: 'fa-solid fa-cake-candles', available: true },
        { id: 'cafe_chat', label: '和 Char 聊天', sub: '打开互动对话面板', icon: 'fa-solid fa-comments', available: true },
        { id: 'cafe_photo', label: '拍照留念', sub: '存至万象镜留影', icon: 'fa-solid fa-camera', available: true }
      ]
    },
    {
      id: 'gacha_house',
      name: '奇遇扭蛋屋',
      tagline: '糖果穹顶小屋 · 礼物与奇遇抽奖',
      status: 'open',
      openLabel: '已开放',
      icon: 'fa-solid fa-egg',
      brief: '兔子屋顶下的透明糖果穹顶扭蛋屋，可抽取入包好礼与奇遇故事卡，公开概率与 10 抽保底。',
      pinX: 87,
      pinY: 45,
      box: { left: 73, top: 29, width: 26, height: 28 },
      primaryActionLabel: '进入扭蛋屋',
      features: [
        { id: 'gacha_gift', label: '心动礼物机', sub: '抽取实物道具入包', icon: 'fa-solid fa-box', available: true },
        { id: 'gacha_adventure', label: '镜界奇遇机', sub: '收集奇遇图鉴卡', icon: 'fa-solid fa-star', available: true },
        { id: 'gacha_odds', label: '概率与保底', sub: '公开公示规则', icon: 'fa-solid fa-list-check', available: true },
        { id: 'gacha_history', label: '抽取记录', sub: '查看可靠存档', icon: 'fa-solid fa-clock-rotate-left', available: true }
      ]
    },
    {
      id: 'four_seasons_garden',
      name: '四季花园',
      tagline: '樱影凉亭花圃 · 采花制束与花语纪念',
      status: 'open',
      openLabel: '已开放',
      icon: 'fa-solid fa-leaf',
      brief: '白纱凉亭与花圃喷泉坐落在樱花树影间，每天可免费采集花材，亲手搭配花束赠予同行 Char。',
      pinX: 16,
      pinY: 14,
      box: { left: 4, top: 5, width: 27, height: 19 },
      primaryActionLabel: '进入花园',
      features: [
        { id: 'garden_collect', label: '采集花材', sub: '每日免费 3 次', icon: 'fa-solid fa-seedling', available: true },
        { id: 'garden_craft', label: '制作花束', sub: '3份花材定制搭配', icon: 'fa-solid fa-fan', available: true },
        { id: 'garden_basket', label: '花材收纳篮', sub: '查看花材与花语', icon: 'fa-solid fa-basket-shopping', available: true },
        { id: 'garden_mementos', label: '花束与纪念', sub: '赠礼或查看花语卡', icon: 'fa-solid fa-heart', available: true }
      ]
    },
    {
      id: 'starlight_park',
      name: '星光游乐场',
      tagline: '星辰摩天轮 · 抓娃娃机 · 梦幻木马',
      status: 'open',
      openLabel: '已开放',
      icon: 'fa-solid fa-ferris-wheel',
      brief: '金色星辰摩天轮与旋转木马点亮小镇夜空，可体验抓娃娃机、星愿摩天轮三幕双人互动与梦幻旋转木马，也可直达游戏大厅。',
      pinX: 86,
      pinY: 72,
      box: { left: 69, top: 57, width: 30, height: 30 },
      primaryActionLabel: '进入游乐场',
      features: [
        { id: 'park_claw', label: '抓娃娃机', sub: '20 金币 · 概率抓取与赠礼', icon: 'fa-solid fa-trophy', available: true },
        { id: 'park_ferris', label: '星愿摩天轮', sub: '30 金币 · 三幕双人互动', icon: 'fa-solid fa-ferris-wheel', available: true },
        { id: 'park_carousel', label: '梦幻旋转木马', sub: '10 金币 · 主题座位与纪念', icon: 'fa-solid fa-horse', available: true },
        { id: 'park_minigame', label: '前往游戏大厅', sub: '复用现有小游戏', icon: 'fa-solid fa-dice', available: true, externalApp: 'gameHall' }
      ]
    },
    {
      id: 'starwish_station',
      name: '星愿列车站',
      tagline: '紫晶蒸汽钟楼 · 四大梦境站台',
      status: 'available',
      openLabel: '已开放',
      icon: 'fa-solid fa-train',
      brief: '奶油白与淡粉色筑起的梦幻车站，香槟金钟表在星光下轻响。挑选同行 Char 与远方目的地，购票登上梦境列车并寄回旅行明信片。',
      pinX: 52,
      pinY: 13,
      box: { left: 33, top: 4, width: 37, height: 21 },
      primaryActionLabel: '进入列车站',
      features: [
        { id: 'station_dest', label: '选择目的地', sub: '30 金币 · 四处远方站台', icon: 'fa-solid fa-map-location-dot', available: true },
        { id: 'station_tickets', label: '我的车票', sub: '查看车票与未完成旅程', icon: 'fa-solid fa-ticket-simple', available: true },
        { id: 'station_postcards', label: '旅行明信片', sub: '查看已珍藏的沿途回忆', icon: 'fa-solid fa-envelope-open-text', available: true },
        { id: 'station_char', label: '选择同行者', sub: '切换一起乘车的 Char', icon: 'fa-solid fa-user-group', available: true }
      ]
    },
    {
      id: 'mirror_gallery',
      name: '镜中留影馆',
      tagline: '琉璃拱窗画廊 · 留影、花语、湖畔、游乐与明信片',
      status: 'collection_link',
      openLabel: '收藏入口',
      icon: 'fa-solid fa-images',
      brief: '珍藏你在万象镜小镇拍下的场景留影、花语纪念、湖畔纪念、游乐场纪念、旅行明信片与奇遇卡片，并可快速前往成就馆与恋爱记。',
      pinX: 87,
      pinY: 18,
      box: { left: 72, top: 7, width: 27, height: 22 },
      primaryActionLabel: '查看收藏馆',
      features: [
        { id: 'gal_photos', label: '留影与明信片', sub: '咖啡馆/花语/湖畔/游乐/旅行', icon: 'fa-solid fa-image', available: true },
        { id: 'gal_codex', label: '奇遇图鉴', sub: '查看已收集奇遇', icon: 'fa-solid fa-book-open', available: true },
        { id: 'gal_achievement', label: '前往成就馆', sub: '复用既有成就系统', icon: 'fa-solid fa-award', available: true },
        { id: 'gal_lovediary', label: '前往恋爱记', sub: '查看独立恋爱档案', icon: 'fa-solid fa-heart', available: true }
      ]
    },
    {
      id: 'lakeside_walk',
      name: '湖畔步道',
      tagline: '睡莲河道木栈 · 双人散步与心意分支',
      status: 'open',
      openLabel: '已开放',
      icon: 'fa-solid fa-water',
      brief: '白鹅游弋在睡莲河道间，木栈道与粉色小船静静停泊，可邀请同行 Char 沿湖漫步、触发偶遇并珍藏纪念。',
      pinX: 57,
      pinY: 82,
      box: { left: 39, top: 69, width: 34, height: 26 },
      primaryActionLabel: '开始漫步',
      features: [
        { id: 'lake_stroll', label: '一起散步', sub: '沿湖触发偶遇事件', icon: 'fa-solid fa-person-walking', available: true },
        { id: 'lake_bench', label: '湖边长椅', sub: '继续或回顾散步', icon: 'fa-solid fa-couch', available: true },
        { id: 'lake_mementos', label: '我们的湖畔纪念', sub: '查看已收藏时刻', icon: 'fa-solid fa-bookmark', available: true },
        { id: 'lake_char', label: '选择同行 Char', sub: '切换散步同伴', icon: 'fa-solid fa-user-group', available: true }
      ]
    }
  ];

  // V2.2 四季花园：八种基础花材（严禁使用中文名作主键）
  var DAILY_COLLECTION_LIMIT = 3;
  var FLOWERS = [
    { id: 'rose', name: '玫瑰', meaning: '心动', seasons: ['spring', 'summer'], color: '#d96b8f', icon: 'fa-solid fa-rose' },
    { id: 'tulip', name: '郁金香', meaning: '告白', seasons: ['spring'], color: '#e67e6b', icon: 'fa-solid fa-seedling' },
    { id: 'sunflower', name: '向日葵', meaning: '陪伴', seasons: ['summer'], color: '#e0a538', icon: 'fa-solid fa-sun' },
    { id: 'daisy', name: '雏菊', meaning: '纯真', seasons: ['spring', 'summer'], color: '#d8b75c', icon: 'fa-solid fa-bahai' },
    { id: 'lavender', name: '薰衣草', meaning: '守候', seasons: ['summer', 'autumn'], color: '#8f72bd', icon: 'fa-solid fa-wand-magic-sparkles' },
    { id: 'cherry_blossom', name: '樱花', meaning: '珍惜', seasons: ['spring'], color: '#eb9fc1', icon: 'fa-solid fa-fan' },
    { id: 'hydrangea', name: '绣球花', meaning: '团圆', seasons: ['summer', 'autumn'], color: '#6b9ac4', icon: 'fa-solid fa-cloud' },
    { id: 'lily_of_the_valley', name: '铃兰', meaning: '幸福', seasons: ['spring'], color: '#6ca886', icon: 'fa-solid fa-bell' }
  ];

  var SEASON_THEMES = {
    spring: { key: 'spring', label: '春季', decor: '樱风花廊 · 当季盛放', icon: 'fa-solid fa-fan' },
    summer: { key: 'summer', label: '夏季', decor: '晴光花圃 · 阳光正好', icon: 'fa-solid fa-sun' },
    autumn: { key: 'autumn', label: '秋季', decor: '浅秋花径 · 微风清朗', icon: 'fa-solid fa-leaf' },
    winter: { key: 'winter', label: '冬季', decor: '温室暖灯 · 轻雪花房', icon: 'fa-solid fa-snowflake' }
  };

  var BOUQUET_WRAPPINGS = [
    { id: 'sakura_pink', name: '樱花粉', hex: '#f5c7dc' },
    { id: 'cream_white', name: '奶油白', hex: '#faf3e6' },
    { id: 'lavender_mist', name: '淡紫色', hex: '#ddd0ef' }
  ];

  var BOUQUET_RIBBONS = [
    { id: 'champagne_gold', name: '香槟金', hex: '#c9a255' },
    { id: 'rose_pink', name: '玫瑰粉', hex: '#d97ba5' }
  ];

  // V2.2 湖畔步道：六个基础情境与各三项明确分支
  var LAKESIDE_EVENTS = [
    {
      id: 'swan_visit',
      title: '天鹅靠岸',
      desc: '散步途中，两只白鹅沿着睡莲水纹慢慢游近木栈道，在水面漾开一圈安静的涟漪。',
      periodBias: { day: 3, morning: 1.5, dusk: 1, night: 0.7 },
      options: [
        { id: 'A', label: '停下来静静观察', outcome: '你们放轻了脚步，看着水波贴着木栈慢慢晃动，直到两只天鹅转过桥影。', fallbackReply: '难得看它们靠得这么近，连水面都变得很安静。' },
        { id: 'B', label: '和 Char 聊聊天鹅', outcome: '你们低声聊起湖水清澈时的倒影，天鹅轻轻振了一下翅膀又缓缓游远。', fallbackReply: '它们看起来很习惯这里有人散步，倒像是在巡视湖面。' },
        { id: 'C', label: '继续沿湖散步', outcome: '你们朝湖面点了点头，沿着铺满花影的木栈继续往前走。', fallbackReply: '走吧，前面那段木栈刚好能看到整片湖面。' }
      ]
    },
    {
      id: 'sudden_rain',
      title: '突然的小雨',
      desc: '湖风忽然带起一点微凉的水汽，细密的雨丝轻轻落在水面和木栈栏杆上。',
      periodBias: { morning: 1.5, day: 1.5, dusk: 1.5, night: 1.5 },
      options: [
        { id: 'A', label: '一起去屋檐下躲雨', outcome: '你们快步走到不远处的木亭屋檐下，听着雨点敲在瓦片与睡莲叶上。', fallbackReply: '幸好亭子就在前面几步，先在这里等雨小一点吧。' },
        { id: 'B', label: '慢慢走回长椅附近', outcome: '小雨并不急，你们沿原路折返到遮篷旁的长椅边，拍落肩上的细碎雨珠。', fallbackReply: '这样走回来刚刚好，风里都是雨后的草木气味。' },
        { id: 'C', label: '问问 Char 想怎么办', outcome: '你停下步子看向身边的同行伙伴，把决定交给彼此此刻的心情。', fallbackReply: '雨不大，不如找个避风的屋檐歇几分钟，看雨停了再走。' }
      ]
    },
    {
      id: 'drifting_bottle',
      title: '湖上的漂流瓶',
      desc: '一只透明玻璃瓶随着平缓水流轻轻撞上木桩，里面卷着一张写有小镇寄语的淡蓝纸条。',
      periodBias: { morning: 1.5, day: 1.5, dusk: 1.5, night: 1.5 },
      options: [
        { id: 'A', label: '看看瓶中的纸条', outcome: '纸条上只写着一句简单的祝愿：「愿经过湖边的人今天也能睡个好觉。」随后你们把瓶盖重新拧紧。', fallbackReply: '上面只有一句祝愿，写下它的人当时大概心情不错。' },
        { id: 'B', label: '猜猜是谁留下的', outcome: '你们借着玻璃瓶上的旧麻绳和折痕，猜起也许是小镇某位早起散步的旅人放下的。', fallbackReply: '说不定就是以前某个傍晚来吹风的人留下的小记号。' },
        { id: 'C', label: '让它继续漂向远方', outcome: '你们没有打扰这份偶然的心意，轻轻拨开岸边水草，看小瓶随水波慢慢漂走。', fallbackReply: '就让它接着顺着水流去下一段河道吧。' }
      ]
    },
    {
      id: 'sunset_bench',
      title: '黄昏长椅',
      desc: '你们在湖边木长椅并肩坐下，远处的云层和水面一点点染上柔暖的琥珀光色。',
      periodBias: { dusk: 3, afternoon: 1, day: 1, morning: 0.8, night: 0.9 },
      options: [
        { id: 'A', label: '一起安静看湖', outcome: '谁也没有急着说话，晚风拂过衣角，湖面的光影随着波纹慢慢流动。', fallbackReply: '这样坐着吹一会儿风，时间好像也跟着慢下来了。' },
        { id: 'B', label: '问问 Char 今天的心情', outcome: '你转过头轻声问起今天过得怎么样，伴着湖畔微风交换了今天的片刻感受。', fallbackReply: '能一起出来走这一趟，比一直待在室内舒服多了。' },
        { id: 'C', label: '邀请 Char 拍照', outcome: '你们记住这一刻的光线与湖水角度，在心底为今晚的散步按下一声轻快门。', fallbackReply: '好啊，这个方向刚好把湖面和树影一起收进去。' }
      ]
    },
    {
      id: 'water_starlight',
      title: '水面的星光',
      desc: '夜色映在平静的湖面上，岸边暖灯与天上微小的星光一同落进水波里。',
      periodBias: { night: 3, dusk: 1.5, morning: 0.7, day: 0.6 },
      options: [
        { id: 'A', label: '许下一个愿望', outcome: '你看着水面上晃动的碎光在心里默念了一个心愿，夜风恰好轻轻掠过湖面。', fallbackReply: '愿望自己留着就好，说不定明天醒来就灵验了。' },
        { id: 'B', label: '问 Char 想到了什么', outcome: '你好奇地看向同行伙伴，对方也正望向湖中央倒映的点点光亮。', fallbackReply: '在想水里的光一晃一晃的，很像之前在广场看到的那盏灯。' },
        { id: 'C', label: '记住这一刻', outcome: '你们并肩站在栏杆边多停留了一分钟，让湖水的回响和夜风留在今天的结尾。', fallbackReply: '嗯，这一段路很安静，我会记得今天来过这里。' }
      ]
    },
    {
      id: 'cat_encounter',
      title: '偶遇小猫',
      desc: '木栈拐角的石阶上蹲着一只三花小猫，竖起耳朵好奇地打量着走近的你们。',
      periodBias: { morning: 1.5, day: 1.5, dusk: 1.5, night: 1.5 },
      options: [
        { id: 'A', label: '轻声和它打招呼', outcome: '你蹲低身子轻轻唤了一声，小猫慢悠悠地眨了眨眼，甩着尾巴凑近嗅了嗅。', fallbackReply: '它居然没有立刻跑开，看来这里平时很受照顾。' },
        { id: 'B', label: '与 Char 一起远远观察', outcome: '你们保持着礼貌的距离看它理毛打盹，生怕声音太大惊动了这只湖边小住客。', fallbackReply: '隔着几步看它晒风就挺好的，省得吓着它。' },
        { id: 'C', label: '不打扰它，继续散步', outcome: '你们放轻脚步绕开石阶继续往前，回头时小猫仍安稳地缩在角落里。', fallbackReply: '让它接着歇着吧，我们继续走完前面那一段。' }
      ]
    }
  ];

  // V2.3 星光游乐场：三项设施集中配置与明确公开概率表
  var CLAW_CONFIG = {
    cost: 20,
    successRate: 0.6,
    missRate: 0.4,
    plushies: [
      { id: 'star_bunny', name: '星星兔', rarity: 'common', rarityLabel: '普通', weight: 25, icon: 'fa-solid fa-star', color: '#f3b7d2', desc: '抱着闪耀小星星的软绒垂耳兔玩偶' },
      { id: 'cloud_bear', name: '云朵熊', rarity: 'common', rarityLabel: '普通', weight: 25, icon: 'fa-solid fa-cloud', color: '#8ab7e2', desc: '蓬松棉花糖般温柔柔软的小白熊玩偶' },
      { id: 'pink_cat', name: '草莓猫', rarity: 'common', rarityLabel: '普通', weight: 25, icon: 'fa-solid fa-cat', color: '#e67d96', desc: '系着草莓红丝带蝴蝶结的粉色小猫玩偶' },
      { id: 'moon_fox', name: '月亮狐', rarity: 'rare', rarityLabel: '稀有', weight: 10, icon: 'fa-solid fa-moon', color: '#8e73cc', desc: '尾巴缀着弯月吊坠的银紫小狐狸玩偶' },
      { id: 'lavender_deer', name: '薰衣草鹿', rarity: 'rare', rarityLabel: '稀有', weight: 10, icon: 'fa-solid fa-spa', color: '#a584d8', desc: '自带淡淡薰衣草清香的林间小鹿玩偶' },
      { id: 'dream_whale', name: '星梦鲸', rarity: 'special', rarityLabel: '特别', weight: 5, icon: 'fa-solid fa-fish-fins', color: '#5b9cd2', desc: '游弋在星海微光中的特别款星梦鲸玩偶' }
    ]
  };

  var FERRIS_CONFIG = {
    cost: 30,
    acts: [
      {
        actNumber: 1,
        shortTitle: '缓缓升起',
        title: '第一幕 · 缓缓升起',
        prompt: '星愿摩天轮的透明座舱轻轻合上，随着柔和铃声离开站台，游乐场彩色灯串在脚下渐次铺开。',
        options: [
          { id: 'A', label: '贴近玻璃看小镇灯光', outcome: '你俯身靠向透明观景窗，镜心广场与商店街的暖灯像撒落在地面的星粒。', fallbackReply: '高度慢慢上去之后，连平时走过的街道都显得特别安静。' },
          { id: 'B', label: '和 Char 聊起今天逛过的地方', outcome: '你们数着一路经过的咖啡馆、花园与木栈道，把今日的路线重新拼了一遍。', fallbackReply: '听你这么一说，才发现今天不知不觉逛了这么多地方。' },
          { id: 'C', label: '安静靠在座椅上吹吹晚风', outcome: '微微打开的通风窗送来清爽的风，座舱在平稳的轻响里越升越高。', fallbackReply: '这样稳稳升上去的感觉还挺舒服的，不急着往下看也很好。' }
        ]
      },
      {
        actNumber: 2,
        shortTitle: '抵达最高点',
        title: '第二幕 · 抵达最高点',
        prompt: '座舱停在星愿摩天轮的最高点，整座镜中小镇与湖面星光尽收眼底，夜风轻敲着观景窗。',
        options: [
          { id: 'A', label: '指给 Char 看远处的湖畔与广场', outcome: '顺着你指的方向，能清楚望见睡莲湖面反射出的水波与镜心喷泉的微光。', fallbackReply: '从这里看过去，连湖边的树影都排得很整齐。' },
          { id: 'B', label: '在最高点悄悄许一个心愿', outcome: '你闭上眼停留了几秒，把此刻最安稳的心愿留在高空的风声里。', fallbackReply: '愿望不用说出来也没关系，在最高点停留的这一刻已经算数的。' },
          { id: 'C', label: '轻声问 Char 此刻在想什么', outcome: '你转头看向同坐一侧的同行伙伴，座舱在最高点轻晃着等待回音。', fallbackReply: '在想从这么高的地方往下看，灯火真亮，能一起坐这一趟挺好的。' }
        ]
      },
      {
        actNumber: 3,
        shortTitle: '慢慢降落',
        title: '第三幕 · 慢慢降落',
        prompt: '座舱顺着金色弧线缓缓下降，旋转木马的音乐声重新变得清晰，一段高空时光即将回到地面。',
        options: [
          { id: 'A', label: '约定下次还要一起再来', outcome: '你们看着越来越近的站台灯光，把星愿摩天轮留作下次逛小镇时的新约定。', fallbackReply: '好啊，下次挑个不同时段再坐一次，看到的景色应该又不一样。' },
          { id: 'B', label: '把刚才看到的夜景记在心里', outcome: '随着座舱稳稳落回地面站台，高空那几分钟的宁静光线被妥帖收好。', fallbackReply: '刚才最高点那一片灯火确实很漂亮，我会记得的。' },
          { id: 'C', label: '向身边的 Char 道一声谢谢陪伴', outcome: '舱门缓缓开启，晚风迎面吹来，这一圈平稳的摩天轮之旅画下温柔句点。', fallbackReply: '不用客气，能陪你上来吹吹风看夜景，我也觉得很放松。' }
        ]
      }
    ]
  };

  var CAROUSEL_CONFIG = {
    cost: 10,
    seats: [
      { id: 'moon_white_horse', name: '月光白马', desc: '垂着银色流苏缰绳的典雅白马', icon: 'fa-solid fa-horse' },
      { id: 'sakura_unicorn', name: '樱花独角兽', desc: '鬃毛间点缀樱花瓣的幻彩独角兽', icon: 'fa-solid fa-wand-magic-sparkles' },
      { id: 'star_pumpkin', name: '星河南瓜车', desc: '嵌着星纹铜灯的双人南瓜座驾', icon: 'fa-solid fa-star' }
    ],
    moods: [
      { id: 'gentle_romantic', name: '温柔浪漫', hint: '灯影柔和、节奏舒缓' },
      { id: 'lively_joy', name: '活泼欢乐', hint: '旋律轻快、色彩明亮' },
      { id: 'quiet_dream', name: '安静梦幻', hint: '星光微闪、氛围沉静' }
    ]
  };

  // V2.4 星愿列车站：统一票价、氛围时刻牌与四大独立目的地三阶段剧情
  var TRAIN_CONFIG = {
    ticketPrice: 30,
    stageCount: 3,
    timetablePreview: [
      { code: '08:20', name: '晨花慢车', destId: 'sakura_valley', destName: '樱雾花谷', platform: '一号花风站台' },
      { code: '14:00', name: '潮汐特快', destId: 'moonlight_coast', destName: '月光海岸', platform: '二号灯塔站台' },
      { code: '19:30', name: '星尘夜车', destId: 'starry_observatory', destName: '星眠天文台', platform: '三号穹顶站台' },
      { code: '21:15', name: '浮云专列', destId: 'cloud_town', destName: '云端小镇', platform: '四号钟楼站台' }
    ],
    presetMessages: [
      '风吹过车窗的时候，这一段路刚刚好很温柔。',
      '把今天的风景折进车票里，留给下次再翻开。',
      '谢谢你陪我坐完这一趟列车，路上风景很值得。',
      '记下这一站的光影和微风，愿往后的日子也顺意。'
    ]
  };

  var TRAIN_DESTINATIONS = [
    {
      id: 'sakura_valley',
      name: '樱雾花谷',
      subtitle: '春日 · 花海 · 柔风',
      visualDesc: '粉白花树、山谷、小桥与飘落花瓣',
      coreEvent: '寻找传说中的幸运花',
      icon: 'fa-solid fa-fan',
      accentHex: '#df78a5',
      themeClass: 'is-dest-sakura_valley',
      stage1: {
        shortTitle: '列车启程',
        title: '第一阶段 · 驶离站台前往樱雾花谷',
        prompt: '星愿列车缓缓驶离奶油色站台，小镇的灯火与花圃在车窗后慢慢远去，暖风带着淡淡花香吹进车厢。',
        options: [
          { id: 'A', label: '和 Char 一起望向窗外', outcome: '你们并排靠向复古木框车窗，看小镇屋顶逐渐融进春日晨雾般的浅粉色山线里。', fallbackReply: '车开得很稳，外面的树影一直往后退，换个地方吹吹风也不错。' },
          { id: 'B', label: '问 Char 对这次旅行有什么期待', outcome: '车轮在铁轨上敲出均匀的节拍，你侧过头问起对这趟花谷之行的想法。', fallbackReply: '听说山谷里平时很安静，刚好可以不用赶时间，慢慢看一遍花。' },
          { id: 'C', label: '分享自己为什么选择樱雾花谷', outcome: '你轻轻展开手中的星形车票，说起想在春风和花瓣之间走一段悠闲小桥的心情。', fallbackReply: '挑这个季节去花谷确实合适，一路过去应该都不会太晒。' }
        ]
      },
      stage2: {
        shortTitle: '沿途奇遇',
        title: '第二阶段 · 窗外的樱雾花瓣雨',
        prompt: '列车转过一道柔和的山谷弯道，半开的铜框车窗外忽然飘过漫天粉白花瓣雨，几片轻落在小桌的茶杯旁。',
        options: [
          { id: 'A', label: '接住一片飘进车窗的花瓣', outcome: '你伸手接住一枚带着微凉水汽的花瓣，放在车票边缘仔细端详它的淡粉纹路。', fallbackReply: '花瓣居然一路飘到了车厢里，山谷离我们应该不远了。' },
          { id: 'B', label: '指给 Char 看山坡成片的花海', outcome: '远方山坡一层层铺开浅白与樱红，木桥的轮廓在薄雾后若隐若现。', fallbackReply: '整片山坡都亮起来了，比车站宣传画上看到的还宽阔。' },
          { id: 'C', label: '安静听风铃和列车轻微摇晃声', outcome: '车厢顶上的黄铜风铃随着节奏清脆作响，花瓣擦过玻璃发出沙沙轻响。', fallbackReply: '连风声都变得轻了，这样坐车看花瓣飘过去很放松。' }
        ]
      },
      stage3: {
        shortTitle: '抵达花谷',
        title: '第三阶段 · 樱雾花谷寻找幸运花',
        prompt: '列车停靠在青石小站，你们走上横跨花溪的木桥。传闻在深谷花海之间藏着一朵罕见的五瓣幸运花。',
        options: [
          { id: 'A', label: '沿着木桥慢慢欣赏花海', outcome: '你们不紧不慢地走过拱形木桥，看花影随柔风轻轻起伏，连时间都放慢了脚步。', fallbackReply: '不一定要立刻找到什么，光是把这片花谷走完一遍就已经很值了。' },
          { id: 'B', label: '与 Char 一起沿花径寻找幸运花', outcome: '你们分工细看石阶两侧茂密的花丛，终于在溪水转弯处发现了一株格外澄亮的五瓣花。', fallbackReply: '看那边石缝旁边那朵，花瓣数得清清楚楚，真让你找着了。' },
          { id: 'C', label: '在花谷木栏边留下一句祝福', outcome: '你在随身携带着的小木牌上写下今天的心愿，看它迎着温暖花风轻轻摆动。', fallbackReply: '把祝福留在这里挺好的，下次如果再来也能顺便看看。' }
        ]
      }
    },
    {
      id: 'moonlight_coast',
      name: '月光海岸',
      subtitle: '海浪 · 灯塔 · 月光',
      visualDesc: '月色海面、贝壳、白色灯塔',
      coreEvent: '在海边留下一个愿望',
      icon: 'fa-solid fa-water',
      accentHex: '#5e8fc8',
      themeClass: 'is-dest-moonlight_coast',
      stage1: {
        shortTitle: '列车启程',
        title: '第一阶段 · 驶离站台前往月光海岸',
        prompt: '夜行蒸汽列车轻鸣一声离开站台，远处城镇灯海退到视野边缘，空气里逐渐浮出微咸清冽的海风气息。',
        options: [
          { id: 'A', label: '和 Char 一起望向窗外', outcome: '你们看着铁路两旁的路灯逐一略过，窗玻璃上映出微暗海平面的银色边界。', fallbackReply: '才刚出站没多久，空气里已经隐约有海风的味道了。' },
          { id: 'B', label: '问 Char 对这次旅行有什么期待', outcome: '车厢暖灯把桌面照成温柔的金铜色，你问起同行伙伴到海边后最想做什么。', fallbackReply: '听听海浪拍岸的声音吧，晚上站在海边比白天更静一些。' },
          { id: 'C', label: '分享自己为什么选择月光海岸', outcome: '你聊起想去看看海边那座白色灯塔，听听夜潮褪去时贝壳轻碰的声音。', fallbackReply: '灯塔夜里亮起来应该很显眼，选海岸线这班车挺合适的。' }
        ]
      },
      stage2: {
        shortTitle: '沿途奇遇',
        title: '第二阶段 · 驶过月色海上长桥',
        prompt: '列车驶上连接陆地与海角的海上长桥，整片月色海面在两侧铺开，浪花在桥墩边碎成一片片银白光点。',
        options: [
          { id: 'A', label: '推开一条车窗缝听浪声', outcome: '凉爽海风立刻涌进车厢，潮水一遍遍抚过长桥石墩的浑厚回响格外清晰。', fallbackReply: '风虽然有点凉，但听着整片海在车轮下面响起来，感觉很开阔。' },
          { id: 'B', label: '与 Char 数起远方的航标光点', outcome: '远海尽头每隔几秒亮起一束柔和灯塔光柱，你们顺着光柱方向望向白色海岬。', fallbackReply: '那边一明一暗的光点就是灯塔了，看来再过几分钟就到站。' },
          { id: 'C', label: '看月光在水面上晃成一条银路', outcome: '玻璃倒映着海面细碎波纹，仿佛整列列车正平稳行驶在月色铺就的轨道上。', fallbackReply: '这一段海上长桥真稳，从窗边看下去几乎分不清天和水线的交界。' }
        ]
      },
      stage3: {
        shortTitle: '抵达海岸',
        title: '第三阶段 · 月光海岸留下愿望',
        prompt: '列车停在白色灯塔旁的木站台。潮水退下后，细软沙滩上留着几枚被月光照亮的螺旋贝壳。',
        options: [
          { id: 'A', label: '并肩坐在防波堤上聆听海浪', outcome: '潮水有节奏地卷过贝壳与细沙，海风带走了这一天的疲惫与喧嚣。', fallbackReply: '光是在海边坐几分钟听浪声，心里那些杂念就少了一大半。' },
          { id: 'B', label: '与 Char 沿海岸线走向白色灯塔', outcome: '你们踩着松软细沙走近洁白高耸的灯塔底座，灯光一圈圈扫过深蓝海面。', fallbackReply: '站到灯塔下面才觉得它比远处看着还高，海风在这边吹得很干爽。' },
          { id: 'C', label: '用贝壳在湿润沙滩写下愿望', outcome: '你拾起一枚洁白长贝壳，在潮水还没漫上来的沙滩安静写下一个简短心愿。', fallbackReply: '趁海浪还没冲过来，这几个字已经先留在今晚的月光下面了。' }
        ]
      }
    },
    {
      id: 'starry_observatory',
      name: '星眠天文台',
      subtitle: '星空 · 流星 · 宇宙',
      visualDesc: '圆顶天文台、星云、望远镜',
      coreEvent: '一起寻找一颗特别的星星',
      icon: 'fa-solid fa-meteor',
      accentHex: '#7d68c4',
      themeClass: 'is-dest-starry_observatory',
      stage1: {
        shortTitle: '列车启程',
        title: '第一阶段 · 驶离站台前往星眠天文台',
        prompt: '星尘夜车顺着高架铁轨缓缓攀升，小镇暖灯化作脚下点点琥珀，头顶的夜空比平地澄澈了许多。',
        options: [
          { id: 'A', label: '和 Char 一起望向窗外', outcome: '你们仰望越升越高后渐渐清晰起来的银河淡影，群星贴着深蓝天鹅绒幕布慢慢亮起。', fallbackReply: '海拔上去以后云层好像变薄了，今晚的星星比小镇里看得清楚得多。' },
          { id: 'B', label: '问 Char 对这次旅行有什么期待', outcome: '车厢壁灯调成了柔和的暗琥珀光，你好奇地问起对方有没有特别想看的星象。', fallbackReply: '能用天文台的望远镜仔细看看星云就已经不错了，有流星的话更好。' },
          { id: 'C', label: '分享自己为什么选择星眠天文台', outcome: '你说起平时在小镇抬头只能见到几颗亮星，一直想来山顶看看完整的夜空。', fallbackReply: '脱离地面灯光之后确实安静得多，今晚挑这里来对了。' }
        ]
      },
      stage2: {
        shortTitle: '沿途奇遇',
        title: '第二阶段 · 掠过车窗的流星弧线',
        prompt: '列车穿过云雾弥漫的山脊隧道，出隧道的一瞬，窗外深空恰巧划过一道银白色流星尾迹。',
        options: [
          { id: 'A', label: '立刻轻声提醒 Char 看向窗外', outcome: '流星在视野里停留了两秒才缓缓熄灭，你们刚好一起接住了同一道转瞬微光。', fallbackReply: '我看到了，就在那片暗云边上划过去，反应还真快。' },
          { id: 'B', label: '在流星落下前默默记下画面', outcome: '你没有急着眨眼，把那条清亮细长的光迹与列车窗框一起收进脑海。', fallbackReply: '居然在半路上就撞见一颗，说明今晚山顶上的观测条件一定很稳。' },
          { id: 'C', label: '问 Char 是否相信流星的祝愿', outcome: '夜雾在窗外散去，圆顶天文台静静矗立在不远处的山巅，星云在它上方流转。', fallbackReply: '信不信另说，碰见难得的景色顺手许个心愿也没什么坏处。' }
        ]
      },
      stage3: {
        shortTitle: '抵达天文台',
        title: '第三阶段 · 星眠天文台寻找特别的星',
        prompt: '圆顶天文台的观测窗缓缓打开，黄铜主望远镜正对深邃星云，漫天繁星如碎钻铺展眼前。',
        options: [
          { id: 'A', label: '通过黄铜望远镜一起观察星座', outcome: '调整好目镜焦距后，原本肉眼模糊的星团顿时分明起来，泛出淡蓝与浅金微辉。', fallbackReply: '从镜头里看过去密度高了好多，平时只觉得是雾的地方全是一颗颗星。' },
          { id: 'B', label: '靠着栏杆分享关于星星的想法', outcome: '你们看着远光经过漫长光年才落进眼底的星光，聊起各自眼中最安稳的一颗亮星。', fallbackReply: '知道那颗星光出发的时候比小镇还要早，突然觉得很多小烦恼没那么沉了。' },
          { id: 'C', label: '并肩仰望天幕安静等待下一颗流星', outcome: '山巅夜风微凉却极清澈，你们选好一片最开阔的天区，一起静候群星之间新的光点。', fallbackReply: '不用刻意数时间，反正这班回程车不赶，我们可以再多看一会儿。' }
        ]
      }
    },
    {
      id: 'cloud_town',
      name: '云端小镇',
      subtitle: '云海 · 钟楼 · 梦幻街道',
      visualDesc: '漂浮云层、复古街灯、彩色屋顶',
      coreEvent: '在陌生小镇寻找一份惊喜',
      icon: 'fa-solid fa-cloud-moon',
      accentHex: '#c69348',
      themeClass: 'is-dest-cloud_town',
      stage1: {
        shortTitle: '列车启程',
        title: '第一阶段 · 驶离站台前往云端小镇',
        prompt: '浮云专列迎着轻风跃上高架天桥，窗外地面渐渐被蓬松雪白的云絮遮掩，车厢像漂浮在半空航行。',
        options: [
          { id: 'A', label: '和 Char 一起望向窗外', outcome: '你们贴近玻璃看着软绵绵的云海贴着轨道翻涌，偶尔露出下方一点点微光。', fallbackReply: '没想到铁轨还能一直修进云里去，从窗口往下看全都是软云层。' },
          { id: 'B', label: '问 Char 对这次旅行有什么期待', outcome: '你靠在柔软丝绒座椅里，好奇这座建在云海之上的彩色屋顶小镇究竟是什么模样。', fallbackReply: '听说那里的钟楼会敲很好听的整点铃，先去随便逛逛街头看看吧。' },
          { id: 'C', label: '分享自己为什么选择云端小镇', outcome: '你说起想在一个陌生又温柔的云端街道漫步，看看复古街灯与彩色小房子。', fallbackReply: '偶尔离开熟悉的小镇去陌生的街巷转转，确实能换个好心情。' }
        ]
      },
      stage2: {
        shortTitle: '沿途奇遇',
        title: '第二阶段 · 穿过云海看见高耸钟楼',
        prompt: '列车穿过一道厚实的金色云墙，云缝散开时，远方亮起成排复古锻铁街灯与彩色斜屋顶，高耸钟楼近在眼前。',
        options: [
          { id: 'A', label: '指向云雾后初现的钟楼尖顶', outcome: '香槟色阳光穿云而出，钟楼塔尖与铜指针一并镀上一层柔和光泽。', fallbackReply: '看到了，那座钟楼还真高，街灯一排排点亮的样子很有童话感。' },
          { id: 'B', label: '猜猜彩色屋顶下藏着什么小店', outcome: '红砖、薄荷绿与奶油黄的屋顶一路铺开，烟囱冒出细细的茶香白雾。', fallbackReply: '说不定有热可可小铺或者卖旧怀表的小店，待会儿下车顺路去瞧瞧。' },
          { id: 'C', label: '记下穿越云海时的轻盈失重感', outcome: '列车减缓速度滑入高空木制站台，阳光与云影落在车厢扶手上缓慢移动。', fallbackReply: '刚才冲出云墙那一下真漂亮，像推开了一扇藏在半空中的门。' }
        ]
      },
      stage3: {
        shortTitle: '抵达云端小镇',
        title: '第三阶段 · 在云端小镇寻找惊喜',
        prompt: '你们踏上云雾缭绕的石板长街，两侧彩色屋顶在复古街灯映照下温暖透亮，钟楼恰好传来轻脆整点报时。',
        options: [
          { id: 'A', label: '沿着彩色街道悠闲逛逛小铺', outcome: '你们拐进摆满铜铃与风车的拐角小街，在老摊位领到了两枚纪念小纸徽章作为小惊喜。', fallbackReply: '这条街的小摆件都很细致，老板顺手送的小纸徽章也蛮可爱的。' },
          { id: 'B', label: '循着铃声寻找那座复古钟楼', outcome: '穿过拱门喷泉后，你们站在仰头可见整面鎏金钟盘的广场中央，看白鸽掠过钟塔。', fallbackReply: '走近听钟声反而没有想象中那么响，倒是很沉稳好听。' },
          { id: 'C', label: '一起在云端观景台停留片刻', outcome: '观景台栏杆外就是整片翻涌云海，你们吹着高空微风把这片意外晴空稳稳记下。', fallbackReply: '站在这里往下看，云层像海一样慢慢流过去，这一趟走得很值。' }
        ]
      }
    }
  ];

  // 商店街商品目录（保留 6 件经典商品 ID，并补充分类）
  var SHOP_GOODS = [
    { id: 'item_vinyl', name: '复古黑胶唱机', price: 300, icon: 'fa-solid fa-record-vinyl', category: 'life', invCategory: 'furniture', desc: '可布置于「我们的家」，播放双人歌单，舒适度+25', condition: '放入共享背包后可在「我们的家」使用' },
    { id: 'crop_strawberry_seed', name: '甜心草莓种子 (4包)', price: 50, icon: 'fa-solid fa-seedling', category: 'life', invCategory: 'seed', desc: '可在「弯弯农场」播种收获新鲜草莓', condition: '前往弯弯农场空地播种即可' },
    { id: 'item_rug', name: '暖绒云朵毯', price: 200, icon: 'fa-solid fa-rug', category: 'life', invCategory: 'furniture', desc: '可布置于「我们的家」，提升居家舒适度+25', condition: '存入共享背包即可调用' },
    { id: 'item_sticky_notes', name: '心动便签纸 (5份)', price: 60, icon: 'fa-solid fa-note-sticky', category: 'prop', invCategory: 'study_tool', desc: '陪伴自习室灵感便签，记录专注瞬时念头', condition: '通用学习道具，可存入共享背包' },
    { id: 'crop_sunflower_seed', name: '晨光向日葵种子 (2包)', price: 80, icon: 'fa-solid fa-sun', category: 'life', invCategory: 'seed', desc: '弯弯农场种植金色花朵，收获丰厚回报', condition: '适用于弯弯农场耕作' },
    { id: 'item_frame', name: '拍立得相框', price: 150, icon: 'fa-solid fa-camera-retro', category: 'life', invCategory: 'furniture', desc: '记录旅行与自习名场面的实体相框装饰', condition: '存入共享背包留念或布置' },

    // 礼物屋新增
    { id: 'gift_music_box', name: '星尘发条音乐盒', price: 120, icon: 'fa-solid fa-music', category: 'gift', invCategory: 'gift', desc: '装有镜中小镇八音盒旋律的纪念礼，适合赠予同行 Char', condition: '可直接在背包中赠予任意 Char' },
    { id: 'gift_postcard_set', name: '手绘小镇明信片盒', price: 45, icon: 'fa-solid fa-envelope-open-text', category: 'gift', invCategory: 'gift', desc: '收录镜心广场与咖啡馆插画的 3 张套卡', condition: '可在背包送给同行 Char 提升陪伴好感记录' },
    { id: 'gift_cocoa_voucher', name: '手冲热可可兑换券', price: 35, icon: 'fa-solid fa-mug-hot', category: 'gift', invCategory: 'gift', desc: '一张暖融融的甜饮小券，冬夜或疲惫时送给 Ta', condition: '可在背包赠予同行 Char' },

    // 穿搭铺新增
    { id: 'style_velvet_ribbon', name: '月光丝绒发带', price: 90, icon: 'fa-solid fa-ribbon', category: 'style', invCategory: 'style', desc: '带有细闪星芒刺绣的缎面发饰，搭配约会心情', condition: '收藏穿搭饰品，存入共享背包' },
    { id: 'style_caramel_scarf', name: '焦糖格纹羊绒围巾', price: 140, icon: 'fa-solid fa-vest', category: 'style', invCategory: 'style', desc: '秋冬傍晚在湖畔散步时的柔软配饰', condition: '收藏穿搭饰品，存入共享背包' },

    // 奇遇道具店新增
    { id: 'prop_clear_bell', name: '晴天祈愿小铃铛', price: 75, icon: 'fa-solid fa-bell', category: 'prop', invCategory: 'prop', desc: '系在背包上的铜制微风铃，伴随探索清脆作响', condition: '探索收藏小物，可存入背包或赠礼' }
  ];

  // 午后咖啡馆菜单
  var CAFE_MENU = {
    drink: [
      { id: 'cafe_latte', name: '镜心手冲拿铁', price: 18, desc: '焦糖坚果尾韵，适合慢慢聊会儿天' },
      { id: 'cafe_oolong', name: '香草桂花乌龙', price: 15, desc: '清甜花香与焙火茶韵' },
      { id: 'cafe_peach', name: '冰摇白桃气泡', price: 16, desc: '气泡轻跳的清爽午后果饮' }
    ],
    dessert: [
      { id: 'cafe_mille', name: '双人草莓千层', price: 24, desc: '现打淡奶油配酸甜草莓果肉' },
      { id: 'cafe_pudding', name: '焦糖布丁杯', price: 20, desc: '绵密香草籽布丁配微苦焦糖' }
    ]
  };

  // 奇遇扭蛋屋双机奖池与公示概率
  var GACHA_MACHINES = {
    gift: {
      id: 'gift',
      name: '心动礼物机',
      cost: 40,
      pityLimit: 10,
      summary: '抽取实体礼物或道具直接存入共享背包；每 10 抽保底必得稀有及以上礼品。',
      pool: [
        { id: 'gift_candy', name: '樱花夹心糖罐', rarity: 'N', weight: 55, itemId: 'gacha_sakura_candy', icon: 'fa-solid fa-candy-cane', invCategory: 'gift', desc: '甜甜的樱花白桃水果硬糖' },
        { id: 'gift_bookmark', name: '鎏金流沙书签', rarity: 'R', weight: 30, itemId: 'gacha_gold_bookmark', icon: 'fa-solid fa-bookmark', invCategory: 'gift', desc: '夹在书页里会泛出微光的金属书签' },
        { id: 'gift_lantern', name: '星愿微缩夜灯', rarity: 'SR', weight: 15, itemId: 'gacha_star_lantern', icon: 'fa-solid fa-lightbulb', invCategory: 'furniture', desc: '能点亮桌面一角的玻璃星空小夜灯（稀有保底可得）' }
      ]
    },
    adventure: {
      id: 'adventure',
      name: '镜界奇遇机',
      cost: 30,
      pityLimit: 10,
      summary: '抽取小镇奇遇纪念卡片并返还小额金币；重要地点与主线剧情永不锁死于抽奖。每 10 抽保底典藏奇遇。',
      pool: [
        { id: 'adv_swan_feather', name: '湖畔白鹅的赠羽', rarity: 'N', weight: 55, coinBonus: 12, desc: '在湖边捡到一枚干净柔软的羽毛，附带 12 金币心意' },
        { id: 'adv_cafe_cat', name: '咖啡馆打盹的橘猫', rarity: 'R', weight: 30, coinBonus: 20, desc: '阳伞下蜷成一团的小猫蹭了蹭你的鞋尖，拾获 20 金币' },
        { id: 'adv_mirror_rainbow', name: '镜面折射的彩虹时刻', rarity: 'SR', weight: 15, coinBonus: 45, desc: '水雾在镜心广场上方画出双道虹光，收获 45 金币（10 抽保底）' }
      ]
    }
  };

  var _clockFn = null;
  var _txQueue = Promise.resolve();
  var _processedDrawIds = {};
  var _refundedRequestKeys = {};
  var _aiSeq = 0;
  var _openSeq = 0;
  var _typewriterTimer = null;
  var _carouselAnimTimer = null;
  var _atmosphereTimer = null;
  var _visibilityHandler = null;

  var _runtime = {
    pageEl: null,
    activeTab: 'map', // 'map' | 'bag' | 'mementos' | 'codex'
    mementoFilter: 'all', // 'all' | 'cafe_photo' | 'flower_language' | 'lakeside_walk' | 'amusement_park' | 'starwish_train' | 'seasonal_event'
    amusementSubFilter: 'all', // 'all' | 'plush' | 'ferris_wheel' | 'carousel'
    trainDestFilter: 'all', // 'all' | 'sakura_valley' | 'moonlight_coast' | 'starry_observatory' | 'cloud_town'
    timePreview: 'auto', // 'auto' | 'morning' | 'day' | 'afternoon' | 'dusk' | 'night'
    timeMenuOpen: false,
    activeCharId: null,
    fromChatNavId: '',
    fromChatCtx: null,
    uiSettings: { typewriterEnabled: true },
    lifeSettings: {
      invitationsEnabled: true,
      invitationFrequency: 'low',
      atmosphereEnabled: true,
      seasonalHintsEnabled: true,
      dndMode: false
    },
    lettersTab: 'active', // 'active' | 'deferred' | 'history'
    selectedLetterId: null,
    letterReturnTo: null,
    seasonalReturnTo: null,
    visibleNoteInviteId: null,
    suppressedNoteForSession: {},
    lastCitedEventByChar: {},
    lastGreetingBySlot: {},
    mapTransform: { x: 0, y: 0, scale: 1, initialized: false },
    boardMetrics: { baseW: 390, baseH: 585, stageW: 390, stageH: 600 },
    sheet: {
      open: false,
      locationId: null,
      subView: 'intro', // 'intro' | 'secondary' | 'plaza' | 'shop' | 'cafe' | 'gacha' | 'gallery' | 'garden' | 'lakeside' | 'park' | 'station' | 'charPicker' | 'charChat' | 'letters' | 'letterDetail' | 'lifeSettings' | 'seasonal'
      canStepBack: false,
      shopCat: 'all',
      gardenTab: 'home', // 'home' | 'collect' | 'craft' | 'basket' | 'mementos'
      craftDraft: { counts: {}, wrappingId: 'sakura_pink', ribbonId: 'champagne_gold', name: '' },
      lastCollectedFlower: null,
      lastGiftedBouquetId: null,
      lakesideView: 'home', // 'home' | 'walk' | 'mementos'
      finishedWalkId: null,
      parkView: 'hub', // 'hub' | 'claw' | 'plushies' | 'ferris' | 'carousel' | 'mementos'
      clawPos: 50,
      clawDropping: false,
      lastClawResult: null,
      lastGiftedPlushId: null,
      finishedFerrisId: null,
      carouselSeatId: 'moon_white_horse',
      carouselMoodId: 'gentle_romantic',
      carouselPlaying: false,
      lastCarouselRideId: null,
      stationView: 'hub', // 'hub' | 'tickets' | 'journey' | 'postcards'
      selectedDestId: 'sakura_valley',
      finishedJourneyId: null,
      postcardDraftMsg: '',
      charQuote: '',
      charQuoteMeta: '',
      charQuoteSource: '', // 'ai' | 'fallback' | 'offline_notice' | 'solo'
      lastAiActionDesc: '',
      lastGachaResult: null,
      gachaTab: 'gift'
    },
    confirm: {
      open: false,
      data: null // { mode: 'confirm'|'result', kind, title, sub, icon, detailHtml, confirmLabel, payload, requestId }
    },
    pendingAction: false,
    aiLoading: false,
    charBubbles: {}, // { [charScope]: { [locId]: [ { role, text, meta, ts } ] } }
    sessionId: 'sess_' + Date.now().toString(36),
    gesture: {
      pointers: {},
      dragging: false,
      pinching: false,
      moved: false,
      startX: 0,
      startY: 0,
      origX: 0,
      origY: 0,
      pinchStartDist: 0,
      pinchStartScale: 1,
      pinchMidX: 0,
      pinchMidY: 0
    },
    popHandler: null,
    keyHandler: null,
    resizeHandler: null,
    resizeObserver: null,
    pushedHistory: false
  };

  function nowMs() {
    if (typeof _clockFn === 'function') {
      var v = Number(_clockFn());
      if (!isNaN(v) && isFinite(v)) return v;
    }
    return Date.now();
  }

  function nowDate() {
    return new Date(nowMs());
  }

  function getTodayStr() {
    var d = nowDate();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'wx') + '_' + nowMs().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function runTx(fn) {
    var run = async function() {
      return await fn();
    };
    var p = _txQueue.then(run, run);
    _txQueue = p.catch(function() {});
    return p;
  }

  async function readConfig(key, fallback) {
    try {
      if (global.db && global.db.config && typeof global.db.config.get === 'function') {
        var row = await global.db.config.get(key);
        if (row && row.value !== undefined && row.value !== null) return row.value;
      }
    } catch (_) {}
    try {
      if (global.localStorage) {
        var raw = global.localStorage.getItem(key);
        if (raw !== null && raw !== undefined) return JSON.parse(raw);
      }
    } catch (_) {}
    return fallback;
  }

  async function writeConfig(key, value) {
    var dbPresent = Boolean(global.db && global.db.config && typeof global.db.config.put === 'function');
    var dbOk = false;
    var lsPresent = Boolean(global.localStorage && typeof global.localStorage.setItem === 'function');
    var lsOk = false;
    if (dbPresent) {
      try {
        await global.db.config.put({ key: key, value: value });
        dbOk = true;
      } catch (_) {
        dbOk = false;
      }
    }
    if (lsPresent) {
      try {
        global.localStorage.setItem(key, JSON.stringify(value));
        lsOk = true;
      } catch (_) {
        lsOk = false;
      }
    }
    if (dbPresent && !dbOk && !lsOk) return false;
    if (!dbPresent && lsPresent && !lsOk) return false;
    return dbOk || lsOk;
  }

  function sanitizeTextField(raw, maxCp) {
    var s = String(raw || '').replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
    var limit = maxCp || 24;
    var cps = Array.from(s);
    if (cps.length > limit) s = cps.slice(0, limit).join('');
    return s;
  }

  // ====================================================
  // 一、时段与地图计算（V3.0 解耦 realTimeSlot 与手动 timePreview）
  // ====================================================
  function getRealTimeSlotKey(dateObj) {
    var d = dateObj || nowDate();
    var h = d.getHours();
    if (h >= 5 && h <= 10) return 'morning';
    if (h >= 11 && h <= 16) return 'afternoon';
    if (h >= 17 && h <= 19) return 'dusk';
    return 'night';
  }

  function getRealTimePeriodKey(dateObj) {
    var slot = getRealTimeSlotKey(dateObj);
    return slot === 'afternoon' ? 'day' : slot;
  }

  function normalizePreviewToPeriodKey(previewMode) {
    if (!previewMode || previewMode === 'auto') return '';
    if (previewMode === 'afternoon') return 'day';
    return TIME_PERIODS[previewMode] ? previewMode : '';
  }

  function getActivePeriodInfo(previewMode) {
    var realTimeSlot = getRealTimeSlotKey(nowDate());
    var realKey = realTimeSlot === 'afternoon' ? 'day' : realTimeSlot;
    var normalizedPreview = normalizePreviewToPeriodKey(previewMode);
    var mode = normalizedPreview || realKey;
    var info = TIME_PERIODS[mode] || TIME_PERIODS.morning;
    return {
      realTimeSlot: realTimeSlot,
      realKey: realKey,
      displayKey: info.key,
      isPreview: Boolean(normalizedPreview && normalizedPreview !== realKey),
      period: info
    };
  }

  function getSeasonalYear(dateObj) {
    var d = dateObj || nowDate();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    // 跨年冬季（12 月与次年 1-2 月）以 12 月所在年份为 seasonYear
    return m <= 2 ? (y - 1) : y;
  }

  function pickTimeSlotGreeting(slotKey, dateObj) {
    var list = WELCOME_GREETINGS[slotKey] || WELCOME_GREETINGS.morning;
    var d = dateObj || nowDate();
    var dayIdx = Math.floor((d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate() + d.getHours()) % list.length);
    return list[Math.abs(dayIdx) % list.length];
  }

  function getTownAtmosphereSnapshot(previewMode) {
    var d = nowDate();
    var pInfo = getActivePeriodInfo(previewMode !== undefined ? previewMode : _runtime.timePreview);
    var slotKey = pInfo.realTimeSlot;
    var slotDef = TIME_SLOTS_V30[slotKey] || TIME_SLOTS_V30.morning;
    var season = getLocalSeasonInfo(d);
    var greeting = pickTimeSlotGreeting(slotKey, d);
    return {
      realTimeSlot: slotKey,
      realTimeSlotLabel: slotDef.label,
      realTimeSlotRange: slotDef.range,
      realPeriodKey: pInfo.realKey,
      displayKey: pInfo.displayKey,
      displayLabel: pInfo.period.label,
      isPreview: pInfo.isPreview,
      seasonKey: season.key,
      seasonYear: season.seasonYear,
      seasonLabel: season.label,
      seasonDecor: season.decor,
      greeting: greeting,
      atmosphereEnabled: Boolean(_runtime.lifeSettings && _runtime.lifeSettings.atmosphereEnabled),
      slotDef: slotDef
    };
  }

  function getLocationById(locId) {
    return LOCATIONS.find(function(l) { return l.id === locId; }) || null;
  }

  function clampMapTransform(x, y, scale, metrics) {
    var s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(scale) || 1));
    var stageW = Math.max(200, metrics.stageW || 390);
    var stageH = Math.max(240, metrics.stageH || 600);
    var scaledW = (metrics.baseW || stageW) * s;
    var scaledH = (metrics.baseH || stageH) * s;

    var minX = Math.min(0, stageW - scaledW);
    var maxX = scaledW < stageW ? (stageW - scaledW) / 2 : 0;
    var minY = Math.min(0, stageH - scaledH);
    var maxY = scaledH < stageH ? (stageH - scaledH) / 2 : 0;

    if (scaledW < stageW) minX = maxX;
    if (scaledH < stageH) minY = maxY;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
      scale: Math.round(s * 1000) / 1000
    };
  }

  function computeBoardMetrics(stageW, stageH) {
    var w = Math.max(240, Number(stageW) || 390);
    var h = Math.max(300, Number(stageH) || 600);
    var imgRatio = MAP_WIDTH / MAP_HEIGHT; // 2:3
    var stageRatio = w / h;
    var baseW, baseH;
    if (stageRatio > imgRatio) {
      baseW = w;
      baseH = w / imgRatio;
    } else {
      baseH = h;
      baseW = h * imgRatio;
    }
    return { baseW: baseW, baseH: baseH, stageW: w, stageH: h };
  }

  function centerTransformOnPoint(pinX, pinY, scale, metrics) {
    var s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(scale) || 1));
    var targetX = metrics.stageW / 2 - (metrics.baseW * (pinX / 100)) * s;
    var targetY = metrics.stageH / 2 - (metrics.baseH * (pinY / 100)) * s;
    return clampMapTransform(targetX, targetY, s, metrics);
  }

  // ====================================================
  // 二、持久化状态（V2.0 键完全兼容 + V2.1 独立 UI 设置键）
  // ====================================================
  async function loadUiSettings() {
    var cfg = await readConfig(STORAGE_KEYS.UI_V21, null);
    if (!cfg || typeof cfg !== 'object') {
      return { schemaVersion: 21, typewriterEnabled: true };
    }
    return {
      schemaVersion: 21,
      typewriterEnabled: cfg.typewriterEnabled !== false
    };
  }

  async function saveUiSettings(patch) {
    var cur = await loadUiSettings();
    var next = Object.assign({}, cur, patch || {});
    _runtime.uiSettings = next;
    await writeConfig(STORAGE_KEYS.UI_V21, next);
    return next;
  }

  async function loadMirrorState() {
    var st = await readConfig(STORAGE_KEYS.STATE, null);
    if (!st || typeof st !== 'object') {
      st = {
        schemaVersion: 2,
        mapTransform: null,
        timePreview: 'auto',
        activeCharId: null,
        visitedLocations: {},
        checkins: {}
      };
    }
    if (!st.visitedLocations || typeof st.visitedLocations !== 'object') st.visitedLocations = {};
    if (!st.checkins || typeof st.checkins !== 'object') st.checkins = {};
    return st;
  }

  async function saveMirrorState(patch) {
    var cur = await loadMirrorState();
    var next = Object.assign({}, cur, patch || {});
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'activeCharId')) {
      _runtime.activeCharId = next.activeCharId ? String(next.activeCharId) : null;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'timePreview')) {
      _runtime.timePreview = next.timePreview || 'auto';
    }
    await writeConfig(STORAGE_KEYS.STATE, next);
    return next;
  }

  async function loadGachaState() {
    var st = await readConfig(STORAGE_KEYS.GACHA, null);
    if (!st || typeof st !== 'object') {
      st = { giftPity: 0, adventurePity: 0, totalPulls: 0, logs: [], collectedEncounters: [] };
    }
    if (!Array.isArray(st.logs)) st.logs = [];
    if (!Array.isArray(st.collectedEncounters)) st.collectedEncounters = [];
    return st;
  }

  async function saveGachaState(st) {
    if (st.logs.length > 60) st.logs = st.logs.slice(0, 60);
    await writeConfig(STORAGE_KEYS.GACHA, st);
    return st;
  }

  async function loadCharLogs() {
    var map = await readConfig(STORAGE_KEYS.CHAR_LOGS, {});
    return (map && typeof map === 'object') ? map : {};
  }

  async function appendCharInteraction(charId, entry) {
    var scope = charId ? String(charId) : 'solo';
    var map = await loadCharLogs();
    if (!map[scope] || !Array.isArray(map[scope].interactions)) {
      map[scope] = { interactions: [], giftsGiven: [] };
    }
    map[scope].interactions.unshift(Object.assign({
      id: uid('act'),
      createdAt: nowMs(),
      charId: charId ? String(charId) : null
    }, entry || {}));
    if (map[scope].interactions.length > 50) {
      map[scope].interactions = map[scope].interactions.slice(0, 50);
    }
    await writeConfig(STORAGE_KEYS.CHAR_LOGS, map);
    return map[scope];
  }

  async function loadMementos() {
    var list = await readConfig(STORAGE_KEYS.MEMENTOS, []);
    return Array.isArray(list) ? list : [];
  }

  async function saveMementos(list) {
    return await writeConfig(STORAGE_KEYS.MEMENTOS, Array.isArray(list) ? list : []);
  }

  // ====================================================
  // 二（B）、V2.2 季节判定、同行情境、四季花园与湖畔步道数据结构
  // ====================================================
  function getLocalSeasonInfo(dateObj) {
    var d = dateObj || nowDate();
    var m = d.getMonth() + 1;
    var key = 'winter';
    if (m >= 3 && m <= 5) key = 'spring';
    else if (m >= 6 && m <= 8) key = 'summer';
    else if (m >= 9 && m <= 11) key = 'autumn';
    var base = SEASON_THEMES[key] || SEASON_THEMES.spring;
    return Object.assign({}, base, {
      seasonYear: getSeasonalYear(d)
    });
  }

  function getFlowerById(flowerId) {
    return FLOWERS.find(function(f) { return f.id === flowerId; }) || null;
  }

  function getWrappingById(wrapId) {
    return BOUQUET_WRAPPINGS.find(function(w) { return w.id === wrapId; }) || BOUQUET_WRAPPINGS[0];
  }

  function getRibbonById(ribbonId) {
    return BOUQUET_RIBBONS.find(function(r) { return r.id === ribbonId; }) || BOUQUET_RIBBONS[0];
  }

  function getLakesideEventById(eventId) {
    return LAKESIDE_EVENTS.find(function(ev) { return ev.id === eventId; }) || null;
  }

  function createEmptyFlowerMap() {
    var map = {};
    for (var i = 0; i < FLOWERS.length; i++) map[FLOWERS[i].id] = 0;
    return map;
  }

  function sanitizeGardenState(raw) {
    var st = (raw && typeof raw === 'object') ? raw : {};
    var flowers = createEmptyFlowerMap();
    if (st.flowers && typeof st.flowers === 'object') {
      for (var i = 0; i < FLOWERS.length; i++) {
        var fid = FLOWERS[i].id;
        var n = Math.floor(Number(st.flowers[fid]) || 0);
        flowers[fid] = n > 0 ? n : 0;
      }
    }
    var collectedDates = {};
    if (st.collectedDates && typeof st.collectedDates === 'object') {
      var keys = Object.keys(st.collectedDates).sort().slice(-30);
      for (var k = 0; k < keys.length; k++) {
        var cnt = Math.floor(Number(st.collectedDates[keys[k]]) || 0);
        if (cnt > 0) collectedDates[keys[k]] = cnt;
      }
    }
    var processed = (st.processedRequests && typeof st.processedRequests === 'object') ? st.processedRequests : {};
    var procKeys = Object.keys(processed);
    if (procKeys.length > 120) {
      var trimmed = {};
      procKeys.slice(-120).forEach(function(pk) { trimmed[pk] = processed[pk]; });
      processed = trimmed;
    }
    return {
      schemaVersion: 22,
      collectionDate: typeof st.collectionDate === 'string' ? st.collectionDate : '',
      collectionUsed: Math.max(0, Math.floor(Number(st.collectionUsed) || 0)),
      lastProcessedDate: typeof st.lastProcessedDate === 'string' ? st.lastProcessedDate : '',
      collectedDates: collectedDates,
      flowers: flowers,
      bouquets: Array.isArray(st.bouquets) ? st.bouquets : [],
      processedRequests: processed,
      pendingCompensations: Array.isArray(st.pendingCompensations) ? st.pendingCompensations.slice(-20) : [],
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function loadGardenState() {
    var raw = await readConfig(STORAGE_KEYS.GARDEN_V22, null);
    return sanitizeGardenState(raw);
  }

  async function saveGardenState(st) {
    st.updatedAt = nowMs();
    return await writeConfig(STORAGE_KEYS.GARDEN_V22, st);
  }

  function getGardenDailyCollectionStatus(gs) {
    var today = getTodayStr();
    var rollbackBlocked = Boolean(gs.lastProcessedDate && today < gs.lastProcessedDate);
    var used = Math.max(
      Number(gs.collectedDates && gs.collectedDates[today]) || 0,
      gs.collectionDate === today ? (Number(gs.collectionUsed) || 0) : 0
    );
    var remaining = rollbackBlocked ? 0 : Math.max(0, DAILY_COLLECTION_LIMIT - used);
    return {
      today: today,
      used: used,
      limit: DAILY_COLLECTION_LIMIT,
      remaining: remaining,
      rollbackBlocked: rollbackBlocked
    };
  }

  async function loadLakesideState() {
    var raw = await readConfig(STORAGE_KEYS.LAKESIDE_V22, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    var processed = (st.processedRequests && typeof st.processedRequests === 'object') ? st.processedRequests : {};
    var pKeys = Object.keys(processed);
    if (pKeys.length > 120) {
      var trimmed = {};
      pKeys.slice(-120).forEach(function(pk) { trimmed[pk] = processed[pk]; });
      processed = trimmed;
    }
    return {
      schemaVersion: 22,
      activeWalksByChar: (st.activeWalksByChar && typeof st.activeWalksByChar === 'object') ? st.activeWalksByChar : {},
      completedWalks: Array.isArray(st.completedWalks) ? st.completedWalks.slice(0, 60) : [],
      processedRequests: processed,
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveLakesideState(st) {
    st.updatedAt = nowMs();
    if (Array.isArray(st.completedWalks) && st.completedWalks.length > 60) {
      st.completedWalks = st.completedWalks.slice(0, 60);
    }
    return await writeConfig(STORAGE_KEYS.LAKESIDE_V22, st);
  }

  async function loadCompanionState() {
    var raw = await readConfig(STORAGE_KEYS.COMPANION_V22, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 22,
      eventsByScope: (st.eventsByScope && typeof st.eventsByScope === 'object') ? st.eventsByScope : {},
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveCompanionState(st) {
    st.updatedAt = nowMs();
    return await writeConfig(STORAGE_KEYS.COMPANION_V22, st);
  }

  function sanitizeCompanionPayload(payload) {
    if (!payload || typeof payload !== 'object') return {};
    var out = {};
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'lorebook' || k === 'profile' || k === 'memories') continue;
      var v = payload[k];
      if (typeof v === 'string') out[k] = sanitizeTextField(v, 80);
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else if (Array.isArray(v)) out[k] = v.slice(0, 6).map(function(x) { return sanitizeTextField(x, 24); });
    }
    return out;
  }

  async function recordCompanionEvent(charId, locationId, eventType, payload) {
    var scope = charId ? String(charId) : 'user';
    var st = await loadCompanionState();
    if (!Array.isArray(st.eventsByScope[scope])) st.eventsByScope[scope] = [];
    var ev = {
      eventId: uid('cev'),
      charId: charId ? String(charId) : null,
      sessionId: _runtime.sessionId,
      locationId: String(locationId || ''),
      eventType: String(eventType || ''),
      payload: sanitizeCompanionPayload(payload),
      createdAt: nowMs(),
      schemaVersion: 22
    };
    st.eventsByScope[scope].unshift(ev);
    if (st.eventsByScope[scope].length > 20) {
      st.eventsByScope[scope] = st.eventsByScope[scope].slice(0, 20);
    }
    await saveCompanionState(st);
    return ev;
  }

  function getBridge() {
    return global.WanxiangExperienceBridge || null;
  }

  async function buildBridgeHelperForChar(charId) {
    var bridge = getBridge();
    if (!bridge || !charId) {
      return {
        findByRef: function() { return null; },
        findByMemento: function() { return null; },
        isSaved: function() { return false; },
        renderButtons: function() { return ''; }
      };
    }
    var cid = String(charId);
    var exps = [];
    try {
      exps = await bridge.getExperiencesForChar(cid);
    } catch (_) { exps = []; }

    var savedMap = {};
    for (var i = 0; i < exps.length; i++) {
      var ex = exps[i];
      if (!ex || !ex.canRemember) continue;
      try {
        var st = await bridge.checkMemorySavedStatus({ experience: ex });
        savedMap[ex.experienceId] = Boolean(st && st.saved);
      } catch (_) {
        savedMap[ex.experienceId] = false;
      }
    }

    function matchPayload(exp, refId) {
      if (!exp || !refId) return false;
      var rid = String(refId);
      if (exp.experienceId === rid || exp.sourceEventId === rid || exp.mementoId === rid) return true;
      var p = exp.payload || {};
      return p.bouquetId === rid || p.walkId === rid || p.rideId === rid || p.carouselRideId === rid ||
        p.journeyId === rid || p.plushInstanceId === rid || p.giftEventId === rid || p.draftId === rid ||
        p.seasonalDedupKey === rid;
    }

    function findByRef(refId, preferredEventType) {
      if (!refId) return null;
      if (preferredEventType) {
        var exact = exps.find(function(e) { return e.eventType === preferredEventType && matchPayload(e, refId); });
        if (exact) return exact;
      }
      return exps.find(function(e) { return matchPayload(e, refId); }) || null;
    }

    function findByMemento(mem) {
      if (!mem) return null;
      return exps.find(function(e) {
        return e.mementoId === mem.id ||
          (mem.sourceEventId && e.sourceEventId === mem.sourceEventId) ||
          (mem.giftEventId && e.sourceEventId === mem.giftEventId) ||
          (mem.walkId && matchPayload(e, mem.walkId)) ||
          (mem.rideId && matchPayload(e, mem.rideId)) ||
          (mem.carouselRideId && matchPayload(e, mem.carouselRideId)) ||
          (mem.journeyId && matchPayload(e, mem.journeyId));
      }) || null;
    }

    function renderButtons(exp) {
      if (!exp || !exp.charId) return '';
      var isSaved = Boolean(savedMap[exp.experienceId]);
      var html = '<div class="wx-bridge-actions-row">';
      if (exp.canShare) {
        html +=
          '<button type="button" class="wx-mini-btn wx-bridge-share-btn" data-wx-bridge-share="' + esc(exp.experienceId) + '" data-wx-bridge-char="' + esc(exp.charId) + '">' +
            '<i class="fa-regular fa-paper-plane"></i> 分享给 ' + esc(exp.charName || 'Char') +
          '</button>';
      }
      if (exp.canRemember) {
        if (isSaved) {
          html += '<span class="wx-bridge-remembered-tag"><i class="fa-solid fa-check"></i> 已记住 ✓</span>';
        } else {
          html +=
            '<button type="button" class="wx-mini-btn wx-bridge-rem-btn" data-wx-bridge-remember="' + esc(exp.experienceId) + '" data-wx-bridge-char="' + esc(exp.charId) + '">' +
              '<i class="fa-regular fa-bookmark"></i> 记住这一天' +
            '</button>';
        }
      }
      html += '</div>';
      return html;
    }

    return {
      findByRef: findByRef,
      findByMemento: findByMemento,
      isSaved: function(exp) { return Boolean(exp && savedMap[exp.experienceId]); },
      renderButtons: renderButtons
    };
  }

  async function renderChatReturnBar() {
    if (!_runtime.pageEl) return;
    var bar = _runtime.pageEl.querySelector('#wx-chat-return-bar');
    if (!bar) return;
    var ctx = _runtime.fromChatCtx;
    if (!ctx || !ctx.sourceChatId || !ctx.charId) {
      bar.classList.add('is-hidden');
      bar.innerHTML = '';
      return;
    }
    bar.classList.remove('is-hidden');
    bar.innerHTML =
      '<div class="wx-chat-return-info">' +
        '<i class="fa-solid fa-comments"></i>' +
        '<span>来自与 <strong>' + esc(ctx.charName || 'Char') + '</strong> 的私聊 · ' + esc(ctx.targetLocationName || '万象镜') + '</span>' +
      '</div>' +
      '<button type="button" class="wx-chat-return-btn" id="wx-chat-return-btn">' +
        '<i class="fa fa-angle-left"></i> 返回与 ' + esc(ctx.charName || 'Char') + ' 的聊天' +
      '</button>';
  }

  function isValidLocationId(locId) {
    return Boolean(locId && LOCATIONS.some(function(l) { return l.id === locId; }));
  }

  async function getCompanionContextForChar(charId, limitOrOpts) {
    if (!charId) return [];
    var cid = String(charId);
    var opts = (limitOrOpts && typeof limitOrOpts === 'object')
      ? limitOrOpts
      : { limit: Number(limitOrOpts) || 6 };
    var maxItems = Math.max(1, Math.min(8, Number(opts.limit) || 6));
    var excludeEventId = opts.excludeEventId ? String(opts.excludeEventId) : '';
    var st = await loadCompanionState();
    var list = Array.isArray(st.eventsByScope[cid]) ? st.eventsByScope[cid] : [];
    var candidates = [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev || String(ev.charId || '') !== cid) continue;
      if (!isValidLocationId(ev.locationId)) continue;
      var p = ev.payload || {};
      if (p.cancelled || p.abandoned || p.refunded || p.status === 'refunded' || p.status === 'abandoned' || p.status === 'cancelled') continue;
      if (String(ev.eventType || '').indexOf('cancelled') !== -1 || String(ev.eventType || '').indexOf('refunded') !== -1 || String(ev.eventType || '').indexOf('abandoned') !== -1) continue;

      var summary = '';
      if (ev.eventType === 'bouquet_gifted') {
        summary = '在四季花园收到你送的花束「' + (p.name || '心意花束') + '」（花材：' + (Array.isArray(p.flowerNames) ? p.flowerNames.join('、') : '') + '，花语：' + (p.meanings || '') + '）';
      } else if (ev.eventType === 'lakeside_walk_completed') {
        summary = '在湖畔步道一起经历了「' + (p.eventTitle || '湖畔散步') + '」，你选择了「' + (p.choiceLabel || '') + '」';
      } else if (ev.eventType === 'gift_sent') {
        summary = '收到你送的小镇礼物「' + (p.itemName || '') + '」';
      } else if (ev.eventType === 'cafe_order') {
        summary = '在午后咖啡馆一起点了「' + (p.itemName || '') + '」';
      } else if (ev.eventType === 'memento_saved') {
        summary = '在万象镜收藏了一张「' + (p.title || '小镇纪念') + '」';
      } else if (ev.eventType === 'claw_attempt_completed') {
        summary = '在星光游乐场抓娃娃机游玩了一次（' + (p.success ? ('抓到了「' + (p.plushName || '玩偶') + '」') : '差一点抓到') + '）';
      } else if (ev.eventType === 'plush_won') {
        summary = '在星光游乐场抓到了玩偶「' + (p.plushName || '') + '」（' + (p.rarityLabel || '') + '）';
      } else if (ev.eventType === 'plush_gifted') {
        summary = '在星光游乐场收到你送出的玩偶「' + (p.plushName || '') + '」';
      } else if (ev.eventType === 'ferris_ride_completed') {
        summary = '一起乘坐了星愿摩天轮（' + (p.highlights || '看完了整场夜景') + '）';
      } else if (ev.eventType === 'carousel_ride_completed') {
        summary = '在梦幻旋转木马坐上了「' + (p.seatName || '') + '」（' + (p.moodName || '') + '氛围）';
      } else if (ev.eventType === 'amusement_memento_saved') {
        summary = '在星光游乐场收藏了一张「' + (p.title || '游乐场纪念') + '」';
      } else if (ev.eventType === 'train_ticket_purchased') {
        summary = '在星愿列车站买了前往「' + (p.destinationName || '远方') + '」的车票';
      } else if (ev.eventType === 'train_journey_started') {
        summary = '在星愿列车站登上开往「' + (p.destinationName || '远方') + '」的梦境列车';
      } else if (ev.eventType === 'train_journey_completed') {
        summary = '一起坐着星愿列车抵达并游玩了「' + (p.destinationName || '远方') + '」（' + (p.highlights || '顺利到站') + '）';
      } else if (ev.eventType === 'train_postcard_saved') {
        summary = '珍藏了来自「' + (p.destinationName || '远方') + '」的旅行明信片';
      } else if (ev.eventType === 'invitation_completed') {
        summary = '应邀一起去了「' + (p.locationName || '小镇地点') + '」并完成了互动';
      } else if (ev.eventType === 'seasonal_event_completed') {
        summary = '一起参加了' + (p.seasonLabel || '') + '限定「' + (p.eventTitle || '季节事件') + '」（选择：' + (p.choiceLabel || '') + '）';
      } else if (p.summary) {
        summary = p.summary;
      }
      if (summary) {
        candidates.push({
          eventId: ev.eventId,
          eventType: ev.eventType,
          locationId: ev.locationId,
          summary: summary,
          createdAt: ev.createdAt
        });
      }
    }

    // 避免反复把同一条首条记忆作为开场主导记忆
    if (excludeEventId && candidates.length > 1 && candidates[0].eventId === excludeEventId) {
      var firstItem = candidates.shift();
      candidates.push(firstItem);
    }

    // 去重相同摘要文本，保留最新 6–8 条
    var seenSummaries = {};
    var result = [];
    for (var j = 0; j < candidates.length && result.length < maxItems; j++) {
      if (seenSummaries[candidates[j].summary]) continue;
      seenSummaries[candidates[j].summary] = true;
      result.push(candidates[j]);
    }
    return result;
  }

  async function getEconomySnapshot() {
    if (global.SharedEconomyService && typeof global.SharedEconomyService.getState === 'function') {
      return await global.SharedEconomyService.getState();
    }
    return { coins: 0, diamonds: 0, inventory: [], logs: [] };
  }

  async function loadAvailableCharacters() {
    try {
      if (global.db && global.db.characters && typeof global.db.characters.toArray === 'function') {
        var rows = await global.db.characters.toArray();
        return rows.filter(function(c) {
          return c && c.type !== 'user' && !c.deleted && c.id !== undefined && c.id !== null;
        });
      }
    } catch (_) {}
    if (global._charCache && typeof global._charCache === 'object') {
      return Object.keys(global._charCache).map(function(k) { return global._charCache[k]; }).filter(function(c) {
        return c && c.type !== 'user' && !c.deleted;
      });
    }
    return [];
  }

  async function getActiveCharacterObj() {
    if (!_runtime.activeCharId) return null;
    var chars = await loadAvailableCharacters();
    var hit = chars.find(function(c) { return String(c.id) === String(_runtime.activeCharId); });
    if (!hit) {
      _runtime.activeCharId = null;
      await saveMirrorState({ activeCharId: null });
      return null;
    }
    return hit;
  }

  // ====================================================
  // 三、Char 档案 & 世界书隔离读取 + AI/非AI 反应生成 + 会话气泡管理
  // ====================================================
  async function readScopedLorebook(charId, seedText) {
    var cidStr = String(charId || '');
    if (!cidStr) return '';
    try {
      if (typeof global.getLorebookContext === 'function') {
        var num = Number(charId);
        var ctx = await global.getLorebookContext(isNaN(num) ? charId : num, [{ content: seedText || '' }]);
        if (ctx && typeof ctx === 'string') return ctx.trim().slice(0, 320);
      }
    } catch (_) {}

    try {
      var books = await readConfig('lorebooks', []);
      if (!Array.isArray(books)) return '';
      var out = [];
      for (var i = 0; i < books.length; i++) {
        var b = books[i];
        if (!b || b.enabled === false) continue;
        var ids = Array.isArray(b.charIds) ? b.charIds.map(String) : [];
        if (b.scope === 'personal' && ids.indexOf(cidStr) === -1) continue;
        var entries = Array.isArray(b.entries) ? b.entries : [];
        for (var j = 0; j < entries.length; j++) {
          var e = entries[j];
          if (e && e.enabled !== false && e.content) {
            out.push(String(e.content).trim());
          }
        }
      }
      return out.join('\n').slice(0, 320);
    } catch (_) {
      return '';
    }
  }

  function buildNonAiFallbackQuote(charObj, locationName, eventDesc) {
    var cname = (charObj && (charObj.nick || charObj.name)) || '同行伙伴';
    return cname + ' 陪你在「' + locationName + '」停留片刻（' + eventDesc + '）。';
  }

  function pushCharBubbleEntry(charId, locId, role, text, meta) {
    var scope = charId ? String(charId) : 'solo';
    var lid = locId || 'mirror_plaza';
    if (!_runtime.charBubbles[scope]) _runtime.charBubbles[scope] = {};
    if (!_runtime.charBubbles[scope][lid]) _runtime.charBubbles[scope][lid] = [];
    _runtime.charBubbles[scope][lid].push({
      role: role,
      text: String(text || ''),
      meta: String(meta || ''),
      ts: nowMs()
    });
    if (_runtime.charBubbles[scope][lid].length > 16) {
      _runtime.charBubbles[scope][lid] = _runtime.charBubbles[scope][lid].slice(-16);
    }
  }

  function getCharHistoryFor(charId, locId) {
    var scope = charId ? String(charId) : 'solo';
    var lid = locId || 'mirror_plaza';
    return (_runtime.charBubbles[scope] && _runtime.charBubbles[scope][lid])
      ? _runtime.charBubbles[scope][lid].slice()
      : [];
  }

  function clearTypewriter() {
    if (_typewriterTimer) {
      clearTimeout(_typewriterTimer);
      _typewriterTimer = null;
    }
  }

  function applyQuoteTextWithOptionalTypewriter(el, fullText) {
    clearTypewriter();
    if (!el) return;
    var txt = String(fullText || '');
    var reduced = false;
    try {
      reduced = Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {}
    if (!_runtime.uiSettings.typewriterEnabled || reduced || txt.length <= 2) {
      el.textContent = txt;
      return;
    }
    var idx = 0;
    var step = Math.max(1, Math.ceil(txt.length / 18));
    function tick() {
      idx = Math.min(txt.length, idx + step);
      el.textContent = txt.slice(0, idx);
      if (idx < txt.length && _runtime.sheet.open && _runtime.pageEl) {
        _typewriterTimer = setTimeout(tick, 18);
      } else {
        _typewriterTimer = null;
      }
    }
    tick();
  }

  async function requestCharReaction(opts) {
    opts = opts || {};
    var charObj = await getActiveCharacterObj();
    var locName = opts.locationName || '万象镜';
    var actionText = opts.actionDesc || '来到这里看看';
    _runtime.sheet.lastAiActionDesc = actionText;

    if (!charObj) {
      return {
        ok: true,
        charId: null,
        source: 'solo',
        text: '你正独自漫步于「' + locName + '」，随时可点击角色条挑选同行伙伴。'
      };
    }

    var targetCharId = String(charObj.id);
    var reqSeq = ++_aiSeq;

    if (typeof global.callAI !== 'function') {
      return {
        ok: true,
        charId: targetCharId,
        source: 'offline_notice',
        text: buildNonAiFallbackQuote(charObj, locName, actionText)
      };
    }

    try {
      var lore = await readScopedLorebook(targetCharId, locName + ' ' + actionText);
      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== targetCharId) {
        return { ok: false, aborted: true, reason: 'char_switched_before_ai' };
      }

      var lastCited = _runtime.lastCitedEventByChar[targetCharId] || '';
      var companionEvents = await getCompanionContextForChar(targetCharId, { limit: 6, excludeEventId: lastCited });
      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== targetCharId) {
        return { ok: false, aborted: true, reason: 'char_switched_before_ai' };
      }
      var companionLines = companionEvents.length
        ? companionEvents.map(function(ce) { return '· ' + ce.summary; }).join('\n')
        : '';

      var cname = charObj.nick || charObj.name || '伴侣';
      var persona = charObj.personality || charObj.bio || charObj.description || '自然真实';
      var style = charObj.speakingStyle || '';
      var relation = charObj.relationship || '';
      var atmo = getTownAtmosphereSnapshot(_runtime.timePreview);
      var prompt = [
        '【角色基础人设与风格】',
        '你正在扮演角色「' + cname + '」，严格维持角色原本的性格与说话习惯：' + persona,
        style ? '说话风格参考：' + style : '',
        relation ? '与用户的关系：' + relation : '',
        lore ? '【世界书参考（仅限当前角色）】\n' + lore : '',
        companionLines ? '【最近一起经历的真实小镇互动（仅限当前角色，按时间顺序，请自然延续勿机械照抄）】\n' + companionLines : '',
        '【当前小镇时段与场景】\n万象镜·' + locName + '（真实生活时段：' + atmo.realTimeSlotLabel + '，视觉显示：' + atmo.displayLabel + '，当前季节：' + atmo.seasonLabel + '）',
        '【当前实际发生】\n' + actionText,
        '要求：\n1. 用第一人称回复 1 到 2 句简短自然的话，不超过 70 个字；\n2. 符合自身人设，不要千篇一律甜腻口吻；\n3. 仅可自然提及上方列出的实际已发生事件，不得编造未发生过的购买、约会、赠礼或记忆；也不得声称修改了金币或奖励。'
      ].filter(Boolean).join('\n\n');

      var aiReply = await global.callAI([{ role: 'user', content: prompt }], { temperature: 0.7 });

      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== targetCharId) {
        return { ok: false, aborted: true, reason: 'char_switched_after_ai' };
      }

      var cleanText = String(aiReply || '').trim();
      if (!cleanText) throw new Error('EMPTY_AI_REPLY');

      if (companionEvents.length && companionEvents[0].eventId) {
        _runtime.lastCitedEventByChar[targetCharId] = companionEvents[0].eventId;
      }

      return { ok: true, charId: targetCharId, source: 'ai', text: cleanText };
    } catch (_) {
      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== targetCharId) {
        return { ok: false, aborted: true, reason: 'char_switched_on_error' };
      }
      return {
        ok: true,
        charId: targetCharId,
        source: 'fallback',
        text: opts.fallbackText || buildNonAiFallbackQuote(charObj, locName, actionText)
      };
    }
  }

  // ====================================================
  // 四、核心业务事务（与 V2.0 完全一致：购买、赠礼、咖啡馆、扭蛋保底防重）
  // ====================================================
  async function purchaseShopGood(goodId) {
    return await runTx(async function() {
      var good = SHOP_GOODS.find(function(g) { return g.id === goodId; });
      if (!good) return { ok: false, msg: '商品不存在' };
      if (!global.SharedEconomyService) return { ok: false, msg: '共享经济服务暂不可用' };

      var spendRes = await global.SharedEconomyService.spendCoins(good.price, '万象镜商店街：' + good.name, 'mall');
      if (!spendRes || !spendRes.success) {
        return { ok: false, msg: (spendRes && spendRes.msg) || '金币余额不足' };
      }

      try {
        await global.SharedEconomyService.addItem({
          itemId: good.id,
          name: good.name,
          icon: good.icon,
          category: good.invCategory,
          desc: good.desc,
          price: good.price
        }, 1, 'mall');
      } catch (err) {
        await global.SharedEconomyService.addCoins(good.price, '交易异常退款：' + good.name, 'mall');
        return { ok: false, msg: '背包写入失败，金币已原路退回' };
      }

      await appendCharInteraction(_runtime.activeCharId, {
        locationId: 'shopping_street',
        type: 'purchase',
        title: '购入「' + good.name + '」',
        cost: good.price
      });

      return { ok: true, good: good, remaining: spendRes.remaining };
    });
  }

  async function claimDailySignin() {
    if (!global.WanwanSharedHub || !global.WanwanSharedHub.RewardGuard) {
      return { ok: false, msg: '防刷校验服务未就绪' };
    }
    return await runTx(async function() {
      var eventId = 'mall_signin_' + getTodayStr();
      var guard = await global.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, 0, 50, 0);
      if (!guard.allowed) {
        return { ok: false, reason: 'already_claimed', msg: '今日签到奖励已领取过，明日再来吧~' };
      }
      await global.SharedEconomyService.addCoins(guard.coinsGranted, '万象镜每日迎新签到', 'mall');
      return { ok: true, coins: guard.coinsGranted };
    });
  }

  async function claimPlazaWish() {
    if (!global.WanwanSharedHub || !global.WanwanSharedHub.RewardGuard) {
      return { ok: false, msg: '防刷校验服务未就绪' };
    }
    return await runTx(async function() {
      var eventId = 'wx_plaza_wish_' + getTodayStr();
      var guard = await global.WanwanSharedHub.RewardGuard.validateAndGrant(eventId, 0, 15, 0);
      if (!guard.allowed) {
        return { ok: false, reason: 'already_claimed', msg: '今日已在镜心喷泉许过愿啦，明天再来吧' };
      }
      await global.SharedEconomyService.addCoins(guard.coinsGranted, '镜心广场喷泉许愿', 'wanxiangMirror');
      await appendCharInteraction(_runtime.activeCharId, {
        locationId: 'mirror_plaza',
        type: 'wish',
        title: '在镜心喷泉许下心愿 (+' + guard.coinsGranted + ' 金币)'
      });
      if (_runtime.activeCharId) {
        await completeAcceptedInvitationForCharUnlocked(_runtime.activeCharId, 'mirror_plaza', 'pz_wish_' + eventId, '在镜心喷泉许下心愿');
      }
      return { ok: true, coins: guard.coinsGranted };
    });
  }

  async function giftItemToActiveChar(itemId) {
    return await runTx(async function() {
      var charObj = await getActiveCharacterObj();
      if (!charObj) return { ok: false, msg: '请先选择一位同行 Char 再送出礼物' };
      if (!global.SharedEconomyService) return { ok: false, msg: '共享背包暂不可用' };

      var eco = await getEconomySnapshot();
      var target = (eco.inventory || []).find(function(it) { return it.itemId === itemId; });
      if (!target || target.count < 1) {
        return { ok: false, msg: '背包里该物品数量不足' };
      }

      var res = await global.SharedEconomyService.consumeItem(itemId, 1);
      if (!res || !res.success) {
        return { ok: false, msg: (res && res.msg) || '消耗失败' };
      }

      var map = await loadCharLogs();
      var cid = String(charObj.id);
      if (!map[cid] || !Array.isArray(map[cid].giftsGiven)) {
        map[cid] = { interactions: (map[cid] && map[cid].interactions) || [], giftsGiven: [] };
      }
      map[cid].giftsGiven.unshift({
        id: uid('gift'),
        itemId: itemId,
        itemName: target.name,
        charId: cid,
        charName: charObj.nick || charObj.name,
        createdAt: nowMs()
      });
      if (map[cid].giftsGiven.length > 50) map[cid].giftsGiven = map[cid].giftsGiven.slice(0, 50);
      await writeConfig(STORAGE_KEYS.CHAR_LOGS, map);

      await appendCharInteraction(cid, {
        locationId: 'shopping_street',
        type: 'gift',
        title: '将「' + target.name + '」送给 ' + (charObj.nick || charObj.name)
      });
      await recordCompanionEvent(cid, 'shopping_street', 'gift_sent', { itemName: target.name });

      return { ok: true, itemName: target.name, charObj: charObj };
    });
  }

  async function orderAtCafe(menuType, itemId) {
    return await runTx(async function() {
      var list = CAFE_MENU[menuType] || [];
      var item = list.find(function(m) { return m.id === itemId; });
      if (!item) return { ok: false, msg: '饮品或甜点不存在' };
      if (!global.SharedEconomyService) return { ok: false, msg: '共享经济服务暂不可用' };

      var spendRes = await global.SharedEconomyService.spendCoins(item.price, '午后咖啡馆：' + item.name, 'wanxiangMirror');
      if (!spendRes || !spendRes.success) {
        return { ok: false, msg: (spendRes && spendRes.msg) || '金币不足' };
      }

      var charObj = await getActiveCharacterObj();
      await appendCharInteraction(charObj ? charObj.id : null, {
        locationId: 'afternoon_cafe',
        type: menuType === 'dessert' ? 'cafe_dessert' : 'cafe_drink',
        title: (charObj ? '与 ' + (charObj.nick || charObj.name) + ' ' : '独自') +
               (menuType === 'dessert' ? '分享了「' : '点了一杯「') + item.name + '」',
        cost: item.price
      });
      if (charObj) {
        await recordCompanionEvent(charObj.id, 'afternoon_cafe', 'cafe_order', { itemName: item.name });
        await completeAcceptedInvitationForCharUnlocked(charObj.id, 'afternoon_cafe', 'cafe_ord_' + uid('cfo'), '一起点了「' + item.name + '」');
      }

      return { ok: true, item: item, remaining: spendRes.remaining, charObj: charObj };
    });
  }

  async function saveCafeMemento(noteText) {
    var charObj = await getActiveCharacterObj();
    var mementos = await loadMementos();
    var period = getActivePeriodInfo('auto').period;
    var item = {
      id: uid('mem'),
      sourceType: 'cafe_photo',
      locationId: 'afternoon_cafe',
      locationName: '午后咖啡馆',
      charId: charObj ? String(charObj.id) : null,
      charName: charObj ? (charObj.nick || charObj.name) : '独自时光',
      periodLabel: period.label,
      note: String(noteText || '').trim() || (charObj ? ('与 ' + (charObj.nick || charObj.name) + ' 在洋伞下留影') : '午后咖啡香的片刻停驻'),
      createdAt: nowMs(),
      dateStr: getTodayStr(),
      schemaVersion: 22
    };
    mementos.unshift(item);
    if (mementos.length > 100) mementos = mementos.slice(0, 100);
    await saveMementos(mementos);
    if (charObj) {
      await completeAcceptedInvitationForChar(charObj.id, 'afternoon_cafe', 'cafe_mem_' + item.id, '在午后咖啡馆拍下留影');
    }
    return item;
  }

  async function deleteMemento(memId) {
    var list = await loadMementos();
    var next = list.filter(function(m) { return m.id !== memId; });
    await saveMementos(next);
    return next;
  }

  // ====================================================
  // 四（B）、V2.2 四季花园与湖畔步道事务引擎（幂等、补偿、隔离）
  // ====================================================
  function pickWeightedFlower(seasonKey, rngFn) {
    var rand = typeof rngFn === 'function' ? rngFn : Math.random;
    var weights = FLOWERS.map(function(f) {
      return f.seasons.indexOf(seasonKey) !== -1 ? 3 : 1;
    });
    var total = weights.reduce(function(s, w) { return s + w; }, 0);
    var roll = rand() * total;
    for (var i = 0; i < FLOWERS.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return FLOWERS[i];
    }
    return FLOWERS[FLOWERS.length - 1];
  }

  async function collectDailyFlower(requestId, rngFn) {
    var reqKey = 'collect_' + String(requestId || uid('col'));
    return await runTx(async function() {
      var gs = await loadGardenState();
      if (gs.processedRequests[reqKey]) {
        var prev = gs.processedRequests[reqKey];
        return Object.assign({ ok: true, idempotent: true }, prev, { status: getGardenDailyCollectionStatus(gs) });
      }
      var status = getGardenDailyCollectionStatus(gs);
      if (status.rollbackBlocked) {
        return { ok: false, reason: 'clock_rollback', msg: '检测到设备日期早于最近记录，今日采集暂已锁定', status: status };
      }
      if (status.remaining <= 0) {
        return { ok: false, reason: 'daily_limit', msg: '今日免费采集次数已用完（每日最多 3 次）', status: status };
      }

      var season = getLocalSeasonInfo();
      var flower = pickWeightedFlower(season.key, rngFn);
      var prevSnapshot = JSON.parse(JSON.stringify(gs));

      gs.flowers[flower.id] = (gs.flowers[flower.id] || 0) + 1;
      var nextUsed = status.used + 1;
      gs.collectionDate = status.today;
      gs.collectionUsed = nextUsed;
      gs.collectedDates[status.today] = nextUsed;
      if (!gs.lastProcessedDate || status.today > gs.lastProcessedDate) {
        gs.lastProcessedDate = status.today;
      }
      var resPayload = {
        flower: flower,
        season: season,
        used: nextUsed,
        remaining: Math.max(0, DAILY_COLLECTION_LIMIT - nextUsed)
      };
      gs.processedRequests[reqKey] = resPayload;

      var saved = await saveGardenState(gs);
      if (!saved) {
        await saveGardenState(prevSnapshot);
        return { ok: false, reason: 'storage_failed', msg: '存储空间不足或写入失败，未能记录采集', status: status };
      }
      if (_runtime.activeCharId) {
        await completeAcceptedInvitationForCharUnlocked(_runtime.activeCharId, 'four_seasons_garden', 'gd_col_' + reqKey, '在四季花园采集到「' + flower.name + '」');
      }
      return {
        ok: true,
        idempotent: false,
        flower: flower,
        season: season,
        used: nextUsed,
        remaining: Math.max(0, DAILY_COLLECTION_LIMIT - nextUsed),
        status: getGardenDailyCollectionStatus(gs)
      };
    });
  }

  function buildBouquetMetadata(counts, wrappingId, ribbonId, customName) {
    var items = [];
    var total = 0;
    for (var i = 0; i < FLOWERS.length; i++) {
      var f = FLOWERS[i];
      var qty = Math.floor(Number(counts && counts[f.id]) || 0);
      if (qty > 0) {
        items.push({ flowerId: f.id, name: f.name, meaning: f.meaning, count: qty, color: f.color });
        total += qty;
      }
    }
    items.sort(function(a, b) { return b.count - a.count; });
    var primary = items[0] || FLOWERS[0];
    var defaultName = items.length === 1
      ? (primary.name + '之' + (primary.meaning || '心语'))
      : (items.length === 2 ? (primary.name + '的约定') : (primary.name + '花笺'));
    var cleanCustom = sanitizeTextField(customName, 24);
    var wrap = getWrappingById(wrappingId);
    var ribbon = getRibbonById(ribbonId);
    var meanings = items.map(function(it) { return it.meaning; }).filter(function(m, idx, arr) { return arr.indexOf(m) === idx; }).join(' · ');
    return {
      items: items,
      total: total,
      primaryFlowerId: primary.flowerId || primary.id,
      name: cleanCustom || defaultName,
      wrapping: wrap,
      ribbon: ribbon,
      meanings: meanings
    };
  }

  async function craftBouquet(params) {
    params = params || {};
    var reqKey = 'craft_' + String(params.requestId || uid('crf'));
    return await runTx(async function() {
      var gs = await loadGardenState();
      if (gs.processedRequests[reqKey]) {
        var existingB = gs.bouquets.find(function(b) { return b.bouquetId === gs.processedRequests[reqKey].bouquetId; });
        return { ok: true, idempotent: true, bouquet: existingB || gs.processedRequests[reqKey].bouquet };
      }

      var meta = buildBouquetMetadata(params.counts || {}, params.wrappingId, params.ribbonId, params.name);
      if (meta.total !== 3 || meta.items.length < 1 || meta.items.length > 3) {
        return { ok: false, msg: '每束花需自由搭配 1–3 种花材，合计恰好 3 份' };
      }
      for (var i = 0; i < meta.items.length; i++) {
        var ing = meta.items[i];
        if ((gs.flowers[ing.flowerId] || 0) < ing.count) {
          return { ok: false, msg: ing.name + '库存不足，无法制作' };
        }
      }

      var prevSnapshot = JSON.parse(JSON.stringify(gs));
      for (var j = 0; j < meta.items.length; j++) {
        gs.flowers[meta.items[j].flowerId] = Math.max(0, (gs.flowers[meta.items[j].flowerId] || 0) - meta.items[j].count);
      }

      var bouquet = {
        bouquetId: uid('bq'),
        name: meta.name,
        ingredients: meta.items,
        meanings: meta.meanings,
        wrappingId: meta.wrapping.id,
        wrappingName: meta.wrapping.name,
        ribbonId: meta.ribbon.id,
        ribbonName: meta.ribbon.name,
        status: 'owned', // 'owned' | 'gifting' | 'gifted'
        createdAt: nowMs(),
        giftedToCharId: null,
        giftEventId: null
      };

      gs.bouquets.unshift(bouquet);
      gs.processedRequests[reqKey] = { bouquetId: bouquet.bouquetId, bouquet: bouquet };
      var savedGarden = await saveGardenState(gs);
      if (!savedGarden) {
        return { ok: false, reason: 'storage_failed', msg: '存储空间不足，花束未能保存，花材未扣除' };
      }

      if (global.SharedEconomyService && typeof global.SharedEconomyService.addItem === 'function') {
        try {
          await global.SharedEconomyService.addItem({
            itemId: 'wx_bouquet_' + bouquet.bouquetId,
            name: bouquet.name,
            icon: 'fa-solid fa-fan',
            category: 'bouquet',
            bouquetId: bouquet.bouquetId,
            desc: '四季花园定制花束（' + meta.items.map(function(x) { return x.name + '×' + x.count; }).join('、') + '）'
          }, 1, 'wanxiangMirrorGarden');
        } catch (err) {
          // 跨存储补偿：恢复原花材并移除未同步成功的花束记录
          await saveGardenState(prevSnapshot);
          return { ok: false, reason: 'inventory_sync_failed', msg: '同步共享背包失败，已安全退回全部花材' };
        }
      }

      return { ok: true, idempotent: false, bouquet: bouquet };
    });
  }

  async function giftBouquetToActiveChar(bouquetId, expectedCharId, requestId) {
    var reqKey = 'giftbq_' + String(requestId || uid('gbq'));
    return await runTx(async function() {
      var charObj = await getActiveCharacterObj();
      if (!charObj) {
        return { ok: false, msg: '请先选择一位同行 Char 再送出花束' };
      }
      var cid = String(charObj.id);
      if (expectedCharId && String(expectedCharId) !== cid) {
        return { ok: false, reason: 'char_changed', msg: '同行角色已切换，本次赠礼已取消，未消耗花束' };
      }

      var gs = await loadGardenState();
      if (gs.processedRequests[reqKey]) {
        var prev = gs.processedRequests[reqKey];
        var prevBq = gs.bouquets.find(function(b) { return b.bouquetId === prev.bouquetId; });
        return { ok: true, idempotent: true, bouquet: prevBq || prev.bouquet, giftEventId: prev.giftEventId, charObj: charObj };
      }

      var bq = gs.bouquets.find(function(b) { return b.bouquetId === bouquetId; });
      if (!bq) return { ok: false, msg: '花束记录不存在' };
      if (bq.status === 'gifted') {
        return { ok: false, reason: 'already_gifted', msg: '这束花已经送出过啦，不可重复赠送' };
      }

      // 进入 gifting 状态并保存，确保跨存储中断可追踪（若上次中断在 gifting 且无 giftEventId，仍可安全继续/恢复）
      bq.status = 'gifting';
      var savedMid = await saveGardenState(gs);
      if (!savedMid) {
        return { ok: false, reason: 'storage_failed', msg: '存储写入失败，未能发起赠礼' };
      }

      var consumedShared = false;
      if (global.SharedEconomyService && typeof global.SharedEconomyService.getState === 'function') {
        try {
          var eco = await global.SharedEconomyService.getState();
          var invItemId = 'wx_bouquet_' + bq.bouquetId;
          var hasInInv = (eco.inventory || []).some(function(it) { return it.itemId === invItemId && it.count > 0; });
          if (hasInInv) {
            var consRes = await global.SharedEconomyService.consumeItem(invItemId, 1);
            if (!consRes || !consRes.success) {
              bq.status = 'owned';
              await saveGardenState(gs);
              return { ok: false, msg: (consRes && consRes.msg) || '背包花束扣除失败' };
            }
            consumedShared = true;
          }
        } catch (err) {
          bq.status = 'owned';
          await saveGardenState(gs);
          return { ok: false, msg: '同步共享背包时出错，已保留原花束' };
        }
      }

      var giftEventId = uid('gfev');
      bq.status = 'gifted';
      bq.giftedToCharId = cid;
      bq.giftedToCharName = charObj.nick || charObj.name || '';
      bq.giftEventId = giftEventId;
      bq.giftedAt = nowMs();
      gs.processedRequests[reqKey] = { bouquetId: bq.bouquetId, giftEventId: giftEventId, charId: cid, bouquet: bq };

      var savedFinal = await saveGardenState(gs);
      if (!savedFinal) {
        // 补偿退回背包并恢复 owned 状态
        if (consumedShared && global.SharedEconomyService && typeof global.SharedEconomyService.addItem === 'function') {
          try {
            await global.SharedEconomyService.addItem({
              itemId: 'wx_bouquet_' + bq.bouquetId,
              name: bq.name,
              icon: 'fa-solid fa-fan',
              category: 'bouquet',
              bouquetId: bq.bouquetId,
              desc: '四季花园定制花束'
            }, 1, 'wanxiangMirrorGarden');
          } catch (_) {}
        }
        bq.status = 'owned';
        bq.giftedToCharId = null;
        bq.giftedToCharName = null;
        bq.giftEventId = null;
        bq.giftedAt = null;
        delete gs.processedRequests[reqKey];
        try { await saveGardenState(gs); } catch (_) {}
        return { ok: false, reason: 'storage_failed', msg: '保存赠礼记录失败，花束已保留' };
      }

      var flowerNames = (bq.ingredients || []).map(function(x) { return x.name + '×' + x.count; });
      await appendCharInteraction(cid, {
        locationId: 'four_seasons_garden',
        type: 'bouquet_gift',
        title: '送出花束「' + bq.name + '」给 ' + (charObj.nick || charObj.name)
      });
      await recordCompanionEvent(cid, 'four_seasons_garden', 'bouquet_gifted', {
        bouquetId: bq.bouquetId,
        giftEventId: giftEventId,
        name: bq.name,
        flowerNames: flowerNames,
        meanings: bq.meanings || '',
        wrappingName: bq.wrappingName || '',
        ribbonName: bq.ribbonName || ''
      });
      await completeAcceptedInvitationForCharUnlocked(cid, 'four_seasons_garden', 'gd_gift_' + giftEventId, '送出花束「' + bq.name + '」');

      return { ok: true, idempotent: false, bouquet: bq, giftEventId: giftEventId, charObj: charObj };
    });
  }

  async function updateBouquetReply(bouquetId, charId, replyText, aiFailed) {
    return await runTx(async function() {
      var gs = await loadGardenState();
      var bq = gs.bouquets.find(function(b) { return b.bouquetId === bouquetId; });
      if (!bq || bq.status !== 'gifted') return null;
      if (charId && String(bq.giftedToCharId || '') !== String(charId)) return null;
      bq.charReplySummary = aiFailed ? '' : String(replyText || '');
      bq.aiFailed = Boolean(aiFailed);
      await saveGardenState(gs);
      return bq;
    });
  }

  async function saveFlowerMemento(bouquetId) {
    var gs = await loadGardenState();
    var bq = gs.bouquets.find(function(b) { return b.bouquetId === bouquetId; });
    if (!bq || bq.status !== 'gifted' || !bq.giftEventId) {
      return { ok: false, msg: '仅已送出的花束可生成花语纪念卡' };
    }
    var mementos = await loadMementos();
    var existing = mementos.find(function(m) {
      return m.sourceType === 'flower_language' && m.giftEventId === bq.giftEventId;
    });
    if (existing) {
      return { ok: true, duplicate: true, memento: existing };
    }

    var charName = bq.giftedToCharName || '同行伙伴';
    var card = {
      id: uid('mem_fl'),
      mementoId: uid('mem_fl'),
      sourceType: 'flower_language',
      locationId: 'four_seasons_garden',
      locationName: '四季花园',
      bouquetId: bq.bouquetId,
      giftEventId: bq.giftEventId,
      charId: bq.giftedToCharId ? String(bq.giftedToCharId) : null,
      charName: charName,
      title: '花语纪念 · ' + bq.name,
      bouquetName: bq.name,
      ingredientsText: (bq.ingredients || []).map(function(i) { return i.name + '×' + i.count; }).join('、'),
      meanings: bq.meanings || '',
      wrappingInfo: (bq.wrappingName || '') + ' · ' + (bq.ribbonName || ''),
      charReplySummary: bq.charReplySummary || '',
      note: '将「' + bq.name + '」（' + (bq.meanings || '心意') + '）赠予 ' + charName,
      createdAt: bq.giftedAt || nowMs(),
      dateStr: getTodayStr(),
      periodLabel: getActivePeriodInfo('auto').period.label,
      schemaVersion: 22
    };
    mementos.unshift(card);
    if (mementos.length > 100) mementos = mementos.slice(0, 100);
    var ok = await saveMementos(mementos);
    if (!ok) return { ok: false, msg: '存储空间不足，花语纪念卡保存失败' };
    if (bq.giftedToCharId) {
      await recordCompanionEvent(bq.giftedToCharId, 'four_seasons_garden', 'memento_saved', { title: card.title });
    }
    return { ok: true, duplicate: false, memento: card };
  }

  function pickWeightedLakesideEvent(visualPeriod, rngFn) {
    var rand = typeof rngFn === 'function' ? rngFn : Math.random;
    var weights = LAKESIDE_EVENTS.map(function(ev) {
      var b = ev.periodBias && ev.periodBias[visualPeriod];
      return Number(b) || 1.5;
    });
    var total = weights.reduce(function(s, w) { return s + w; }, 0);
    var roll = rand() * total;
    for (var i = 0; i < LAKESIDE_EVENTS.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return LAKESIDE_EVENTS[i];
    }
    return LAKESIDE_EVENTS[LAKESIDE_EVENTS.length - 1];
  }

  async function startLakesideWalk(charId, requestId, rngFn) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false, msg: '请先选择一位同行 Char 再开始散步' };
    var chars = await loadAvailableCharacters();
    var targetChar = chars.find(function(c) { return String(c.id) === cid; });
    if (!targetChar) return { ok: false, msg: '指定的同行 Char 不存在' };

    var reqKey = 'walk_start_' + String(requestId || uid('ws'));
    return await runTx(async function() {
      var ls = await loadLakesideState();
      if (ls.processedRequests[reqKey]) {
        var prevId = ls.processedRequests[reqKey].walkId;
        var prevDraft = ls.activeWalksByChar[cid];
        if (prevDraft && prevDraft.walkId === prevId) {
          return { ok: true, idempotent: true, walk: prevDraft };
        }
      }

      if (ls.activeWalksByChar[cid]) {
        return { ok: true, resumed: true, walk: ls.activeWalksByChar[cid] };
      }

      var pInfo = getActivePeriodInfo(_runtime.timePreview);
      var ev = pickWeightedLakesideEvent(pInfo.displayKey, rngFn);
      var walk = {
        walkId: uid('walk'),
        charId: cid,
        charName: targetChar.nick || targetChar.name || '',
        eventId: ev.id,
        eventTitle: ev.title,
        stage: 'event', // 'event' | 'choice_done'
        choiceId: null,
        choiceLabel: '',
        outcomeText: '',
        charReply: '',
        charReplySource: '',
        aiFailed: false,
        visualPeriod: pInfo.displayKey,
        visualPeriodLabel: pInfo.period.label,
        isPreview: pInfo.isPreview,
        startedAt: nowMs(),
        updatedAt: nowMs()
      };
      ls.activeWalksByChar[cid] = walk;
      ls.processedRequests[reqKey] = { walkId: walk.walkId };
      var ok = await saveLakesideState(ls);
      if (!ok) return { ok: false, msg: '存储空间不足，未能开启湖畔散步' };
      return { ok: true, resumed: false, walk: walk };
    });
  }

  async function chooseLakesideOption(walkId, choiceId, requestId) {
    var reqKey = 'walk_opt_' + String(requestId || uid('wopt'));
    return await runTx(async function() {
      var ls = await loadLakesideState();
      if (ls.processedRequests[reqKey]) {
        var prev = ls.processedRequests[reqKey];
        return { ok: true, idempotent: true, walk: prev.walk };
      }

      var cid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
      var walk = cid && ls.activeWalksByChar[cid];
      if (!walk || walk.walkId !== walkId) {
        // Also search by walkId in case called directly via API
        var foundCid = Object.keys(ls.activeWalksByChar).find(function(k) {
          return ls.activeWalksByChar[k] && ls.activeWalksByChar[k].walkId === walkId;
        });
        if (!foundCid) return { ok: false, msg: '当前散步草稿不存在或已结束' };
        if (cid && foundCid !== cid) {
          return { ok: false, reason: 'char_mismatch', msg: '当前同行 Char 与该散步不匹配，已阻止串台' };
        }
        cid = foundCid;
        walk = ls.activeWalksByChar[cid];
      }

      var ev = getLakesideEventById(walk.eventId);
      if (!ev) return { ok: false, msg: '湖畔情境定义不存在' };
      var opt = ev.options.find(function(o) { return o.id === choiceId; });
      if (!opt) return { ok: false, msg: '无效的互动选项' };

      if (walk.stage === 'choice_done') {
        return { ok: true, idempotent: true, walk: walk, event: ev, option: opt };
      }

      walk.choiceId = opt.id;
      walk.choiceLabel = opt.label;
      walk.outcomeText = opt.outcome;
      walk.stage = 'choice_done';
      walk.updatedAt = nowMs();
      ls.activeWalksByChar[cid] = walk;
      ls.processedRequests[reqKey] = { walk: walk };

      var ok = await saveLakesideState(ls);
      if (!ok) return { ok: false, msg: '存储写入失败，未能保存散步选择' };
      return { ok: true, idempotent: false, walk: walk, event: ev, option: opt };
    });
  }

  async function updateWalkReply(walkId, charId, replyText, source, aiFailed) {
    return await runTx(async function() {
      var ls = await loadLakesideState();
      var cid = String(charId || '');
      var w = ls.activeWalksByChar[cid];
      if (w && w.walkId === walkId) {
        w.charReply = replyText || '';
        w.charReplySource = source || '';
        w.aiFailed = Boolean(aiFailed);
        w.updatedAt = nowMs();
        await saveLakesideState(ls);
        return w;
      }
      var comp = ls.completedWalks.find(function(c) { return c.walkId === walkId && String(c.charId) === cid; });
      if (comp) {
        comp.charReply = replyText || '';
        comp.charReplySource = source || '';
        comp.aiFailed = Boolean(aiFailed);
        await saveLakesideState(ls);
        return comp;
      }
      return null;
    });
  }

  async function finishLakesideWalk(walkId, requestId) {
    var reqKey = 'walk_fin_' + String(requestId || uid('wfin'));
    return await runTx(async function() {
      var ls = await loadLakesideState();
      if (ls.processedRequests[reqKey]) {
        var existingComp = ls.completedWalks.find(function(c) { return c.walkId === walkId; });
        return { ok: true, idempotent: true, completedWalk: existingComp || ls.processedRequests[reqKey].completedWalk };
      }
      var existingDone = ls.completedWalks.find(function(c) { return c.walkId === walkId; });
      if (existingDone) {
        return { ok: true, idempotent: true, completedWalk: existingDone };
      }

      var foundCid = Object.keys(ls.activeWalksByChar).find(function(k) {
        return ls.activeWalksByChar[k] && ls.activeWalksByChar[k].walkId === walkId;
      });
      if (!foundCid) return { ok: false, msg: '未找到进行中的散步记录' };
      var walk = ls.activeWalksByChar[foundCid];

      var completedRecord = {
        walkId: walk.walkId,
        charId: walk.charId,
        charName: walk.charName,
        eventId: walk.eventId,
        eventTitle: walk.eventTitle,
        choiceId: walk.choiceId || 'A',
        choiceLabel: walk.choiceLabel || '',
        outcomeText: walk.outcomeText || '',
        charReply: walk.charReply || '',
        charReplySource: walk.charReplySource || '',
        aiFailed: Boolean(walk.aiFailed),
        visualPeriod: walk.visualPeriod,
        visualPeriodLabel: walk.visualPeriodLabel,
        isPreview: Boolean(walk.isPreview),
        startedAt: walk.startedAt,
        completedAt: nowMs(),
        dateStr: getTodayStr()
      };

      delete ls.activeWalksByChar[foundCid];
      ls.completedWalks.unshift(completedRecord);
      ls.processedRequests[reqKey] = { completedWalk: completedRecord };
      var ok = await saveLakesideState(ls);
      if (!ok) return { ok: false, msg: '存储写入失败，未能完成散步结算' };

      await appendCharInteraction(walk.charId, {
        locationId: 'lakeside_walk',
        type: 'lakeside_walk',
        title: '在湖畔步道经历了「' + walk.eventTitle + '」（' + (walk.choiceLabel || '散步') + '）'
      });
      await recordCompanionEvent(walk.charId, 'lakeside_walk', 'lakeside_walk_completed', {
        walkId: walk.walkId,
        eventId: walk.eventId,
        eventTitle: walk.eventTitle,
        choiceId: walk.choiceId,
        choiceLabel: walk.choiceLabel
      });
      await completeAcceptedInvitationForCharUnlocked(walk.charId, 'lakeside_walk', 'lk_fin_' + walk.walkId, '在湖畔步道经历了「' + walk.eventTitle + '」');

      return { ok: true, idempotent: false, completedWalk: completedRecord };
    });
  }

  async function abandonLakesideWalk(charId) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false };
    return await runTx(async function() {
      var ls = await loadLakesideState();
      if (!ls.activeWalksByChar[cid]) return { ok: true };
      delete ls.activeWalksByChar[cid];
      var ok = await saveLakesideState(ls);
      return { ok: ok };
    });
  }

  async function saveLakesideMemento(walkId) {
    var ls = await loadLakesideState();
    var comp = ls.completedWalks.find(function(c) { return c.walkId === walkId; });
    if (!comp) return { ok: false, msg: '请先完成该次湖畔散步后再收藏纪念' };

    var mementos = await loadMementos();
    var existing = mementos.find(function(m) {
      return m.sourceType === 'lakeside_walk' && m.walkId === walkId;
    });
    if (existing) {
      return { ok: true, duplicate: true, memento: existing };
    }

    var replySummary = (!comp.aiFailed && comp.charReply) ? comp.charReply : '';
    var card = {
      id: uid('mem_lk'),
      mementoId: uid('mem_lk'),
      sourceType: 'lakeside_walk',
      locationId: 'lakeside_walk',
      locationName: '湖畔步道',
      walkId: comp.walkId,
      charId: comp.charId ? String(comp.charId) : null,
      charName: comp.charName || '同行伙伴',
      eventId: comp.eventId,
      choiceId: comp.choiceId,
      title: '湖畔纪念 · ' + comp.eventTitle,
      summary: comp.outcomeText + (comp.choiceLabel ? '（选择：' + comp.choiceLabel + '）' : ''),
      charReplySummary: replySummary,
      note: '与 ' + (comp.charName || '同行伙伴') + ' 在「' + comp.eventTitle + '」选择：' + (comp.choiceLabel || ''),
      createdAt: comp.completedAt || nowMs(),
      dateStr: comp.dateStr || getTodayStr(),
      visualPeriod: comp.visualPeriod || 'day',
      periodLabel: comp.visualPeriodLabel || '白昼',
      isPreview: Boolean(comp.isPreview),
      schemaVersion: 22
    };
    mementos.unshift(card);
    if (mementos.length > 100) mementos = mementos.slice(0, 100);
    var ok = await saveMementos(mementos);
    if (!ok) return { ok: false, msg: '存储空间不足，湖畔纪念保存失败' };
    if (comp.charId) {
      await recordCompanionEvent(comp.charId, 'lakeside_walk', 'memento_saved', { title: card.title });
    }
    return { ok: true, duplicate: false, memento: card };
  }

  // ====================================================
  // 四（C）、V2.3 星光游乐场事务引擎（抓娃娃机 / 星愿摩天轮 / 梦幻旋转木马）
  // ====================================================
  function trimProcessedMap(rawMap) {
    var src = (rawMap && typeof rawMap === 'object') ? rawMap : {};
    var keys = Object.keys(src);
    if (keys.length <= 120) return src;
    var out = {};
    keys.slice(-120).forEach(function(k) { out[k] = src[k]; });
    return out;
  }

  async function loadParkState() {
    var raw = await readConfig(STORAGE_KEYS.PARK_V23, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 23,
      totalVisits: Math.max(0, Math.floor(Number(st.totalVisits) || 0)),
      lastFacility: typeof st.lastFacility === 'string' ? st.lastFacility : 'hub',
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveParkState(st) {
    st.updatedAt = nowMs();
    return await writeConfig(STORAGE_KEYS.PARK_V23, st);
  }

  async function loadClawState() {
    var raw = await readConfig(STORAGE_KEYS.CLAW_V23, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 23,
      attempts: Array.isArray(st.attempts) ? st.attempts.slice(0, 60) : [],
      plushies: Array.isArray(st.plushies) ? st.plushies.slice(0, 120) : [],
      processedRequests: trimProcessedMap(st.processedRequests),
      pendingCompensations: Array.isArray(st.pendingCompensations) ? st.pendingCompensations.slice(-30) : [],
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveClawState(st) {
    st.updatedAt = nowMs();
    if (Array.isArray(st.attempts) && st.attempts.length > 60) st.attempts = st.attempts.slice(0, 60);
    if (Array.isArray(st.plushies) && st.plushies.length > 120) st.plushies = st.plushies.slice(0, 120);
    st.processedRequests = trimProcessedMap(st.processedRequests);
    return await writeConfig(STORAGE_KEYS.CLAW_V23, st);
  }

  async function loadFerrisState() {
    var raw = await readConfig(STORAGE_KEYS.FERRIS_V23, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 23,
      activeRidesByChar: (st.activeRidesByChar && typeof st.activeRidesByChar === 'object') ? st.activeRidesByChar : {},
      completedRides: Array.isArray(st.completedRides) ? st.completedRides.slice(0, 60) : [],
      processedRequests: trimProcessedMap(st.processedRequests),
      pendingCompensations: Array.isArray(st.pendingCompensations) ? st.pendingCompensations.slice(-30) : [],
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveFerrisState(st) {
    st.updatedAt = nowMs();
    if (Array.isArray(st.completedRides) && st.completedRides.length > 60) st.completedRides = st.completedRides.slice(0, 60);
    st.processedRequests = trimProcessedMap(st.processedRequests);
    return await writeConfig(STORAGE_KEYS.FERRIS_V23, st);
  }

  async function loadCarouselState() {
    var raw = await readConfig(STORAGE_KEYS.CAROUSEL_V23, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 23,
      rides: Array.isArray(st.rides) ? st.rides.slice(0, 60) : [],
      processedRequests: trimProcessedMap(st.processedRequests),
      pendingCompensations: Array.isArray(st.pendingCompensations) ? st.pendingCompensations.slice(-30) : [],
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveCarouselState(st) {
    st.updatedAt = nowMs();
    if (Array.isArray(st.rides) && st.rides.length > 60) st.rides = st.rides.slice(0, 60);
    st.processedRequests = trimProcessedMap(st.processedRequests);
    return await writeConfig(STORAGE_KEYS.CAROUSEL_V23, st);
  }

  async function refundOnceForKey(reqKey, amount, reason, compList, sourceApp) {
    if (_refundedRequestKeys[reqKey]) return false;
    if (Array.isArray(compList) && compList.some(function(c) { return c.requestKey === reqKey && c.status === 'refunded'; })) {
      _refundedRequestKeys[reqKey] = true;
      return false;
    }
    try {
      var ecoCheck = await getEconomySnapshot();
      var refTag = '[ref:' + reqKey + ']';
      if (ecoCheck && Array.isArray(ecoCheck.logs) && ecoCheck.logs.some(function(l) {
        return l && l.type === 'income' && typeof l.reason === 'string' && l.reason.indexOf(refTag) !== -1;
      })) {
        _refundedRequestKeys[reqKey] = true;
        return false;
      }
    } catch (_) {}
    try {
      var jCheck = await readConfig(STORAGE_KEYS.JOURNEYS_V24, null);
      if (jCheck && jCheck.refundedLedger && jCheck.refundedLedger[reqKey]) {
        _refundedRequestKeys[reqKey] = true;
        return false;
      }
    } catch (_) {}
    _refundedRequestKeys[reqKey] = true;
    if (global.SharedEconomyService && typeof global.SharedEconomyService.addCoins === 'function') {
      try {
        await global.SharedEconomyService.addCoins(
          amount,
          String(reason || '异常退款') + ' [ref:' + reqKey + ']',
          sourceApp || 'wanxiangMirrorPark'
        );
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  function rollClawOutcome(rngFn) {
    var rand = typeof rngFn === 'function' ? rngFn : Math.random;
    var r1 = Number(rand());
    if (isNaN(r1) || r1 < 0) r1 = 0;
    if (r1 >= 1) r1 = 0.999999;
    if (r1 >= CLAW_CONFIG.successRate) {
      return { success: false, plush: null };
    }
    var list = CLAW_CONFIG.plushies;
    var totalW = list.reduce(function(s, p) { return s + (Number(p.weight) || 0); }, 0);
    var r2 = Number(rand());
    if (isNaN(r2) || r2 < 0) r2 = 0;
    if (r2 >= 1) r2 = 0.999999;
    var roll = r2 * totalW;
    for (var i = 0; i < list.length; i++) {
      roll -= (Number(list[i].weight) || 0);
      if (roll <= 0) return { success: true, plush: list[i] };
    }
    return { success: true, plush: list[list.length - 1] };
  }

  async function playClawAttempt(params) {
    params = params || {};
    var rawReq = String(params.requestId || uid('clwreq'));
    var reqKey = 'claw_' + rawReq;
    var clawPos = Math.max(10, Math.min(90, Math.round(Number(params.clawPos !== undefined ? params.clawPos : 50))));

    return await runTx(async function() {
      if (!global.SharedEconomyService) {
        return { ok: false, reason: 'economy_unavailable', msg: '共享经济服务暂不可用' };
      }
      var cs = await loadClawState();

      // 幂等校验（先检查已处理的 requestId，不重复扣费也不重复发娃）
      if (cs.processedRequests[reqKey]) {
        var proc = cs.processedRequests[reqKey];
        var existingAtt = cs.attempts.find(function(a) { return a.attemptId === proc.attemptId; }) || proc.attempt || null;
        var existingPlush = proc.plushInstanceId
          ? cs.plushies.find(function(p) { return p.plushInstanceId === proc.plushInstanceId; }) || null
          : null;
        if (proc.status === 'compensation_pending') {
          var didRefund = await refundOnceForKey(reqKey, CLAW_CONFIG.cost, '抓娃娃未入包补偿退款', cs.pendingCompensations);
          if (existingAtt) existingAtt.status = 'refunded';
          proc.status = 'refunded';
          proc.refunded = true;
          cs.pendingCompensations.forEach(function(c) {
            if (c.requestKey === reqKey) { c.status = 'refunded'; c.refundedAt = nowMs(); }
          });
          await saveClawState(cs);
          return { ok: false, idempotent: true, refunded: true, refundExecuted: didRefund, attempt: existingAtt, plush: null, msg: '异常订单已完成单次退款' };
        }
        return {
          ok: proc.status === 'completed',
          idempotent: true,
          refunded: proc.status === 'refunded',
          refundExecuted: false,
          success: Boolean(existingAtt && existingAtt.success),
          attempt: existingAtt,
          plush: existingPlush
        };
      }

      // 检查崩溃恢复场景：若 SharedEconomyService 已扣费 [tx:reqKey] 但本地尚未写入处理记录
      try {
        var ecoPre = await getEconomySnapshot();
        var txTag = '[tx:' + reqKey + ']';
        var refTag = '[ref:' + reqKey + ']';
        if (ecoPre && Array.isArray(ecoPre.logs)) {
          var spentLogged = ecoPre.logs.some(function(l) { return l && l.type === 'expense' && typeof l.reason === 'string' && l.reason.indexOf(txTag) !== -1; });
          var refLogged = ecoPre.logs.some(function(l) { return l && l.type === 'income' && typeof l.reason === 'string' && l.reason.indexOf(refTag) !== -1; });
          if (spentLogged) {
            if (refLogged) {
              return { ok: false, idempotent: true, refunded: true, refundExecuted: false, msg: '异常订单已完成单次退款' };
            }
            var recRef = await refundOnceForKey(reqKey, CLAW_CONFIG.cost, '抓娃娃未入库补偿退款', cs.pendingCompensations, 'wanxiangMirrorPark');
            return { ok: false, idempotent: true, refunded: true, refundExecuted: recRef, msg: '检测到未落盘抓娃娃异常，已安全退款' };
          }
        }
      } catch (_) {}

      var spendRes = await global.SharedEconomyService.spendCoins(CLAW_CONFIG.cost, '星光游乐场：抓娃娃机 [tx:' + reqKey + ']', 'wanxiangMirrorPark');
      if (!spendRes || !spendRes.success) {
        return { ok: false, reason: 'insufficient_coins', msg: (spendRes && spendRes.msg) || '金币余额不足（需要 20 金币）' };
      }

      var outcome = rollClawOutcome(params.rngFn);
      var charObj = await getActiveCharacterObj();
      var attemptId = uid('clwa');
      var attempt = {
        attemptId: attemptId,
        requestId: rawReq,
        requestKey: reqKey,
        status: outcome.success ? 'paid' : 'completed',
        cost: CLAW_CONFIG.cost,
        success: outcome.success,
        plushId: outcome.plush ? outcome.plush.id : null,
        plushName: outcome.plush ? outcome.plush.name : '',
        plushInstanceId: null,
        rarity: outcome.plush ? outcome.plush.rarity : null,
        rarityLabel: outcome.plush ? outcome.plush.rarityLabel : '',
        clawPos: clawPos,
        charId: charObj ? String(charObj.id) : null,
        charName: charObj ? (charObj.nick || charObj.name) : '',
        createdAt: nowMs(),
        updatedAt: nowMs(),
        dateStr: getTodayStr()
      };

      var plushObj = null;
      if (outcome.success && outcome.plush) {
        plushObj = {
          plushInstanceId: uid('plush'),
          attemptId: attemptId,
          plushId: outcome.plush.id,
          name: outcome.plush.name,
          rarity: outcome.plush.rarity,
          rarityLabel: outcome.plush.rarityLabel,
          icon: outcome.plush.icon,
          color: outcome.plush.color,
          desc: outcome.plush.desc,
          obtainedAt: nowMs(),
          dateStr: getTodayStr(),
          status: 'owned', // 'owned' | 'gifting' | 'gifted'
          giftedToCharId: null,
          giftedToCharName: null,
          giftEventId: null,
          giftedAt: null,
          charReplySummary: '',
          aiFailed: false
        };
        attempt.plushInstanceId = plushObj.plushInstanceId;
      }

      var prevSnapshot = JSON.parse(JSON.stringify(cs));
      cs.attempts.unshift(attempt);
      if (plushObj) cs.plushies.unshift(plushObj);
      cs.processedRequests[reqKey] = {
        attemptId: attemptId,
        plushInstanceId: plushObj ? plushObj.plushInstanceId : null,
        status: attempt.status,
        attempt: attempt
      };

      var savedFirst = await saveClawState(cs);
      if (!savedFirst) {
        await refundOnceForKey(reqKey, CLAW_CONFIG.cost, '抓娃娃存储失败退款', prevSnapshot.pendingCompensations);
        return { ok: false, reason: 'storage_failed', refunded: true, msg: '存储空间不足，已自动退还 20 金币' };
      }

      if (plushObj && typeof global.SharedEconomyService.addItem === 'function') {
        try {
          await global.SharedEconomyService.addItem({
            itemId: 'wx_plush_' + plushObj.plushInstanceId,
            name: plushObj.name + '（玩偶）',
            icon: plushObj.icon,
            category: 'plush',
            plushInstanceId: plushObj.plushInstanceId,
            desc: '星光游乐场抓获 · ' + plushObj.rarityLabel + ' · ' + plushObj.desc
          }, 1, 'wanxiangMirrorPark');
          attempt.status = 'completed';
          attempt.updatedAt = nowMs();
          cs.processedRequests[reqKey].status = 'completed';
          await saveClawState(cs);
        } catch (err) {
          // 同步背包失败 -> 移除未入包玩偶并发起单次幂等补偿退款
          cs.plushies = cs.plushies.filter(function(p) { return p.plushInstanceId !== plushObj.plushInstanceId; });
          attempt.status = 'compensation_pending';
          attempt.plushInstanceId = null;
          attempt.updatedAt = nowMs();
          var compEntry = {
            requestKey: reqKey,
            attemptId: attemptId,
            amount: CLAW_CONFIG.cost,
            status: 'compensation_pending',
            createdAt: nowMs()
          };
          cs.pendingCompensations.push(compEntry);
          cs.processedRequests[reqKey] = { attemptId: attemptId, plushInstanceId: null, status: 'compensation_pending', attempt: attempt };
          await saveClawState(cs);

          await refundOnceForKey(reqKey, CLAW_CONFIG.cost, '抓娃娃入包失败补偿退款', cs.pendingCompensations);
          attempt.status = 'refunded';
          attempt.updatedAt = nowMs();
          compEntry.status = 'refunded';
          compEntry.refundedAt = nowMs();
          cs.processedRequests[reqKey].status = 'refunded';
          cs.processedRequests[reqKey].refunded = true;
          await saveClawState(cs);

          return { ok: false, reason: 'inventory_sync_failed', refunded: true, attempt: attempt, plush: null, msg: '玩偶同步共享背包失败，已安全退还 20 金币' };
        }
      }

      await appendCharInteraction(charObj ? charObj.id : null, {
        locationId: 'starlight_park',
        type: 'claw_machine',
        cost: CLAW_CONFIG.cost,
        title: outcome.success
          ? ('在抓娃娃机抓到了【' + plushObj.rarityLabel + '】' + plushObj.name)
          : '在抓娃娃机试了一次手气（差一点抓到）'
      });
      if (charObj) {
        await recordCompanionEvent(charObj.id, 'starlight_park', 'claw_attempt_completed', {
          attemptId: attemptId,
          success: outcome.success,
          plushName: plushObj ? plushObj.name : ''
        });
        if (plushObj) {
          await recordCompanionEvent(charObj.id, 'starlight_park', 'plush_won', {
            attemptId: attemptId,
            plushInstanceId: plushObj.plushInstanceId,
            plushName: plushObj.name,
            rarityLabel: plushObj.rarityLabel
          });
        }
        await completeAcceptedInvitationForCharUnlocked(charObj.id, 'starlight_park', 'pk_claw_' + attemptId, '在抓娃娃机游玩一次');
      }

      return {
        ok: true,
        idempotent: false,
        success: outcome.success,
        attempt: attempt,
        plush: plushObj,
        remaining: spendRes.remaining
      };
    });
  }

  async function giftPlushToActiveChar(plushInstanceId, expectedCharId, requestId) {
    var reqKey = 'giftpl_' + String(requestId || uid('gpl'));
    return await runTx(async function() {
      var charObj = await getActiveCharacterObj();
      if (!charObj) {
        return { ok: false, msg: '请先选择一位同行 Char 再送出玩偶' };
      }
      var cid = String(charObj.id);
      if (expectedCharId && String(expectedCharId) !== cid) {
        return { ok: false, reason: 'char_changed', msg: '同行角色已切换，本次赠送已取消，玩偶安全保留' };
      }

      var cs = await loadClawState();
      if (cs.processedRequests[reqKey]) {
        var prev = cs.processedRequests[reqKey];
        var prevPl = cs.plushies.find(function(p) { return p.plushInstanceId === prev.plushInstanceId; }) || prev.plush;
        return { ok: true, idempotent: true, plush: prevPl, giftEventId: prev.giftEventId, charObj: charObj };
      }

      var pl = cs.plushies.find(function(p) { return p.plushInstanceId === plushInstanceId; });
      if (!pl) return { ok: false, msg: '玩偶记录不存在' };
      if (pl.status === 'gifted') {
        return { ok: false, reason: 'already_gifted', msg: '这只玩偶已经送出过啦，不可重复赠送' };
      }

      pl.status = 'gifting';
      var savedMid = await saveClawState(cs);
      if (!savedMid) {
        return { ok: false, reason: 'storage_failed', msg: '存储写入失败，未能发起赠送' };
      }

      var consumedShared = false;
      if (global.SharedEconomyService && typeof global.SharedEconomyService.getState === 'function') {
        try {
          var eco = await global.SharedEconomyService.getState();
          var invItemId = 'wx_plush_' + pl.plushInstanceId;
          var hasInInv = (eco.inventory || []).some(function(it) { return it.itemId === invItemId && it.count > 0; });
          if (hasInInv) {
            var consRes = await global.SharedEconomyService.consumeItem(invItemId, 1);
            if (!consRes || !consRes.success) {
              pl.status = 'owned';
              await saveClawState(cs);
              return { ok: false, msg: (consRes && consRes.msg) || '背包玩偶扣除失败' };
            }
            consumedShared = true;
          }
        } catch (err) {
          pl.status = 'owned';
          await saveClawState(cs);
          return { ok: false, msg: '同步共享背包时出错，已保留原玩偶' };
        }
      }

      var giftEventId = uid('plgev');
      pl.status = 'gifted';
      pl.giftedToCharId = cid;
      pl.giftedToCharName = charObj.nick || charObj.name || '';
      pl.giftEventId = giftEventId;
      pl.giftedAt = nowMs();
      cs.processedRequests[reqKey] = { plushInstanceId: pl.plushInstanceId, giftEventId: giftEventId, charId: cid, plush: pl };

      var savedFinal = await saveClawState(cs);
      if (!savedFinal) {
        if (consumedShared && global.SharedEconomyService && typeof global.SharedEconomyService.addItem === 'function') {
          try {
            await global.SharedEconomyService.addItem({
              itemId: 'wx_plush_' + pl.plushInstanceId,
              name: pl.name + '（玩偶）',
              icon: pl.icon,
              category: 'plush',
              plushInstanceId: pl.plushInstanceId,
              desc: '星光游乐场抓获 · ' + pl.rarityLabel + ' · ' + pl.desc
            }, 1, 'wanxiangMirrorPark');
          } catch (_) {}
        }
        pl.status = 'owned';
        pl.giftedToCharId = null;
        pl.giftedToCharName = null;
        pl.giftEventId = null;
        pl.giftedAt = null;
        delete cs.processedRequests[reqKey];
        try { await saveClawState(cs); } catch (_) {}
        return { ok: false, reason: 'storage_failed', msg: '保存赠礼记录失败，玩偶已安全保留' };
      }

      var map = await loadCharLogs();
      if (!map[cid] || !Array.isArray(map[cid].giftsGiven)) {
        map[cid] = { interactions: (map[cid] && map[cid].interactions) || [], giftsGiven: [] };
      }
      map[cid].giftsGiven.unshift({
        id: giftEventId,
        itemId: 'wx_plush_' + pl.plushInstanceId,
        itemName: pl.name,
        charId: cid,
        charName: charObj.nick || charObj.name,
        createdAt: nowMs()
      });
      if (map[cid].giftsGiven.length > 50) map[cid].giftsGiven = map[cid].giftsGiven.slice(0, 50);
      await writeConfig(STORAGE_KEYS.CHAR_LOGS, map);

      await appendCharInteraction(cid, {
        locationId: 'starlight_park',
        type: 'plush_gift',
        title: '将游乐场抓到的玩偶「' + pl.name + '」送给 ' + (charObj.nick || charObj.name)
      });
      await recordCompanionEvent(cid, 'starlight_park', 'plush_gifted', {
        plushInstanceId: pl.plushInstanceId,
        giftEventId: giftEventId,
        plushName: pl.name,
        rarityLabel: pl.rarityLabel
      });

      return { ok: true, idempotent: false, plush: pl, giftEventId: giftEventId, charObj: charObj };
    });
  }

  async function updatePlushReply(plushInstanceId, charId, replyText, aiFailed) {
    return await runTx(async function() {
      var cs = await loadClawState();
      var pl = cs.plushies.find(function(p) { return p.plushInstanceId === plushInstanceId; });
      if (!pl || pl.status !== 'gifted') return null;
      if (charId && String(pl.giftedToCharId || '') !== String(charId)) return null;
      pl.charReplySummary = aiFailed ? '' : String(replyText || '');
      pl.aiFailed = Boolean(aiFailed);
      await saveClawState(cs);
      return pl;
    });
  }

  async function startFerrisRide(charId, requestId) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false, reason: 'no_char', msg: '请先选择一位同行 Char 再乘坐星愿摩天轮' };
    var chars = await loadAvailableCharacters();
    var targetChar = chars.find(function(c) { return String(c.id) === cid; });
    if (!targetChar) return { ok: false, reason: 'char_not_found', msg: '指定的同行 Char 不存在' };

    var rawReq = String(requestId || uid('freq'));
    var reqKey = 'ferris_start_' + rawReq;
    return await runTx(async function() {
      if (!global.SharedEconomyService) {
        return { ok: false, reason: 'economy_unavailable', msg: '共享经济服务暂不可用' };
      }
      var fs = await loadFerrisState();
      if (fs.processedRequests[reqKey]) {
        var prevId = fs.processedRequests[reqKey].rideId;
        var prevDraft = fs.activeRidesByChar[cid];
        if (prevDraft && prevDraft.rideId === prevId) {
          return { ok: true, idempotent: true, ride: prevDraft };
        }
        var prevDone = fs.completedRides.find(function(r) { return r.rideId === prevId; });
        if (prevDone) return { ok: true, idempotent: true, ride: prevDone };
      }

      if (fs.activeRidesByChar[cid]) {
        return { ok: true, resumed: true, ride: fs.activeRidesByChar[cid] };
      }

      var spendRes = await global.SharedEconomyService.spendCoins(FERRIS_CONFIG.cost, '星光游乐场：星愿摩天轮', 'wanxiangMirrorPark');
      if (!spendRes || !spendRes.success) {
        return { ok: false, reason: 'insufficient_coins', msg: (spendRes && spendRes.msg) || '金币余额不足（需要 30 金币）' };
      }

      var pInfo = getActivePeriodInfo(_runtime.timePreview);
      var ride = {
        rideId: uid('ferris'),
        requestId: rawReq,
        paymentTransactionId: reqKey,
        charId: cid,
        charName: targetChar.nick || targetChar.name || '',
        cost: FERRIS_CONFIG.cost,
        status: 'in_progress',
        currentAct: 1,
        actStage: 'prompt', // 'prompt' | 'result'
        choices: {},
        actReplies: {},
        visualPeriod: pInfo.displayKey,
        visualPeriodLabel: pInfo.period.label,
        isPreview: pInfo.isPreview,
        startedAt: nowMs(),
        updatedAt: nowMs()
      };
      fs.activeRidesByChar[cid] = ride;
      fs.processedRequests[reqKey] = { rideId: ride.rideId };
      var saved = await saveFerrisState(fs);
      if (!saved) {
        await refundOnceForKey(reqKey, FERRIS_CONFIG.cost, '摩天轮存储失败退款', fs.pendingCompensations);
        return { ok: false, reason: 'storage_failed', refunded: true, msg: '存储空间不足，已自动退还 30 金币' };
      }
      return { ok: true, resumed: false, idempotent: false, ride: ride, remaining: spendRes.remaining };
    });
  }

  async function chooseFerrisActOption(rideId, actNumber, choiceId, requestId) {
    var actNum = Number(actNumber);
    var reqKey = 'ferris_opt_' + String(requestId || uid('fopt'));
    return await runTx(async function() {
      var fs = await loadFerrisState();
      if (fs.processedRequests[reqKey]) {
        return { ok: true, idempotent: true, ride: fs.processedRequests[reqKey].ride };
      }

      var activeCid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
      var foundCid = Object.keys(fs.activeRidesByChar).find(function(k) {
        return fs.activeRidesByChar[k] && fs.activeRidesByChar[k].rideId === rideId;
      });
      if (!foundCid) return { ok: false, msg: '该次摩天轮行程草稿不存在或已结束' };
      if (activeCid && foundCid !== activeCid) {
        return { ok: false, reason: 'char_mismatch', msg: '当前同行 Char 与该摩天轮座舱不匹配，已严格隔离' };
      }

      var ride = fs.activeRidesByChar[foundCid];
      if (ride.currentAct !== actNum) {
        var existingChoice = ride.choices && ride.choices['act' + actNum];
        if (existingChoice) {
          return { ok: true, idempotent: true, ride: ride };
        }
        return { ok: false, msg: '当前处于第 ' + ride.currentAct + ' 幕，请按顺序体验' };
      }

      var actKey = 'act' + actNum;
      if (ride.choices && ride.choices[actKey]) {
        return { ok: true, idempotent: true, ride: ride };
      }

      var actDef = FERRIS_CONFIG.acts.find(function(a) { return a.actNumber === actNum; });
      if (!actDef) return { ok: false, msg: '摩天轮幕次配置不存在' };
      var opt = actDef.options.find(function(o) { return o.id === choiceId; });
      if (!opt) return { ok: false, msg: '无效的互动选项' };

      if (!ride.choices) ride.choices = {};
      ride.choices[actKey] = {
        actNumber: actNum,
        actTitle: actDef.shortTitle,
        choiceId: opt.id,
        label: opt.label,
        outcome: opt.outcome,
        fallbackReply: opt.fallbackReply,
        chosenAt: nowMs()
      };
      ride.actStage = 'result';
      ride.updatedAt = nowMs();
      fs.activeRidesByChar[foundCid] = ride;
      fs.processedRequests[reqKey] = { ride: ride };

      var ok = await saveFerrisState(fs);
      if (!ok) return { ok: false, msg: '保存摩天轮进度失败' };
      return { ok: true, idempotent: false, ride: ride, actDef: actDef, option: opt };
    });
  }

  async function updateFerrisActReply(rideId, actNumber, charId, replyText, source, aiFailed) {
    return await runTx(async function() {
      var fs = await loadFerrisState();
      var cid = String(charId || '');
      var actKey = 'act' + Number(actNumber);
      var r = fs.activeRidesByChar[cid];
      if (r && r.rideId === rideId) {
        if (!r.actReplies) r.actReplies = {};
        r.actReplies[actKey] = {
          text: aiFailed ? '' : String(replyText || ''),
          source: source || '',
          aiFailed: Boolean(aiFailed),
          updatedAt: nowMs()
        };
        r.updatedAt = nowMs();
        await saveFerrisState(fs);
        return r;
      }
      var comp = fs.completedRides.find(function(c) { return c.rideId === rideId && String(c.charId) === cid; });
      if (comp) {
        if (!comp.actReplies) comp.actReplies = {};
        comp.actReplies[actKey] = {
          text: aiFailed ? '' : String(replyText || ''),
          source: source || '',
          aiFailed: Boolean(aiFailed),
          updatedAt: nowMs()
        };
        await saveFerrisState(fs);
        return comp;
      }
      return null;
    });
  }

  async function advanceFerrisAct(rideId) {
    return await runTx(async function() {
      var fs = await loadFerrisState();
      var activeCid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
      var foundCid = Object.keys(fs.activeRidesByChar).find(function(k) {
        return fs.activeRidesByChar[k] && fs.activeRidesByChar[k].rideId === rideId;
      });
      if (!foundCid) return { ok: false, msg: '未找到进行中的摩天轮草稿' };
      if (activeCid && foundCid !== activeCid) return { ok: false, reason: 'char_mismatch', msg: '当前同行 Char 不匹配' };
      var ride = fs.activeRidesByChar[foundCid];
      if (!ride.choices || !ride.choices['act' + ride.currentAct]) {
        return { ok: false, msg: '请先选择当前幕次的互动' };
      }
      if (ride.currentAct < 3) {
        ride.currentAct += 1;
        ride.actStage = 'prompt';
        ride.updatedAt = nowMs();
        await saveFerrisState(fs);
      }
      return { ok: true, ride: ride };
    });
  }

  async function finishFerrisRide(rideId, requestId) {
    var reqKey = 'ferris_fin_' + String(requestId || uid('ffin'));
    return await runTx(async function() {
      var fs = await loadFerrisState();
      if (fs.processedRequests[reqKey]) {
        var prevComp = fs.completedRides.find(function(c) { return c.rideId === rideId; });
        return { ok: true, idempotent: true, completedRide: prevComp || fs.processedRequests[reqKey].completedRide };
      }
      var already = fs.completedRides.find(function(c) { return c.rideId === rideId; });
      if (already) {
        return { ok: true, idempotent: true, completedRide: already };
      }

      var foundCid = Object.keys(fs.activeRidesByChar).find(function(k) {
        return fs.activeRidesByChar[k] && fs.activeRidesByChar[k].rideId === rideId;
      });
      if (!foundCid) return { ok: false, msg: '未找到待完成的摩天轮行程' };
      var ride = fs.activeRidesByChar[foundCid];
      if (!ride.choices || !ride.choices.act1 || !ride.choices.act2 || !ride.choices.act3) {
        return { ok: false, msg: '请先体验完三幕行程再结束摩天轮之旅' };
      }

      var completed = Object.assign({}, ride, {
        status: 'completed',
        completedAt: nowMs(),
        dateStr: getTodayStr()
      });
      delete fs.activeRidesByChar[foundCid];
      fs.completedRides.unshift(completed);
      fs.processedRequests[reqKey] = { completedRide: completed };
      var ok = await saveFerrisState(fs);
      if (!ok) return { ok: false, msg: '存储写入失败，未能保存摩天轮完结记录' };

      var highlights = [1, 2, 3].map(function(n) {
        var ch = completed.choices['act' + n];
        return ch ? ch.label : '';
      }).filter(Boolean).join(' → ');

      await appendCharInteraction(completed.charId, {
        locationId: 'starlight_park',
        type: 'ferris_wheel',
        cost: completed.cost,
        title: '与 ' + (completed.charName || '同行伙伴') + ' 乘坐了星愿摩天轮'
      });
      await recordCompanionEvent(completed.charId, 'starlight_park', 'ferris_ride_completed', {
        rideId: completed.rideId,
        highlights: highlights.slice(0, 70)
      });
      await completeAcceptedInvitationForCharUnlocked(completed.charId, 'starlight_park', 'pk_ferris_' + completed.rideId, '完成星愿摩天轮三幕之旅');

      return { ok: true, idempotent: false, completedRide: completed };
    });
  }

  async function abandonFerrisRide(charId) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false };
    return await runTx(async function() {
      var fs = await loadFerrisState();
      if (!fs.activeRidesByChar[cid]) return { ok: true };
      delete fs.activeRidesByChar[cid];
      var ok = await saveFerrisState(fs);
      return { ok: ok };
    });
  }

  async function commitCarouselRide(params) {
    params = params || {};
    var rawReq = String(params.requestId || uid('creq'));
    var reqKey = 'carousel_' + rawReq;
    var seat = CAROUSEL_CONFIG.seats.find(function(s) { return s.id === params.seatId; });
    var mood = CAROUSEL_CONFIG.moods.find(function(m) { return m.id === params.moodId; });
    if (!seat) return { ok: false, msg: '无效的木马座位主题' };
    if (!mood) return { ok: false, msg: '无效的氛围选择' };

    return await runTx(async function() {
      if (!global.SharedEconomyService) {
        return { ok: false, reason: 'economy_unavailable', msg: '共享经济服务暂不可用' };
      }
      var cs = await loadCarouselState();
      if (cs.processedRequests[reqKey]) {
        var existingId = cs.processedRequests[reqKey].carouselRideId;
        var existingRide = cs.rides.find(function(r) { return r.carouselRideId === existingId; }) || cs.processedRequests[reqKey].ride;
        return { ok: true, idempotent: true, ride: existingRide };
      }

      var spendRes = await global.SharedEconomyService.spendCoins(CAROUSEL_CONFIG.cost, '星光游乐场：梦幻旋转木马', 'wanxiangMirrorPark');
      if (!spendRes || !spendRes.success) {
        return { ok: false, reason: 'insufficient_coins', msg: (spendRes && spendRes.msg) || '金币余额不足（需要 10 金币）' };
      }

      var charObj = await getActiveCharacterObj();
      var pInfo = getActivePeriodInfo(_runtime.timePreview);
      var ride = {
        carouselRideId: uid('crid'),
        requestId: rawReq,
        cost: CAROUSEL_CONFIG.cost,
        seatId: seat.id,
        seatName: seat.name,
        seatIcon: seat.icon,
        moodId: mood.id,
        moodName: mood.name,
        moodHint: mood.hint,
        charId: charObj ? String(charObj.id) : null,
        charName: charObj ? (charObj.nick || charObj.name) : '独自体验',
        status: 'completed',
        animationSkipped: false,
        charReply: '',
        charReplySource: '',
        aiFailed: false,
        visualPeriod: pInfo.displayKey,
        visualPeriodLabel: pInfo.period.label,
        isPreview: pInfo.isPreview,
        createdAt: nowMs(),
        completedAt: nowMs(),
        dateStr: getTodayStr()
      };

      cs.rides.unshift(ride);
      cs.processedRequests[reqKey] = { carouselRideId: ride.carouselRideId, ride: ride };
      var saved = await saveCarouselState(cs);
      if (!saved) {
        await refundOnceForKey(reqKey, CAROUSEL_CONFIG.cost, '旋转木马存储失败退款', cs.pendingCompensations);
        return { ok: false, reason: 'storage_failed', refunded: true, msg: '存储空间不足，已自动退还 10 金币' };
      }

      await appendCharInteraction(charObj ? charObj.id : null, {
        locationId: 'starlight_park',
        type: 'carousel',
        cost: CAROUSEL_CONFIG.cost,
        title: '乘坐了「' + seat.name + '」旋转木马（' + mood.name + '）'
      });
      if (charObj) {
        await recordCompanionEvent(charObj.id, 'starlight_park', 'carousel_ride_completed', {
          carouselRideId: ride.carouselRideId,
          seatName: seat.name,
          moodName: mood.name
        });
        await completeAcceptedInvitationForCharUnlocked(charObj.id, 'starlight_park', 'pk_car_' + ride.carouselRideId, '乘坐「' + seat.name + '」旋转木马');
      }

      return { ok: true, idempotent: false, ride: ride, seat: seat, mood: mood, remaining: spendRes.remaining };
    });
  }

  async function markCarouselAnimationSkipped(carouselRideId) {
    return await runTx(async function() {
      var cs = await loadCarouselState();
      var r = cs.rides.find(function(x) { return x.carouselRideId === carouselRideId; });
      if (!r) return null;
      r.animationSkipped = true;
      await saveCarouselState(cs);
      return r;
    });
  }

  async function updateCarouselReply(carouselRideId, charId, replyText, source, aiFailed) {
    return await runTx(async function() {
      var cs = await loadCarouselState();
      var r = cs.rides.find(function(x) { return x.carouselRideId === carouselRideId; });
      if (!r) return null;
      if (charId && r.charId && String(r.charId) !== String(charId)) return null;
      r.charReply = aiFailed ? '' : String(replyText || '');
      r.charReplySource = source || '';
      r.aiFailed = Boolean(aiFailed);
      await saveCarouselState(cs);
      return r;
    });
  }

  async function saveAmusementMemento(params) {
    params = params || {};
    var kind = params.kind; // 'plush' | 'ferris_wheel' | 'carousel'
    var sourceId = String(params.sourceId || '');
    if (!kind || !sourceId) return { ok: false, msg: '缺少纪念来源标识' };

    var mementos = await loadMementos();
    var card = null;
    var boundCharId = null;

    if (kind === 'plush') {
      var csPl = await loadClawState();
      var pl = csPl.plushies.find(function(p) { return p.plushInstanceId === sourceId || p.attemptId === sourceId; });
      if (!pl) return { ok: false, msg: '未找到该玩偶记录' };
      var dupPl = mementos.find(function(m) {
        return m.sourceType === 'amusement_park' && m.parkCategory === 'plush' && m.plushInstanceId === pl.plushInstanceId;
      });
      if (dupPl) return { ok: true, duplicate: true, memento: dupPl };

      boundCharId = pl.giftedToCharId || (_runtime.activeCharId ? String(_runtime.activeCharId) : null);
      var plCharName = pl.giftedToCharName || '游乐场收藏';
      card = {
        id: uid('mem_ap'),
        mementoId: uid('mem_ap'),
        sourceType: 'amusement_park',
        parkCategory: 'plush',
        locationId: 'starlight_park',
        locationName: '星光游乐场',
        plushInstanceId: pl.plushInstanceId,
        attemptId: pl.attemptId,
        giftEventId: pl.giftEventId || null,
        charId: boundCharId,
        charName: plCharName,
        title: '玩偶纪念 · ' + pl.name + '（' + pl.rarityLabel + '）',
        summary: pl.status === 'gifted'
          ? ('在星光游乐场抓到「' + pl.name + '」并赠予 ' + plCharName)
          : ('在星光游乐场抓到【' + pl.rarityLabel + '】玩偶「' + pl.name + '」'),
        charReplySummary: pl.charReplySummary || '',
        note: pl.desc || '',
        createdAt: pl.giftedAt || pl.obtainedAt || nowMs(),
        dateStr: pl.dateStr || getTodayStr(),
        periodLabel: getActivePeriodInfo(_runtime.timePreview).period.label,
        schemaVersion: 23
      };
    } else if (kind === 'ferris_wheel') {
      var fs = await loadFerrisState();
      var fr = fs.completedRides.find(function(r) { return r.rideId === sourceId; });
      if (!fr) return { ok: false, msg: '请先完成三幕星愿摩天轮再收藏纪念' };
      var dupFr = mementos.find(function(m) {
        return m.sourceType === 'amusement_park' && m.parkCategory === 'ferris_wheel' && m.rideId === fr.rideId;
      });
      if (dupFr) return { ok: true, duplicate: true, memento: dupFr };

      boundCharId = fr.charId ? String(fr.charId) : null;
      var actSummary = [1, 2, 3].map(function(n) {
        var ch = fr.choices && fr.choices['act' + n];
        return ch ? ('第' + n + '幕「' + ch.label + '」') : '';
      }).filter(Boolean).join(' · ');
      var lastReplyObj = fr.actReplies && (fr.actReplies.act3 || fr.actReplies.act2 || fr.actReplies.act1);
      var lastReplyTxt = (lastReplyObj && !lastReplyObj.aiFailed && lastReplyObj.text) ? lastReplyObj.text : '';

      card = {
        id: uid('mem_ap'),
        mementoId: uid('mem_ap'),
        sourceType: 'amusement_park',
        parkCategory: 'ferris_wheel',
        locationId: 'starlight_park',
        locationName: '星光游乐场',
        rideId: fr.rideId,
        charId: boundCharId,
        charName: fr.charName || '同行伙伴',
        title: '摩天轮纪念 · 星愿之夜',
        summary: '与 ' + (fr.charName || '同行伙伴') + ' 共乘星愿摩天轮：' + actSummary,
        charReplySummary: lastReplyTxt,
        note: '与 ' + (fr.charName || '同行伙伴') + ' 在星愿摩天轮的三幕记忆',
        createdAt: fr.completedAt || nowMs(),
        dateStr: fr.dateStr || getTodayStr(),
        visualPeriod: fr.visualPeriod || 'night',
        periodLabel: fr.visualPeriodLabel || '夜晚',
        isPreview: Boolean(fr.isPreview),
        schemaVersion: 23
      };
    } else if (kind === 'carousel') {
      var csCa = await loadCarouselState();
      var cr = csCa.rides.find(function(r) { return r.carouselRideId === sourceId; });
      if (!cr) return { ok: false, msg: '未找到该次旋转木马记录' };
      var dupCr = mementos.find(function(m) {
        return m.sourceType === 'amusement_park' && m.parkCategory === 'carousel' && m.carouselRideId === cr.carouselRideId;
      });
      if (dupCr) return { ok: true, duplicate: true, memento: dupCr };

      boundCharId = cr.charId ? String(cr.charId) : null;
      var crReply = (!cr.aiFailed && cr.charReply) ? cr.charReply : '';
      card = {
        id: uid('mem_ap'),
        mementoId: uid('mem_ap'),
        sourceType: 'amusement_park',
        parkCategory: 'carousel',
        locationId: 'starlight_park',
        locationName: '星光游乐场',
        carouselRideId: cr.carouselRideId,
        charId: boundCharId,
        charName: cr.charName || '独自体验',
        title: '木马纪念 · ' + cr.seatName,
        summary: '乘上「' + cr.seatName + '」（' + cr.moodName + '）的星光旋转木马时光',
        charReplySummary: crReply,
        note: cr.moodHint || '',
        createdAt: cr.completedAt || nowMs(),
        dateStr: cr.dateStr || getTodayStr(),
        visualPeriod: cr.visualPeriod || 'night',
        periodLabel: cr.visualPeriodLabel || '夜晚',
        isPreview: Boolean(cr.isPreview),
        schemaVersion: 23
      };
    } else {
      return { ok: false, msg: '未知游乐场纪念类型' };
    }

    mementos.unshift(card);
    if (mementos.length > 100) mementos = mementos.slice(0, 100);
    var ok = await saveMementos(mementos);
    if (!ok) return { ok: false, msg: '存储空间不足，游乐场纪念保存失败' };
    if (boundCharId) {
      await recordCompanionEvent(boundCharId, 'starlight_park', 'amusement_memento_saved', {
        title: card.title,
        parkCategory: card.parkCategory
      });
    }
    return { ok: true, duplicate: false, memento: card };
  }

  // ====================================================
  // 四（C）、V2.4 星愿列车站（车票购票、三阶段旅程、Char 隔离、崩溃补偿与旅行明信片）
  // ====================================================
  function getTrainDestinationById(destId) {
    return TRAIN_DESTINATIONS.find(function(d) { return d.id === destId; }) || null;
  }

  async function loadStationState() {
    var raw = await readConfig(STORAGE_KEYS.STATION_V24, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 24,
      lastSelectedDestByChar: (st.lastSelectedDestByChar && typeof st.lastSelectedDestByChar === 'object') ? st.lastSelectedDestByChar : {},
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveStationState(st) {
    st.updatedAt = nowMs();
    return await writeConfig(STORAGE_KEYS.STATION_V24, st);
  }

  async function loadJourneysState() {
    var raw = await readConfig(STORAGE_KEYS.JOURNEYS_V24, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    var ledger = (st.refundedLedger && typeof st.refundedLedger === 'object') ? st.refundedLedger : {};
    var lKeys = Object.keys(ledger);
    if (lKeys.length > 120) {
      var trimL = {};
      lKeys.slice(-120).forEach(function(k) { trimL[k] = ledger[k]; });
      ledger = trimL;
    }
    return {
      schemaVersion: 24,
      activeJourneysByChar: (st.activeJourneysByChar && typeof st.activeJourneysByChar === 'object') ? st.activeJourneysByChar : {},
      tickets: Array.isArray(st.tickets) ? st.tickets.slice(0, 60) : [],
      completedJourneys: Array.isArray(st.completedJourneys) ? st.completedJourneys.slice(0, 60) : [],
      abandonedJourneys: Array.isArray(st.abandonedJourneys) ? st.abandonedJourneys.slice(0, 30) : [],
      processedRequests: trimProcessedMap(st.processedRequests),
      pendingCompensations: Array.isArray(st.pendingCompensations) ? st.pendingCompensations.slice(-30) : [],
      refundedLedger: ledger,
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveJourneysState(st) {
    st.updatedAt = nowMs();
    if (Array.isArray(st.tickets) && st.tickets.length > 60) st.tickets = st.tickets.slice(0, 60);
    if (Array.isArray(st.completedJourneys) && st.completedJourneys.length > 60) st.completedJourneys = st.completedJourneys.slice(0, 60);
    if (Array.isArray(st.abandonedJourneys) && st.abandonedJourneys.length > 30) st.abandonedJourneys = st.abandonedJourneys.slice(0, 30);
    st.processedRequests = trimProcessedMap(st.processedRequests);
    return await writeConfig(STORAGE_KEYS.JOURNEYS_V24, st);
  }

  async function purchaseTrainTicketAndStartJourney(params) {
    params = params || {};
    var dest = getTrainDestinationById(params.destinationId);
    if (!dest) return { ok: false, reason: 'invalid_destination', msg: '请选择有效的列车目的地' };

    var cid = params.charId ? String(params.charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false, reason: 'no_char', msg: '请先选择一位同行 Char 再购买星愿车票' };

    var chars = await loadAvailableCharacters();
    var targetChar = chars.find(function(c) { return String(c.id) === cid; });
    if (!targetChar) return { ok: false, reason: 'char_not_found', msg: '指定的同行 Char 不存在' };

    var rawReq = String(params.requestId || uid('trreq'));
    var reqKey = 'train_buy_' + rawReq;

    return await runTx(async function() {
      if (!global.SharedEconomyService) {
        return { ok: false, reason: 'economy_unavailable', msg: '共享经济服务暂不可用' };
      }

      var js = await loadJourneysState();
      if (js.processedRequests[reqKey]) {
        var proc = js.processedRequests[reqKey];
        if (proc.status === 'compensation_pending') {
          var didRef = await refundOnceForKey(reqKey, TRAIN_CONFIG.ticketPrice, '星愿列车异常订单补偿退款', js.pendingCompensations, 'wanxiangMirrorStation');
          proc.status = 'refunded';
          js.refundedLedger[reqKey] = nowMs();
          js.pendingCompensations.forEach(function(c) {
            if (c.requestKey === reqKey) { c.status = 'refunded'; c.refundedAt = nowMs(); }
          });
          js.tickets.forEach(function(t) {
            if (t.paymentTransactionId === reqKey) { t.status = 'refunded'; t.updatedAt = nowMs(); }
          });
          await saveJourneysState(js);
          return { ok: false, idempotent: true, refunded: true, refundExecuted: didRef, msg: '异常购票已完成单次退款' };
        }
        if (proc.status === 'refunded') {
          return { ok: false, idempotent: true, refunded: true, refundExecuted: false, msg: '该笔购票异常已完成退款' };
        }
        var existingTicket = js.tickets.find(function(t) { return t.ticketId === proc.ticketId; }) || proc.ticket || null;
        var existingJrn = (js.activeJourneysByChar[cid] && js.activeJourneysByChar[cid].journeyId === proc.journeyId)
          ? js.activeJourneysByChar[cid]
          : (js.completedJourneys.find(function(j) { return j.journeyId === proc.journeyId; }) ||
             js.abandonedJourneys.find(function(j) { return j.journeyId === proc.journeyId; }) ||
             proc.journey || null);
        return { ok: true, idempotent: true, resumed: false, ticket: existingTicket, journey: existingJrn, destination: dest };
      }

      if (js.activeJourneysByChar[cid]) {
        var activeJrn = js.activeJourneysByChar[cid];
        var activeTkt = js.tickets.find(function(t) { return t.ticketId === activeJrn.ticketId; }) || null;
        return {
          ok: true,
          resumed: true,
          idempotent: false,
          journey: activeJrn,
          ticket: activeTkt,
          destination: getTrainDestinationById(activeJrn.destinationId) || dest
        };
      }

      // 崩溃恢复校验：若共享账本已有 [tx:reqKey] 扣款但本地无旅程记录
      try {
        var ecoPre = await getEconomySnapshot();
        var txTag = '[tx:' + reqKey + ']';
        var refTag = '[ref:' + reqKey + ']';
        if (ecoPre && Array.isArray(ecoPre.logs)) {
          var spentLogged = ecoPre.logs.some(function(l) { return l && l.type === 'expense' && typeof l.reason === 'string' && l.reason.indexOf(txTag) !== -1; });
          var refLogged = ecoPre.logs.some(function(l) { return l && l.type === 'income' && typeof l.reason === 'string' && l.reason.indexOf(refTag) !== -1; });
          if (spentLogged) {
            if (refLogged || js.refundedLedger[reqKey]) {
              return { ok: false, idempotent: true, refunded: true, refundExecuted: false, msg: '该笔异常车票已完成单次退款' };
            }
            var crashRef = await refundOnceForKey(reqKey, TRAIN_CONFIG.ticketPrice, '星愿列车未落盘补偿退款', js.pendingCompensations, 'wanxiangMirrorStation');
            js.refundedLedger[reqKey] = nowMs();
            js.processedRequests[reqKey] = { status: 'refunded' };
            await saveJourneysState(js);
            return { ok: false, idempotent: true, refunded: true, refundExecuted: crashRef, msg: '检测到未完成落盘的购票记录，已安全退还 30 金币' };
          }
        }
      } catch (_) {}

      var spendRes = await global.SharedEconomyService.spendCoins(
        TRAIN_CONFIG.ticketPrice,
        '星愿列车站：前往「' + dest.name + '」车票 [tx:' + reqKey + ']',
        'wanxiangMirrorStation'
      );
      if (!spendRes || !spendRes.success) {
        return { ok: false, reason: 'insufficient_coins', msg: (spendRes && spendRes.msg) || '金币余额不足（需要 30 金币）' };
      }

      var pInfo = getActivePeriodInfo(_runtime.timePreview);
      var cName = targetChar.nick || targetChar.name || ('角色 #' + cid);
      var tktId = uid('tkt');
      var jrnId = uid('jrn');
      var tsNow = nowMs();

      var ticket = {
        ticketId: tktId,
        journeyId: jrnId,
        requestId: rawReq,
        requestKey: reqKey,
        charId: cid,
        charName: cName,
        destinationId: dest.id,
        destinationName: dest.name,
        price: TRAIN_CONFIG.ticketPrice,
        paymentTransactionId: reqKey,
        status: 'active',
        createdAt: tsNow,
        updatedAt: tsNow
      };

      var journey = {
        journeyId: jrnId,
        ticketId: tktId,
        requestId: rawReq,
        paymentTransactionId: reqKey,
        charId: cid,
        charName: cName,
        destinationId: dest.id,
        destinationName: dest.name,
        destinationSubtitle: dest.subtitle,
        coreEvent: dest.coreEvent,
        price: TRAIN_CONFIG.ticketPrice,
        status: 'in_progress',
        currentStage: 1,
        stageStep: 'prompt', // 'prompt' | 'result'
        choices: {},
        stageReplies: {},
        visualPeriod: pInfo.displayKey,
        visualPeriodLabel: pInfo.period.label,
        isPreview: pInfo.isPreview,
        startedAt: tsNow,
        updatedAt: tsNow
      };

      js.activeJourneysByChar[cid] = journey;
      js.tickets.unshift(ticket);
      js.processedRequests[reqKey] = {
        ticketId: tktId,
        journeyId: jrnId,
        status: 'active',
        ticket: ticket,
        journey: journey
      };

      var saved = await saveJourneysState(js);
      if (!saved) {
        var didRefund = await refundOnceForKey(reqKey, TRAIN_CONFIG.ticketPrice, '星愿列车存储失败补偿退款', js.pendingCompensations, 'wanxiangMirrorStation');
        return {
          ok: false,
          reason: 'storage_failed',
          refunded: true,
          refundExecuted: didRefund,
          msg: '存储空间不足，已安全退还 30 金币'
        };
      }

      try {
        var stState = await loadStationState();
        stState.lastSelectedDestByChar[cid] = dest.id;
        await saveStationState(stState);
      } catch (_) {}

      await appendCharInteraction(cid, {
        locationId: 'starwish_station',
        type: 'train_ticket',
        cost: TRAIN_CONFIG.ticketPrice,
        title: '在星愿列车站购买了前往「' + dest.name + '」的车票并启程'
      });
      await recordCompanionEvent(cid, 'starwish_station', 'train_ticket_purchased', {
        ticketId: tktId,
        journeyId: jrnId,
        destinationId: dest.id,
        destinationName: dest.name,
        price: TRAIN_CONFIG.ticketPrice
      });
      await recordCompanionEvent(cid, 'starwish_station', 'train_journey_started', {
        ticketId: tktId,
        journeyId: jrnId,
        destinationId: dest.id,
        destinationName: dest.name
      });

      return {
        ok: true,
        idempotent: false,
        resumed: false,
        ticket: ticket,
        journey: journey,
        destination: dest,
        remaining: spendRes.remaining
      };
    });
  }

  async function chooseTrainStageOption(journeyId, stageNumber, choiceId, requestId) {
    var stgNum = Number(stageNumber);
    var reqKey = 'train_opt_' + String(requestId || uid('topt'));
    return await runTx(async function() {
      var js = await loadJourneysState();
      if (js.processedRequests[reqKey]) {
        return { ok: true, idempotent: true, journey: js.processedRequests[reqKey].journey };
      }

      var activeCid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
      var foundCid = Object.keys(js.activeJourneysByChar).find(function(k) {
        return js.activeJourneysByChar[k] && js.activeJourneysByChar[k].journeyId === journeyId;
      });
      if (!foundCid) return { ok: false, msg: '该次列车行程不存在或已结束' };
      if (activeCid && foundCid !== activeCid) {
        return { ok: false, reason: 'char_mismatch', msg: '当前同行 Char 与该趟列车不匹配，已严格隔离' };
      }

      var jrn = js.activeJourneysByChar[foundCid];
      if (jrn.currentStage !== stgNum) {
        var existingChoice = jrn.choices && jrn.choices['stage' + stgNum];
        if (existingChoice) {
          return { ok: true, idempotent: true, journey: jrn };
        }
        return { ok: false, msg: '当前处于第 ' + jrn.currentStage + ' 阶段，请按顺序推进旅程' };
      }

      var stgKey = 'stage' + stgNum;
      if (jrn.choices && jrn.choices[stgKey]) {
        return { ok: true, idempotent: true, journey: jrn };
      }

      var dest = getTrainDestinationById(jrn.destinationId);
      var stgDef = dest && dest[stgKey];
      if (!dest || !stgDef) return { ok: false, msg: '目的地阶段配置不存在' };
      var opt = stgDef.options.find(function(o) { return o.id === choiceId; });
      if (!opt) return { ok: false, msg: '无效的互动选项' };

      if (!jrn.choices) jrn.choices = {};
      jrn.choices[stgKey] = {
        stageNumber: stgNum,
        stageTitle: stgDef.shortTitle,
        choiceId: opt.id,
        label: opt.label,
        outcome: opt.outcome,
        fallbackReply: opt.fallbackReply,
        chosenAt: nowMs()
      };
      jrn.stageStep = 'result';
      jrn.updatedAt = nowMs();
      js.activeJourneysByChar[foundCid] = jrn;
      js.processedRequests[reqKey] = { journey: jrn };

      var ok = await saveJourneysState(js);
      if (!ok) return { ok: false, msg: '保存列车进度失败' };
      return { ok: true, idempotent: false, journey: jrn, destination: dest, stageDef: stgDef, option: opt };
    });
  }

  async function updateTrainStageReply(journeyId, stageNumber, charId, replyText, source, aiFailed) {
    return await runTx(async function() {
      var js = await loadJourneysState();
      var cid = String(charId || '');
      var stgKey = 'stage' + Number(stageNumber);
      var j = js.activeJourneysByChar[cid];
      if (j && j.journeyId === journeyId) {
        if (!j.stageReplies) j.stageReplies = {};
        j.stageReplies[stgKey] = {
          text: aiFailed ? '' : String(replyText || ''),
          source: source || '',
          aiFailed: Boolean(aiFailed),
          updatedAt: nowMs()
        };
        j.updatedAt = nowMs();
        await saveJourneysState(js);
        return j;
      }
      var comp = js.completedJourneys.find(function(c) { return c.journeyId === journeyId && String(c.charId) === cid; });
      if (comp) {
        if (!comp.stageReplies) comp.stageReplies = {};
        comp.stageReplies[stgKey] = {
          text: aiFailed ? '' : String(replyText || ''),
          source: source || '',
          aiFailed: Boolean(aiFailed),
          updatedAt: nowMs()
        };
        await saveJourneysState(js);
        return comp;
      }
      return null;
    });
  }

  async function advanceTrainStage(journeyId) {
    return await runTx(async function() {
      var js = await loadJourneysState();
      var activeCid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
      var foundCid = Object.keys(js.activeJourneysByChar).find(function(k) {
        return js.activeJourneysByChar[k] && js.activeJourneysByChar[k].journeyId === journeyId;
      });
      if (!foundCid) return { ok: false, msg: '未找到进行中的列车行程' };
      if (activeCid && foundCid !== activeCid) {
        return { ok: false, reason: 'char_mismatch', msg: '当前同行 Char 不匹配' };
      }
      var jrn = js.activeJourneysByChar[foundCid];
      if (!jrn.choices || !jrn.choices['stage' + jrn.currentStage]) {
        return { ok: false, msg: '请先选择当前阶段的旅途互动' };
      }
      if (jrn.currentStage < TRAIN_CONFIG.stageCount) {
        jrn.currentStage += 1;
        jrn.stageStep = 'prompt';
        jrn.updatedAt = nowMs();
        await saveJourneysState(js);
      }
      return { ok: true, journey: jrn };
    });
  }

  async function completeTrainJourney(journeyId, requestId) {
    var reqKey = 'train_fin_' + String(requestId || uid('tfin'));
    return await runTx(async function() {
      var js = await loadJourneysState();
      if (js.processedRequests[reqKey]) {
        var prevComp = js.completedJourneys.find(function(c) { return c.journeyId === journeyId; });
        return { ok: true, idempotent: true, completedJourney: prevComp || js.processedRequests[reqKey].completedJourney };
      }
      var already = js.completedJourneys.find(function(c) { return c.journeyId === journeyId; });
      if (already) {
        return { ok: true, idempotent: true, completedJourney: already };
      }

      var foundCid = Object.keys(js.activeJourneysByChar).find(function(k) {
        return js.activeJourneysByChar[k] && js.activeJourneysByChar[k].journeyId === journeyId;
      });
      if (!foundCid) return { ok: false, reason: 'not_found', msg: '未找到有效已购票的进行中旅程' };

      var jrn = js.activeJourneysByChar[foundCid];
      var matchingTicket = js.tickets.find(function(t) { return t.ticketId === jrn.ticketId && t.journeyId === jrn.journeyId; });
      if (!matchingTicket || !jrn.paymentTransactionId || matchingTicket.status !== 'active') {
        return { ok: false, reason: 'unpaid_ticket', msg: '未检测到有效的已购车票状态，无法结算旅程' };
      }
      if (!jrn.choices || !jrn.choices.stage1 || !jrn.choices.stage2 || !jrn.choices.stage3) {
        return { ok: false, reason: 'incomplete_stages', msg: '请先体验完列车三个阶段再抵达终点结算' };
      }

      var completed = Object.assign({}, jrn, {
        status: 'completed',
        completedAt: nowMs(),
        dateStr: getTodayStr()
      });
      delete js.activeJourneysByChar[foundCid];
      matchingTicket.status = 'used';
      matchingTicket.updatedAt = nowMs();
      js.completedJourneys.unshift(completed);
      js.processedRequests[reqKey] = { completedJourney: completed };

      var ok = await saveJourneysState(js);
      if (!ok) return { ok: false, reason: 'storage_failed', msg: '存储写入失败，未能保存列车到站记录' };

      var highlights = [1, 2, 3].map(function(n) {
        var ch = completed.choices['stage' + n];
        return ch ? ch.label : '';
      }).filter(Boolean).join(' → ');

      await appendCharInteraction(completed.charId, {
        locationId: 'starwish_station',
        type: 'train_journey',
        title: '与 ' + (completed.charName || '同行伙伴') + ' 乘星愿列车抵达「' + completed.destinationName + '」'
      });
      await recordCompanionEvent(completed.charId, 'starwish_station', 'train_journey_completed', {
        journeyId: completed.journeyId,
        ticketId: completed.ticketId,
        destinationId: completed.destinationId,
        destinationName: completed.destinationName,
        highlights: highlights.slice(0, 70)
      });
      await completeAcceptedInvitationForCharUnlocked(completed.charId, 'starwish_station', 'tr_fin_' + completed.journeyId, '乘星愿列车抵达「' + completed.destinationName + '」');

      return { ok: true, idempotent: false, completedJourney: completed };
    });
  }

  async function abandonTrainJourney(charId, expectedJourneyId) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false, msg: '未指定同行 Char' };
    return await runTx(async function() {
      var js = await loadJourneysState();
      var active = js.activeJourneysByChar[cid];
      if (!active) return { ok: true, alreadyEmpty: true };
      if (expectedJourneyId && active.journeyId !== expectedJourneyId) {
        return { ok: false, msg: '列车行程标识不匹配' };
      }
      var abandoned = Object.assign({}, active, {
        status: 'abandoned',
        abandonedAt: nowMs()
      });
      delete js.activeJourneysByChar[cid];
      js.abandonedJourneys.unshift(abandoned);
      js.tickets.forEach(function(t) {
        if (t.ticketId === active.ticketId) {
          t.status = 'abandoned';
          t.updatedAt = nowMs();
        }
      });
      var ok = await saveJourneysState(js);
      return { ok: ok, abandonedJourney: abandoned };
    });
  }

  async function saveTrainPostcardMemento(params) {
    params = params || {};
    var journeyId = String(params.journeyId || '');
    if (!journeyId) return { ok: false, msg: '缺少旅程标识，无法生成明信片' };

    var js = await loadJourneysState();
    var jrn = js.completedJourneys.find(function(j) { return j.journeyId === journeyId; });
    if (!jrn) return { ok: false, msg: '请先乘车抵达目的地，再选择制作旅行明信片' };

    var mementos = await loadMementos();
    var dup = mementos.find(function(m) {
      return m.sourceType === 'starwish_train' && m.journeyId === jrn.journeyId;
    });
    if (dup) return { ok: true, duplicate: true, memento: dup };

    var customCleaned = sanitizeTextField(params.customMessage, 48);
    var presetCleaned = sanitizeTextField(params.presetMessage, 48);
    var msgText = customCleaned || presetCleaned || TRAIN_CONFIG.presetMessages[0];

    var stageSummary = [1, 2, 3].map(function(n) {
      var ch = jrn.choices && jrn.choices['stage' + n];
      return ch ? ('第' + n + '站「' + ch.label + '」') : '';
    }).filter(Boolean).join(' · ');

    var lastRep = jrn.stageReplies && (jrn.stageReplies.stage3 || jrn.stageReplies.stage2 || jrn.stageReplies.stage1);
    var lastRepTxt = (lastRep && !lastRep.aiFailed && lastRep.text) ? lastRep.text : '';

    var card = {
      id: uid('mem_tr'),
      mementoId: uid('mem_tr'),
      sourceType: 'starwish_train',
      locationId: 'starwish_station',
      locationName: '星愿列车站',
      journeyId: jrn.journeyId,
      ticketId: jrn.ticketId,
      destinationId: jrn.destinationId,
      destinationName: jrn.destinationName,
      destinationSubtitle: jrn.destinationSubtitle || '',
      charId: jrn.charId ? String(jrn.charId) : null,
      charName: jrn.charName || '同行伙伴',
      title: '旅行明信片 · ' + jrn.destinationName,
      postcardMessage: msgText,
      summary: '与 ' + (jrn.charName || '同行伙伴') + ' 乘星愿列车前往「' + jrn.destinationName + '」：' + stageSummary,
      charReplySummary: lastRepTxt,
      note: msgText,
      createdAt: jrn.completedAt || nowMs(),
      dateStr: jrn.dateStr || getTodayStr(),
      visualPeriod: jrn.visualPeriod || 'day',
      periodLabel: jrn.visualPeriodLabel || '白昼',
      isPreview: Boolean(jrn.isPreview),
      schemaVersion: 24
    };

    mementos.unshift(card);
    if (mementos.length > 120) mementos = mementos.slice(0, 120);
    var ok = await saveMementos(mementos);
    if (!ok) return { ok: false, msg: '存储空间不足，旅行明信片保存失败' };

    if (jrn.charId) {
      await recordCompanionEvent(jrn.charId, 'starwish_station', 'train_postcard_saved', {
        journeyId: jrn.journeyId,
        destinationId: jrn.destinationId,
        destinationName: jrn.destinationName,
        title: card.title
      });
    }
    return { ok: true, duplicate: false, memento: card };
  }

  // ====================================================
  // 四（D）、V3.0 会呼吸的小镇：生活设置、主动邀约引擎与季节生活事件引擎
  // ====================================================
  function defaultLifeSettings() {
    return {
      invitationsEnabled: true,
      invitationFrequency: 'low',
      atmosphereEnabled: true,
      seasonalHintsEnabled: true,
      dndMode: false
    };
  }

  async function loadLifeState() {
    var raw = await readConfig(STORAGE_KEYS.LIFE_V30, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    var def = defaultLifeSettings();
    var rawSet = (st.settings && typeof st.settings === 'object') ? st.settings : {};
    var freq = rawSet.invitationFrequency === 'standard' ? 'standard' : 'low';
    var settings = {
      invitationsEnabled: rawSet.invitationsEnabled !== undefined ? Boolean(rawSet.invitationsEnabled) : def.invitationsEnabled,
      invitationFrequency: freq,
      atmosphereEnabled: rawSet.atmosphereEnabled !== undefined ? Boolean(rawSet.atmosphereEnabled) : def.atmosphereEnabled,
      seasonalHintsEnabled: rawSet.seasonalHintsEnabled !== undefined ? Boolean(rawSet.seasonalHintsEnabled) : def.seasonalHintsEnabled,
      dndMode: rawSet.dndMode !== undefined ? Boolean(rawSet.dndMode) : def.dndMode
    };
    return {
      schemaVersion: 30,
      settings: settings,
      activeSeasonalDrafts: (st.activeSeasonalDrafts && typeof st.activeSeasonalDrafts === 'object') ? st.activeSeasonalDrafts : {},
      completedSeasonalHistory: Array.isArray(st.completedSeasonalHistory) ? st.completedSeasonalHistory.slice(0, 40) : [],
      seasonalMementosIndex: (st.seasonalMementosIndex && typeof st.seasonalMementosIndex === 'object') ? st.seasonalMementosIndex : {},
      processedRequests: trimProcessedMap(st.processedRequests),
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  async function saveLifeState(st) {
    st.updatedAt = nowMs();
    st.schemaVersion = 30;
    if (Array.isArray(st.completedSeasonalHistory) && st.completedSeasonalHistory.length > 40) {
      st.completedSeasonalHistory = st.completedSeasonalHistory.slice(0, 40);
    }
    st.processedRequests = trimProcessedMap(st.processedRequests);
    return await writeConfig(STORAGE_KEYS.LIFE_V30, st);
  }

  async function saveLifeSettings(patch) {
    return await runTx(async function() {
      var st = await loadLifeState();
      var nextSettings = Object.assign({}, st.settings, patch || {});
      if (nextSettings.invitationFrequency !== 'standard') nextSettings.invitationFrequency = 'low';
      nextSettings.invitationsEnabled = Boolean(nextSettings.invitationsEnabled);
      nextSettings.atmosphereEnabled = Boolean(nextSettings.atmosphereEnabled);
      nextSettings.seasonalHintsEnabled = Boolean(nextSettings.seasonalHintsEnabled);
      nextSettings.dndMode = Boolean(nextSettings.dndMode);
      st.settings = nextSettings;
      var ok = await saveLifeState(st);
      if (!ok) return { ok: false, reason: 'storage_failed', settings: _runtime.lifeSettings };
      _runtime.lifeSettings = Object.assign({}, nextSettings);
      return { ok: true, settings: nextSettings };
    });
  }

  async function loadInvitationsState() {
    var raw = await readConfig(STORAGE_KEYS.INVITATIONS_V30, null);
    var st = (raw && typeof raw === 'object') ? raw : {};
    return {
      schemaVersion: 30,
      invitations: Array.isArray(st.invitations) ? st.invitations.slice(0, 80) : [],
      lastGlobalInviteAt: Math.max(0, Number(st.lastGlobalInviteAt) || 0),
      lastInviteByChar: (st.lastInviteByChar && typeof st.lastInviteByChar === 'object') ? st.lastInviteByChar : {},
      maxObservedTimeMs: Math.max(0, Number(st.maxObservedTimeMs) || 0),
      processedGenerationCycles: trimProcessedMap(st.processedGenerationCycles),
      processedCompletions: trimProcessedMap(st.processedCompletions),
      updatedAt: Number(st.updatedAt) || nowMs()
    };
  }

  function compactInvitationsList(list) {
    var src = Array.isArray(list) ? list : [];
    if (src.length <= 60) return src;
    var active = src.filter(function(inv) {
      return inv && (inv.status === 'pending' || inv.status === 'deferred' || inv.status === 'accepted');
    });
    var terminal = src.filter(function(inv) {
      return inv && inv.status !== 'pending' && inv.status !== 'deferred' && inv.status !== 'accepted';
    });
    var keepTerminalCount = Math.max(10, 60 - active.length);
    return active.concat(terminal.slice(0, keepTerminalCount));
  }

  async function saveInvitationsState(st) {
    st.updatedAt = nowMs();
    st.schemaVersion = 30;
    st.invitations = compactInvitationsList(st.invitations);
    st.processedGenerationCycles = trimProcessedMap(st.processedGenerationCycles);
    st.processedCompletions = trimProcessedMap(st.processedCompletions);
    return await writeConfig(STORAGE_KEYS.INVITATIONS_V30, st);
  }

  function applySilentInvitationExpiry(invState, now) {
    var changed = false;
    var expMs = INVITATION_COOLDOWNS.expiryMs;
    (invState.invitations || []).forEach(function(inv) {
      if (!inv) return;
      if (inv.status === 'pending' || inv.status === 'deferred') {
        var limitAt = Number(inv.expiresAt) || (Number(inv.createdAt || 0) + expMs);
        if (now >= limitAt) {
          inv.status = 'expired';
          inv.expiredAt = now;
          inv.updatedAt = now;
          changed = true;
        }
      }
    });
    return changed;
  }

  function pickInvitationTemplate(slotKey, seasonKey, rngFn) {
    var rand = typeof rngFn === 'function' ? rngFn : Math.random;
    var weights = INVITATION_TEMPLATES.map(function(tpl) {
      var w = 1;
      if (tpl.preferredSlots && tpl.preferredSlots.indexOf(slotKey) !== -1) w += 2;
      if (tpl.preferredSeasons && tpl.preferredSeasons.indexOf(seasonKey) !== -1) w += 1.5;
      return w;
    });
    var total = weights.reduce(function(s, x) { return s + x; }, 0);
    var roll = Math.min(0.999999, Math.max(0, Number(rand()) || 0)) * total;
    for (var i = 0; i < INVITATION_TEMPLATES.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return INVITATION_TEMPLATES[i];
    }
    return INVITATION_TEMPLATES[0];
  }

  function isInputFocused() {
    try {
      var ae = global.document && global.document.activeElement;
      if (!ae || !ae.tagName) return false;
      var tag = String(ae.tagName).toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(ae.isContentEditable);
    } catch (_) {
      return false;
    }
  }

  function isInviteUiIdle() {
    if (_runtime.activeTab !== 'map') return false;
    if (_runtime.sheet.open || _runtime.confirm.open || _runtime.pendingAction || _runtime.aiLoading || _runtime.timeMenuOpen) return false;
    if (_runtime.lifeSettings && _runtime.lifeSettings.dndMode) return false;
    if (isInputFocused()) return false;
    return true;
  }

  async function checkAndGenerateActiveInvitation(opts) {
    opts = opts || {};
    var cycleKey = String(opts.cycleKey || _runtime.sessionId || 'default_cycle');
    return await runTx(async function() {
      var life = await loadLifeState();
      _runtime.lifeSettings = Object.assign({}, life.settings);

      var invState = await loadInvitationsState();
      var now = nowMs();
      var expiredChanged = applySilentInvitationExpiry(invState, now);

      // 显式 activeCharId 校验，严禁空角色或自动兜底首位角色
      var charObj = await getActiveCharacterObj();
      if (!charObj) {
        if (expiredChanged) await saveInvitationsState(invState);
        return { ok: false, reason: 'no_active_char', invitations: invState.invitations };
      }
      var cid = String(charObj.id);
      var cname = charObj.nick || charObj.name || ('角色 #' + cid);

      // 时钟回拨异常检测：不得解锁冷却或重复生成
      if (invState.maxObservedTimeMs && now < (invState.maxObservedTimeMs - 60000)) {
        if (expiredChanged) await saveInvitationsState(invState);
        return { ok: false, reason: 'clock_rollback', existing: invState.invitations.find(function(x) { return String(x.charId) === cid && (x.status === 'pending' || x.status === 'deferred' || x.status === 'accepted'); }) || null };
      }
      if (now > invState.maxObservedTimeMs) {
        invState.maxObservedTimeMs = now;
      }

      if (!life.settings.invitationsEnabled || life.settings.dndMode) {
        if (expiredChanged) await saveInvitationsState(invState);
        return { ok: false, reason: life.settings.dndMode ? 'dnd_enabled' : 'invitations_disabled' };
      }

      // 若该周期已触发过校验，保持幂等
      if (invState.processedGenerationCycles[cycleKey]) {
        if (expiredChanged) await saveInvitationsState(invState);
        var existingActive = invState.invitations.find(function(x) {
          return String(x.charId) === cid && (x.status === 'pending' || x.status === 'deferred' || x.status === 'accepted');
        }) || null;
        return { ok: false, idempotent: true, reason: 'cycle_already_checked', existing: existingActive };
      }

      // 每个 Char 同时只允许最多一条 pending / deferred / accepted 邀约
      var nonTerminalForChar = invState.invitations.find(function(x) {
        return String(x.charId) === cid && (x.status === 'pending' || x.status === 'deferred' || x.status === 'accepted');
      });
      if (nonTerminalForChar) {
        invState.processedGenerationCycles[cycleKey] = { result: 'has_non_terminal', inviteId: nonTerminalForChar.inviteId, at: now };
        await saveInvitationsState(invState);
        return { ok: false, reason: 'existing_non_terminal', existing: nonTerminalForChar };
      }

      // 双冷却限制（低频默认 7 天/Char + 72 小时/全局；常规 72 小时/Char + 24 小时/全局）
      var cdCfg = INVITATION_COOLDOWNS[life.settings.invitationFrequency] || INVITATION_COOLDOWNS.low;
      var lastCharAt = Number(invState.lastInviteByChar[cid] || 0);
      if (invState.lastGlobalInviteAt && (now - invState.lastGlobalInviteAt) < cdCfg.globalMs) {
        invState.processedGenerationCycles[cycleKey] = { result: 'global_cooldown', at: now };
        await saveInvitationsState(invState);
        return { ok: false, reason: 'global_cooldown', nextAllowedAt: invState.lastGlobalInviteAt + cdCfg.globalMs };
      }
      if (lastCharAt && (now - lastCharAt) < cdCfg.charMs) {
        invState.processedGenerationCycles[cycleKey] = { result: 'char_cooldown', at: now };
        await saveInvitationsState(invState);
        return { ok: false, reason: 'char_cooldown', nextAllowedAt: lastCharAt + cdCfg.charMs };
      }

      var atmo = getTownAtmosphereSnapshot('auto'); // 仅使用真实时间，不受手动预览影响
      var tpl = pickInvitationTemplate(atmo.realTimeSlot, atmo.seasonKey, opts.rngFn);
      var invite = {
        inviteId: uid('inv'),
        charId: cid,
        charName: cname,
        locationId: tpl.locationId,
        locationName: tpl.locationName,
        templateId: tpl.id,
        realTimeSlot: atmo.realTimeSlot,
        seasonId: atmo.seasonKey,
        seasonYear: atmo.seasonYear,
        baseText: tpl.baseText,
        polishedText: '',
        aiPolished: false,
        status: 'pending',
        createdAt: now,
        expiresAt: now + INVITATION_COOLDOWNS.expiryMs,
        updatedAt: now,
        acceptedAt: null,
        deferredAt: null,
        dismissedAt: null,
        completedAt: null,
        completionEventId: null
      };

      invState.invitations.unshift(invite);
      invState.lastGlobalInviteAt = now;
      invState.lastInviteByChar[cid] = now;
      invState.processedGenerationCycles[cycleKey] = { result: 'generated', inviteId: invite.inviteId, at: now };

      var ok = await saveInvitationsState(invState);
      if (!ok) {
        return { ok: false, reason: 'storage_failed', msg: '存储写入失败，未能保存邀约' };
      }

      return { ok: true, idempotent: false, invitation: invite };
    });
  }

  async function polishInvitationWithAI(inviteId, expectedCharId) {
    var charObj = await getActiveCharacterObj();
    if (!charObj) return { ok: false, reason: 'no_char' };
    var cid = String(charObj.id);
    if (expectedCharId && String(expectedCharId) !== cid) return { ok: false, reason: 'char_mismatch' };
    if (typeof global.callAI !== 'function') return { ok: false, reason: 'offline' };

    var invStatePre = await loadInvitationsState();
    var targetInv = invStatePre.invitations.find(function(x) { return x.inviteId === inviteId; });
    if (!targetInv || String(targetInv.charId) !== cid) return { ok: false, reason: 'not_found_or_mismatch' };
    if (targetInv.aiPolished && targetInv.polishedText) {
      return { ok: true, cached: true, text: targetInv.polishedText, invitation: targetInv };
    }

    var reqSeq = ++_aiSeq;
    try {
      var cname = charObj.nick || charObj.name || '伴侣';
      var persona = charObj.personality || charObj.bio || '自然温和';
      var lore = await readScopedLorebook(cid, targetInv.locationName + ' 邀请');
      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== cid) {
        return { ok: false, aborted: true, reason: 'char_switched_before_ai' };
      }
      var companionEvents = await getCompanionContextForChar(cid, { limit: 4 });
      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== cid) {
        return { ok: false, aborted: true, reason: 'char_switched_before_ai' };
      }
      var compLines = companionEvents.map(function(e) { return '· ' + e.summary; }).join('\n');
      var prompt = [
        '你正在扮演「' + cname + '」（人设：' + persona + '）。',
        lore ? '世界书参考（仅限该角色）：' + lore : '',
        compLines ? '近期真实互动参考：\n' + compLines : '',
        '你准备给用户留一张便签，邀请一起去万象镜小镇的「' + targetInv.locationName + '」。',
        '原意参考：「' + targetInv.baseText + '」',
        '请保持原意，用符合人设的口吻写成 1 句不超过 45 字的自然邀约便签；严禁编造金币、奖励或未发生过的事件。'
      ].filter(Boolean).join('\n');

      var reply = await global.callAI([{ role: 'user', content: prompt }], { temperature: 0.7 });
      if (reqSeq !== _aiSeq || String(_runtime.activeCharId || '') !== cid) {
        return { ok: false, aborted: true, reason: 'char_switched_after_ai' };
      }
      var clean = sanitizeTextField(reply, 70);
      if (!clean) return { ok: false, reason: 'empty_ai' };

      var updated = await runTx(async function() {
        var st = await loadInvitationsState();
        var item = st.invitations.find(function(x) { return x.inviteId === inviteId && String(x.charId) === cid; });
        if (!item) return null;
        item.polishedText = clean;
        item.aiPolished = true;
        item.updatedAt = nowMs();
        await saveInvitationsState(st);
        return item;
      });
      return { ok: Boolean(updated), text: clean, invitation: updated };
    } catch (_) {
      return { ok: false, reason: 'ai_error' };
    }
  }

  async function transitionInvitationState(inviteId, charId, targetAction) {
    return await runTx(async function() {
      var st = await loadInvitationsState();
      var now = nowMs();
      applySilentInvitationExpiry(st, now);
      var inv = st.invitations.find(function(x) { return x.inviteId === inviteId; });
      if (!inv) return { ok: false, reason: 'not_found', msg: '邀约记录不存在' };
      var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
      if (!cid || String(inv.charId) !== cid) {
        return { ok: false, reason: 'char_mismatch', msg: '该邀约属于另一位同行 Char，已拦截跨角色操作' };
      }

      if (targetAction === 'accept') {
        if (inv.status === 'accepted') {
          return { ok: true, idempotent: true, invitation: inv };
        }
        if (inv.status !== 'pending' && inv.status !== 'deferred') {
          return { ok: false, reason: 'invalid_transition', msg: '当前邀约状态不可接受' };
        }
        inv.status = 'accepted';
        inv.acceptedAt = now;
        inv.updatedAt = now;
      } else if (targetAction === 'defer') {
        if (inv.status === 'deferred') {
          return { ok: true, idempotent: true, invitation: inv };
        }
        if (inv.status !== 'pending') {
          return { ok: false, reason: 'invalid_transition', msg: '仅待查看的邀约可设为稍后再说' };
        }
        inv.status = 'deferred';
        inv.deferredAt = now;
        inv.updatedAt = now;
      } else if (targetAction === 'dismiss') {
        if (inv.status === 'dismissed') {
          return { ok: true, idempotent: true, invitation: inv };
        }
        if (inv.status !== 'pending' && inv.status !== 'deferred') {
          return { ok: false, reason: 'invalid_transition', msg: '当前状态不可忽略' };
        }
        inv.status = 'dismissed';
        inv.dismissedAt = now;
        inv.updatedAt = now;
      } else if (targetAction === 'abandon_accepted') {
        if (inv.status === 'dismissed') {
          return { ok: true, idempotent: true, invitation: inv };
        }
        if (inv.status !== 'accepted') {
          return { ok: false, reason: 'invalid_transition', msg: '仅已接受中的邀约可结束同行状态' };
        }
        inv.status = 'dismissed';
        inv.dismissedAt = now;
        inv.updatedAt = now;
      } else {
        return { ok: false, reason: 'unknown_action' };
      }

      var ok = await saveInvitationsState(st);
      if (!ok) return { ok: false, reason: 'storage_failed', msg: '保存邀约状态失败' };
      return { ok: true, idempotent: false, invitation: inv };
    });
  }

  async function acceptInvitation(inviteId, charId) {
    return await transitionInvitationState(inviteId, charId, 'accept');
  }

  async function deferInvitation(inviteId, charId) {
    return await transitionInvitationState(inviteId, charId, 'defer');
  }

  async function dismissInvitation(inviteId, charId) {
    return await transitionInvitationState(inviteId, charId, 'dismiss');
  }

  async function abandonAcceptedInvitation(inviteId, charId) {
    return await transitionInvitationState(inviteId, charId, 'abandon_accepted');
  }

  async function completeAcceptedInvitationForCharUnlocked(charId, locationId, completionEventId, detailText) {
    if (!charId || !locationId || !completionEventId) return { ok: false, reason: 'missing_args' };
    var cid = String(charId);
    var compKey = String(completionEventId);
    var st = await loadInvitationsState();
    if (st.processedCompletions[compKey]) {
      return { ok: true, idempotent: true, completedInvite: st.processedCompletions[compKey] };
    }
    var inv = st.invitations.find(function(x) {
      return x && String(x.charId) === cid && x.locationId === locationId && x.status === 'accepted';
    });
    if (!inv) {
      return { ok: false, reason: 'no_matching_accepted_invite' };
    }
    var now = nowMs();
    inv.status = 'completed';
    inv.completedAt = now;
    inv.completionEventId = compKey;
    inv.completionDetail = sanitizeTextField(detailText || '', 60);
    inv.updatedAt = now;
    st.processedCompletions[compKey] = { inviteId: inv.inviteId, charId: cid, locationId: locationId, completedAt: now };

    var ok = await saveInvitationsState(st);
    if (!ok) return { ok: false, reason: 'storage_failed' };

    await recordCompanionEvent(cid, locationId, 'invitation_completed', {
      inviteId: inv.inviteId,
      locationId: locationId,
      locationName: inv.locationName,
      detail: inv.completionDetail
    });
    return { ok: true, idempotent: false, completedInvite: inv };
  }

  async function completeAcceptedInvitationForChar(charId, locationId, completionEventId, detailText) {
    if (!charId || !locationId || !completionEventId) return { ok: false, reason: 'missing_args' };
    return await runTx(async function() {
      return await completeAcceptedInvitationForCharUnlocked(charId, locationId, completionEventId, detailText);
    });
  }

  async function getInvitationsForChar(charId) {
    var st = await loadInvitationsState();
    var now = nowMs();
    var changed = applySilentInvitationExpiry(st, now);
    if (changed) await saveInvitationsState(st);
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    var scoped = cid ? st.invitations.filter(function(x) { return x && String(x.charId) === cid; }) : [];
    return {
      active: scoped.filter(function(x) { return x.status === 'pending' || x.status === 'accepted'; }),
      pending: scoped.filter(function(x) { return x.status === 'pending'; }),
      accepted: scoped.filter(function(x) { return x.status === 'accepted'; }),
      deferred: scoped.filter(function(x) { return x.status === 'deferred'; }),
      history: scoped.filter(function(x) { return x.status === 'completed' || x.status === 'dismissed' || x.status === 'expired'; }),
      all: scoped
    };
  }

  function getSeasonalEventForSeason(seasonKey) {
    return SEASONAL_EVENTS_V30[seasonKey] || SEASONAL_EVENTS_V30.spring;
  }

  function getCurrentSeasonalEvent(dateObj) {
    var s = getLocalSeasonInfo(dateObj);
    var ev = getSeasonalEventForSeason(s.key);
    return Object.assign({}, ev, {
      seasonLabel: s.label,
      seasonYear: s.seasonYear
    });
  }

  async function startSeasonalEventInteraction(charId, requestId) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false, reason: 'no_char', msg: '请先选择一位同行 Char 再体验季节事件' };
    var chars = await loadAvailableCharacters();
    var targetChar = chars.find(function(c) { return String(c.id) === cid; });
    if (!targetChar) return { ok: false, reason: 'char_not_found', msg: '指定的同行 Char 不存在' };

    var reqKey = 'seas_start_' + String(requestId || uid('ssreq'));
    return await runTx(async function() {
      var ls = await loadLifeState();
      if (ls.processedRequests[reqKey]) {
        var prevDraft = ls.activeSeasonalDrafts[cid];
        if (prevDraft) return { ok: true, idempotent: true, draft: prevDraft };
      }

      // 若该 Char 已在进行某季季节互动草稿（包括跨季过渡前开启的草稿），继续保留原 seasonId 与 seasonYear
      if (ls.activeSeasonalDrafts[cid]) {
        return { ok: true, resumed: true, draft: ls.activeSeasonalDrafts[cid] };
      }

      var curEv = getCurrentSeasonalEvent();
      var cname = targetChar.nick || targetChar.name || ('角色 #' + cid);
      var draft = {
        draftId: uid('sdft'),
        charId: cid,
        charName: cname,
        seasonId: curEv.seasonId,
        seasonLabel: curEv.seasonLabel,
        seasonYear: curEv.seasonYear,
        eventId: curEv.eventId,
        locationId: curEv.locationId,
        locationName: curEv.locationName,
        title: curEv.title,
        status: 'in_progress', // 'in_progress' | 'completed'
        choiceId: null,
        choiceLabel: '',
        outcomeText: '',
        charReply: '',
        charReplySource: '',
        aiFailed: false,
        mementoSaved: false,
        startedAt: nowMs(),
        updatedAt: nowMs(),
        completedAt: null
      };
      ls.activeSeasonalDrafts[cid] = draft;
      ls.processedRequests[reqKey] = { draftId: draft.draftId };
      var ok = await saveLifeState(ls);
      if (!ok) return { ok: false, reason: 'storage_failed', msg: '存储空间不足，未能开启季节活动' };
      return { ok: true, resumed: false, idempotent: false, draft: draft };
    });
  }

  async function selectSeasonalEventOption(draftId, choiceId, requestId) {
    var reqKey = 'seas_opt_' + String(requestId || uid('sopt'));
    return await runTx(async function() {
      var ls = await loadLifeState();
      if (ls.processedRequests[reqKey]) {
        return { ok: true, idempotent: true, draft: ls.processedRequests[reqKey].draft };
      }

      var activeCid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
      var foundCid = Object.keys(ls.activeSeasonalDrafts).find(function(k) {
        return ls.activeSeasonalDrafts[k] && ls.activeSeasonalDrafts[k].draftId === draftId;
      });
      if (!foundCid) return { ok: false, reason: 'not_found', msg: '季节事件草稿不存在或已关闭' };
      if (activeCid && foundCid !== activeCid) {
        return { ok: false, reason: 'char_mismatch', msg: '当前同行 Char 与季节草稿不匹配，已严格隔离' };
      }

      var draft = ls.activeSeasonalDrafts[foundCid];
      var evDef = getSeasonalEventForSeason(draft.seasonId);
      if (!evDef) return { ok: false, reason: 'event_not_found' };
      var opt = evDef.options.find(function(o) { return o.id === choiceId; });
      if (!opt) return { ok: false, reason: 'invalid_option', msg: '无效的选择' };

      if (draft.status === 'completed') {
        return { ok: true, idempotent: true, draft: draft, eventDef: evDef, option: opt };
      }

      draft.choiceId = opt.id;
      draft.choiceLabel = opt.label;
      draft.outcomeText = opt.outcome;
      draft.status = 'completed';
      draft.completedAt = nowMs();
      draft.updatedAt = nowMs();

      ls.activeSeasonalDrafts[foundCid] = draft;
      ls.completedSeasonalHistory.unshift(Object.assign({}, draft));
      ls.processedRequests[reqKey] = { draft: draft };
      var ok = await saveLifeState(ls);
      if (!ok) return { ok: false, reason: 'storage_failed', msg: '存储写入失败，未能保存选择' };

      await appendCharInteraction(draft.charId, {
        locationId: draft.locationId,
        type: 'seasonal_event',
        title: '在' + draft.seasonLabel + '限定「' + draft.title + '」选择「' + opt.label + '」'
      });
      await recordCompanionEvent(draft.charId, draft.locationId, 'seasonal_event_completed', {
        draftId: draft.draftId,
        seasonId: draft.seasonId,
        seasonLabel: draft.seasonLabel,
        seasonYear: draft.seasonYear,
        eventId: draft.eventId,
        eventTitle: draft.title,
        choiceId: opt.id,
        choiceLabel: opt.label
      });

      return { ok: true, idempotent: false, draft: draft, eventDef: evDef, option: opt };
    });
  }

  async function updateSeasonalEventReply(draftId, charId, replyText, source, aiFailed) {
    return await runTx(async function() {
      var ls = await loadLifeState();
      var cid = String(charId || '');
      var d = ls.activeSeasonalDrafts[cid];
      if (d && d.draftId === draftId) {
        d.charReply = aiFailed ? '' : String(replyText || '');
        d.charReplySource = source || '';
        d.aiFailed = Boolean(aiFailed);
        d.updatedAt = nowMs();
        ls.completedSeasonalHistory.forEach(function(h) {
          if (h && h.draftId === draftId && String(h.charId) === cid) {
            h.charReply = d.charReply;
            h.charReplySource = d.charReplySource;
            h.aiFailed = d.aiFailed;
          }
        });
        await saveLifeState(ls);
        return d;
      }
      return null;
    });
  }

  async function dismissSeasonalDraft(charId) {
    var cid = charId ? String(charId) : (_runtime.activeCharId ? String(_runtime.activeCharId) : '');
    if (!cid) return { ok: false };
    return await runTx(async function() {
      var ls = await loadLifeState();
      if (!ls.activeSeasonalDrafts[cid]) return { ok: true };
      delete ls.activeSeasonalDrafts[cid];
      var ok = await saveLifeState(ls);
      return { ok: ok };
    });
  }

  async function saveSeasonalMemento(charIdOrDraftId) {
    var ls = await loadLifeState();
    var targetStr = String(charIdOrDraftId || _runtime.activeCharId || '');
    var draft = ls.activeSeasonalDrafts[targetStr]
      || Object.keys(ls.activeSeasonalDrafts).map(function(k) { return ls.activeSeasonalDrafts[k]; }).find(function(x) { return x && x.draftId === targetStr; })
      || ls.completedSeasonalHistory.find(function(x) { return x && (x.draftId === targetStr || String(x.charId) === targetStr); });
    if (!draft || draft.status !== 'completed') {
      return { ok: false, msg: '请先完成该季节互动后再收藏季节纪念卡' };
    }

    var dedupKey = String(draft.charId) + ':' + String(draft.seasonYear) + ':' + String(draft.seasonId) + ':' + String(draft.eventId);
    var mementos = await loadMementos();
    var dup = mementos.find(function(m) {
      return m.sourceType === 'seasonal_event' && (
        m.seasonalDedupKey === dedupKey ||
        (String(m.charId) === String(draft.charId) && Number(m.seasonYear) === Number(draft.seasonYear) && m.seasonId === draft.seasonId && m.eventId === draft.eventId)
      );
    });
    if (dup) {
      return { ok: true, duplicate: true, memento: dup };
    }

    var replyTxt = (!draft.aiFailed && draft.charReply) ? draft.charReply : '';
    var card = {
      id: uid('mem_ss'),
      mementoId: uid('mem_ss'),
      sourceType: 'seasonal_event',
      locationId: draft.locationId,
      locationName: draft.locationName,
      seasonId: draft.seasonId,
      seasonLabel: draft.seasonLabel,
      seasonYear: draft.seasonYear,
      eventId: draft.eventId,
      seasonalDedupKey: dedupKey,
      charId: String(draft.charId),
      charName: draft.charName || '同行伙伴',
      title: draft.seasonLabel + '纪念 · ' + draft.title,
      summary: '与 ' + (draft.charName || '同行伙伴') + ' 在「' + draft.locationName + '」经历了「' + draft.title + '」：' + (draft.choiceLabel || ''),
      charReplySummary: replyTxt,
      note: draft.outcomeText || '',
      createdAt: draft.completedAt || nowMs(),
      dateStr: getTodayStr(),
      periodLabel: getActivePeriodInfo(_runtime.timePreview).period.label,
      schemaVersion: 30
    };

    mementos.unshift(card);
    if (mementos.length > 120) mementos = mementos.slice(0, 120);
    var savedMem = await saveMementos(mementos);
    if (!savedMem) return { ok: false, msg: '存储空间不足，季节纪念保存失败' };

    ls.seasonalMementosIndex[dedupKey] = card.id;
    if (ls.activeSeasonalDrafts[String(draft.charId)] && ls.activeSeasonalDrafts[String(draft.charId)].draftId === draft.draftId) {
      ls.activeSeasonalDrafts[String(draft.charId)].mementoSaved = true;
    }
    await saveLifeState(ls);

    await recordCompanionEvent(draft.charId, draft.locationId, 'memento_saved', { title: card.title });
    return { ok: true, duplicate: false, memento: card };
  }

  // ====================================================
  // 五、奇遇扭蛋屋 (先扣费与落盘 -> 再展示；请求 ID 防重不重复发奖)
  // ====================================================
  function rollWeightedPrize(pool, forceHighRarity, rngFn) {
    var rand = typeof rngFn === 'function' ? rngFn : Math.random;
    var candidates = forceHighRarity
      ? pool.filter(function(p) { return p.rarity === 'SR'; })
      : pool;
    if (!candidates.length) candidates = pool;

    var totalW = candidates.reduce(function(s, p) { return s + (Number(p.weight) || 1); }, 0);
    var roll = rand() * totalW;
    for (var i = 0; i < candidates.length; i++) {
      roll -= (Number(candidates[i].weight) || 1);
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  async function drawGacha(machineId, requestId, rngFn) {
    var drawKey = requestId ? String(requestId) : uid('draw');
    return await runTx(async function() {
      var machine = GACHA_MACHINES[machineId];
      if (!machine) return { ok: false, msg: '扭蛋机台不存在' };
      if (!global.SharedEconomyService) return { ok: false, msg: '共享经济服务暂不可用' };

      var gachaState = await loadGachaState();
      if (_processedDrawIds[drawKey] || gachaState.logs.some(function(l) { return l.requestId === drawKey; })) {
        var existingLog = gachaState.logs.find(function(l) { return l.requestId === drawKey; }) || _processedDrawIds[drawKey];
        return { ok: false, duplicate: true, msg: '该次抽取已结算，不重复发奖', existing: existingLog };
      }

      var spendRes = await global.SharedEconomyService.spendCoins(machine.cost, '奇遇扭蛋屋：' + machine.name, 'wanxiangMirror');
      if (!spendRes || !spendRes.success) {
        return { ok: false, msg: (spendRes && spendRes.msg) || '金币不足' };
      }

      var pityKey = machineId === 'gift' ? 'giftPity' : 'adventurePity';
      var nextPity = (Number(gachaState[pityKey]) || 0) + 1;
      var hitPity = nextPity >= machine.pityLimit;
      var prize = rollWeightedPrize(machine.pool, hitPity, rngFn);

      if (prize.rarity === 'SR') {
        gachaState[pityKey] = 0;
      } else {
        gachaState[pityKey] = nextPity;
      }
      gachaState.totalPulls = (Number(gachaState.totalPulls) || 0) + 1;

      var logRecord = {
        id: uid('gacha'),
        requestId: drawKey,
        machineId: machineId,
        machineName: machine.name,
        prizeId: prize.id,
        prizeName: prize.name,
        rarity: prize.rarity,
        hitPity: hitPity,
        cost: machine.cost,
        createdAt: nowMs(),
        charId: _runtime.activeCharId ? String(_runtime.activeCharId) : null
      };
      gachaState.logs.unshift(logRecord);

      if (machineId === 'adventure') {
        if (!gachaState.collectedEncounters.some(function(e) { return e.id === prize.id; })) {
          gachaState.collectedEncounters.push({
            id: prize.id,
            name: prize.name,
            rarity: prize.rarity,
            desc: prize.desc,
            firstFoundAt: nowMs()
          });
        }
      }

      try {
        if (machineId === 'gift') {
          await global.SharedEconomyService.addItem({
            itemId: prize.itemId,
            name: prize.name,
            icon: prize.icon,
            category: prize.invCategory || 'gift',
            desc: prize.desc
          }, 1, 'wanxiangMirrorGacha');
        } else if (prize.coinBonus > 0) {
          await global.SharedEconomyService.addCoins(prize.coinBonus, '奇遇扭蛋回馈：' + prize.name, 'wanxiangMirrorGacha');
        }
        await saveGachaState(gachaState);
      } catch (err) {
        await global.SharedEconomyService.addCoins(machine.cost, '扭蛋异常退款', 'wanxiangMirrorGacha');
        return { ok: false, msg: '保存抽取结果失败，金币已退回' };
      }

      _processedDrawIds[drawKey] = logRecord;
      await appendCharInteraction(_runtime.activeCharId, {
        locationId: 'gacha_house',
        type: 'gacha',
        title: '在「' + machine.name + '」抽中【' + prize.rarity + '】' + prize.name
      });

      return {
        ok: true,
        prize: prize,
        log: logRecord,
        pityCount: gachaState[pityKey],
        pityLimit: machine.pityLimit
      };
    });
  }

  // ====================================================
  // 六、UI 渲染与中置游戏弹窗系统（Layer 3 / 4 / 5）
  // ====================================================
  function applyTransformDom() {
    if (!_runtime.pageEl) return;
    var el = _runtime.pageEl.querySelector('#wx-map-transform');
    if (!el) return;
    var t = _runtime.mapTransform;
    el.style.width = _runtime.boardMetrics.baseW + 'px';
    el.style.height = _runtime.boardMetrics.baseH + 'px';
    el.style.transform = 'translate3d(' + t.x + 'px, ' + t.y + 'px, 0) scale(' + t.scale + ')';
  }

  function recalcStageMetrics(keepTransform) {
    if (!_runtime.pageEl) return;
    var stage = _runtime.pageEl.querySelector('#wx-map-stage');
    if (!stage) return;
    var rect = stage.getBoundingClientRect ? stage.getBoundingClientRect() : { width: 390, height: 600 };
    var w = rect.width || 390;
    var h = rect.height || 600;
    _runtime.boardMetrics = computeBoardMetrics(w, h);
    if (!keepTransform || !_runtime.mapTransform.initialized) {
      var centered = centerTransformOnPoint(50, 44, 1.0, _runtime.boardMetrics);
      _runtime.mapTransform = { x: centered.x, y: centered.y, scale: centered.scale, initialized: true };
    } else {
      var clamped = clampMapTransform(_runtime.mapTransform.x, _runtime.mapTransform.y, _runtime.mapTransform.scale, _runtime.boardMetrics);
      _runtime.mapTransform.x = clamped.x;
      _runtime.mapTransform.y = clamped.y;
      _runtime.mapTransform.scale = clamped.scale;
    }
    applyTransformDom();
  }

  async function renderAtmosphereAndInviteUi() {
    if (!_runtime.pageEl) return;
    var atmo = getTownAtmosphereSnapshot(_runtime.timePreview);
    var stageEl = _runtime.pageEl.querySelector('#wx-map-stage');
    if (stageEl) {
      stageEl.classList.toggle('is-dusk-tint', atmo.displayKey === 'dusk');
      stageEl.classList.remove('is-season-spring', 'is-season-summer', 'is-season-autumn', 'is-season-winter');
      if (atmo.atmosphereEnabled) {
        stageEl.classList.add('is-season-' + atmo.seasonKey);
      }
    }

    var atmoBar = _runtime.pageEl.querySelector('#wx-atmosphere-bar');
    if (atmoBar) {
      var showBar = _runtime.activeTab === 'map' && Boolean(_runtime.lifeSettings && _runtime.lifeSettings.atmosphereEnabled);
      atmoBar.classList.toggle('is-hidden', !showBar);
      if (showBar) {
        atmoBar.innerHTML =
          '<div class="wx-atmosphere-main">' +
            '<div class="wx-atmosphere-meta">' +
              '<span><i class="' + esc(atmo.slotDef.icon) + '"></i> ' + esc(atmo.realTimeSlotLabel) + '</span>' +
              '<span>·</span>' +
              '<span>' + esc(atmo.seasonLabel) + '</span>' +
              (atmo.isPreview ? '<span>· 预览「' + esc(atmo.displayLabel) + '」</span>' : '') +
            '</div>' +
            '<div class="wx-atmosphere-greeting">' + esc(atmo.greeting) + '</div>' +
          '</div>' +
          '<div class="wx-atmosphere-actions">' +
            (atmo.isPreview
              ? '<button type="button" class="wx-atmo-btn is-restore" data-wx-atmo-restore="auto">跟随当前时间</button>'
              : '') +
            '<button type="button" class="wx-atmo-btn" data-wx-open-life-settings="bar"><i class="fa-solid fa-sliders"></i><span>设置</span></button>' +
          '</div>';
      }
    }

    var lettersBtn = _runtime.pageEl.querySelector('#wx-letters-btn');
    var lettersCountEl = _runtime.pageEl.querySelector('#wx-letters-count');
    var noteEl = _runtime.pageEl.querySelector('#wx-invite-note');
    var cid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
    var bucket = cid ? await getInvitationsForChar(cid) : { active: [], pending: [], accepted: [], deferred: [], history: [], all: [] };

    if (lettersBtn && lettersCountEl) {
      var badgeCnt = bucket.active.length;
      lettersCountEl.textContent = badgeCnt > 0 ? String(badgeCnt) : '';
      lettersBtn.classList.toggle('has-pending', badgeCnt > 0);
    }

    if (noteEl) {
      var canShowNote = Boolean(
        cid &&
        _runtime.lifeSettings &&
        _runtime.lifeSettings.invitationsEnabled &&
        !_runtime.lifeSettings.dndMode &&
        isInviteUiIdle()
      );
      var pendingInv = canShowNote
        ? bucket.pending.find(function(inv) { return !_runtime.suppressedNoteForSession[inv.inviteId]; })
        : null;
      if (pendingInv) {
        _runtime.visibleNoteInviteId = pendingInv.inviteId;
        var noteText = (pendingInv.aiPolished && pendingInv.polishedText) ? pendingInv.polishedText : pendingInv.baseText;
        noteEl.classList.remove('is-hidden');
        noteEl.innerHTML =
          '<div class="wx-invite-note-head">' +
            '<span><i class="fa-regular fa-envelope-open"></i> 来自「' + esc(pendingInv.charName) + '」的小纸条</span>' +
            '<span class="wx-invite-note-loc">' + esc(pendingInv.locationName) + '</span>' +
          '</div>' +
          '<div class="wx-invite-note-text">' + esc(noteText) + '</div>' +
          '<div class="wx-invite-note-actions">' +
            '<button type="button" class="wx-invite-btn is-primary" data-wx-invite-act="accept" data-wx-invite-id="' + esc(pendingInv.inviteId) + '">一起去</button>' +
            '<button type="button" class="wx-invite-btn" data-wx-invite-act="defer" data-wx-invite-id="' + esc(pendingInv.inviteId) + '">稍后再说</button>' +
            '<button type="button" class="wx-invite-btn" data-wx-invite-act="dismiss" data-wx-invite-id="' + esc(pendingInv.inviteId) + '">这次先不了</button>' +
          '</div>';
      } else {
        _runtime.visibleNoteInviteId = null;
        noteEl.classList.add('is-hidden');
        noteEl.innerHTML = '';
      }
    }
  }

  async function refreshTopbarAndCompanion() {
    if (!_runtime.pageEl) return;
    var eco = await getEconomySnapshot();
    var coinEl = _runtime.pageEl.querySelector('#wx-coin-val');
    if (coinEl) coinEl.textContent = String(eco.coins || 0);

    var periodInfo = getActivePeriodInfo(_runtime.timePreview);
    var subEl = _runtime.pageEl.querySelector('#wx-topbar-sub');
    if (subEl) {
      subEl.textContent = (periodInfo.isPreview ? '预览 · ' : '') + periodInfo.period.label + ' · 镜中小镇';
    }
    var timeLabelEl = _runtime.pageEl.querySelector('#wx-time-btn-label');
    if (timeLabelEl) timeLabelEl.textContent = periodInfo.period.label;

    var timePop = _runtime.pageEl.querySelector('#wx-time-popover');
    if (timePop) {
      var curMode = _runtime.timePreview || 'auto';
      timePop.querySelectorAll('[data-wx-time-mode]').forEach(function(b) {
        b.classList.toggle('is-active', b.getAttribute('data-wx-time-mode') === curMode);
      });
    }

    var imgEl = _runtime.pageEl.querySelector('#wx-map-img');
    if (imgEl && imgEl.getAttribute('src') !== periodInfo.period.src) {
      imgEl.setAttribute('src', periodInfo.period.src);
    }

    var charObj = await getActiveCharacterObj();
    var avWrap = _runtime.pageEl.querySelector('#wx-float-avatar');
    var nameEl = _runtime.pageEl.querySelector('#wx-float-char-name');
    var hintEl = _runtime.pageEl.querySelector('#wx-float-char-hint');
    if (avWrap && nameEl && hintEl) {
      if (charObj) {
        var cname = charObj.nick || charObj.name || '伴侣';
        nameEl.textContent = cname;
        hintEl.textContent = '同行探索中 · 点击切换';
        if (charObj.avatar) {
          avWrap.innerHTML = '<img src="' + esc(charObj.avatar) + '" alt="' + esc(cname) + '" onerror="this.remove()">';
        } else {
          avWrap.textContent = cname.slice(0, 1);
        }
      } else {
        nameEl.textContent = '独自探索';
        hintEl.textContent = '点击选择同行 Char';
        avWrap.innerHTML = '<i class="fa-solid fa-user"></i>';
      }
    }

    await renderAtmosphereAndInviteUi();
  }

  function renderHotspotsHtml() {
    return LOCATIONS.map(function(loc) {
      var dotCls = (loc.status === 'open' || loc.status === 'available')
        ? 'is-open'
        : (loc.status === 'basic_open' ? 'is-basic' : (loc.status === 'collection_link' ? 'is-collection' : 'is-placeholder'));
      var box = loc.box;
      return (
        '<button type="button" class="wx-hotspot" data-loc-id="' + esc(loc.id) + '" ' +
        'aria-label="' + esc(loc.name + '（' + loc.openLabel + '）') + '" ' +
        'style="left:' + box.left + '%;top:' + box.top + '%;width:' + box.width + '%;height:' + box.height + '%;">' +
          '<span class="wx-pin">' +
            '<span class="wx-pin-dot ' + dotCls + '"></span>' +
            '<span>' + esc(loc.name) + '</span>' +
          '</span>' +
        '</button>'
      );
    }).join('');
  }

  function buildLocationHeroHtml(loc) {
    var periodInfo = getActivePeriodInfo(_runtime.timePreview);
    var bgUrl = periodInfo.period.src;
    var styleStr =
      'background-image:url(\'' + bgUrl + '\'), linear-gradient(135deg, rgba(230,139,180,0.28), rgba(111,78,142,0.34));' +
      'background-position:' + loc.pinX + '% ' + loc.pinY + '%;';
    return (
      '<div class="wx-card-hero" style="' + styleStr + '" role="img" aria-label="' + esc(loc.name + '场景插画') + '">' +
        '<div class="wx-card-hero-scrim">' +
          '<span class="wx-card-hero-tag">' + esc(loc.tagline || loc.name) + '</span>' +
          '<span class="wx-card-hero-period">' + esc(periodInfo.period.label) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  async function buildCharStripHtml(loc) {
    var charObj = await getActiveCharacterObj();
    var cname = charObj ? (charObj.nick || charObj.name) : '独自漫步';
    var avatarHtml = charObj && charObj.avatar
      ? '<img src="' + esc(charObj.avatar) + '" alt="' + esc(cname) + '" onerror="this.remove()">'
      : (charObj ? esc(cname.slice(0, 1)) : '<i class="fa-solid fa-compass"></i>');

    var quote = '';
    var meta = '';
    if (_runtime.aiLoading && charObj) {
      quote = '正在联系 ' + cname + '…';
      meta = '加载即时回应中';
    } else if (_runtime.sheet.charQuote) {
      quote = _runtime.sheet.charQuote;
      meta = _runtime.sheet.charQuoteMeta || (charObj ? '同行中' : '独自探索');
    } else if (charObj) {
      quote = cname + ' 就在你身旁，静静看着眼前的「' + (loc ? loc.name : '小镇风景') + '」。';
      meta = '同行探索中';
    } else {
      quote = '当前为独自探索模式，点击右上「切换同行」可邀请角色档案中的 Char 一起逛小镇。';
      meta = '未绑定同行角色';
    }

    var canRetry = Boolean(charObj && !_runtime.aiLoading && _runtime.sheet.charQuoteSource === 'fallback');
    var locId = loc ? loc.id : (_runtime.sheet.locationId || '');
    var isPlaceholder = loc && loc.status === 'placeholder';

    return (
      '<div class="wx-char-strip" data-wx-char-scope="' + esc(charObj ? String(charObj.id) : 'solo') + '">' +
        '<div class="wx-char-top">' +
          '<div class="wx-char-strip-avatar">' + avatarHtml + '</div>' +
          '<div class="wx-char-strip-content">' +
            '<div class="wx-char-strip-name"><span>' + esc(cname) + '</span></div>' +
            '<div class="wx-char-status-line">' + esc(meta) + '</div>' +
          '</div>' +
          '<div class="wx-char-tools">' +
            '<button type="button" class="wx-mini-btn ' + (_runtime.uiSettings.typewriterEnabled ? 'is-active' : '') + '" ' +
              'data-wx-action="toggle-typewriter" title="切换逐字显示">' +
              '字效:' + (_runtime.uiSettings.typewriterEnabled ? '开' : '关') +
            '</button>' +
            '<button type="button" class="wx-mini-btn" data-wx-action="open-char-picker">切换同行</button>' +
          '</div>' +
        '</div>' +
        '<div class="wx-char-bubble">' +
          '<div class="wx-char-strip-quote" data-wx-raw-quote="' + esc(quote) + '">' + esc(quote) + '</div>' +
          (canRetry || (loc && !isPlaceholder && _runtime.sheet.subView !== 'charChat')
            ? '<div class="wx-char-bubble-foot">' +
                '<span>' + esc(charObj ? '世界书已按角色隔离' : '自由探索') + '</span>' +
                '<div style="display:flex;gap:6px;">' +
                  (canRetry ? '<button type="button" class="wx-mini-btn" data-wx-action="retry-char-ai">重试回应</button>' : '') +
                  (loc && !isPlaceholder && _runtime.sheet.subView !== 'charChat'
                    ? '<button type="button" class="wx-mini-btn" data-wx-action="open-char-chat" data-wx-loc="' + esc(locId) + '">互动面板</button>'
                    : '') +
                '</div>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  function buildModalHeaderHtml(loc, titleOverride, subtitleHtml, backAction) {
    var iconCls = loc ? loc.icon : 'fa-solid fa-user-group';
    var title = titleOverride || (loc ? loc.name : '万象镜');
    var closeAct = backAction || 'close-sheet';
    var closeIcon = backAction ? 'fa-solid fa-angle-left' : 'fa-solid fa-xmark';
    var closeLabel = backAction ? '返回上一层' : '关闭弹窗';
    return (
      '<div class="wx-sheet-header">' +
        '<div class="wx-header-crest"><i class="' + esc(iconCls) + '"></i></div>' +
        '<div class="wx-sheet-title-wrap">' +
          '<h2 class="wx-sheet-title">' + esc(title) + '</h2>' +
          '<div class="wx-sheet-meta">' + subtitleHtml + '</div>' +
        '</div>' +
        '<button type="button" class="wx-sheet-close" data-wx-action="' + esc(closeAct) + '" aria-label="' + esc(closeLabel) + '">' +
          '<i class="' + closeIcon + '"></i>' +
        '</button>' +
      '</div>'
    );
  }

  function clearCarouselAnimTimer() {
    if (_carouselAnimTimer) {
      clearTimeout(_carouselAnimTimer);
      _carouselAnimTimer = null;
    }
    _runtime.sheet.carouselPlaying = false;
  }

  async function buildSeasonalHintBannerHtml(locId) {
    var life = await loadLifeState();
    var cid = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
    var activeDraft = (cid && life.activeSeasonalDrafts) ? life.activeSeasonalDrafts[cid] : null;
    var hasLocDraft = Boolean(activeDraft && activeDraft.locationId === locId);
    var curEv = getCurrentSeasonalEvent();
    var matchesCurrent = curEv && curEv.locationId === locId;
    if (!hasLocDraft && (!matchesCurrent || !life.settings.seasonalHintsEnabled)) return '';

    var showEv = hasLocDraft ? getSeasonalEventForSeason(activeDraft.seasonId) : curEv;
    var seasonTag = hasLocDraft ? (activeDraft.seasonLabel + '（进行中）') : curEv.seasonLabel;
    var btnText = hasLocDraft
      ? (activeDraft.status === 'completed' ? '查看季节纪念' : '继续季节互动')
      : '体验季节互动';
    return (
      '<div class="wx-seasonal-hint-banner">' +
        '<div style="min-width:0;flex:1;">' +
          '<div style="font-size:12.5px;font-weight:700;color:var(--wx-text);"><i class="' + esc(showEv.icon) + '"></i> ' + esc(seasonTag) + ' · ' + esc(showEv.title) + '</div>' +
          '<div style="font-size:11.5px;color:var(--wx-sub);margin-top:2px;">' + esc(showEv.subtitle) + '</div>' +
        '</div>' +
        '<button type="button" class="wx-item-cta is-outline" data-wx-open-seasonal="' + esc(locId) + '">' + esc(btnText) + '</button>' +
      '</div>'
    );
  }

  async function renderLettersSheet(sheetEl) {
    var charObj = await getActiveCharacterObj();
    var cid = charObj ? String(charObj.id) : '';
    var cname = charObj ? (charObj.nick || charObj.name) : '';
    var bucket = cid ? await getInvitationsForChar(cid) : { active: [], pending: [], accepted: [], deferred: [], history: [], all: [] };
    var tab = _runtime.lettersTab || 'active';
    var list = tab === 'deferred' ? bucket.deferred : (tab === 'history' ? bucket.history : bucket.active);

    var statusLabels = {
      pending: { text: '待查看', cls: 'is-warn' },
      accepted: { text: '已接受同行', cls: 'is-open' },
      deferred: { text: '稍后再说', cls: '' },
      completed: { text: '已完成同行', cls: 'is-open' },
      dismissed: { text: '已婉拒', cls: '' },
      expired: { text: '已静默过期', cls: '' }
    };

    var bodyHtml = '';
    if (!charObj) {
      bodyHtml =
        '<div class="wx-notice-box"><strong>请选择同行 Char</strong><br>小镇来信与邀约严格按角色隔离保存，请选择一位同行伙伴后查看。</div>' +
        '<button type="button" class="wx-btn-primary" data-wx-action="open-char-picker">选择同行 Char</button>';
    } else {
      bodyHtml =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
          '<span style="font-size:12px;color:var(--wx-sub);">当前视角：<strong>' + esc(cname) + '</strong>（按角色隔离）</span>' +
          '<button type="button" class="wx-mini-btn" data-wx-open-life-settings="letters"><i class="fa-solid fa-sliders"></i> 生活与邀约设置</button>' +
        '</div>' +
        '<div class="wx-seg-tabs">' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'active' ? 'is-active' : '') + '" data-wx-letters-tab="active">当前邀约 (' + bucket.active.length + ')</button>' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'deferred' ? 'is-active' : '') + '" data-wx-letters-tab="deferred">稍后再看 (' + bucket.deferred.length + ')</button>' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'history' ? 'is-active' : '') + '" data-wx-letters-tab="history">过往记录 (' + bucket.history.length + ')</button>' +
        '</div>' +
        (list.length
          ? '<div class="wx-list">' + list.map(function(inv) {
              var stMeta = statusLabels[inv.status] || { text: inv.status, cls: '' };
              var displayText = (inv.aiPolished && inv.polishedText) ? inv.polishedText : inv.baseText;
              var slotMeta = TIME_SLOTS_V30[inv.realTimeSlot] ? TIME_SLOTS_V30[inv.realTimeSlot].label : '';
              return (
                '<div class="wx-letter-card ' + (inv.status === 'pending' || inv.status === 'accepted' ? 'is-active' : '') + '">' +
                  '<div class="wx-letter-head">' +
                    '<span class="wx-letter-title">' + esc(inv.charName) + ' → ' + esc(inv.locationName) + '</span>' +
                    '<span class="wx-letter-status ' + esc(stMeta.cls) + '">' + esc(stMeta.text) + '</span>' +
                  '</div>' +
                  '<div class="wx-letter-body">' + esc(displayText) + '</div>' +
                  '<div class="wx-letter-meta">' + esc(slotMeta ? (slotMeta + ' · ') : '') + '7 天内有效 · 拒绝或过期均无惩罚</div>' +
                  '<div class="wx-letter-actions">' +
                    '<button type="button" class="wx-mini-btn" data-wx-open-letter="' + esc(inv.inviteId) + '">详情</button>' +
                    (inv.status === 'pending' || inv.status === 'deferred'
                      ? '<button type="button" class="wx-item-cta" data-wx-letter-op="accept" data-wx-invite-id="' + esc(inv.inviteId) + '">一起去</button>' +
                        (inv.status === 'pending' ? '<button type="button" class="wx-mini-btn" data-wx-letter-op="defer" data-wx-invite-id="' + esc(inv.inviteId) + '">稍后再说</button>' : '') +
                        '<button type="button" class="wx-mini-btn" data-wx-letter-op="dismiss" data-wx-invite-id="' + esc(inv.inviteId) + '">这次先不了</button>'
                      : (inv.status === 'accepted'
                          ? '<button type="button" class="wx-item-cta" data-wx-letter-op="go" data-wx-invite-id="' + esc(inv.inviteId) + '">前往「' + esc(inv.locationName) + '」</button>' +
                            '<button type="button" class="wx-mini-btn" data-wx-letter-op="abandon_accepted" data-wx-invite-id="' + esc(inv.inviteId) + '">取消同行</button>'
                          : '')) +
                  '</div>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '<div class="wx-empty">当前分类下暂无「' + esc(cname) + '」的邀约记录。</div>');
    }

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        { icon: 'fa-solid fa-envelope-open-text' },
        '小镇来信',
        '<span class="wx-status-open">轻量低打扰邀约</span><span>·</span><span>' + esc(cname || '未选 Char') + '</span>',
        'close-sheet'
      ) +
      '<div class="wx-sheet-body">' + bodyHtml + '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-open-life-settings="letters">生活设置</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderLetterDetailSheet(sheetEl) {
    var charObj = await getActiveCharacterObj();
    var cid = charObj ? String(charObj.id) : '';
    var bucket = cid ? await getInvitationsForChar(cid) : { all: [] };
    var inv = bucket.all.find(function(x) { return x.inviteId === _runtime.selectedLetterId; }) || null;
    if (!inv) {
      _runtime.sheet.subView = 'letters';
      await renderLettersSheet(sheetEl);
      return;
    }

    var statusTextMap = {
      pending: '待查看',
      accepted: '已接受（前往地点完成一次真实互动即可完成）',
      deferred: '已设为稍后再说',
      completed: '已完成同行邀约',
      dismissed: '已婉拒（无惩罚）',
      expired: '已超过 7 天静默过期（无惩罚）'
    };
    var displayText = (inv.aiPolished && inv.polishedText) ? inv.polishedText : inv.baseText;

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        { icon: 'fa-solid fa-envelope-open-text' },
        '来信详情 · ' + inv.locationName,
        '<span>来自 ' + esc(inv.charName) + '</span><span>·</span><span>' + esc(statusTextMap[inv.status] || inv.status) + '</span>',
        'back-letters'
      ) +
      '<div class="wx-sheet-body">' +
        '<div class="wx-letter-card is-active">' +
          '<div class="wx-letter-head">' +
            '<span class="wx-letter-title">' + esc(inv.charName) + ' 写给你的便签</span>' +
            '<span class="wx-letter-status is-open">' + esc(inv.locationName) + '</span>' +
          '</div>' +
          '<div class="wx-letter-body" style="font-size:13.5px;">' + esc(displayText) + '</div>' +
          (inv.completionDetail ? '<div class="wx-letter-meta">完成记录：' + esc(inv.completionDetail) + '</div>' : '') +
          '<div class="wx-letter-meta">状态：' + esc(statusTextMap[inv.status] || inv.status) + ' · 仅作为轻量邀约入口，绝不自动扣费或改写长期记忆。</div>' +
        '</div>' +
        '<div class="wx-letter-actions">' +
          (inv.status === 'pending' || inv.status === 'deferred'
            ? '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-letter-op="accept" data-wx-invite-id="' + esc(inv.inviteId) + '">一起去「' + esc(inv.locationName) + '」</button>' +
              (inv.status === 'pending' ? '<button type="button" class="wx-btn-secondary" data-wx-letter-op="defer" data-wx-invite-id="' + esc(inv.inviteId) + '">稍后再说</button>' : '') +
              '<button type="button" class="wx-btn-secondary" data-wx-letter-op="dismiss" data-wx-invite-id="' + esc(inv.inviteId) + '">这次先不了</button>'
            : (inv.status === 'accepted'
                ? '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-letter-op="go" data-wx-invite-id="' + esc(inv.inviteId) + '">前往「' + esc(inv.locationName) + '」</button>' +
                  '<button type="button" class="wx-btn-secondary" data-wx-letter-op="abandon_accepted" data-wx-invite-id="' + esc(inv.inviteId) + '">取消本次同行</button>'
                : '')) +
        '</div>' +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-letters">返回来信列表</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderLifeSettingsSheet(sheetEl) {
    var life = await loadLifeState();
    var s = life.settings;
    var backAct = _runtime.letterReturnTo === 'letters' ? 'back-letters' : 'close-sheet';

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        { icon: 'fa-solid fa-sliders' },
        '小镇生活与邀约设置',
        '<span class="wx-status-open">即时保存</span><span>·</span><span>低打扰控制</span>',
        backAct
      ) +
      '<div class="wx-sheet-body">' +
        '<div class="wx-life-setting-list">' +
          '<div class="wx-life-setting-row">' +
            '<div class="wx-life-setting-info">' +
              '<div class="wx-life-setting-title">Char 主动邀约</div>' +
              '<div class="wx-life-setting-desc">开启后，同行 Char 会在自然冷却后轻声发出小镇同行邀约；关闭后立即停止生成。</div>' +
            '</div>' +
            '<button type="button" class="wx-toggle-btn ' + (s.invitationsEnabled ? 'is-on' : '') + '" data-wx-life-toggle="invitationsEnabled">' + (s.invitationsEnabled ? '已开启' : '已关闭') + '</button>' +
          '</div>' +
          '<div class="wx-life-setting-row">' +
            '<div class="wx-life-setting-info">' +
              '<div class="wx-life-setting-title">邀约频率偏好</div>' +
              '<div class="wx-life-setting-desc">低频：每 Char 7 天 / 全局 72 小时；常规：每 Char 72 小时 / 全局 24 小时。</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
              '<button type="button" class="wx-mini-btn ' + (s.invitationFrequency === 'low' ? 'is-active' : '') + '" data-wx-life-freq="low">低频(默认)</button>' +
              '<button type="button" class="wx-mini-btn ' + (s.invitationFrequency === 'standard' ? 'is-active' : '') + '" data-wx-life-freq="standard">常规</button>' +
            '</div>' +
          '</div>' +
          '<div class="wx-life-setting-row">' +
            '<div class="wx-life-setting-info">' +
              '<div class="wx-life-setting-title">勿扰模式</div>' +
              '<div class="wx-life-setting-desc">开启后暂停左下角小纸条提醒与主动邀约生成，可随时关闭恢复。</div>' +
            '</div>' +
            '<button type="button" class="wx-toggle-btn ' + (s.dndMode ? 'is-on' : '') + '" data-wx-life-toggle="dndMode">' + (s.dndMode ? '勿扰中' : '未开启') + '</button>' +
          '</div>' +
          '<div class="wx-life-setting-row">' +
            '<div class="wx-life-setting-info">' +
              '<div class="wx-life-setting-title">小镇时段氛围与欢迎语</div>' +
              '<div class="wx-life-setting-desc">展示地图顶部真实时段轻氛围条、固定欢迎语及轻微季节边角光晕。</div>' +
            '</div>' +
            '<button type="button" class="wx-toggle-btn ' + (s.atmosphereEnabled ? 'is-on' : '') + '" data-wx-life-toggle="atmosphereEnabled">' + (s.atmosphereEnabled ? '已开启' : '已关闭') + '</button>' +
          '</div>' +
          '<div class="wx-life-setting-row">' +
            '<div class="wx-life-setting-info">' +
              '<div class="wx-life-setting-title">季节生活事件提示</div>' +
              '<div class="wx-life-setting-desc">在对应季节的推荐地点卡片中显示限定互动提示条（进行中草稿不受影响）。</div>' +
            '</div>' +
            '<button type="button" class="wx-toggle-btn ' + (s.seasonalHintsEnabled ? 'is-on' : '') + '" data-wx-life-toggle="seasonalHintsEnabled">' + (s.seasonalHintsEnabled ? '已开启' : '已关闭') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="' + backAct + '">' + (_runtime.letterReturnTo === 'letters' ? '返回来信' : '返回小镇') + '</button>' +
      '</div></div>';
  }

  async function renderSeasonalEventSheet(sheetEl) {
    var charObj = await getActiveCharacterObj();
    var cname = charObj ? (charObj.nick || charObj.name) : '';
    var cid = charObj ? String(charObj.id) : '';
    var life = await loadLifeState();
    var draft = cid ? life.activeSeasonalDrafts[cid] : null;
    var evDef = draft ? getSeasonalEventForSeason(draft.seasonId) : getCurrentSeasonalEvent();
    var mementos = await loadMementos();

    var bodyHtml = '';
    if (!charObj) {
      bodyHtml =
        '<div class="wx-notice-box"><strong>请选择同行 Char</strong><br>季节生活事件需要一位同行角色一起参与记录，请先选择同行 Char。</div>' +
        '<button type="button" class="wx-btn-primary" data-wx-action="open-char-picker">选择同行 Char</button>';
    } else if (!draft) {
      bodyHtml =
        '<div class="wx-seasonal-card">' +
          '<div class="wx-seasonal-title"><i class="' + esc(evDef.icon) + '"></i><span>' + esc(evDef.title) + '</span></div>' +
          '<div class="wx-seasonal-desc">' + esc(evDef.prompt) + '</div>' +
          '<button type="button" class="wx-btn-primary" data-wx-open-seasonal="' + esc(evDef.locationId) + '">与 ' + esc(cname) + ' 一起开启本季互动</button>' +
        '</div>';
    } else if (draft.status === 'in_progress') {
      bodyHtml =
        '<div class="wx-seasonal-card">' +
          '<div class="wx-seasonal-title"><i class="' + esc(evDef.icon) + '"></i><span>' + esc(draft.seasonLabel) + ' · ' + esc(draft.title) + '</span></div>' +
          '<div class="wx-seasonal-desc">' + esc(evDef.prompt) + '</div>' +
          '<div class="wx-choice-list">' +
            evDef.options.map(function(opt) {
              return (
                '<button type="button" class="wx-choice-card" data-wx-seasonal-choice="' + esc(opt.id) + '" data-wx-draft-id="' + esc(draft.draftId) + '">' +
                  '<span><strong>' + esc(opt.id) + '.</strong> ' + esc(opt.label) + '</span>' +
                  '<i class="fa-solid fa-angle-right"></i>' +
                '</button>'
              );
            }).join('') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;">' +
          '<button type="button" class="wx-mini-btn" data-wx-action="seasonal-abandon">结束/放弃本次草稿</button>' +
        '</div>';
    } else {
      var dedupKey = String(draft.charId) + ':' + String(draft.seasonYear) + ':' + String(draft.seasonId) + ':' + String(draft.eventId);
      var alreadySaved = mementos.some(function(m) {
        return m.sourceType === 'seasonal_event' && m.seasonalDedupKey === dedupKey;
      });
      var optMeta = evDef.options.find(function(o) { return o.id === draft.choiceId; });
      var repLine = draft.charReply
        ? draft.charReply
        : (_runtime.aiLoading ? ('正在等待 ' + cname + ' 回应…') : ((optMeta && optMeta.fallbackReply) || '微风轻轻吹过小镇，这一刻被安静留了下来。'));
      var seasonalHelper = await buildBridgeHelperForChar(cid);
      var seasonalExp = seasonalHelper.findByRef(draft.draftId, 'seasonal_event_completed') || seasonalHelper.findByRef(dedupKey);
      bodyHtml =
        '<div class="wx-seasonal-card">' +
          '<div class="wx-seasonal-title"><i class="' + esc(evDef.icon) + '"></i><span>' + esc(draft.title) + ' · ' + esc(draft.choiceLabel) + '</span></div>' +
          '<div class="wx-seasonal-desc">' + esc(draft.outcomeText) + '</div>' +
          '<div class="wx-char-bubble">' +
            '<div class="wx-char-strip-quote" data-wx-raw-quote="' + esc(repLine) + '">' + esc(repLine) + '</div>' +
            (draft.aiFailed && !_runtime.aiLoading
              ? '<div class="wx-char-bubble-foot"><span>AI 暂未接通，以上为当前季节自然回应</span><button type="button" class="wx-mini-btn" data-wx-seasonal-retry-ai="' + esc(draft.draftId) + '">重试回应</button></div>'
              : '') +
          '</div>' +
          '<div class="wx-char-actions-row">' +
            (alreadySaved
              ? '<span style="font-size:12px;color:var(--wx-open);font-weight:700;">已收藏至季节纪念</span>'
              : '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-save-seasonal-mem="' + esc(draft.draftId) + '">收藏季节纪念卡</button>') +
            '<button type="button" class="wx-btn-secondary" data-wx-action="seasonal-abandon">完成收起</button>' +
          '</div>' +
          (seasonalExp ? seasonalHelper.renderButtons(seasonalExp) : '') +
        '</div>';
    }

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        { icon: evDef.icon || 'fa-solid fa-leaf' },
        '季节生活事件 · ' + (evDef.title || '四季记忆'),
        '<span class="wx-status-open">' + esc(draft ? draft.seasonLabel : evDef.seasonLabel) + '</span><span>·</span><span>' + esc(evDef.locationName) + '</span>',
        'back-seasonal-origin'
      ) +
      '<div class="wx-sheet-body">' + bodyHtml + '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-seasonal-origin">返回上一页</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderSheet() {
    if (!_runtime.pageEl) return;
    var backdrop = _runtime.pageEl.querySelector('#wx-sheet-backdrop');
    var sheetEl = _runtime.pageEl.querySelector('#wx-sheet');
    var stageEl = _runtime.pageEl.querySelector('#wx-map-stage');
    if (!backdrop || !sheetEl) return;

    if (!_runtime.sheet.open) {
      clearTypewriter();
      backdrop.classList.remove('is-open');
      sheetEl.classList.remove('has-hero-split');
      if (stageEl) {
        stageEl.classList.remove('is-dimmed');
        stageEl.setAttribute('aria-hidden', 'false');
      }
      return;
    }

    backdrop.classList.add('is-open');
    if (stageEl) {
      stageEl.classList.add('is-dimmed');
      stageEl.setAttribute('aria-hidden', 'true');
    }

    var sub = _runtime.sheet.subView;
    sheetEl.classList.toggle('has-hero-split', sub === 'intro' || sub === 'secondary');

    if (sub === 'charPicker') {
      await renderCharPickerSheet(sheetEl);
      return;
    }
    if (sub === 'letters') {
      await renderLettersSheet(sheetEl);
      return;
    }
    if (sub === 'letterDetail') {
      await renderLetterDetailSheet(sheetEl);
      return;
    }
    if (sub === 'lifeSettings') {
      await renderLifeSettingsSheet(sheetEl);
      return;
    }
    if (sub === 'seasonal') {
      await renderSeasonalEventSheet(sheetEl);
      return;
    }

    var loc = getLocationById(_runtime.sheet.locationId);
    if (!loc) {
      _runtime.sheet.open = false;
      backdrop.classList.remove('is-open');
      if (stageEl) stageEl.classList.remove('is-dimmed');
      return;
    }

    if (sub === 'intro' || sub === 'secondary') {
      await renderLocationIntroSheet(sheetEl, loc, sub === 'secondary');
    } else if (sub === 'charChat') {
      await renderCharChatSheet(sheetEl, loc);
    } else if (sub === 'plaza') {
      await renderPlazaSheet(sheetEl, loc);
    } else if (sub === 'shop') {
      await renderShopSheet(sheetEl, loc);
    } else if (sub === 'cafe') {
      await renderCafeSheet(sheetEl, loc);
    } else if (sub === 'gacha') {
      await renderGachaSheet(sheetEl, loc);
    } else if (sub === 'gallery') {
      await renderGallerySheet(sheetEl, loc);
    } else if (sub === 'garden') {
      await renderGardenSheet(sheetEl, loc);
    } else if (sub === 'lakeside') {
      await renderLakesideSheet(sheetEl, loc);
    } else if (sub === 'park') {
      await renderParkSheet(sheetEl, loc);
    } else if (sub === 'station') {
      await renderStationSheet(sheetEl, loc);
    }
  }

  async function renderLocationIntroSheet(sheetEl, loc, showSecondary) {
    var isPlaceholder = loc.status === 'placeholder';
    var statusCls = isPlaceholder ? 'wx-status-warn' : 'wx-status-open';
    var listToRender = showSecondary && loc.secondaryFeatures ? loc.secondaryFeatures : loc.features.slice(0, 4);
    var hasMore = !showSecondary && loc.secondaryFeatures && loc.secondaryFeatures.length > 0;
    var eco = await getEconomySnapshot();

    var headerHtml = buildModalHeaderHtml(
      loc,
      loc.name,
      '<span class="' + statusCls + '">' + esc(loc.openLabel) + '</span>' +
      '<span>·</span>' +
      '<span>' + esc(isPlaceholder ? (loc.openCondition || '暂未开放') : ('金币 ' + (eco.coins || 0))) + '</span>',
      'close-sheet'
    );

    var leftCol =
      '<div class="wx-split-left">' +
        buildLocationHeroHtml(loc) +
        '<p class="wx-sheet-desc">' + esc(loc.brief) + '</p>' +
        (isPlaceholder && loc.futureTeaser
          ? '<div class="wx-notice-box">' + esc(loc.futureTeaser) + '</div>'
          : '') +
      '</div>';

    var rightCol =
      '<div class="wx-split-right">' +
        '<div class="wx-action-grid">' +
          listToRender.map(function(f) {
            return (
              '<button type="button" class="wx-action-btn ' + (f.available ? '' : 'is-disabled') + '" ' +
              (f.available ? '' : 'aria-disabled="true" ') +
              'data-wx-feature="' + esc(f.id) + '" data-wx-loc="' + esc(loc.id) + '">' +
                '<i class="' + esc(f.icon) + '"></i>' +
                '<span class="wx-action-btn-text">' +
                  '<span>' + esc(f.label) + '</span>' +
                  '<small>' + esc(f.sub) + '</small>' +
                '</span>' +
              '</button>'
            );
          }).join('') +
        '</div>' +
        (hasMore
          ? '<button type="button" class="wx-btn-secondary" style="min-height:42px;font-size:12.5px;" data-wx-action="toggle-secondary">更多入口（我的背包 / 每日签到）</button>'
          : (showSecondary
              ? '<button type="button" class="wx-btn-secondary" style="min-height:42px;font-size:12.5px;" data-wx-action="back-intro">返回主要功能</button>'
              : '')
        ) +
        await buildCharStripHtml(loc) +
      '</div>';

    var footerHtml =
      '<div class="wx-sheet-footer">' +
        '<div class="wx-sheet-footer-actions">' +
          '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
          (isPlaceholder
            ? '<button type="button" class="wx-btn-primary" disabled>敬请期待（暂未开放）</button>'
            : '<button type="button" class="wx-btn-primary" data-wx-action="enter-location" data-wx-loc="' + esc(loc.id) + '">' + esc(loc.primaryActionLabel || '进入地点') + '</button>') +
        '</div>' +
      '</div>';

    sheetEl.innerHTML = headerHtml + '<div class="wx-sheet-body">' + leftCol + rightCol + '</div>' + footerHtml;
  }

  async function renderCharPickerSheet(sheetEl) {
    var chars = await loadAvailableCharacters();
    var activeId = _runtime.activeCharId ? String(_runtime.activeCharId) : null;
    var loc = _runtime.sheet.locationId ? getLocationById(_runtime.sheet.locationId) : null;
    var backAct = loc ? 'back-intro' : 'close-sheet';

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '选择同行 Char',
        '<span>读取角色档案 · 切换不重置地图位置与背包</span>',
        backAct
      ) +
      '<div class="wx-sheet-body">' +
        '<div class="wx-list">' +
          '<div class="wx-item-row">' +
            '<div class="wx-item-icon"><i class="fa-solid fa-compass"></i></div>' +
            '<div class="wx-item-info">' +
              '<div class="wx-item-name">独自探索</div>' +
              '<div class="wx-item-meta">不携带角色，安静逛逛镜中小镇</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta ' + (!activeId ? 'is-outline' : '') + '" data-wx-pick-char="">' + (!activeId ? '当前' : '选择') + '</button>' +
          '</div>' +
          (chars.length
            ? chars.map(function(c) {
                var cid = String(c.id);
                var cname = c.nick || c.name || ('角色 #' + cid);
                var isCur = activeId === cid;
                var desc = c.personality || c.bio || c.description || '角色档案已就绪';
                return (
                  '<div class="wx-item-row">' +
                    '<div class="wx-item-icon" style="overflow:hidden;">' +
                      (c.avatar ? '<img src="' + esc(c.avatar) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove()">' : esc(cname.slice(0, 1))) +
                    '</div>' +
                    '<div class="wx-item-info">' +
                      '<div class="wx-item-name">' + esc(cname) + '</div>' +
                      '<div class="wx-item-meta">' + esc(String(desc).slice(0, 36)) + '</div>' +
                    '</div>' +
                    '<button type="button" class="wx-item-cta ' + (isCur ? 'is-outline' : '') + '" data-wx-pick-char="' + esc(cid) + '">' + (isCur ? '当前' : '同行') + '</button>' +
                  '</div>'
                );
              }).join('')
            : '<div class="wx-empty">角色档案暂无其他角色，可先在桌面「角色档案」中创建或继续独自探索。</div>'
          ) +
        '</div>' +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" style="flex:1;" data-wx-action="' + backAct + '">' + (loc ? '返回地点卡片' : '返回地图') + '</button>' +
      '</div></div>';
  }

  async function renderCharChatSheet(sheetEl, loc) {
    var charObj = await getActiveCharacterObj();
    var cname = charObj ? (charObj.nick || charObj.name) : '独自探索';
    var history = getCharHistoryFor(charObj ? charObj.id : null, loc.id);

    // 仅展示当前地点真正支持的互动按钮
    var quickActionsHtml = '';
    if (loc.id === 'mirror_plaza') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="plaza-wish">喷泉许愿</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-action="plaza-greet">打个招呼</button>';
    } else if (loc.id === 'shopping_street') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="shopping_street">逛逛货架</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-action="open-shop-bag">打开背包送礼</button>';
    } else if (loc.id === 'afternoon_cafe') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="afternoon_cafe">点单菜单</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-action="cafe-save-photo">拍一张留影</button>';
    } else if (loc.id === 'gacha_house') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="gacha_house">去抽扭蛋</button>';
    } else if (loc.id === 'mirror_gallery') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-switch-tab="mementos">查看留影</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-switch-tab="codex">查看图鉴</button>';
    } else if (loc.id === 'four_seasons_garden') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="four_seasons_garden">回到花园</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-garden-tab="collect">采集花材</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-garden-tab="craft">制作花束</button>';
    } else if (loc.id === 'lakeside_walk') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="lakeside_walk">回到湖畔</button>';
    } else if (loc.id === 'starlight_park') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="starlight_park">回到游乐场</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-park-view="claw">抓娃娃机</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-park-view="ferris">星愿摩天轮</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-park-view="carousel">梦幻木马</button>';
    } else if (loc.id === 'starwish_station') {
      quickActionsHtml =
        '<button type="button" class="wx-mini-btn" data-wx-action="enter-location" data-wx-loc="starwish_station">回到列车站</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-station-view="tickets">查看车票</button>' +
        '<button type="button" class="wx-mini-btn" data-wx-station-view="postcards">旅行明信片</button>';
    }

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        loc.name + ' · 同行互动',
        '<span>当前同行：' + esc(cname) + '</span><span>·</span><span>世界书隔离保护</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        await buildCharStripHtml(loc) +
        (history.length
          ? '<div class="wx-section-head"><span>本次「' + esc(loc.name) + '」对话记录</span></div>' +
            '<div class="wx-char-history">' +
              history.map(function(h) {
                return '<div class="wx-char-hist-item ' + (h.role === 'user' ? 'is-user' : '') + '">' + esc(h.text) + '</div>';
              }).join('') +
            '</div>'
          : '<div class="wx-notice-box">在下方对 ' + esc(cname) + ' 说句话，或点击当前地点支持的互动动作，回应将严格基于当下已发生事件。</div>'
        ) +
        '<div class="wx-chat-row">' +
          '<input type="text" class="wx-input" id="wx-char-panel-input" placeholder="对 ' + esc(cname) + ' 说点什么...">' +
          '<button type="button" class="wx-item-cta" data-wx-action="char-panel-send">说话</button>' +
        '</div>' +
        (quickActionsHtml
          ? '<div class="wx-char-actions-row">' + quickActionsHtml + '</div>'
          : '') +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回地点</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderPlazaSheet(sheetEl, loc) {
    var guardKey = 'wx_plaza_wish_' + getTodayStr();
    var eco = await getEconomySnapshot();
    var wishClaimed = false;
    try {
      if (global.WanwanSharedHub && global.WanwanSharedHub.RewardGuard) {
        var rec = await global.WanwanSharedHub.RewardGuard.getTodayRecord();
        wishClaimed = rec && rec.all && rec.all._globalEventIds && rec.all._globalEventIds.indexOf(guardKey) !== -1;
      }
    } catch (_) {}

    var seasonalBannerHtml = await buildSeasonalHintBannerHtml('mirror_plaza');
    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '镜心广场',
        '<span class="wx-status-open">基础开放</span><span>·</span><span class="wx-num">余额 ' + (eco.coins || 0) + ' 金币</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        '<div class="wx-notice-box">' +
          '<strong>今日小镇公告</strong><br>' +
          '镜心广场、心动商店街、午后咖啡馆、奇遇扭蛋屋、镜中留影馆、四季花园、湖畔步道、星光游乐场与星愿列车站已全部开放，欢迎和同行伙伴畅游镜中小镇！' +
        '</div>' +
        seasonalBannerHtml +
        await buildCharStripHtml(loc) +
        '<div class="wx-action-grid">' +
          '<button type="button" class="wx-action-btn" data-wx-action="plaza-wish">' +
            '<i class="fa-solid fa-droplet"></i>' +
            '<span class="wx-action-btn-text"><span>' + (wishClaimed ? '今日已许愿' : '喷泉许愿 (+15币)') + '</span><small>每日一次 · 防重入账</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-action="plaza-greet">' +
            '<i class="fa-solid fa-comment"></i>' +
            '<span class="wx-action-btn-text"><span>和同行者聊聊</span><small>听听广场上的见闻</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-jump-loc="shopping_street">' +
            '<i class="fa-solid fa-store"></i>' +
            '<span class="wx-action-btn-text"><span>前往商店街</span><small>购物与每日签到</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-jump-loc="gacha_house">' +
            '<i class="fa-solid fa-egg"></i>' +
            '<span class="wx-action-btn-text"><span>前往扭蛋屋</span><small>抽取礼物与奇遇</small></span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderShopSheet(sheetEl, loc) {
    var eco = await getEconomySnapshot();
    var cat = _runtime.sheet.shopCat || 'all';
    var cats = [
      { key: 'all', label: '全部货架' },
      { key: 'gift', label: '礼物屋' },
      { key: 'life', label: '生活馆' },
      { key: 'style', label: '穿搭铺' },
      { key: 'prop', label: '奇遇道具店' },
      { key: 'bag', label: '我的背包 (' + (eco.inventory ? eco.inventory.length : 0) + ')' }
    ];

    var bodyHtml = '';
    if (cat === 'bag') {
      var inv = eco.inventory || [];
      bodyHtml = inv.length
        ? '<div class="wx-list">' + inv.map(function(item) {
            return (
              '<div class="wx-item-row">' +
                '<div class="wx-item-icon"><i class="' + esc(item.icon || 'fa-solid fa-box') + '"></i></div>' +
                '<div class="wx-item-info">' +
                  '<div class="wx-item-name">' + esc(item.name) + ' <span class="wx-num" style="font-size:12px;color:var(--wx-sub);">×' + (item.count || 1) + '</span></div>' +
                  '<div class="wx-item-meta">' + esc(item.desc || '共享背包物品') + '</div>' +
                '</div>' +
                '<button type="button" class="wx-item-cta is-outline" data-wx-gift-item="' + esc(item.itemId) + '">赠给 Char</button>' +
              '</div>'
            );
          }).join('') + '</div>'
        : '<div class="wx-empty">共享背包暂无物品，可以在商店街或扭蛋屋获取。</div>';
    } else {
      var goods = cat === 'all' ? SHOP_GOODS : SHOP_GOODS.filter(function(g) { return g.category === cat; });
      bodyHtml = '<div class="wx-list">' + goods.map(function(g) {
        return (
          '<div class="wx-item-row">' +
            '<div class="wx-item-icon"><i class="' + esc(g.icon) + '"></i></div>' +
            '<div class="wx-item-info">' +
              '<div class="wx-item-name">' + esc(g.name) + '</div>' +
              '<div class="wx-item-meta">' + esc(g.desc) + ' · ' + esc(g.condition) + '</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta wx-num" data-wx-buy-good="' + esc(g.id) + '">' + g.price + ' 币</button>' +
          '</div>'
        );
      }).join('') + '</div>';
    }

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '心动商店街',
        '<span class="wx-status-open">共享经济统一入包</span><span>·</span><span class="wx-num">金币 ' + (eco.coins || 0) + '</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
          '<span style="font-size:12px;color:var(--wx-sub);">万象镜精选货架与每日签到已整合至此</span>' +
          '<button type="button" class="wx-item-cta is-outline" data-wx-action="shop-signin"><i class="fa-solid fa-gift"></i> 每日签到</button>' +
        '</div>' +
        '<div class="wx-seg-tabs">' +
          cats.map(function(c) {
            return '<button type="button" class="wx-seg-tab ' + (c.key === cat ? 'is-active' : '') + '" data-wx-shop-cat="' + c.key + '">' + esc(c.label) + '</button>';
          }).join('') +
        '</div>' +
        await buildCharStripHtml(loc) +
        bodyHtml +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderCafeSheet(sheetEl, loc) {
    var eco = await getEconomySnapshot();
    var logs = await loadCharLogs();
    var scopeKey = _runtime.activeCharId ? String(_runtime.activeCharId) : 'solo';
    var recentOrders = ((logs[scopeKey] && logs[scopeKey].interactions) || [])
      .filter(function(it) { return it.locationId === 'afternoon_cafe'; })
      .slice(0, 4);

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '午后咖啡馆',
        '<span class="wx-status-open">轻量双人约会</span><span>·</span><span class="wx-num">金币 ' + (eco.coins || 0) + '</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        await buildCharStripHtml(loc) +
        '<div class="wx-section-head"><span>点单饮品</span><span style="font-size:11px;color:var(--wx-sub);font-weight:400;">实际点单才记录互动</span></div>' +
        '<div class="wx-list">' +
          CAFE_MENU.drink.map(function(d) {
            return (
              '<div class="wx-item-row">' +
                '<div class="wx-item-icon"><i class="fa-solid fa-mug-saucer"></i></div>' +
                '<div class="wx-item-info"><div class="wx-item-name">' + esc(d.name) + '</div><div class="wx-item-meta">' + esc(d.desc) + '</div></div>' +
                '<button type="button" class="wx-item-cta wx-num" data-wx-cafe-order="drink:' + esc(d.id) + '">' + d.price + ' 币</button>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div class="wx-section-head"><span>分享甜点</span></div>' +
        '<div class="wx-list">' +
          CAFE_MENU.dessert.map(function(d) {
            return (
              '<div class="wx-item-row">' +
                '<div class="wx-item-icon"><i class="fa-solid fa-cake-candles"></i></div>' +
                '<div class="wx-item-info"><div class="wx-item-name">' + esc(d.name) + '</div><div class="wx-item-meta">' + esc(d.desc) + '</div></div>' +
                '<button type="button" class="wx-item-cta wx-num" data-wx-cafe-order="dessert:' + esc(d.id) + '">' + d.price + ' 币</button>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div class="wx-section-head"><span>和 Char 聊天 / 拍照留念</span></div>' +
        '<div class="wx-chat-row">' +
          '<input type="text" class="wx-input" id="wx-cafe-chat-input" placeholder="说点什么或留一句今日心情...">' +
          '<button type="button" class="wx-item-cta" data-wx-action="cafe-send-chat">发送</button>' +
        '</div>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="cafe-save-photo"><i class="fa-solid fa-camera"></i> 拍一张咖啡馆留影（存至万象镜）</button>' +
        (recentOrders.length
          ? '<div class="wx-notice-box"><strong>当前视角近期记录</strong><br>' +
              recentOrders.map(function(o) { return '· ' + esc(o.title); }).join('<br>') +
            '</div>'
          : '') +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderGachaSheet(sheetEl, loc) {
    var eco = await getEconomySnapshot();
    var gs = await loadGachaState();
    var tab = _runtime.sheet.gachaTab || 'gift';
    var lastRes = _runtime.sheet.lastGachaResult;

    var contentHtml = '';
    if (tab === 'odds') {
      contentHtml =
        '<div class="wx-gacha-odds">' +
          '<strong>奖池概率与保底规则公示</strong><br>' +
          '1. 心动礼物机 (40 金币/次)：N 级 55% · R 级 30% · SR 级 15%，每 10 抽必出 SR 道具；抽中道具直接入共享背包。<br>' +
          '2. 镜界奇遇机 (30 金币/次)：N 级 55% · R 级 30% · SR 级 15%，每 10 抽必出 SR 典藏奇遇；重要地点与主线剧情永不锁死在扭蛋中。<br>' +
          '3. 先扣费并可靠保存结果后再展示卡片，单次请求附带防重编号，不会因刷新或重播动画重复发奖。' +
        '</div>';
    } else if (tab === 'history') {
      contentHtml = gs.logs.length
        ? '<div class="wx-list">' + gs.logs.slice(0, 15).map(function(l) {
            return (
              '<div class="wx-item-row">' +
                '<div class="wx-item-icon"><i class="fa-solid fa-star"></i></div>' +
                '<div class="wx-item-info">' +
                  '<div class="wx-item-name">[' + esc(l.rarity) + '] ' + esc(l.prizeName) + '</div>' +
                  '<div class="wx-item-meta">' + esc(l.machineName) + (l.hitPity ? ' · 保底触发' : '') + '</div>' +
                '</div>' +
              '</div>'
            );
          }).join('') + '</div>'
        : '<div class="wx-empty">暂无抽取记录</div>';
    } else {
      var m = GACHA_MACHINES[tab] || GACHA_MACHINES.gift;
      var pity = tab === 'gift' ? gs.giftPity : gs.adventurePity;
      contentHtml =
        '<div class="wx-gacha-card">' +
          '<div class="wx-gacha-head">' +
            '<span class="wx-gacha-title">' + esc(m.name) + '</span>' +
            '<span class="wx-num" style="font-size:12px;color:var(--wx-sub);">保底进度 ' + pity + ' / ' + m.pityLimit + '</span>' +
          '</div>' +
          '<p style="margin:0;font-size:12px;line-height:1.5;color:var(--wx-sub);">' + esc(m.summary) + '</p>' +
          '<div class="wx-gacha-odds">' +
            m.pool.map(function(p) {
              return '[' + p.rarity + '] ' + esc(p.name) + ' (' + p.weight + '%)';
            }).join(' · ') +
          '</div>' +
          '<button type="button" class="wx-btn-primary wx-num" data-wx-gacha-draw="' + esc(m.id) + '">抽取一次（消耗 ' + m.cost + ' 金币）</button>' +
        '</div>' +
        (lastRes && lastRes.machineId === m.id
          ? '<div class="wx-gacha-result">' +
              '<div style="font-size:12px;color:var(--wx-open);font-weight:700;">结果已可靠落盘 · 获得 [' + esc(lastRes.rarity) + '] ' + esc(lastRes.prizeName) + '</div>' +
              '<div style="font-size:12px;color:var(--wx-sub);">' + esc(lastRes.desc || '') + '</div>' +
            '</div>'
          : '');
    }

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '奇遇扭蛋屋',
        '<span class="wx-status-open">可靠落盘防重</span><span>·</span><span class="wx-num">金币 ' + (eco.coins || 0) + '</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        '<div class="wx-seg-tabs">' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'gift' ? 'is-active' : '') + '" data-wx-gacha-tab="gift">心动礼物机</button>' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'adventure' ? 'is-active' : '') + '" data-wx-gacha-tab="adventure">镜界奇遇机</button>' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'odds' ? 'is-active' : '') + '" data-wx-gacha-tab="odds">概率公示</button>' +
          '<button type="button" class="wx-seg-tab ' + (tab === 'history' ? 'is-active' : '') + '" data-wx-gacha-tab="history">抽取记录</button>' +
        '</div>' +
        await buildCharStripHtml(loc) +
        contentHtml +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderGallerySheet(sheetEl, loc) {
    var mementos = await loadMementos();
    var gs = await loadGachaState();
    var st = await loadMirrorState();
    var visitedCount = Object.keys(st.visitedLocations || {}).length;
    var flCount = mementos.filter(function(m) { return m.sourceType === 'flower_language'; }).length;
    var lkCount = mementos.filter(function(m) { return m.sourceType === 'lakeside_walk'; }).length;
    var apCount = mementos.filter(function(m) { return m.sourceType === 'amusement_park'; }).length;
    var trCount = mementos.filter(function(m) { return m.sourceType === 'starwish_train'; }).length;
    var ssCount = mementos.filter(function(m) { return m.sourceType === 'seasonal_event'; }).length;

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '镜中留影馆',
        '<span class="wx-status-open">花语(' + flCount + ') · 湖畔(' + lkCount + ') · 游乐(' + apCount + ') · 明信片(' + trCount + ') · 季节(' + ssCount + ')</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        await buildCharStripHtml(loc) +
        '<div class="wx-action-grid">' +
          '<button type="button" class="wx-action-btn" data-wx-switch-tab="mementos">' +
            '<i class="fa-solid fa-images"></i><span class="wx-action-btn-text"><span>万象镜纪念册 (' + mementos.length + ')</span><small>咖啡馆 / 花语 / 湖畔 / 游乐 / 旅行明信片</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-switch-tab="codex">' +
            '<i class="fa-solid fa-book"></i><span class="wx-action-btn-text"><span>奇遇图鉴 (' + gs.collectedEncounters.length + ' · 到访 ' + visitedCount + '/9)</span><small>打开图鉴全屏栏</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-external="achievement">' +
            '<i class="fa-solid fa-award"></i><span class="wx-action-btn-text"><span>成就馆</span><small>查看正式勋章与纪念卡</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-external="loveDiary">' +
            '<i class="fa-solid fa-heart"></i><span class="wx-action-btn-text"><span>恋爱记</span><small>独立恋爱纪念空间</small></span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderGardenSheet(sheetEl, loc) {
    var gs = await loadGardenState();
    var colStatus = getGardenDailyCollectionStatus(gs);
    var season = getLocalSeasonInfo();
    var mementos = await loadMementos();
    var gTab = _runtime.sheet.gardenTab || 'home';
    var draft = _runtime.sheet.craftDraft || { counts: {}, wrappingId: 'sakura_pink', ribbonId: 'champagne_gold', name: '' };
    var charObj = await getActiveCharacterObj();
    var activeCid = charObj ? String(charObj.id) : null;

    var tabs = [
      { key: 'home', label: '花园概览' },
      { key: 'collect', label: '采集 (' + colStatus.remaining + '/' + colStatus.limit + ')' },
      { key: 'craft', label: '制作花束' },
      { key: 'basket', label: '花材篮' },
      { key: 'mementos', label: '花束与纪念' }
    ];

    var seasonBarHtml =
      '<div class="wx-season-bar">' +
        '<div>' +
          '<div class="wx-season-bar-title"><i class="' + esc(season.icon) + '"></i><span>当前季节：' + esc(season.label) + ' · ' + esc(season.decor) + '</span></div>' +
          '<div class="wx-season-bar-meta">' +
            (colStatus.rollbackBlocked
              ? '检测到设备日期回拨，今日免费采集已安全锁定'
              : '今日免费采集剩余 <strong class="wx-num">' + colStatus.remaining + ' / ' + colStatus.limit + '</strong> 次（免费，不扣金币）') +
          '</div>' +
        '</div>' +
      '</div>';

    var totalPicked = 0;
    var distinctTypes = 0;
    FLOWERS.forEach(function(f) {
      var q = Math.floor(Number(draft.counts && draft.counts[f.id]) || 0);
      if (q > 0) {
        totalPicked += q;
        distinctTypes += 1;
      }
    });

    var bodyInner = '';
    if (gTab === 'home') {
      var ownedCnt = gs.bouquets.filter(function(b) { return b.status === 'owned'; }).length;
      var flowerTotal = FLOWERS.reduce(function(s, f) { return s + (gs.flowers[f.id] || 0); }, 0);
      bodyInner =
        '<div class="wx-action-grid">' +
          '<button type="button" class="wx-action-btn" data-wx-garden-tab="collect">' +
            '<i class="fa-solid fa-seedling"></i><span class="wx-action-btn-text"><span>每日免费采集</span><small>今日剩余 ' + colStatus.remaining + ' / ' + colStatus.limit + ' 次</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-garden-tab="craft">' +
            '<i class="fa-solid fa-fan"></i><span class="wx-action-btn-text"><span>制作心意花束</span><small>现有花材 ' + flowerTotal + ' 朵</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-garden-tab="basket">' +
            '<i class="fa-solid fa-basket-shopping"></i><span class="wx-action-btn-text"><span>花材与花语图鉴</span><small>8 种基础花材</small></span>' +
          '</button>' +
          '<button type="button" class="wx-action-btn" data-wx-garden-tab="mementos">' +
            '<i class="fa-solid fa-heart"></i><span class="wx-action-btn-text"><span>送花与花语纪念</span><small>待送花束 ' + ownedCnt + ' 束</small></span>' +
          '</button>' +
        '</div>';
    } else if (gTab === 'collect') {
      var lastCol = _runtime.sheet.lastCollectedFlower;
      var collectDisabled = colStatus.remaining <= 0 || colStatus.rollbackBlocked || _runtime.pendingAction;
      bodyInner =
        '<button type="button" class="wx-btn-primary" data-wx-action="garden-collect" ' + (collectDisabled ? 'disabled' : '') + '>' +
          (colStatus.rollbackBlocked ? '日期校验未通过（今日已锁定）' : (colStatus.remaining > 0 ? '采集一次（免费 · 剩 ' + colStatus.remaining + ' 次）' : '今日免费采集次数已用完（0/3）')) +
        '</button>' +
        (lastCol
          ? '<div class="wx-bouquet-preview">' +
              '<div class="wx-bouquet-title">' +
                '<span><i class="' + esc(lastCol.icon) + '" style="color:' + esc(lastCol.color) + ';"></i> 采到「' + esc(lastCol.name) + '」×1</span>' +
                '<span class="wx-num" style="font-size:12px;color:var(--wx-open);">花语：' + esc(lastCol.meaning) + '</span>' +
              '</div>' +
              '<div class="wx-bouquet-meta">当前收纳库存：<strong>' + (gs.flowers[lastCol.id] || 0) + '</strong> 朵 · 已自动存入四季花园花材篮</div>' +
            '</div>'
          : '<div class="wx-notice-box">每日 0 点刷新 3 次免费采集机会；当前季节当季花材出现概率更高。</div>') +
        '<div class="wx-section-head"><span>当前花材概览</span></div>' +
        '<div class="wx-flower-grid">' +
          FLOWERS.map(function(f) {
            var inSeason = f.seasons.indexOf(season.key) !== -1;
            return (
              '<div class="wx-flower-card ' + (inSeason ? 'is-in-season' : '') + '">' +
                '<div class="wx-flower-head">' +
                  '<div class="wx-flower-name"><i class="' + esc(f.icon) + '" style="color:' + esc(f.color) + ';"></i><span>' + esc(f.name) + '</span></div>' +
                  '<span class="wx-flower-qty wx-num">×' + (gs.flowers[f.id] || 0) + '</span>' +
                '</div>' +
                '<div class="wx-flower-meaning">花语：' + esc(f.meaning) + (inSeason ? ' · 当季' : '') + '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>';
    } else if (gTab === 'craft') {
      var previewMeta = buildBouquetMetadata(draft.counts, draft.wrappingId, draft.ribbonId, draft.name);
      var canCraft = totalPicked === 3 && distinctTypes >= 1 && distinctTypes <= 3;
      bodyInner =
        '<div class="wx-section-head"><span>1. 选择 1–3 种花材（合计恰好 3 份）</span><span class="wx-num">已选 ' + totalPicked + ' / 3</span></div>' +
        '<div class="wx-flower-grid">' +
          FLOWERS.map(function(f) {
            var stock = gs.flowers[f.id] || 0;
            var picked = Math.floor(Number(draft.counts && draft.counts[f.id]) || 0);
            var decDis = picked <= 0;
            var incDis = picked >= stock || totalPicked >= 3 || (picked === 0 && distinctTypes >= 3);
            var inSeason = f.seasons.indexOf(season.key) !== -1;
            return (
              '<div class="wx-flower-card ' + (inSeason ? 'is-in-season' : '') + '">' +
                '<div class="wx-flower-head">' +
                  '<div class="wx-flower-name"><i class="' + esc(f.icon) + '" style="color:' + esc(f.color) + ';"></i><span>' + esc(f.name) + '</span></div>' +
                  '<span class="wx-flower-qty wx-num">存 ' + stock + '</span>' +
                '</div>' +
                '<div class="wx-flower-meaning">花语：' + esc(f.meaning) + '</div>' +
                '<div class="wx-qty-ctrl">' +
                  '<button type="button" class="wx-qty-btn" data-wx-craft-dec="' + esc(f.id) + '" ' + (decDis ? 'disabled' : '') + ' aria-label="减少' + esc(f.name) + '">-</button>' +
                  '<span class="wx-num" style="font-weight:700;">' + picked + '</span>' +
                  '<button type="button" class="wx-qty-btn" data-wx-craft-inc="' + esc(f.id) + '" ' + (incDis ? 'disabled' : '') + ' aria-label="增加' + esc(f.name) + '">+</button>' +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div class="wx-section-head"><span>2. 免费挑选包装纸与丝带</span></div>' +
        '<div class="wx-swatch-row">' +
          BOUQUET_WRAPPINGS.map(function(w) {
            var act = previewMeta.wrapping.id === w.id;
            return '<button type="button" class="wx-swatch-btn ' + (act ? 'is-active' : '') + '" data-wx-wrap-id="' + esc(w.id) + '"><span class="wx-swatch-dot" style="background:' + esc(w.hex) + ';"></span><span>' + esc(w.name) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="wx-swatch-row">' +
          BOUQUET_RIBBONS.map(function(r) {
            var act = previewMeta.ribbon.id === r.id;
            return '<button type="button" class="wx-swatch-btn ' + (act ? 'is-active' : '') + '" data-wx-ribbon-id="' + esc(r.id) + '"><span class="wx-swatch-dot" style="background:' + esc(r.hex) + ';"></span><span>丝带：' + esc(r.name) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="wx-section-head"><span>3. 为花束起名（选填，最多24字）</span></div>' +
        '<input type="text" class="wx-input" id="wx-bouquet-name-input" maxlength="24" value="' + esc(draft.name || '') + '" placeholder="留空将生成默认花语名">' +
        '<div class="wx-bouquet-preview is-wrap-' + esc(previewMeta.wrapping.id) + '">' +
          '<div class="wx-bouquet-title">' +
            '<span id="wx-bouquet-preview-name">' + esc(totalPicked > 0 ? previewMeta.name : '请选择 3 份花材进行搭配') + '</span>' +
            '<span class="wx-num" style="font-size:12px;">' + totalPicked + ' / 3 朵</span>' +
          '</div>' +
          '<div class="wx-bouquet-meta">' +
            (totalPicked > 0
              ? '花材：' + esc(previewMeta.items.map(function(i) { return i.name + '×' + i.count; }).join('、')) + '<br>' +
                '花语：' + esc(previewMeta.meanings) + ' · 包装：' + esc(previewMeta.wrapping.name) + ' / ' + esc(previewMeta.ribbon.name)
              : '包装：' + esc(previewMeta.wrapping.name) + ' · 丝带：' + esc(previewMeta.ribbon.name)) +
          '</div>' +
        '</div>' +
        '<button type="button" class="wx-btn-primary" data-wx-action="garden-craft-confirm" ' + (canCraft ? '' : 'disabled') + '>制作花束（确认搭配）</button>';
    } else if (gTab === 'basket') {
      bodyInner =
        '<div class="wx-notice-box">所有花材均通过每日免费采集获得，库存严格非负；搭配花束时需确认后才扣除。</div>' +
        '<div class="wx-flower-grid">' +
          FLOWERS.map(function(f) {
            var inSeason = f.seasons.indexOf(season.key) !== -1;
            var seasonNames = f.seasons.map(function(sk) { return (SEASON_THEMES[sk] && SEASON_THEMES[sk].label) || sk; }).join(' / ');
            return (
              '<div class="wx-flower-card ' + (inSeason ? 'is-in-season' : '') + '">' +
                '<div class="wx-flower-head">' +
                  '<div class="wx-flower-name"><i class="' + esc(f.icon) + '" style="color:' + esc(f.color) + ';"></i><span>' + esc(f.name) + '</span></div>' +
                  '<span class="wx-flower-qty wx-num">×' + (gs.flowers[f.id] || 0) + '</span>' +
                '</div>' +
                '<div class="wx-flower-meaning">花语：' + esc(f.meaning) + '<br>盛放季：' + esc(seasonNames) + (inSeason ? '（当季）' : '') + '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>';
    } else if (gTab === 'mementos') {
      var ownedBqs = gs.bouquets.filter(function(b) { return b.status === 'owned' || (b.status === 'gifting' && !b.giftEventId); });
      var giftedBqs = gs.bouquets.filter(function(b) { return b.status === 'gifted'; });
      var flowerMems = mementos.filter(function(m) {
        return m.sourceType === 'flower_language' && (!activeCid || String(m.charId) === activeCid);
      });

      bodyInner =
        '<div class="wx-section-head"><span>待送出的花束</span><span class="wx-num">' + ownedBqs.length + ' 束</span></div>' +
        (ownedBqs.length
          ? '<div class="wx-list">' + ownedBqs.map(function(b) {
              var ingTxt = (b.ingredients || []).map(function(i) { return i.name + '×' + i.count; }).join('、');
              return (
                '<div class="wx-bouquet-preview is-wrap-' + esc(b.wrappingId || 'sakura_pink') + '">' +
                  '<div class="wx-bouquet-title"><span>' + esc(b.name) + '</span><span style="font-size:11.5px;color:var(--wx-open);">未送出</span></div>' +
                  '<div class="wx-bouquet-meta">花材：' + esc(ingTxt) + '<br>花语：' + esc(b.meanings || '') + ' · ' + esc(b.wrappingName || '') + ' / ' + esc(b.ribbonName || '') + '</div>' +
                  '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                    '<button type="button" class="wx-item-cta" data-wx-gift-bouquet="' + esc(b.bouquetId) + '">送给当前 Char</button>' +
                  '</div>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '<div class="wx-empty">暂无待送出的花束，去「制作花束」搭配一束吧~</div>') +
        '<div class="wx-section-head"><span>已送出的花束记录</span><span class="wx-num">' + giftedBqs.length + ' 束</span></div>' +
        (giftedBqs.length
          ? '<div class="wx-list">' + (await (async function() {
              var gHelper = await buildBridgeHelperForChar(activeCid);
              return giftedBqs.slice(0, 12).map(function(b) {
                var savedMem = mementos.some(function(m) {
                  return m.sourceType === 'flower_language' && m.giftEventId === b.giftEventId;
                });
                var canRetryGiftAi = Boolean(activeCid && String(b.giftedToCharId || '') === activeCid && (b.aiFailed || !b.charReplySummary));
                var bExp = (activeCid && String(b.giftedToCharId || '') === activeCid)
                  ? (gHelper.findByRef(b.giftEventId, 'bouquet_gifted') || gHelper.findByRef(b.bouquetId, 'bouquet_gifted'))
                  : null;
                return (
                  '<div class="wx-memento-card">' +
                    '<div class="wx-memento-head">' +
                      '<span class="wx-memento-title">' + esc(b.name) + ' → ' + esc(b.giftedToCharName || '同行伙伴') + '</span>' +
                      '<span style="font-size:11px;color:var(--wx-sub);">已送出</span>' +
                    '</div>' +
                    '<div class="wx-memento-meta">花语：' + esc(b.meanings || '') +
                      (b.charReplySummary ? '<br>Ta 的回应：“' + esc(b.charReplySummary) + '”' : (b.aiFailed ? '<br>AI 回应暂未送达，可不重扣花束直接重试' : '')) +
                    '</div>' +
                    '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">' +
                      (canRetryGiftAi ? '<button type="button" class="wx-mini-btn" data-wx-retry-gift-ai="' + esc(b.bouquetId) + '">重试回应</button>' : '') +
                      (savedMem
                        ? '<span style="font-size:11.5px;color:var(--wx-open);font-weight:600;">已保存花语纪念卡</span>'
                        : '<button type="button" class="wx-item-cta is-outline" data-wx-save-flower-mem="' + esc(b.bouquetId) + '">保存花语纪念卡</button>') +
                    '</div>' +
                    (bExp ? gHelper.renderButtons(bExp) : '') +
                  '</div>'
                );
              }).join('');
            })()) + '</div>'
          : '') +
        (flowerMems.length
          ? '<div class="wx-section-head"><span>当前视角花语纪念卡</span><span class="wx-num">' + flowerMems.length + ' 张</span></div>' +
            '<div class="wx-list">' + flowerMems.slice(0, 8).map(function(m) {
              return (
                '<div class="wx-memento-card">' +
                  '<div class="wx-memento-head"><span class="wx-memento-title">' + esc(m.title || m.bouquetName) + '</span><span style="font-size:11px;color:var(--wx-sub);">' + esc(m.dateStr) + '</span></div>' +
                  '<div class="wx-memento-meta">' + esc(m.ingredientsText || '') + (m.meanings ? ' · 花语：' + esc(m.meanings) : '') + '</div>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '');
    }

    var gardenSeasonalHtml = await buildSeasonalHintBannerHtml('four_seasons_garden');
    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '四季花园',
        '<span class="wx-status-open">' + esc(season.label) + '</span><span>·</span><span class="wx-num">免费采集 ' + colStatus.remaining + '/' + colStatus.limit + '</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        seasonBarHtml +
        gardenSeasonalHtml +
        '<div class="wx-seg-tabs">' +
          tabs.map(function(t) {
            return '<button type="button" class="wx-seg-tab ' + (t.key === gTab ? 'is-active' : '') + '" data-wx-garden-tab="' + t.key + '">' + esc(t.label) + '</button>';
          }).join('') +
        '</div>' +
        await buildCharStripHtml(loc) +
        bodyInner +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderLakesideSheet(sheetEl, loc) {
    var ls = await loadLakesideState();
    var charObj = await getActiveCharacterObj();
    var cid = charObj ? String(charObj.id) : '';
    var cname = charObj ? (charObj.nick || charObj.name) : '';
    var mementos = await loadMementos();
    var lView = _runtime.sheet.lakesideView || 'home';
    var activeWalk = cid && ls.activeWalksByChar ? ls.activeWalksByChar[cid] : null;
    var finishedWalk = (_runtime.sheet.finishedWalkId && cid)
      ? ls.completedWalks.find(function(c) { return c.walkId === _runtime.sheet.finishedWalkId && String(c.charId) === cid; })
      : null;

    var tabs = [
      { key: 'home', label: '湖畔散步' },
      { key: 'mementos', label: '湖畔纪念' }
    ];

    var bodyInner = '';
    if (lView === 'mementos') {
      var lakeMems = mementos.filter(function(m) {
        return m.sourceType === 'lakeside_walk' && (!cid || String(m.charId) === cid);
      });
      bodyInner = lakeMems.length
        ? '<div class="wx-list">' + lakeMems.map(function(m) {
            return (
              '<div class="wx-memento-card">' +
                '<div class="wx-memento-head"><span class="wx-memento-title">' + esc(m.title) + '</span><span style="font-size:11px;color:var(--wx-sub);">' + esc(m.dateStr) + ' · ' + esc(m.periodLabel) + '</span></div>' +
                '<div class="wx-memento-meta">' + esc(m.summary || m.note) +
                  (m.charReplySummary ? '<br>同行回应：“' + esc(m.charReplySummary) + '”' : '') +
                '</div>' +
              '</div>'
            );
          }).join('') + '</div>'
        : '<div class="wx-empty">当前视角暂无湖畔纪念，散步结束时选择「收藏纪念」即可留存。</div>';
    } else if (!charObj) {
      bodyInner =
        '<div class="wx-notice-box"><strong>请选择同行 Char</strong><br>湖畔散步与分支互动需要一位同行伙伴，不会擅自为你指定错误的角色。</div>' +
        '<button type="button" class="wx-btn-primary" data-wx-action="open-char-picker">选择同行 Char</button>';
    } else if (finishedWalk) {
      var alreadySaved = mementos.some(function(m) {
        return m.sourceType === 'lakeside_walk' && m.walkId === finishedWalk.walkId;
      });
      var lakeHelper = await buildBridgeHelperForChar(cid);
      var lakeExp = lakeHelper.findByRef(finishedWalk.walkId, 'lakeside_walk_completed');
      bodyInner =
        '<div class="wx-walk-stage">' +
          '<div class="wx-walk-title">要把这段时光收藏起来吗？</div>' +
          '<div class="wx-walk-desc">' +
            '与 <strong>' + esc(cname) + '</strong> 的「<strong>' + esc(finishedWalk.eventTitle) + '</strong>」已收尾。<br>' +
            esc(finishedWalk.outcomeText || '') +
            (!finishedWalk.aiFailed && finishedWalk.charReply ? '<br><br>Ta 说：“' + esc(finishedWalk.charReply) + '”' : '') +
          '</div>' +
          '<div class="wx-char-actions-row" style="margin-top:4px;">' +
            (alreadySaved
              ? '<span style="font-size:12px;color:var(--wx-open);font-weight:700;">已收藏至湖畔纪念</span>'
              : '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-save-lake-mem="' + esc(finishedWalk.walkId) + '">收藏纪念</button>') +
            '<button type="button" class="wx-btn-secondary" data-wx-action="lake-skip-memento">暂不收藏</button>' +
            '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
          '</div>' +
          (lakeExp ? lakeHelper.renderButtons(lakeExp) : '') +
        '</div>';
    } else if (activeWalk) {
      var ev = getLakesideEventById(activeWalk.eventId);
      if (activeWalk.stage === 'event' && ev) {
        bodyInner =
          '<div class="wx-walk-stage">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
              '<span class="wx-walk-title">' + esc(ev.title) + '</span>' +
              '<span style="font-size:11.5px;color:var(--wx-sub);">' + esc(activeWalk.visualPeriodLabel || '') + (activeWalk.isPreview ? '（视觉预览）' : '') + '</span>' +
            '</div>' +
            '<div class="wx-walk-desc">' + esc(ev.desc) + '</div>' +
            '<div class="wx-choice-list">' +
              ev.options.map(function(opt) {
                return (
                  '<button type="button" class="wx-choice-card" data-wx-lake-choice="' + esc(opt.id) + '" data-wx-walk-id="' + esc(activeWalk.walkId) + '">' +
                    '<span><strong>' + esc(opt.id) + '.</strong> ' + esc(opt.label) + '</span>' +
                    '<i class="fa-solid fa-angle-right"></i>' +
                  '</button>'
                );
              }).join('') +
            '</div>' +
          '</div>' +
          '<button type="button" class="wx-btn-secondary" data-wx-action="lake-abandon">放弃本次散步草稿</button>';
      } else {
        var optObj = ev && ev.options ? ev.options.find(function(o) { return o.id === activeWalk.choiceId; }) : null;
        var displayReply = activeWalk.charReply
          ? activeWalk.charReply
          : (_runtime.aiLoading ? ('正在等待 ' + cname + ' 回应…') : ((optObj && optObj.fallbackReply) || '微风掠过湖面，安静地陪在你身边。'));
        bodyInner =
          '<div class="wx-walk-stage">' +
            '<div class="wx-walk-title">' + esc(activeWalk.eventTitle) + ' · ' + esc(activeWalk.choiceLabel) + '</div>' +
            '<div class="wx-walk-desc">' + esc(activeWalk.outcomeText) + '</div>' +
            '<div class="wx-char-bubble">' +
              '<div class="wx-char-strip-quote" data-wx-raw-quote="' + esc(displayReply) + '">' + esc(displayReply) + '</div>' +
              (activeWalk.aiFailed && !_runtime.aiLoading
                ? '<div class="wx-char-bubble-foot"><span>AI 暂未接通，以上为当前情境自然回应</span><button type="button" class="wx-mini-btn" data-wx-retry-walk-ai="' + esc(activeWalk.walkId) + '">重试回应</button></div>'
                : '') +
            '</div>' +
          '</div>' +
          '<div class="wx-char-actions-row">' +
            '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-lake-finish="' + esc(activeWalk.walkId) + '">结束散步</button>' +
            '<button type="button" class="wx-btn-secondary" data-wx-action="lake-abandon">放弃草稿</button>' +
          '</div>';
      }
    } else {
      var recentForChar = ls.completedWalks.filter(function(c) { return String(c.charId) === cid; }).slice(0, 3);
      bodyInner =
        '<div class="wx-notice-box">与 <strong>' + esc(cname) + '</strong> 沿着睡莲湖畔免费散步，每次散步会按当前时段倾向触发一个偶遇事件，你可自由选择应对方式。</div>' +
        '<button type="button" class="wx-btn-primary" data-wx-action="lake-start">和 ' + esc(cname) + ' 一起散步（免费）</button>' +
        (recentForChar.length
          ? '<div class="wx-section-head"><span>与 ' + esc(cname) + ' 的近期湖畔散步</span></div>' +
            '<div class="wx-list">' + recentForChar.map(function(cw) {
              var saved = mementos.some(function(m) { return m.sourceType === 'lakeside_walk' && m.walkId === cw.walkId; });
              return (
                '<div class="wx-memento-card">' +
                  '<div class="wx-memento-head"><span class="wx-memento-title">' + esc(cw.eventTitle) + '</span><span style="font-size:11px;color:var(--wx-sub);">' + esc(cw.dateStr) + '</span></div>' +
                  '<div class="wx-memento-meta">选择：' + esc(cw.choiceLabel) + '</div>' +
                  (!saved ? '<div style="display:flex;justify-content:flex-end;"><button type="button" class="wx-mini-btn" data-wx-save-lake-mem="' + esc(cw.walkId) + '">收藏纪念</button></div>' : '') +
                '</div>'
              );
            }).join('') + '</div>'
          : '');
    }

    var lakeSeasonalHtml = await buildSeasonalHintBannerHtml('lakeside_walk');
    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '湖畔步道',
        '<span class="wx-status-open">免费散步</span><span>·</span><span>' + esc(cname || '请先选同行 Char') + '</span>',
        'back-intro'
      ) +
      '<div class="wx-sheet-body">' +
        lakeSeasonalHtml +
        '<div class="wx-seg-tabs">' +
          tabs.map(function(t) {
            var active = (lView === t.key) || (t.key === 'home' && lView === 'walk');
            return '<button type="button" class="wx-seg-tab ' + (active ? 'is-active' : '') + '" data-wx-lake-view="' + t.key + '">' + esc(t.label) + '</button>';
          }).join('') +
        '</div>' +
        await buildCharStripHtml(loc) +
        bodyInner +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderParkSheet(sheetEl, loc) {
    var eco = await getEconomySnapshot();
    var clawSt = await loadClawState();
    var ferrisSt = await loadFerrisState();
    var carouselSt = await loadCarouselState();
    var mementos = await loadMementos();
    var charObj = await getActiveCharacterObj();
    var cid = charObj ? String(charObj.id) : '';
    var cname = charObj ? (charObj.nick || charObj.name) : '';
    var pView = _runtime.sheet.parkView || 'hub';

    var activeRide = cid && ferrisSt.activeRidesByChar ? ferrisSt.activeRidesByChar[cid] : null;
    var finishedFerris = (_runtime.sheet.finishedFerrisId && cid)
      ? ferrisSt.completedRides.find(function(r) { return r.rideId === _runtime.sheet.finishedFerrisId && String(r.charId) === cid; })
      : null;

    var ownedPlushies = clawSt.plushies.filter(function(p) {
      return p.status === 'owned' || (p.status === 'gifting' && !p.giftEventId);
    });
    var giftedPlushies = clawSt.plushies.filter(function(p) { return p.status === 'gifted'; });
    var apMems = mementos.filter(function(m) {
      return m.sourceType === 'amusement_park' && (!cid || String(m.charId) === cid);
    });

    var subViewLabels = {
      hub: '游乐场总览',
      claw: '抓娃娃机',
      plushies: '我的玩偶收藏',
      ferris: '星愿摩天轮',
      carousel: '梦幻旋转木马',
      mementos: '游乐场纪念'
    };
    var headerBackAct = pView === 'hub' ? 'back-intro' : 'back-park-hub';
    var bodyInner = '';

    if (pView === 'hub') {
      bodyInner =
        '<div class="wx-notice-box">欢迎来到<strong>星光游乐场</strong>！使用共享金币即可畅玩抓娃娃机、星愿摩天轮与梦幻旋转木马，也可直达小镇游戏大厅。</div>' +
        '<div class="wx-park-cards">' +
          '<div class="wx-park-card">' +
            '<div class="wx-park-card-info">' +
              '<div class="wx-park-card-title"><i class="fa-solid fa-gift"></i><span>抓娃娃机</span><span class="wx-num" style="font-size:11.5px;color:var(--wx-open);">20 币/次</span></div>' +
              '<div class="wx-park-card-meta">公开概率 60% 抓中 · 6 款玩偶 · 支持收藏与赠给 Char</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta" data-wx-park-view="claw">去玩</button>' +
          '</div>' +
          '<div class="wx-park-card">' +
            '<div class="wx-park-card-info">' +
              '<div class="wx-park-card-title"><i class="fa-solid fa-circle-notch"></i><span>星愿摩天轮</span><span class="wx-num" style="font-size:11.5px;color:var(--wx-open);">30 币/趟</span></div>' +
              '<div class="wx-park-card-meta">三幕式双人高空对话（缓缓升起 / 最高点 / 慢慢降落）' + (activeRide ? ' · 有进行中草稿' : '') + '</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta" data-wx-park-view="ferris">' + (activeRide ? '继续' : '乘坐') + '</button>' +
          '</div>' +
          '<div class="wx-park-card">' +
            '<div class="wx-park-card-info">' +
              '<div class="wx-park-card-title"><i class="fa-solid fa-horse"></i><span>梦幻旋转木马</span><span class="wx-num" style="font-size:11.5px;color:var(--wx-open);">10 币/次</span></div>' +
              '<div class="wx-park-card-meta">3 种主题坐骑 × 3 种氛围选择 · 可跳过动画</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta" data-wx-park-view="carousel">体验</button>' +
          '</div>' +
          '<div class="wx-park-card">' +
            '<div class="wx-park-card-info">' +
              '<div class="wx-park-card-title"><i class="fa-solid fa-gamepad"></i><span>小镇游戏大厅</span><span style="font-size:11.5px;color:var(--wx-sub);">独立 App</span></div>' +
              '<div class="wx-park-card-meta">保留既有的小游戏大厅直达入口</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta is-outline" data-wx-feature="park_minigame" data-wx-loc="starlight_park">前往</button>' +
          '</div>' +
        '</div>' +
        '<div class="wx-char-actions-row">' +
          '<button type="button" class="wx-btn-secondary" style="flex:1;" data-wx-park-view="plushies"><i class="fa-solid fa-box-heart"></i> 玩偶收藏 (' + clawSt.plushies.length + ')</button>' +
          '<button type="button" class="wx-btn-secondary" style="flex:1;" data-wx-park-view="mementos"><i class="fa-solid fa-ticket"></i> 游乐纪念 (' + apMems.length + ')</button>' +
        '</div>';
    } else if (pView === 'claw') {
      var lastClaw = _runtime.sheet.lastClawResult;
      var caughtPlush = lastClaw && lastClaw.plush ? lastClaw.plush : null;
      var caughtLive = caughtPlush ? clawSt.plushies.find(function(p) { return p.plushInstanceId === caughtPlush.plushInstanceId; }) || caughtPlush : null;
      bodyInner =
        '<div class="wx-seg-tabs">' +
          '<button type="button" class="wx-seg-tab is-active" data-wx-park-view="claw">抓娃娃机</button>' +
          '<button type="button" class="wx-seg-tab" data-wx-park-view="plushies">玩偶收藏 (' + clawSt.plushies.length + ')</button>' +
          '<button type="button" class="wx-seg-tab" data-wx-action="back-park-hub">游乐场总览</button>' +
        '</div>' +
        '<div class="wx-notice-box">' +
          '<strong>概率公开公示（无隐藏保底 / 无 AI 干预）</strong><br>' +
          '每次落爪消耗 <span class="wx-num">20</span> 金币：抓中 <span class="wx-num">60%</span> · 失手 <span class="wx-num">40%</span>。' +
          '抓中后玩偶概率：普通（<span class="wx-num">75%</span>：星星兔 25% / 云朵熊 25% / 草莓猫 25%）· 稀有（<span class="wx-num">20%</span>：月亮狐 10% / 薰衣草鹿 10%）· 特别（<span class="wx-num">5%</span>：星梦鲸 5%）。' +
        '</div>' +
        '<div class="wx-claw-stage">' +
          '<div class="wx-claw-viewport">' +
            '<div class="wx-claw-rail">' +
              '<div class="wx-claw-gantry ' + (_runtime.sheet.clawDropping ? 'is-dropping' : '') + '" style="left:' + _runtime.sheet.clawPos + '%;">' +
                '<div class="wx-claw-cord"></div>' +
                '<div class="wx-claw-hook"><i class="fa-solid fa-claw-marks"></i></div>' +
              '</div>' +
            '</div>' +
            '<div class="wx-claw-bin">' +
              CLAW_CONFIG.plushies.map(function(p) {
                return (
                  '<div class="wx-claw-doll-slot">' +
                    '<i class="' + esc(p.icon) + '" style="color:' + esc(p.color) + ';font-size:13px;"></i>' +
                    '<span>' + esc(p.name) + '</span>' +
                    '<span class="wx-num" style="opacity:0.7;">' + p.weight + '%</span>' +
                  '</div>'
                );
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="wx-claw-controls">' +
            '<button type="button" class="wx-claw-ctrl-btn" data-wx-action="claw-left"><i class="fa-solid fa-arrow-left"></i><span>向左</span></button>' +
            '<button type="button" class="wx-claw-ctrl-btn is-drop wx-num" data-wx-action="claw-drop"><i class="fa-solid fa-hand"></i><span>落爪 (20 币)</span></button>' +
            '<button type="button" class="wx-claw-ctrl-btn" data-wx-action="claw-right"><span>向右</span><i class="fa-solid fa-arrow-right"></i></button>' +
          '</div>' +
        '</div>' +
        (lastClaw
          ? (lastClaw.ok && caughtLive
              ? (await (async function() {
                  var cHelper = await buildBridgeHelperForChar(cid);
                  var cExp = cHelper.findByRef(caughtLive.plushInstanceId, caughtLive.status === 'gifted' ? 'plush_gifted' : 'plush_won');
                  return '<div class="wx-memento-card">' +
                    '<div class="wx-memento-head">' +
                      '<span class="wx-memento-title"><i class="' + esc(caughtLive.icon) + '" style="color:' + esc(caughtLive.color) + ';"></i> 抓到了「' + esc(caughtLive.name) + '」</span>' +
                      '<span class="wx-rarity-tag is-' + esc(caughtLive.rarity) + '">' + esc(caughtLive.rarityLabel) + '</span>' +
                    '</div>' +
                    '<div class="wx-memento-meta">' + esc(caughtLive.desc) + '（已同步存入共享背包）</div>' +
                    '<div class="wx-char-actions-row">' +
                      (caughtLive.status === 'owned'
                        ? '<button type="button" class="wx-item-cta" data-wx-gift-plush="' + esc(caughtLive.plushInstanceId) + '">赠给当前 Char</button>'
                        : '<span style="font-size:11.5px;color:var(--wx-open);font-weight:600;">已送给 ' + esc(caughtLive.giftedToCharName || 'Char') + '</span>') +
                      '<button type="button" class="wx-mini-btn" data-wx-save-park-mem="plush:' + esc(caughtLive.plushInstanceId) + '">收藏玩偶纪念</button>' +
                    '</div>' +
                    (cExp ? cHelper.renderButtons(cExp) : '') +
                  '</div>';
                })())
              : '<div class="wx-notice-box">' + esc(lastClaw.refunded ? (lastClaw.msg || '本次落爪未完成，金币已退还。') : '差一点点就抓稳了！爪子轻轻一晃空手回到起点。') + '</div>')
          : '');
    } else if (pView === 'plushies') {
      bodyInner =
        '<div class="wx-seg-tabs">' +
          '<button type="button" class="wx-seg-tab" data-wx-park-view="claw">抓娃娃机</button>' +
          '<button type="button" class="wx-seg-tab is-active" data-wx-park-view="plushies">玩偶收藏 (' + clawSt.plushies.length + ')</button>' +
          '<button type="button" class="wx-seg-tab" data-wx-action="back-park-hub">游乐场总览</button>' +
        '</div>' +
        '<div class="wx-section-head"><span>我的待送玩偶</span><span class="wx-num">' + ownedPlushies.length + ' 只</span></div>' +
        (ownedPlushies.length
          ? '<div class="wx-list">' + ownedPlushies.map(function(p) {
              var saved = mementos.some(function(m) {
                return m.sourceType === 'amusement_park' && m.parkCategory === 'plush' && m.plushInstanceId === p.plushInstanceId;
              });
              return (
                '<div class="wx-memento-card">' +
                  '<div class="wx-memento-head">' +
                    '<span class="wx-memento-title"><i class="' + esc(p.icon) + '" style="color:' + esc(p.color) + ';"></i> ' + esc(p.name) + '</span>' +
                    '<span class="wx-rarity-tag is-' + esc(p.rarity) + '">' + esc(p.rarityLabel) + '</span>' +
                  '</div>' +
                  '<div class="wx-memento-meta">' + esc(p.desc) + ' · ' + esc(p.dateStr) + '</div>' +
                  '<div class="wx-char-actions-row" style="justify-content:flex-end;">' +
                    (saved
                      ? '<span style="font-size:11.5px;color:var(--wx-open);font-weight:600;">已收藏纪念</span>'
                      : '<button type="button" class="wx-mini-btn" data-wx-save-park-mem="plush:' + esc(p.plushInstanceId) + '">收藏玩偶纪念</button>') +
                    '<button type="button" class="wx-item-cta" data-wx-gift-plush="' + esc(p.plushInstanceId) + '">赠给当前 Char</button>' +
                  '</div>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '<div class="wx-empty">还没有待送出的玩偶，去抓娃娃机试试手气吧~</div>') +
        (giftedPlushies.length
          ? '<div class="wx-section-head"><span>已送出的玩偶</span><span class="wx-num">' + giftedPlushies.length + ' 只</span></div>' +
            '<div class="wx-list">' + giftedPlushies.slice(0, 12).map(function(p) {
              var savedG = mementos.some(function(m) {
                return m.sourceType === 'amusement_park' && m.parkCategory === 'plush' && m.plushInstanceId === p.plushInstanceId;
              });
              var canRetry = Boolean(cid && String(p.giftedToCharId || '') === cid && (p.aiFailed || !p.charReplySummary));
              return (
                '<div class="wx-memento-card">' +
                  '<div class="wx-memento-head">' +
                    '<span class="wx-memento-title">' + esc(p.name) + ' → ' + esc(p.giftedToCharName || '同行伙伴') + '</span>' +
                    '<span style="font-size:11px;color:var(--wx-sub);">已送出</span>' +
                  '</div>' +
                  '<div class="wx-memento-meta">' + esc(p.desc) +
                    (p.charReplySummary ? '<br>Ta 的回应：“' + esc(p.charReplySummary) + '”' : (p.aiFailed ? '<br>AI 回应暂未送达，可不重扣玩偶直接重试' : '')) +
                  '</div>' +
                  '<div class="wx-char-actions-row" style="justify-content:flex-end;">' +
                    (canRetry ? '<button type="button" class="wx-mini-btn" data-wx-retry-plush-ai="' + esc(p.plushInstanceId) + '">重试回应</button>' : '') +
                    (savedG
                      ? '<span style="font-size:11.5px;color:var(--wx-open);font-weight:600;">已收藏纪念</span>'
                      : '<button type="button" class="wx-mini-btn" data-wx-save-park-mem="plush:' + esc(p.plushInstanceId) + '">收藏玩偶纪念</button>') +
                  '</div>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '');
    } else if (pView === 'ferris') {
      if (!charObj) {
        bodyInner =
          '<div class="wx-notice-box"><strong>请选择同行 Char</strong><br>星愿摩天轮为双人三幕式互动体验，需要选择一位同行角色，不会擅自为你指定角色。</div>' +
          '<button type="button" class="wx-btn-primary" data-wx-action="open-char-picker">选择同行 Char</button>';
      } else {
        var curStepNum = finishedFerris ? 3 : (activeRide ? activeRide.currentAct : 0);
        var stepperHtml =
          '<div class="wx-act-stepper">' +
            FERRIS_CONFIG.acts.map(function(a) {
              var done = finishedFerris || (activeRide && ((activeRide.currentAct > a.actNumber) || (activeRide.currentAct === a.actNumber && activeRide.actStage === 'result')));
              var actCls = finishedFerris ? 'is-done' : (curStepNum === a.actNumber ? 'is-active' : (done ? 'is-done' : ''));
              return '<div class="wx-act-step ' + actCls + '">' + a.actNumber + '. ' + esc(a.shortTitle) + '</div>';
            }).join('') +
          '</div>';

        if (finishedFerris) {
          var alreadySavedFr = mementos.some(function(m) {
            return m.sourceType === 'amusement_park' && m.parkCategory === 'ferris_wheel' && m.rideId === finishedFerris.rideId;
          });
          var lastRepFr = finishedFerris.actReplies && (finishedFerris.actReplies.act3 || finishedFerris.actReplies.act2 || finishedFerris.actReplies.act1);
          var frHelper = await buildBridgeHelperForChar(cid);
          var frExp = frHelper.findByRef(finishedFerris.rideId, 'ferris_ride_completed');
          bodyInner =
            stepperHtml +
            '<div class="wx-walk-stage">' +
              '<div class="wx-walk-title">要把这一圈星愿摩天轮收藏成纪念吗？</div>' +
              '<div class="wx-walk-desc">' +
                '与 <strong>' + esc(cname) + '</strong> 一起完成了三幕摩天轮之旅。' +
                (lastRepFr && !lastRepFr.aiFailed && lastRepFr.text ? '<br><br>Ta 说：“' + esc(lastRepFr.text) + '”' : '') +
              '</div>' +
              '<div class="wx-char-actions-row">' +
                (alreadySavedFr
                  ? '<span style="font-size:12px;color:var(--wx-open);font-weight:700;">已收藏至游乐场纪念</span>'
                  : '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-save-park-mem="ferris_wheel:' + esc(finishedFerris.rideId) + '">收藏摩天轮纪念</button>') +
                '<button type="button" class="wx-btn-secondary" data-wx-action="ferris-skip-memento">暂不收藏</button>' +
                '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
              '</div>' +
              (frExp ? frHelper.renderButtons(frExp) : '') +
            '</div>';
        } else if (activeRide) {
          var actDef = FERRIS_CONFIG.acts.find(function(a) { return a.actNumber === activeRide.currentAct; }) || FERRIS_CONFIG.acts[0];
          var actKey = 'act' + actDef.actNumber;
          var chosen = activeRide.choices && activeRide.choices[actKey];
          var replyObj = activeRide.actReplies && activeRide.actReplies[actKey];
          if (activeRide.actStage === 'prompt' || !chosen) {
            bodyInner =
              stepperHtml +
              '<div class="wx-walk-stage">' +
                '<div class="wx-walk-title">' + esc(actDef.title) + '</div>' +
                '<div class="wx-walk-desc">' + esc(actDef.prompt) + '</div>' +
                '<div class="wx-choice-list">' +
                  actDef.options.map(function(opt) {
                    return (
                      '<button type="button" class="wx-choice-card" data-wx-ferris-choice="' + esc(opt.id) + '" data-wx-ride-id="' + esc(activeRide.rideId) + '" data-wx-act="' + actDef.actNumber + '">' +
                        '<span><strong>' + esc(opt.id) + '.</strong> ' + esc(opt.label) + '</span>' +
                        '<i class="fa-solid fa-angle-right"></i>' +
                      '</button>'
                    );
                  }).join('') +
                '</div>' +
              '</div>' +
              '<button type="button" class="wx-btn-secondary" data-wx-action="ferris-abandon">结束/放弃本次摩天轮草稿</button>';
          } else {
            var optMeta = actDef.options.find(function(o) { return o.id === chosen.choiceId; });
            var replyText = (replyObj && replyObj.text)
              ? replyObj.text
              : (_runtime.aiLoading ? ('正在等待 ' + cname + ' 回应…') : ((optMeta && optMeta.fallbackReply) || chosen.fallbackReply || '夜风轻吹，玻璃窗外整座小镇温柔亮着灯。'));
            bodyInner =
              stepperHtml +
              '<div class="wx-walk-stage">' +
                '<div class="wx-walk-title">' + esc(actDef.title) + ' · ' + esc(chosen.label) + '</div>' +
                '<div class="wx-walk-desc">' + esc(chosen.outcome) + '</div>' +
                '<div class="wx-char-bubble">' +
                  '<div class="wx-char-strip-quote" data-wx-raw-quote="' + esc(replyText) + '">' + esc(replyText) + '</div>' +
                  (replyObj && replyObj.aiFailed && !_runtime.aiLoading
                    ? '<div class="wx-char-bubble-foot"><span>AI 暂未接通，以上为当前幕次自然回应</span><button type="button" class="wx-mini-btn" data-wx-retry-ferris-ai="' + esc(activeRide.rideId) + '" data-wx-act="' + actDef.actNumber + '">重试回应</button></div>'
                    : '') +
                '</div>' +
              '</div>' +
              '<div class="wx-char-actions-row">' +
                (actDef.actNumber < 3
                  ? '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-ferris-next="' + esc(activeRide.rideId) + '">进入第 ' + (actDef.actNumber + 1) + ' 幕</button>'
                  : '<button type="button" class="wx-btn-primary" style="flex:1;" data-wx-ferris-finish="' + esc(activeRide.rideId) + '">结束摩天轮之旅</button>') +
                '<button type="button" class="wx-btn-secondary" data-wx-action="ferris-abandon">放弃草稿</button>' +
              '</div>';
          }
        } else {
          var recentFr = ferrisSt.completedRides.filter(function(r) { return String(r.charId) === cid; }).slice(0, 3);
          bodyInner =
            stepperHtml +
            '<div class="wx-notice-box">与 <strong>' + esc(cname) + '</strong> 乘坐星愿摩天轮（单次 <span class="wx-num">30</span> 金币，包含全部三幕高空互动）；中途退出返回时可继续当前幕次，绝不重复扣费。</div>' +
            '<button type="button" class="wx-btn-primary wx-num" data-wx-action="ferris-start">乘坐星愿摩天轮（30 金币）</button>' +
            (recentFr.length
              ? '<div class="wx-section-head"><span>与 ' + esc(cname) + ' 的近期摩天轮</span></div>' +
                '<div class="wx-list">' + recentFr.map(function(fr) {
                  var savedR = mementos.some(function(m) {
                    return m.sourceType === 'amusement_park' && m.parkCategory === 'ferris_wheel' && m.rideId === fr.rideId;
                  });
                  return (
                    '<div class="wx-memento-card">' +
                      '<div class="wx-memento-head"><span class="wx-memento-title">星愿摩天轮三幕</span><span style="font-size:11px;color:var(--wx-sub);">' + esc(fr.dateStr) + '</span></div>' +
                      (!savedR ? '<div style="display:flex;justify-content:flex-end;"><button type="button" class="wx-mini-btn" data-wx-save-park-mem="ferris_wheel:' + esc(fr.rideId) + '">收藏纪念</button></div>' : '') +
                    '</div>'
                  );
                }).join('') + '</div>'
              : '');
        }
      }
    } else if (pView === 'carousel') {
      var curSeat = CAROUSEL_CONFIG.seats.find(function(s) { return s.id === _runtime.sheet.carouselSeatId; }) || CAROUSEL_CONFIG.seats[0];
      var curMood = CAROUSEL_CONFIG.moods.find(function(m) { return m.id === _runtime.sheet.carouselMoodId; }) || CAROUSEL_CONFIG.moods[0];
      var lastCarRide = _runtime.sheet.lastCarouselRideId
        ? carouselSt.rides.find(function(r) { return r.carouselRideId === _runtime.sheet.lastCarouselRideId; })
        : null;
      var savedCarMem = lastCarRide && mementos.some(function(m) {
        return m.sourceType === 'amusement_park' && m.parkCategory === 'carousel' && m.carouselRideId === lastCarRide.carouselRideId;
      });
      bodyInner =
        '<div class="wx-section-head"><span>1. 选择木马主题座位</span></div>' +
        '<div class="wx-swatch-row">' +
          CAROUSEL_CONFIG.seats.map(function(s) {
            return '<button type="button" class="wx-swatch-btn ' + (s.id === curSeat.id ? 'is-active' : '') + '" data-wx-carousel-seat="' + esc(s.id) + '"><i class="' + esc(s.icon) + '"></i><span>' + esc(s.name) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="wx-section-head"><span>2. 选择氛围基调（仅作氛围提示，不改写 Char 人设）</span></div>' +
        '<div class="wx-swatch-row">' +
          CAROUSEL_CONFIG.moods.map(function(m) {
            return '<button type="button" class="wx-swatch-btn ' + (m.id === curMood.id ? 'is-active' : '') + '" data-wx-carousel-mood="' + esc(m.id) + '"><span>' + esc(m.name) + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="wx-carousel-stage">' +
          '<div class="wx-carousel-ring ' + (_runtime.sheet.carouselPlaying ? 'is-spinning' : '') + '"><i class="' + esc(curSeat.icon) + '"></i></div>' +
          '<div style="font-size:13.5px;font-weight:700;color:var(--wx-text);">' + esc(curSeat.name) + ' · ' + esc(curMood.name) + '</div>' +
          '<div style="font-size:11.5px;color:var(--wx-sub);">' + esc(curSeat.desc) + '（' + esc(curMood.hint) + '）</div>' +
          (_runtime.sheet.carouselPlaying
            ? '<button type="button" class="wx-mini-btn" data-wx-action="carousel-skip-anim">跳过旋转动画</button>'
            : '') +
        '</div>' +
        '<button type="button" class="wx-btn-primary wx-num" data-wx-action="carousel-start">乘坐梦幻旋转木马（10 金币）</button>' +
        (lastCarRide
          ? (await (async function() {
              var carHelper = await buildBridgeHelperForChar(cid);
              var carExp = carHelper.findByRef(lastCarRide.carouselRideId, 'carousel_ride_completed');
              return '<div class="wx-memento-card">' +
                '<div class="wx-memento-head"><span class="wx-memento-title">本次木马记录 · ' + esc(lastCarRide.seatName) + '</span><span style="font-size:11px;color:var(--wx-open);">' + esc(lastCarRide.moodName) + '</span></div>' +
                '<div class="wx-memento-meta">金光柔和地随着圆盘转动了一圈。' +
                  (lastCarRide.charReply ? '<br>Ta 说：“' + esc(lastCarRide.charReply) + '”' : (lastCarRide.aiFailed ? '<br>AI 暂未接通，自然记录已保存' : '')) +
                '</div>' +
                '<div class="wx-char-actions-row" style="justify-content:flex-end;">' +
                  (lastCarRide.aiFailed && cid && String(lastCarRide.charId || '') === cid
                    ? '<button type="button" class="wx-mini-btn" data-wx-retry-carousel-ai="' + esc(lastCarRide.carouselRideId) + '">重试回应</button>'
                    : '') +
                  (savedCarMem
                    ? '<span style="font-size:11.5px;color:var(--wx-open);font-weight:600;">已收藏木马纪念</span>'
                    : '<button type="button" class="wx-mini-btn" data-wx-save-park-mem="carousel:' + esc(lastCarRide.carouselRideId) + '">收藏木马纪念</button>') +
                  '<button type="button" class="wx-mini-btn" data-wx-action="carousel-skip-memento">暂不收藏</button>' +
                '</div>' +
                (carExp ? carHelper.renderButtons(carExp) : '') +
              '</div>';
            })())
          : '');
    } else if (pView === 'mementos') {
      bodyInner = apMems.length
        ? '<div class="wx-list">' + apMems.map(function(m) {
            var catLbl = m.parkCategory === 'plush' ? '玩偶' : (m.parkCategory === 'ferris_wheel' ? '摩天轮' : '旋转木马');
            return (
              '<div class="wx-memento-card">' +
                '<div class="wx-memento-head"><span class="wx-memento-title">' + esc(m.title) + '</span><span style="font-size:11px;color:var(--wx-open);font-weight:600;">' + esc(catLbl) + '</span></div>' +
                '<div class="wx-memento-meta">' + esc(m.dateStr) + ' · ' + esc(m.periodLabel || '') + '<br>' + esc(m.summary || m.note || '') +
                  (m.charReplySummary ? '<br>Ta 说：“' + esc(m.charReplySummary) + '”' : '') +
                '</div>' +
              '</div>'
            );
          }).join('') + '</div>'
        : '<div class="wx-empty">当前视角暂无游乐场纪念，抓到玩偶或乘坐摩天轮/木马后选择「收藏纪念」即可留存。</div>';
    }

    var parkSeasonalHtml = await buildSeasonalHintBannerHtml('starlight_park');
    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '星光游乐场 · ' + (subViewLabels[pView] || '游乐场'),
        '<span class="wx-status-open">正式开放</span><span>·</span><span class="wx-num">金币 ' + (eco.coins || 0) + '</span>',
        headerBackAct
      ) +
      '<div class="wx-sheet-body">' +
        parkSeasonalHtml +
        await buildCharStripHtml(loc) +
        bodyInner +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        (pView === 'hub'
          ? '<button type="button" class="wx-btn-secondary" data-wx-action="back-intro">返回卡片</button>'
          : '<button type="button" class="wx-btn-secondary" data-wx-action="back-park-hub">返回游乐场</button>') +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  async function renderStationSheet(sheetEl, loc) {
    var eco = await getEconomySnapshot();
    var js = await loadJourneysState();
    var mementos = await loadMementos();
    var charObj = await getActiveCharacterObj();
    var cid = charObj ? String(charObj.id) : null;
    var sView = _runtime.sheet.stationView || 'hub';
    var activeJrn = cid ? (js.activeJourneysByChar[cid] || null) : null;
    var pInfo = getActivePeriodInfo(_runtime.timePreview);
    var isNightVisual = pInfo.displayKey === 'night' || pInfo.displayKey === 'dusk';

    // 若处于旅程页且既无进行中旅程又无刚结束的旅程，则安全退回大厅
    var finishedJrn = _runtime.sheet.finishedJourneyId
      ? js.completedJourneys.find(function(j) { return j.journeyId === _runtime.sheet.finishedJourneyId && (!cid || String(j.charId) === cid); })
      : null;
    if (sView === 'journey' && !activeJrn && !finishedJrn) {
      sView = 'hub';
      _runtime.sheet.stationView = 'hub';
    }

    var viewLabels = {
      hub: '车站大厅',
      tickets: '我的车票',
      journey: '梦境列车',
      postcards: '旅行明信片'
    };
    var headerBackAct = sView === 'hub' ? 'back-intro' : 'back-station-hub';
    var bodyInner = '';

    if (sView === 'hub') {
      var bannerStyle = 'background-image:url(\'' + pInfo.period.src + '\'), linear-gradient(135deg, #fbf0f3 0%, #f5dfd8 100%);background-position:' + loc.pinX + '% ' + loc.pinY + '%;';
      var resumeHtml = activeJrn
        ? '<div class="wx-station-resume-card">' +
            '<div>' +
              '<div style="font-size:13.5px;font-weight:700;color:var(--wx-text);"><i class="fa-solid fa-train"></i> 有一趟未完成的旅程 · ' + esc(activeJrn.destinationName) + '</div>' +
              '<div style="font-size:11.5px;color:var(--wx-sub);margin-top:3px;">当前进度：第 ' + activeJrn.currentStage + ' / 3 阶段 · 已购票，继续乘车不重复扣费</div>' +
            '</div>' +
            '<button type="button" class="wx-item-cta" data-wx-action="station-resume-journey">继续乘车</button>' +
          '</div>'
        : '';

      var timetableHtml =
        '<div class="wx-timetable">' +
          '<div class="wx-timetable-head">' +
            '<span><i class="fa-regular fa-clock"></i> 复古车站时刻牌</span>' +
            '<span class="wx-timetable-tag">氛围展示 · 随时出发</span>' +
          '</div>' +
          '<div class="wx-timetable-rows">' +
            TRAIN_CONFIG.timetablePreview.map(function(row) {
              return (
                '<div class="wx-timetable-row">' +
                  '<span class="wx-timetable-code wx-num">' + esc(row.code) + '</span>' +
                  '<span class="wx-timetable-name">' + esc(row.name) + ' · ' + esc(row.destName) + '</span>' +
                  '<span class="wx-timetable-plat">' + esc(row.platform) + '</span>' +
                '</div>'
              );
            }).join('') +
          '</div>' +
        '</div>';

      var destCardsHtml =
        '<div class="wx-section-head"><span>选择星愿列车目的地</span><span class="wx-num" style="font-size:11.5px;color:var(--wx-sub);">统一票价 30 金币/趟</span></div>' +
        '<div class="wx-dest-cards">' +
          TRAIN_DESTINATIONS.map(function(d) {
            var isCurActive = activeJrn && activeJrn.destinationId === d.id;
            return (
              '<div class="wx-dest-card ' + esc(d.themeClass) + '">' +
                '<div class="wx-dest-icon"><i class="' + esc(d.icon) + '"></i></div>' +
                '<div class="wx-dest-info">' +
                  '<div class="wx-dest-title">' + esc(d.name) + ' <span class="wx-dest-sub">' + esc(d.subtitle) + '</span></div>' +
                  '<div class="wx-dest-meta">' + esc(d.visualDesc) + '<br>核心体验：' + esc(d.coreEvent) + '</div>' +
                '</div>' +
                '<button type="button" class="wx-item-cta wx-num ' + (isCurActive ? 'is-outline' : '') + '" ' +
                  (isCurActive ? 'data-wx-action="station-resume-journey"' : 'data-wx-station-buy="' + esc(d.id) + '"') + '>' +
                  (isCurActive ? '继续' : (TRAIN_CONFIG.ticketPrice + ' 币购票')) +
                '</button>' +
              '</div>'
            );
          }).join('') +
        '</div>';

      bodyInner =
        '<div class="wx-station-banner ' + (isNightVisual ? 'is-night' : '') + '" style="' + bannerStyle + '">' +
          '<div class="wx-station-banner-scrim">' +
            '<div class="wx-station-banner-title"><i class="fa-solid fa-star"></i> 星愿列车站 · Dreamland Express</div>' +
            '<div class="wx-station-banner-sub">奶油白石拱、浅樱霓虹与香槟金铜钟楼 · 四大远方站台已通车</div>' +
          '</div>' +
        '</div>' +
        timetableHtml +
        resumeHtml +
        destCardsHtml;
    } else if (sView === 'tickets') {
      var scopedTickets = cid
        ? js.tickets.filter(function(t) { return String(t.charId) === cid; })
        : js.tickets;
      var statusMap = {
        active: '乘车中',
        used: '已抵达',
        abandoned: '已提前结束',
        refunded: '已退款',
        compensation_pending: '待处理'
      };
      bodyInner =
        '<div class="wx-section-head"><span>' + (charObj ? esc(charObj.nick || charObj.name) + ' 的星愿车票' : '全部星愿车票记录') + '</span><span class="wx-num">' + scopedTickets.length + ' 张</span></div>' +
        (scopedTickets.length
          ? '<div class="wx-list">' + scopedTickets.map(function(t) {
              var stLbl = statusMap[t.status] || t.status;
              var canResumeTkt = t.status === 'active' && cid && String(t.charId) === cid && activeJrn && activeJrn.ticketId === t.ticketId;
              return (
                '<div class="wx-ticket-card">' +
                  '<div class="wx-ticket-stub">' +
                    '<span class="wx-ticket-code wx-num">' + esc(String(t.ticketId).slice(-6).toUpperCase()) + '</span>' +
                    '<span class="wx-ticket-price wx-num">' + (t.price || 30) + ' 币</span>' +
                  '</div>' +
                  '<div class="wx-ticket-main">' +
                    '<div class="wx-item-name">' + esc(t.destinationName) + ' <span style="font-size:11px;color:' + (t.status === 'active' ? 'var(--wx-open)' : 'var(--wx-sub)') + ';font-weight:600;">· ' + esc(stLbl) + '</span></div>' +
                    '<div class="wx-item-meta">同行伙伴：' + esc(t.charName || '') + ' · 票号 ' + esc(t.ticketId) + '</div>' +
                  '</div>' +
                  (canResumeTkt ? '<button type="button" class="wx-item-cta" data-wx-action="station-resume-journey">登车</button>' : '') +
                '</div>'
              );
            }).join('') + '</div>'
          : '<div class="wx-empty">' + (charObj ? ('与 ' + esc(charObj.nick || charObj.name) + ' 暂无车票记录，去车站大厅挑选目的地出发吧！') : '暂无车票记录，请先选择同行 Char 并在车站大厅购票。') + '</div>');
    } else if (sView === 'journey') {
      if (activeJrn) {
        var jDest = getTrainDestinationById(activeJrn.destinationId) || TRAIN_DESTINATIONS[0];
        var curStg = activeJrn.currentStage || 1;
        var stgKey = 'stage' + curStg;
        var stgDef = jDest[stgKey];
        var chosen = activeJrn.choices && activeJrn.choices[stgKey];
        var repObj = activeJrn.stageReplies && activeJrn.stageReplies[stgKey];
        var fallbackLine = chosen ? (chosen.fallbackReply || '') : '';
        var displayReply = repObj ? (repObj.aiFailed ? (fallbackLine || 'AI 暂未接通，列车按当前风景自然前行。') : repObj.text) : '';

        var stepperHtml =
          '<div class="wx-act-stepper">' +
            [1, 2, 3].map(function(n) {
              var sDef = jDest['stage' + n];
              var done = Boolean(activeJrn.choices && activeJrn.choices['stage' + n]);
              var cur = curStg === n;
              return '<div class="wx-act-step ' + (cur ? 'is-active' : (done ? 'is-done' : '')) + '">第' + n + '站 · ' + esc(sDef ? sDef.shortTitle : '') + '</div>';
            }).join('') +
          '</div>';

        var windowHtml =
          '<div class="wx-train-window ' + esc(jDest.themeClass) + ' ' + (isNightVisual ? 'is-night' : '') + '">' +
            '<div class="wx-train-window-stars"></div>' +
            '<div class="wx-train-scenery-track"></div>' +
            '<div class="wx-train-window-badge">' +
              '<i class="' + esc(jDest.icon) + '"></i>' +
              '<span>开往「' + esc(jDest.name) + '」 · ' + esc(jDest.subtitle) + '</span>' +
            '</div>' +
          '</div>';

        var stageContentHtml = '';
        if (activeJrn.stageStep === 'prompt' || !chosen) {
          stageContentHtml =
            '<div class="wx-walk-stage">' +
              '<div class="wx-walk-event-title">' + esc(stgDef.title) + '</div>' +
              '<div class="wx-walk-event-desc">' + esc(stgDef.prompt) + '</div>' +
              '<div class="wx-choice-list">' +
                stgDef.options.map(function(opt) {
                  return (
                    '<button type="button" class="wx-choice-card" data-wx-train-choice="' + esc(opt.id) + '" data-wx-journey-id="' + esc(activeJrn.journeyId) + '" data-wx-stage="' + curStg + '">' +
                      '<span class="wx-choice-tag">' + esc(opt.id) + '</span>' +
                      '<span>' + esc(opt.label) + '</span>' +
                    '</button>'
                  );
                }).join('') +
              '</div>' +
            '</div>';
        } else {
          stageContentHtml =
            '<div class="wx-walk-stage">' +
              '<div class="wx-walk-event-title">' + esc(stgDef.title) + ' · 你选择了「' + esc(chosen.label) + '」</div>' +
              '<div class="wx-walk-event-desc">' + esc(chosen.outcome) + '</div>' +
              '<div class="wx-notice-box">' +
                '<strong>' + esc(activeJrn.charName || '同行伙伴') + ' 的旅途回应：</strong><br>' +
                (_runtime.aiLoading
                  ? '正在轻声回应中…'
                  : esc(displayReply || fallbackLine || '静静望着窗外的景色。')) +
                (repObj && repObj.aiFailed
                  ? '<div style="margin-top:6px;"><button type="button" class="wx-mini-btn" data-wx-retry-train-ai="' + esc(activeJrn.journeyId) + '" data-wx-stage="' + curStg + '">重试 AI 回应</button></div>'
                  : '') +
              '</div>' +
              (curStg < 3
                ? '<button type="button" class="wx-btn-primary" data-wx-train-next="' + esc(activeJrn.journeyId) + '">继续下一阶段（第 ' + (curStg + 1) + ' 阶段）</button>'
                : '<button type="button" class="wx-btn-primary" data-wx-train-finish="' + esc(activeJrn.journeyId) + '">抵达「' + esc(jDest.name) + '」终点站</button>') +
            '</div>';
        }

        bodyInner =
          windowHtml +
          stepperHtml +
          stageContentHtml +
          '<div style="display:flex;justify-content:flex-end;">' +
            '<button type="button" class="wx-mini-btn" data-wx-action="station-abandon-ask">提前结束本次旅程</button>' +
          '</div>';
      } else if (finishedJrn) {
        var fDest = getTrainDestinationById(finishedJrn.destinationId) || TRAIN_DESTINATIONS[0];
        var savedPc = mementos.find(function(m) {
          return m.sourceType === 'starwish_train' && m.journeyId === finishedJrn.journeyId;
        });
        var draftMsg = _runtime.sheet.postcardDraftMsg || TRAIN_CONFIG.presetMessages[0];
        var highlightsArr = [1, 2, 3].map(function(n) {
          var c = finishedJrn.choices && finishedJrn.choices['stage' + n];
          return c ? ('第' + n + '站 · ' + c.label) : '';
        }).filter(Boolean);

        var jrnHelper = await buildBridgeHelperForChar(finishedJrn.charId);
        var jrnExp = jrnHelper.findByRef(finishedJrn.journeyId, 'train_journey_completed') || jrnHelper.findByRef(finishedJrn.journeyId);
        bodyInner =
          '<div class="wx-postcard-card ' + esc(fDest.themeClass) + '">' +
            '<div class="wx-postcard-head">' +
              '<span><i class="' + esc(fDest.icon) + '"></i> 星愿列车旅行明信片 · ' + esc(fDest.name) + '</span>' +
              '<span class="wx-num" style="font-size:11px;color:var(--wx-sub);">' + esc(finishedJrn.dateStr || getTodayStr()) + '</span>' +
            '</div>' +
            '<div class="wx-postcard-meta">同行伙伴：<strong>' + esc(finishedJrn.charName) + '</strong> · ' + esc(fDest.visualDesc) + '</div>' +
            '<div class="wx-postcard-route">' + highlightsArr.map(function(x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
            '<div class="wx-postcard-quote" id="wx-postcard-preview-msg">“' + esc(draftMsg) + '”</div>' +
            (jrnExp ? jrnHelper.renderButtons(jrnExp) : '') +
          '</div>' +
          (savedPc
            ? '<div class="wx-notice-box" style="color:var(--wx-open);font-weight:600;">该趟旅程的旅行明信片已珍藏至万象镜「留影」页（已按旅程序号去重，不会重复收藏）。</div>'
            : '<div class="wx-section-head"><span>是否收藏这趟旅行的明信片？（可选）</span></div>' +
              '<div class="wx-swatch-row">' +
                TRAIN_CONFIG.presetMessages.map(function(pm, idx) {
                  return '<button type="button" class="wx-mini-btn" data-wx-postcard-preset="' + idx + '">寄语' + (idx + 1) + '</button>';
                }).join('') +
              '</div>' +
              '<input type="text" class="wx-input" id="wx-postcard-msg-input" maxlength="48" placeholder="也可以自己写一句给今天的明信片寄语（最多48字）" value="' + esc(_runtime.sheet.postcardDraftMsg || '') + '">' +
              '<div class="wx-char-actions-row" style="justify-content:flex-end;">' +
                '<button type="button" class="wx-btn-secondary" data-wx-action="station-skip-postcard">暂不制作明信片</button>' +
                '<button type="button" class="wx-btn-primary" data-wx-save-train-postcard="' + esc(finishedJrn.journeyId) + '">收藏旅行明信片</button>' +
              '</div>');
      }
    } else if (sView === 'postcards') {
      var trainMems = mementos.filter(function(m) {
        if (m.sourceType !== 'starwish_train') return false;
        if (cid) return String(m.charId) === cid;
        return true;
      });
      var pcHelperMap = {};
      bodyInner =
        '<div class="wx-section-head"><span>' + (charObj ? esc(charObj.nick || charObj.name) + ' 同行明信片' : '全部星愿旅行明信片') + '</span><span class="wx-num">' + trainMems.length + ' 张</span></div>' +
        (trainMems.length
          ? '<div class="wx-list">' + (await Promise.all(trainMems.map(async function(m) {
              var mCid = m.charId ? String(m.charId) : '';
              if (mCid && !pcHelperMap[mCid]) pcHelperMap[mCid] = await buildBridgeHelperForChar(mCid);
              var pcExp = (mCid && pcHelperMap[mCid]) ? pcHelperMap[mCid].findByMemento(m) : null;
              return (
                '<div class="wx-postcard-card is-dest-' + esc(m.destinationId || 'sakura_valley') + '">' +
                  '<div class="wx-postcard-head">' +
                    '<span class="wx-memento-title">' + esc(m.title) + '</span>' +
                    '<span style="font-size:11px;color:var(--wx-open);font-weight:600;">' + esc(m.dateStr || '') + '</span>' +
                  '</div>' +
                  '<div class="wx-postcard-meta">' + esc(m.charName || '') + ' · ' + esc(m.periodLabel || '') + '<br>' + esc(m.summary || '') + '</div>' +
                  '<div class="wx-postcard-quote">“' + esc(m.postcardMessage || m.note || '') + '”</div>' +
                  (m.charReplySummary ? '<div class="wx-memento-meta">Ta 说：“' + esc(m.charReplySummary) + '”</div>' : '') +
                  (pcExp ? pcHelperMap[mCid].renderButtons(pcExp) : '') +
                '</div>'
              );
            }))).join('') + '</div>'
          : '<div class="wx-empty">当前视角暂无旅行明信片，购买车票完成一趟梦境列车即可按意愿收藏。</div>');
    }

    sheetEl.innerHTML =
      buildModalHeaderHtml(
        loc,
        '星愿列车站 · ' + (viewLabels[sView] || '列车站'),
        '<span class="wx-status-open">全线通车</span><span>·</span><span class="wx-num">金币 ' + (eco.coins || 0) + '</span>',
        headerBackAct
      ) +
      '<div class="wx-sheet-body">' +
        await buildCharStripHtml(loc) +
        bodyInner +
      '</div>' +
      '<div class="wx-sheet-footer"><div class="wx-sheet-footer-actions">' +
        (sView === 'tickets'
          ? '<button type="button" class="wx-btn-secondary" data-wx-action="back-station-hub">车站大厅</button>'
          : '<button type="button" class="wx-btn-secondary" data-wx-station-view="tickets">查看车票</button>') +
        '<button type="button" class="wx-btn-secondary" data-wx-action="open-char-chat" data-wx-loc="starwish_station">与 Char 互动</button>' +
        '<button type="button" class="wx-btn-secondary" data-wx-action="close-sheet">返回小镇</button>' +
      '</div></div>';
  }

  // ===== 第五层：确认与开奖结果弹窗 =====
  function renderConfirmModal() {
    if (!_runtime.pageEl) return;
    var wrap = _runtime.pageEl.querySelector('#wx-confirm-backdrop');
    var card = _runtime.pageEl.querySelector('#wx-confirm-card');
    if (!wrap || !card) return;

    if (!_runtime.confirm.open || !_runtime.confirm.data) {
      wrap.classList.remove('is-open');
      card.innerHTML = '';
      return;
    }

    var d = _runtime.confirm.data;
    wrap.classList.add('is-open');
    var isPending = Boolean(_runtime.pendingAction);

    if (d.mode === 'confirm') {
      card.innerHTML =
        '<div class="wx-confirm-head">' +
          '<div class="wx-confirm-icon"><i class="' + esc(d.icon || 'fa-solid fa-sparkles') + '"></i></div>' +
          '<div><h3 class="wx-confirm-title">' + esc(d.title) + '</h3><div class="wx-confirm-sub">' + esc(d.sub || '') + '</div></div>' +
        '</div>' +
        '<div class="wx-confirm-detail wx-num">' + d.detailHtml + '</div>' +
        '<div class="wx-confirm-actions">' +
          '<button type="button" class="wx-btn-secondary" data-wx-confirm-close ' + (isPending ? 'disabled' : '') + '>取消</button>' +
          '<button type="button" class="wx-btn-primary" data-wx-confirm-exec ' + (isPending ? 'disabled' : '') + '>' +
            esc(isPending ? (d.pendingLabel || '处理中…') : (d.confirmLabel || '确认')) +
          '</button>' +
        '</div>';
    } else if (d.mode === 'bridge_share_conflict') {
      card.innerHTML =
        '<div class="wx-confirm-head">' +
          '<div class="wx-confirm-icon"><i class="fa-solid fa-pen-to-square"></i></div>' +
          '<div><h3 class="wx-confirm-title">' + esc(d.title || '输入框已有未发送草稿') + '</h3><div class="wx-confirm-sub">' + esc(d.sub || '') + '</div></div>' +
        '</div>' +
        '<div class="wx-confirm-detail">' +
          '<div style="font-size:12px;color:var(--wx-sub);margin-bottom:6px;">当前私聊框已有未发出的文字，你可以选择保留并合并，或替换为本次分享：</div>' +
          '<div class="wx-bridge-conflict-preview">原有草稿：' + esc(d.existingText || '') + '</div>' +
          '<div class="wx-bridge-conflict-preview is-new">本次分享：' + esc(d.draftText || '') + '</div>' +
        '</div>' +
        '<div class="wx-confirm-actions wx-bridge-conflict-actions">' +
          '<button type="button" class="wx-btn-secondary" data-wx-confirm-close ' + (isPending ? 'disabled' : '') + '>取消</button>' +
          '<button type="button" class="wx-btn-secondary" data-wx-bridge-conflict="replace" ' + (isPending ? 'disabled' : '') + '>替换原草稿</button>' +
          '<button type="button" class="wx-btn-primary" data-wx-bridge-conflict="merge" ' + (isPending ? 'disabled' : '') + '>合并保留</button>' +
        '</div>';
    } else {
      card.innerHTML =
        '<div class="wx-confirm-head">' +
          '<div class="wx-confirm-icon"><i class="' + esc(d.icon || 'fa-solid fa-star') + '"></i></div>' +
          '<div><h3 class="wx-confirm-title">' + esc(d.title) + '</h3><div class="wx-confirm-sub">' + esc(d.sub || '') + '</div></div>' +
        '</div>' +
        '<div class="wx-confirm-detail wx-num">' + d.detailHtml + '</div>' +
        '<div class="wx-confirm-actions">' +
          '<button type="button" class="wx-btn-primary" data-wx-confirm-close>知道了</button>' +
        '</div>';
    }
  }

  function openConfirmModal(cfg) {
    _runtime.confirm.open = true;
    _runtime.confirm.data = Object.assign({ mode: 'confirm' }, cfg || {});
    renderConfirmModal();
    renderAtmosphereAndInviteUi();
  }

  function closeConfirmModal() {
    if (_runtime.pendingAction) return;
    _runtime.confirm.open = false;
    _runtime.confirm.data = null;
    renderConfirmModal();
    renderAtmosphereAndInviteUi();
  }

  async function executePendingConfirm() {
    if (_runtime.pendingAction || !_runtime.confirm.open || !_runtime.confirm.data) return;
    var d = _runtime.confirm.data;
    if (d.mode !== 'confirm') {
      closeConfirmModal();
      return;
    }

    var capturedBridgeShareEl = _runtime.pageEl && _runtime.pageEl.querySelector('#wx-bridge-share-input');
    var capturedBridgeMemTitleEl = _runtime.pageEl && _runtime.pageEl.querySelector('#wx-bridge-mem-title');
    var capturedBridgeMemContentEl = _runtime.pageEl && _runtime.pageEl.querySelector('#wx-bridge-mem-content');
    var capturedBridgeShareText = capturedBridgeShareEl ? capturedBridgeShareEl.value : undefined;
    var capturedBridgeMemTitle = capturedBridgeMemTitleEl ? capturedBridgeMemTitleEl.value : undefined;
    var capturedBridgeMemContent = capturedBridgeMemContentEl ? capturedBridgeMemContentEl.value : undefined;

    _runtime.pendingAction = true;
    renderConfirmModal();

    try {
      if (d.kind === 'buy_good') {
        var bRes = await purchaseShopGood(d.payload.goodId);
        await refreshTopbarAndCompanion();
        await renderSheet();
        if (_runtime.activeTab === 'bag') await renderSubpageContent();
        if (bRes.ok) {
          _runtime.confirm.data = {
            mode: 'result',
            title: '购买成功',
            sub: '已存入共享背包',
            icon: 'fa-solid fa-circle-check',
            detailHtml: '获得「<strong>' + esc(bRes.good.name) + '</strong>」，消耗 <span class="wx-num">' + bRes.good.price + '</span> 金币。<br>当前剩余 <span class="wx-num">' + bRes.remaining + '</span> 金币。'
          };
        } else {
          _runtime.confirm.data = {
            mode: 'result',
            title: '未能购买',
            sub: '未发生扣费',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(bRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'gift_item') {
        var rawItemId = String((d.payload && d.payload.itemId) || '');
        if (rawItemId.indexOf('wx_bouquet_') === 0) {
          var bqIdFromBag = rawItemId.slice('wx_bouquet_'.length);
          var bagBqRes = await giftBouquetToActiveChar(bqIdFromBag, d.payload.expectedCharId, d.requestId);
          if (bagBqRes.ok) {
            _runtime.sheet.lastGiftedBouquetId = bagBqRes.bouquet.bouquetId;
            var bagIngTxt = (bagBqRes.bouquet.ingredients || []).map(function(i) { return i.name + '×' + i.count; }).join('、');
            var bagReact = await requestCharReaction({
              locationName: '四季花园',
              actionDesc: '收到了你亲手搭配并送出的花束「' + bagBqRes.bouquet.name + '」（花材：' + bagIngTxt + '，花语：' + (bagBqRes.bouquet.meanings || '') + '）'
            });
            if (bagReact && bagReact.ok && !bagReact.aborted) {
              var bagIsAi = bagReact.source === 'ai';
              await updateBouquetReply(bagBqRes.bouquet.bouquetId, bagReact.charId, bagReact.text, !bagIsAi);
              _runtime.sheet.charQuote = bagReact.text;
              _runtime.sheet.charQuoteMeta = bagIsAi ? 'AI 赠花回应' : '赠花记录已保存';
              _runtime.sheet.charQuoteSource = bagReact.source;
              pushCharBubbleEntry(bagReact.charId, 'four_seasons_garden', 'char', bagReact.text, _runtime.sheet.charQuoteMeta);
            }
            await renderSheet();
            if (_runtime.activeTab === 'bag') await renderSubpageContent();
            _runtime.confirm.data = {
              mode: 'result',
              title: '花束赠礼完成',
              sub: '送给 ' + esc(bagBqRes.charObj.nick || bagBqRes.charObj.name),
              icon: 'fa-solid fa-fan',
              detailHtml: '已送出「<strong>' + esc(bagBqRes.bouquet.name) + '</strong>」。' +
                (_runtime.sheet.charQuote ? '<br><br>Ta 说：“' + esc(_runtime.sheet.charQuote) + '”' : '')
            };
          } else {
            _runtime.confirm.data = {
              mode: 'result',
              title: '未能送出花束',
              sub: '花束安全保留',
              icon: 'fa-solid fa-circle-exclamation',
              detailHtml: esc(bagBqRes.msg || '操作未完成')
            };
          }
        } else if (rawItemId.indexOf('wx_plush_') === 0) {
          var plushIdFromBag = rawItemId.slice('wx_plush_'.length);
          var bagPlRes = await giftPlushToActiveChar(plushIdFromBag, d.payload.expectedCharId, d.requestId);
          if (bagPlRes.ok) {
            _runtime.sheet.lastGiftedPlushId = bagPlRes.plush.plushInstanceId;
            var bagPlReact = await requestCharReaction({
              locationName: '星光游乐场',
              actionDesc: '收到了你在游乐场抓到的玩偶「' + bagPlRes.plush.name + '」（' + bagPlRes.plush.rarityLabel + '）'
            });
            if (bagPlReact && bagPlReact.ok && !bagPlReact.aborted) {
              var bagPlAi = bagPlReact.source === 'ai';
              await updatePlushReply(bagPlRes.plush.plushInstanceId, bagPlReact.charId, bagPlReact.text, !bagPlAi);
              _runtime.sheet.charQuote = bagPlReact.text;
              _runtime.sheet.charQuoteMeta = bagPlAi ? 'AI 赠玩偶回应' : '玩偶赠礼已记录';
              _runtime.sheet.charQuoteSource = bagPlReact.source;
              pushCharBubbleEntry(bagPlReact.charId, 'starlight_park', 'char', bagPlReact.text, _runtime.sheet.charQuoteMeta);
            }
            await renderSheet();
            if (_runtime.activeTab === 'bag') await renderSubpageContent();
            _runtime.confirm.data = {
              mode: 'result',
              title: '玩偶赠礼完成',
              sub: '送给 ' + esc(bagPlRes.charObj.nick || bagPlRes.charObj.name),
              icon: 'fa-solid fa-gift',
              detailHtml: '已送出玩偶「<strong>' + esc(bagPlRes.plush.name) + '</strong>」。' +
                (_runtime.sheet.charQuote ? '<br><br>Ta 说：“' + esc(_runtime.sheet.charQuote) + '”' : '')
            };
          } else {
            _runtime.confirm.data = {
              mode: 'result',
              title: '未能送出玩偶',
              sub: '原玩偶安全保留',
              icon: 'fa-solid fa-circle-exclamation',
              detailHtml: esc(bagPlRes.msg || '操作未完成')
            };
          }
        } else {
          var gRes = await giftItemToActiveChar(rawItemId);
          if (gRes.ok) {
            var react = await requestCharReaction({
              locationName: '心动商店街',
              actionDesc: '收到了你亲手送出的礼物「' + gRes.itemName + '」'
            });
            if (react && react.ok && !react.aborted) {
              _runtime.sheet.charQuote = react.text;
              _runtime.sheet.charQuoteMeta = react.source === 'ai' ? 'AI 赠礼回应' : '赠礼记录已保存';
              _runtime.sheet.charQuoteSource = react.source;
              pushCharBubbleEntry(react.charId, 'shopping_street', 'char', react.text, _runtime.sheet.charQuoteMeta);
            }
            await renderSheet();
            if (_runtime.activeTab === 'bag') await renderSubpageContent();
            _runtime.confirm.data = {
              mode: 'result',
              title: '赠礼完成',
              sub: '送给 ' + esc(gRes.charObj.nick || gRes.charObj.name),
              icon: 'fa-solid fa-gift',
              detailHtml: '已送出「<strong>' + esc(gRes.itemName) + '</strong>」。' +
                (_runtime.sheet.charQuote ? '<br><br>Ta 说：“' + esc(_runtime.sheet.charQuote) + '”' : '')
            };
          } else {
            _runtime.confirm.data = {
              mode: 'result',
              title: '无法送礼',
              sub: '请检查同行角色或背包',
              icon: 'fa-solid fa-circle-exclamation',
              detailHtml: esc(gRes.msg)
            };
          }
        }
      } else if (d.kind === 'craft_bouquet') {
        var cRes = await craftBouquet({
          counts: d.payload.counts,
          wrappingId: d.payload.wrappingId,
          ribbonId: d.payload.ribbonId,
          name: d.payload.name,
          requestId: d.requestId
        });
        if (cRes.ok) {
          _runtime.sheet.craftDraft = {
            counts: {},
            wrappingId: d.payload.wrappingId || 'sakura_pink',
            ribbonId: d.payload.ribbonId || 'champagne_gold',
            name: ''
          };
          _runtime.sheet.gardenTab = 'mementos';
          await renderSheet();
          if (_runtime.activeTab === 'bag') await renderSubpageContent();
          var bqDone = cRes.bouquet;
          _runtime.confirm.data = {
            mode: 'result',
            title: '花束制作完成',
            sub: '已存入四季花园与共享背包',
            icon: 'fa-solid fa-fan',
            detailHtml: '获得花束「<strong>' + esc(bqDone.name) + '</strong>」<br>花材：' +
              esc((bqDone.ingredients || []).map(function(x) { return x.name + '×' + x.count; }).join('、')) +
              '<br>花语：' + esc(bqDone.meanings || '')
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: '未能制作花束',
            sub: '花材未扣除',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(cRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'gift_bouquet') {
        var bqGiftRes = await giftBouquetToActiveChar(d.payload.bouquetId, d.payload.expectedCharId, d.requestId);
        if (bqGiftRes.ok) {
          var bqSent = bqGiftRes.bouquet;
          _runtime.sheet.lastGiftedBouquetId = bqSent.bouquetId;
          var ingSummary = (bqSent.ingredients || []).map(function(x) { return x.name + '×' + x.count; }).join('、');
          var flReact = await requestCharReaction({
            locationName: '四季花园',
            actionDesc: '收到了你亲手制作并送出的花束「' + bqSent.name + '」（花材：' + ingSummary + '，花语：' + (bqSent.meanings || '') + '）'
          });
          if (flReact && flReact.ok && !flReact.aborted) {
            var flIsAi = flReact.source === 'ai';
            await updateBouquetReply(bqSent.bouquetId, flReact.charId, flReact.text, !flIsAi);
            _runtime.sheet.charQuote = flReact.text;
            _runtime.sheet.charQuoteMeta = flIsAi ? 'AI 赠花回应' : '赠礼已完成（可重试回应）';
            _runtime.sheet.charQuoteSource = flReact.source;
            pushCharBubbleEntry(flReact.charId, 'four_seasons_garden', 'char', flReact.text, _runtime.sheet.charQuoteMeta);
          }
          await renderSheet();
          if (_runtime.activeTab === 'bag') await renderSubpageContent();
          _runtime.confirm.data = {
            mode: 'result',
            title: '花束送出成功',
            sub: '送给 ' + esc(bqGiftRes.charObj.nick || bqGiftRes.charObj.name),
            icon: 'fa-solid fa-heart',
            detailHtml: '已将「<strong>' + esc(bqSent.name) + '</strong>」赠予 ' + esc(bqGiftRes.charObj.nick || bqGiftRes.charObj.name) + '。' +
              (_runtime.sheet.charQuote ? '<br><br>Ta 说：“' + esc(_runtime.sheet.charQuote) + '”' : '')
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: '未能送出花束',
            sub: '原花束安全保留',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(bqGiftRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'cafe_order') {
        var oRes = await orderAtCafe(d.payload.menuType, d.payload.itemId);
        await refreshTopbarAndCompanion();
        if (oRes.ok) {
          var cReact = await requestCharReaction({
            locationName: '午后咖啡馆',
            actionDesc: (d.payload.menuType === 'dessert' ? '一起点了一份甜点「' : '点了一杯饮品「') + oRes.item.name + '」'
          });
          if (cReact && cReact.ok && !cReact.aborted) {
            _runtime.sheet.charQuote = cReact.text;
            _runtime.sheet.charQuoteMeta = cReact.source === 'ai' ? 'AI 即时回应' : '互动已记录';
            _runtime.sheet.charQuoteSource = cReact.source;
            pushCharBubbleEntry(cReact.charId, 'afternoon_cafe', 'char', cReact.text, _runtime.sheet.charQuoteMeta);
          }
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: '下单成功',
            sub: '午后咖啡馆',
            icon: 'fa-solid fa-mug-hot',
            detailHtml: '享用「<strong>' + esc(oRes.item.name) + '</strong>」（-' + oRes.item.price + ' 金币），剩余 <span class="wx-num">' + oRes.remaining + '</span> 金币。' +
              (_runtime.sheet.charQuote ? '<br><br>' + esc(_runtime.sheet.charQuote) : '')
          };
        } else {
          _runtime.confirm.data = {
            mode: 'result',
            title: '未能下单',
            sub: '未发生扣费',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(oRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'gacha_draw') {
        var mid = d.payload.machineId;
        var reqId = d.requestId || uid('greq');
        var dRes = await drawGacha(mid, reqId);
        await refreshTopbarAndCompanion();
        if (dRes.ok) {
          _runtime.sheet.lastGachaResult = Object.assign({ machineId: mid, desc: dRes.prize.desc }, dRes.log);
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: '扭蛋开启 · [' + dRes.prize.rarity + ']',
            sub: esc(dRes.log.machineName) + (dRes.log.hitPity ? ' · 触发10抽保底' : ''),
            icon: 'fa-solid fa-egg',
            detailHtml: '恭喜获得「<strong>' + esc(dRes.prize.name) + '</strong>」！<br>' + esc(dRes.prize.desc || '') +
              '<br><span style="font-size:12px;color:var(--wx-sub);">当前保底进度：' + dRes.pityCount + ' / ' + dRes.pityLimit + '（结果已安全落盘）</span>'
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: dRes.duplicate ? '已结算提示' : '无法抽取',
            sub: '未重复扣费',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(dRes.msg || '抽取失败')
          };
        }
      } else if (d.kind === 'claw_play') {
        var clawRes = await playClawAttempt({
          requestId: d.requestId || uid('clw'),
          clawPos: d.payload ? d.payload.clawPos : _runtime.sheet.clawPos
        });
        _runtime.sheet.lastClawResult = clawRes;
        _runtime.sheet.clawDropping = Boolean(clawRes.ok);
        await refreshTopbarAndCompanion();
        await renderSheet();
        if (_runtime.activeTab === 'bag') await renderSubpageContent();
        if (clawRes.ok) {
          setTimeout(function() {
            _runtime.sheet.clawDropping = false;
            if (_runtime.sheet.open && _runtime.sheet.subView === 'park' && _runtime.sheet.parkView === 'claw') {
              renderSheet();
            }
          }, 280);
          var won = clawRes.plush;
          if (_runtime.activeCharId) {
            var clawReact = await requestCharReaction({
              locationName: '星光游乐场',
              actionDesc: won
                ? ('在抓娃娃机成功抓到了一只「' + won.name + '」（' + won.rarityLabel + '）')
                : '在抓娃娃机试了一次手气，差一点就抓到玩偶了'
            });
            if (clawReact && clawReact.ok && !clawReact.aborted) {
              _runtime.sheet.charQuote = clawReact.text;
              _runtime.sheet.charQuoteMeta = clawReact.source === 'ai' ? 'AI 游乐场回应' : '陪伴提示';
              _runtime.sheet.charQuoteSource = clawReact.source;
              await renderSheet();
            }
          }
          _runtime.confirm.data = {
            mode: 'result',
            title: won ? ('抓中啦 · ' + esc(won.name)) : '差一点点',
            sub: won ? ('【' + esc(won.rarityLabel) + '】已存入收藏与共享背包') : '星光游乐场 · 抓娃娃机',
            icon: won ? esc(won.icon) : 'fa-solid fa-hand',
            detailHtml: won
              ? ('恭喜抓到「<strong>' + esc(won.name) + '</strong>」！<br>' + esc(won.desc) + '<br>消耗 <span class="wx-num">20</span> 金币，剩余 <span class="wx-num">' + (clawRes.remaining !== undefined ? clawRes.remaining : '') + '</span> 金币。')
              : ('本次爪子没能夹紧玩偶，消耗 <span class="wx-num">20</span> 金币。下次再瞄准试试吧！')
          };
        } else {
          _runtime.confirm.data = {
            mode: 'result',
            title: clawRes.refunded ? '抓娃娃未入包（已退款）' : '未能落爪',
            sub: clawRes.refunded ? '20 金币已退回' : '未产生无效发奖',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(clawRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'gift_plush') {
        var gpRes = await giftPlushToActiveChar(d.payload.plushInstanceId, d.payload.expectedCharId, d.requestId);
        if (gpRes.ok) {
          var gpPlush = gpRes.plush;
          _runtime.sheet.lastGiftedPlushId = gpPlush.plushInstanceId;
          var gpReact = await requestCharReaction({
            locationName: '星光游乐场',
            actionDesc: '收到了你在游乐场抓到的玩偶「' + gpPlush.name + '」（' + gpPlush.rarityLabel + '）'
          });
          if (gpReact && gpReact.ok && !gpReact.aborted) {
            var gpIsAi = gpReact.source === 'ai';
            await updatePlushReply(gpPlush.plushInstanceId, gpReact.charId, gpReact.text, !gpIsAi);
            _runtime.sheet.charQuote = gpReact.text;
            _runtime.sheet.charQuoteMeta = gpIsAi ? 'AI 赠玩偶回应' : '玩偶赠礼已完成（可重试回应）';
            _runtime.sheet.charQuoteSource = gpReact.source;
            pushCharBubbleEntry(gpReact.charId, 'starlight_park', 'char', gpReact.text, _runtime.sheet.charQuoteMeta);
          }
          await renderSheet();
          if (_runtime.activeTab === 'bag') await renderSubpageContent();
          _runtime.confirm.data = {
            mode: 'result',
            title: '玩偶送出成功',
            sub: '送给 ' + esc(gpRes.charObj.nick || gpRes.charObj.name),
            icon: 'fa-solid fa-heart',
            detailHtml: '已将「<strong>' + esc(gpPlush.name) + '</strong>」赠予 ' + esc(gpRes.charObj.nick || gpRes.charObj.name) + '。' +
              (_runtime.sheet.charQuote ? '<br><br>Ta 说：“' + esc(_runtime.sheet.charQuote) + '”' : '')
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: '未能送出玩偶',
            sub: '原玩偶安全保留',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(gpRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'ferris_start') {
        var fStartRes = await startFerrisRide(d.payload.charId, d.requestId);
        await refreshTopbarAndCompanion();
        if (fStartRes.ok) {
          _runtime.sheet.subView = 'park';
          _runtime.sheet.parkView = 'ferris';
          _runtime.sheet.finishedFerrisId = null;
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: fStartRes.resumed ? '继续星愿摩天轮' : '摩天轮已出发',
            sub: '共三幕双人互动 · 含 30 金币全部体验',
            icon: 'fa-solid fa-circle-notch',
            detailHtml: fStartRes.resumed
              ? '已为你恢复当前的摩天轮座舱进度，本次不额外扣费。'
              : '座舱缓缓离开站台，第一幕「缓缓升起」已开启。'
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: fStartRes.refunded ? '存储失败（已退款）' : '无法乘坐',
            sub: fStartRes.refunded ? '30 金币已退回' : '未产生额外扣费',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(fStartRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'carousel_ride') {
        var crRes = await commitCarouselRide({
          seatId: d.payload.seatId,
          moodId: d.payload.moodId,
          requestId: d.requestId
        });
        await refreshTopbarAndCompanion();
        if (crRes.ok) {
          _runtime.sheet.subView = 'park';
          _runtime.sheet.parkView = 'carousel';
          _runtime.sheet.lastCarouselRideId = crRes.ride.carouselRideId;
          clearCarouselAnimTimer();
          var reduceMotion = Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
          if (!reduceMotion && !crRes.idempotent) {
            _runtime.sheet.carouselPlaying = true;
            _carouselAnimTimer = setTimeout(function() {
              clearCarouselAnimTimer();
              if (_runtime.sheet.open && _runtime.sheet.subView === 'park' && _runtime.sheet.parkView === 'carousel') {
                renderSheet();
              }
            }, 2200);
          }
          await renderSheet();
          if (_runtime.activeCharId) {
            var carReact = await requestCharReaction({
              locationName: '星光游乐场 · 旋转木马',
              actionDesc: '一起乘上了「' + crRes.ride.seatName + '」（氛围提示：' + crRes.ride.moodName + '，仅作场景氛围描述，请严格保持角色原本性格与说话方式）'
            });
            if (carReact && carReact.ok && !carReact.aborted) {
              var carIsAi = carReact.source === 'ai';
              await updateCarouselReply(crRes.ride.carouselRideId, carReact.charId, carReact.text, carReact.source, !carIsAi);
              _runtime.sheet.charQuote = carReact.text;
              _runtime.sheet.charQuoteMeta = carIsAi ? 'AI 木马回应' : '陪伴提示';
              _runtime.sheet.charQuoteSource = carReact.source;
              pushCharBubbleEntry(carReact.charId, 'starlight_park', 'char', carReact.text, _runtime.sheet.charQuoteMeta);
              await renderSheet();
            }
          }
          _runtime.confirm.data = {
            mode: 'result',
            title: '乘上梦幻旋转木马',
            sub: esc(crRes.ride.seatName) + ' · ' + esc(crRes.ride.moodName),
            icon: esc(crRes.ride.seatIcon || 'fa-solid fa-horse'),
            detailHtml: '旋转圆盘伴随着星光音乐转动一圈，记录已保存。消耗 <span class="wx-num">10</span> 金币。' +
              (_runtime.sheet.charQuote ? '<br><br>Ta 说：“' + esc(_runtime.sheet.charQuote) + '”' : '')
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: crRes.refunded ? '存储失败（已退款）' : '无法乘坐',
            sub: crRes.refunded ? '10 金币已退回' : '未发生扣费',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(crRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'train_buy') {
        var tRes = await purchaseTrainTicketAndStartJourney({
          destinationId: d.payload.destinationId,
          charId: d.payload.charId,
          requestId: d.requestId
        });
        await refreshTopbarAndCompanion();
        if (tRes.ok) {
          _runtime.sheet.subView = 'station';
          _runtime.sheet.stationView = 'journey';
          _runtime.sheet.finishedJourneyId = null;
          _runtime.sheet.postcardDraftMsg = '';
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: tRes.resumed ? '继续未完成旅程' : '购票成功 · 列车启程',
            sub: esc(tRes.destination.name) + ' · ' + esc(tRes.journey.charName),
            icon: esc(tRes.destination.icon || 'fa-solid fa-train'),
            detailHtml: tRes.resumed
              ? '已为你恢复开往「<strong>' + esc(tRes.destination.name) + '</strong>」的进行中列车，本次不重复扣费。'
              : '已购入车票并登上开往「<strong>' + esc(tRes.destination.name) + '</strong>」的梦境列车（消耗 <span class="wx-num">30</span> 金币）。'
          };
        } else {
          await renderSheet();
          _runtime.confirm.data = {
            mode: 'result',
            title: tRes.refunded ? '购票异常（已安全退款）' : '未能购票',
            sub: tRes.refunded ? '30 金币已退回' : '未产生额外扣费',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(tRes.msg || '操作未完成')
          };
        }
      } else if (d.kind === 'train_abandon') {
        await abandonTrainJourney(d.payload.charId, d.payload.journeyId);
        _runtime.sheet.finishedJourneyId = null;
        _runtime.sheet.stationView = 'hub';
        await renderSheet();
        _runtime.confirm.data = {
          mode: 'result',
          title: '已结束当前旅程',
          sub: '未执行自动退费',
          icon: 'fa-solid fa-train',
          detailHtml: '已退出本次梦境列车行程，相关车票已记录为「已提前结束」，随时可在车站大厅重新购票出发。'
        };
      } else if (d.kind === 'bridge_share_preview') {
        var bridgeSh = getBridge();
        var editedText = sanitizeTextField(capturedBridgeShareText !== undefined ? capturedBridgeShareText : d.payload.draftText, 240);
        if (!editedText) {
          global.toast && global.toast('分享内容不能为空');
          return;
        }
        var expSh = d.payload.experience;
        var prep = bridgeSh ? await bridgeSh.prepareShareDraft({ experience: expSh, customText: editedText }) : { ok: false, msg: '桥接模块未就绪' };
        if (!prep.ok) {
          _runtime.confirm.data = {
            mode: 'result',
            title: '未能准备分享',
            sub: '未发送任何消息',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(prep.msg || '请先登录微信并打开与该角色的私聊')
          };
          return;
        }
        var liveBox = global.document && global.document.querySelector('#chat-window[data-chat-id="' + prep.chatId + '"] #chat-input');
        var conflict = await bridgeSh.checkShareDraftConflict({
          ownerUid: prep.ownerUid,
          chatId: prep.chatId,
          liveInputText: liveBox ? liveBox.value : ''
        });
        if (conflict.hasConflict) {
          _runtime.confirm.data = {
            mode: 'bridge_share_conflict',
            title: '聊天框已有未发送草稿',
            sub: '目标：' + esc(expSh.charName || 'Char') + ' 的私聊',
            existingText: conflict.existingText,
            draftText: editedText,
            payload: {
              ownerUid: prep.ownerUid,
              chatId: prep.chatId,
              charId: prep.charId,
              shareRecord: prep.shareRecord,
              draftText: editedText,
              existingText: conflict.existingText
            }
          };
          return;
        }
        await bridgeSh.applyShareDraftToChat({
          ownerUid: prep.ownerUid,
          chatId: prep.chatId,
          charId: prep.charId,
          shareRecord: prep.shareRecord,
          draftText: editedText,
          mode: 'replace'
        });
        _runtime.confirm.open = false;
        _runtime.confirm.data = null;
        _runtime.pendingAction = false;
        close();
        if (typeof global.openWechatPrivateChatForBridge === 'function') {
          await global.openWechatPrivateChatForBridge({
            charId: prep.charId,
            chatId: prep.chatId,
            ownerUid: prep.ownerUid,
            restoreDraftText: editedText
          });
        }
        global.toast && global.toast('已将分享草稿带入「' + (expSh.charName || 'Char') + '」聊天框，请确认后手动发送');
        return;
      } else if (d.kind === 'bridge_memory_preview') {
        var bridgeMem = getBridge();
        var mTitle = sanitizeTextField(capturedBridgeMemTitle !== undefined ? capturedBridgeMemTitle : d.payload.title, 30);
        var mContent = sanitizeTextField(capturedBridgeMemContent !== undefined ? capturedBridgeMemContent : d.payload.content, 150);
        if (!mTitle || !mContent) {
          global.toast && global.toast('记忆标题与内容均不能为空');
          return;
        }
        var expMem = d.payload.experience;
        var memRes = bridgeMem
          ? await bridgeMem.confirmSaveMemory({ experience: expMem, title: mTitle, content: mContent })
          : { ok: false, error: '桥接模块未就绪' };
        if (!memRes.ok) {
          _runtime.confirm.data = {
            mode: 'result',
            title: '写入长期记忆失败',
            sub: '原万象镜记录安全保留',
            icon: 'fa-solid fa-circle-exclamation',
            detailHtml: esc(memRes.error || '写入失败，可稍后重试')
          };
          return;
        }
        _runtime.confirm.open = false;
        _runtime.confirm.data = null;
        if (_runtime.sheet.open) await renderSheet();
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        global.toast && global.toast(memRes.duplicate ? '这条万象镜回忆已在长期记忆中' : ('已记住这一天，写入与「' + (expMem.charName || 'Char') + '」的长期记忆'));
        return;
      }
    } finally {
      _runtime.pendingAction = false;
      renderConfirmModal();
    }
  }

  async function renderSubpageContent() {
    if (!_runtime.pageEl) return;
    var subEl = _runtime.pageEl.querySelector('#wx-subpage');
    if (!subEl) return;
    var tab = _runtime.activeTab;

    if (tab === 'map') {
      subEl.classList.remove('is-active');
      subEl.innerHTML = '';
      return;
    }

    subEl.classList.add('is-active');
    if (tab === 'bag') {
      var eco = await getEconomySnapshot();
      var inv = eco.inventory || [];
      subEl.innerHTML =
        '<div class="wx-section-head"><span>共享背包（单一权威数据源）</span><span class="wx-num">' + inv.length + ' 种物品 · ' + (eco.coins || 0) + ' 金币</span></div>' +
        '<div class="wx-notice-box">这里展示 SharedEconomyService 统一背包物品，与「我们的家」「弯弯农场」「陪伴自习室」互通，不新建第二套背包。</div>' +
        (inv.length
          ? '<div class="wx-list">' + inv.map(function(item) {
              return (
                '<div class="wx-item-row">' +
                  '<div class="wx-item-icon"><i class="' + esc(item.icon || 'fa-solid fa-box') + '"></i></div>' +
                  '<div class="wx-item-info">' +
                    '<div class="wx-item-name">' + esc(item.name) + ' <span class="wx-num" style="font-size:12px;color:var(--wx-sub);">×' + (item.count || 1) + '</span></div>' +
                    '<div class="wx-item-meta">' + esc(item.desc || '') + '</div>' +
                  '</div>' +
                  '<button type="button" class="wx-item-cta is-outline" data-wx-gift-item="' + esc(item.itemId) + '">赠予 Char</button>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '<div class="wx-empty">背包空空如也，去心动商店街或奇遇扭蛋屋看看吧~</div>');
    } else if (tab === 'mementos') {
      var allMems = await loadMementos();
      var charObj = await getActiveCharacterObj();
      var charScoped = charObj
        ? allMems.filter(function(m) { return String(m.charId) === String(charObj.id); })
        : allMems;
      var mFilter = _runtime.mementoFilter || 'all';
      var aSub = _runtime.amusementSubFilter || 'all';
      var tSub = _runtime.trainDestFilter || 'all';
      var scoped = charScoped.filter(function(m) {
        var st = m.sourceType || 'cafe_photo';
        if (mFilter !== 'all' && st !== mFilter) return false;
        if (mFilter === 'amusement_park' && aSub !== 'all' && m.parkCategory !== aSub) return false;
        if (mFilter === 'starwish_train' && tSub !== 'all' && m.destinationId !== tSub) return false;
        return true;
      });
      var filterTabs = [
        { key: 'all', label: '全部 (' + charScoped.length + ')' },
        { key: 'cafe_photo', label: '咖啡馆留影' },
        { key: 'flower_language', label: '花语纪念' },
        { key: 'lakeside_walk', label: '湖畔纪念' },
        { key: 'amusement_park', label: '游乐场纪念' },
        { key: 'starwish_train', label: '旅行明信片' },
        { key: 'seasonal_event', label: '季节纪念' }
      ];
      var parkSubTabsHtml = mFilter === 'amusement_park'
        ? '<div class="wx-seg-tabs">' +
            [
              { key: 'all', label: '全部游乐' },
              { key: 'plush', label: '玩偶' },
              { key: 'ferris_wheel', label: '摩天轮' },
              { key: 'carousel', label: '旋转木马' }
            ].map(function(st) {
              return '<button type="button" class="wx-seg-tab ' + (st.key === aSub ? 'is-active' : '') + '" data-wx-amuse-sub="' + st.key + '">' + esc(st.label) + '</button>';
            }).join('') +
          '</div>'
        : '';
      var trainSubTabsHtml = mFilter === 'starwish_train'
        ? '<div class="wx-seg-tabs">' +
            [
              { key: 'all', label: '全部站点' },
              { key: 'sakura_valley', label: '樱雾花谷' },
              { key: 'moonlight_coast', label: '月光海岸' },
              { key: 'starry_observatory', label: '星眠天文台' },
              { key: 'cloud_town', label: '云端小镇' }
            ].map(function(dt) {
              return '<button type="button" class="wx-seg-tab ' + (dt.key === tSub ? 'is-active' : '') + '" data-wx-train-dest="' + dt.key + '">' + esc(dt.label) + '</button>';
            }).join('') +
          '</div>'
        : '';
      subEl.innerHTML =
        '<div class="wx-section-head">' +
          '<span>万象镜留影与纪念' + (charObj ? ' · ' + esc(charObj.nick || charObj.name) + ' 视角' : ' · 全部') + '</span>' +
          '<span class="wx-num">' + scoped.length + ' 张</span>' +
        '</div>' +
        '<div class="wx-seg-tabs">' +
          filterTabs.map(function(ft) {
            return '<button type="button" class="wx-seg-tab ' + (ft.key === mFilter ? 'is-active' : '') + '" data-wx-mem-filter="' + ft.key + '">' + esc(ft.label) + '</button>';
          }).join('') +
        '</div>' +
        parkSubTabsHtml +
        trainSubTabsHtml +
        '<div class="wx-notice-box">万象镜留影、花语、湖畔、游乐场、旅行明信片与季节纪念均独立保存，仅当用户主动收藏时录入，绝不擅自修改角色长期记忆。</div>' +
        (scoped.length
          ? '<div class="wx-list">' + (await (async function() {
              var memHelperCache = {};
              var cards = await Promise.all(scoped.map(async function(m) {
                var st = m.sourceType || 'cafe_photo';
                var badge = st === 'flower_language'
                  ? '花语纪念'
                  : (st === 'lakeside_walk'
                      ? '湖畔纪念'
                      : (st === 'amusement_park'
                          ? (m.parkCategory === 'plush' ? '玩偶纪念' : (m.parkCategory === 'ferris_wheel' ? '摩天轮纪念' : '木马纪念'))
                          : (st === 'starwish_train'
                              ? ('明信片 · ' + (m.destinationName || '远方'))
                              : (st === 'seasonal_event' ? ((m.seasonLabel || '季节') + '纪念') : '咖啡馆留影'))));
                var extra = m.ingredientsText
                  ? (m.ingredientsText + (m.meanings ? ' · 花语：' + m.meanings : ''))
                  : (m.summary || m.note || '');
                var mCid = m.charId ? String(m.charId) : '';
                if (mCid && !memHelperCache[mCid]) memHelperCache[mCid] = await buildBridgeHelperForChar(mCid);
                var mExp = (mCid && memHelperCache[mCid]) ? memHelperCache[mCid].findByMemento(m) : null;
                return (
                  '<div class="wx-memento-card">' +
                    '<div class="wx-memento-head">' +
                      '<span class="wx-memento-title">' + esc(m.title || ((m.locationName || '万象镜') + ' · ' + (m.charName || '同行'))) + '</span>' +
                      '<span style="font-size:11px;color:var(--wx-open);font-weight:600;">' + esc(badge) + '</span>' +
                    '</div>' +
                    '<div class="wx-memento-meta">' +
                      esc(m.dateStr || '') + ' · ' + esc(m.periodLabel || '') + ' · ' + esc(m.charName || '') +
                      (extra ? '<br>' + esc(extra) : '') +
                      (m.postcardMessage ? '<br>明信片寄语：“' + esc(m.postcardMessage) + '”' : '') +
                      (m.charReplySummary ? '<br>Ta 说：“' + esc(m.charReplySummary) + '”' : '') +
                    '</div>' +
                    (mExp ? memHelperCache[mCid].renderButtons(mExp) : '') +
                    '<div style="display:flex;justify-content:flex-end;">' +
                      '<button type="button" class="wx-mini-btn" data-wx-del-mem="' + esc(m.id) + '">删除</button>' +
                    '</div>' +
                  '</div>'
                );
              }));
              return cards.join('');
            })()) + '</div>'
          : '<div class="wx-empty">当前分类下暂无纪念记录，可前往「午后咖啡馆」「四季花园」「湖畔步道」「星光游乐场」或「星愿列车站」留下珍藏时刻。</div>');
    } else if (tab === 'codex') {
      var gs = await loadGachaState();
      var st = await loadMirrorState();
      var visited = st.visitedLocations || {};
      subEl.innerHTML =
        '<div class="wx-section-head"><span>小镇地点图鉴</span><span class="wx-num">已探索 ' + Object.keys(visited).length + ' / ' + LOCATIONS.length + '</span></div>' +
        '<div class="wx-list">' +
          LOCATIONS.map(function(loc) {
            var isVis = Boolean(visited[loc.id]);
            return (
              '<div class="wx-item-row">' +
                '<div class="wx-item-icon"><i class="' + esc(loc.icon) + '"></i></div>' +
                '<div class="wx-item-info">' +
                  '<div class="wx-item-name">' + esc(loc.name) + ' · <span style="font-size:11.5px;color:var(--wx-sub);">' + esc(loc.openLabel) + '</span></div>' +
                  '<div class="wx-item-meta">' + esc(loc.brief) + '</div>' +
                '</div>' +
                '<span class="wx-num" style="font-size:11px;color:' + (isVis ? 'var(--wx-open)' : 'var(--wx-sub)') + ';font-weight:600;">' + (isVis ? '已到访' : '未到访') + '</span>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        '<div class="wx-section-head" style="margin-top:6px;"><span>镜界奇遇收集</span><span class="wx-num">' + gs.collectedEncounters.length + ' / 3</span></div>' +
        (gs.collectedEncounters.length
          ? '<div class="wx-list">' + gs.collectedEncounters.map(function(e) {
              return (
                '<div class="wx-item-row">' +
                  '<div class="wx-item-icon"><i class="fa-solid fa-star"></i></div>' +
                  '<div class="wx-item-info"><div class="wx-item-name">[' + esc(e.rarity) + '] ' + esc(e.name) + '</div><div class="wx-item-meta">' + esc(e.desc) + '</div></div>' +
                '</div>'
              );
            }).join('') + '</div>'
          : '<div class="wx-empty">暂未解锁奇遇图鉴，可前往「奇遇扭蛋屋」抽取。</div>');
    }
  }

  async function triggerCharReactionAndRender(loc, actionDesc, pushHistory) {
    if (!_runtime.activeCharId) return;
    var seqToken = ++_openSeq;
    _runtime.aiLoading = true;
    var quoteEl = _runtime.pageEl && _runtime.pageEl.querySelector('.wx-char-strip-quote');
    if (quoteEl) quoteEl.textContent = '正在联系同行伙伴…';

    var res = await requestCharReaction({
      locationName: loc.name,
      actionDesc: actionDesc
    });
    _runtime.aiLoading = false;

    if (!res || !res.ok || res.aborted) return;
    if (!_runtime.sheet.open || _runtime.sheet.locationId !== loc.id || seqToken !== _openSeq) return;

    _runtime.sheet.charQuote = res.text;
    _runtime.sheet.charQuoteMeta = res.source === 'ai' ? 'AI 即时回应' : '陪伴提示';
    _runtime.sheet.charQuoteSource = res.source;
    if (pushHistory) {
      pushCharBubbleEntry(res.charId, loc.id, 'char', res.text, _runtime.sheet.charQuoteMeta);
    }

    await renderSheet();
    var updatedEl = _runtime.pageEl && _runtime.pageEl.querySelector('.wx-char-strip-quote');
    if (updatedEl) applyQuoteTextWithOptionalTypewriter(updatedEl, res.text);
  }

  async function openLocationSheet(locId, initialSubView) {
    var loc = getLocationById(locId);
    if (!loc) return;
    var myOpenSeq = ++_openSeq;

    // 清除任何未决手势与残留确认框
    _runtime.gesture.pointers = {};
    _runtime.gesture.dragging = false;
    _runtime.gesture.pinching = false;
    _runtime.gesture.moved = false;
    _runtime.confirm.open = false;
    _runtime.confirm.data = null;
    renderConfirmModal();

    _runtime.sheet.open = true;
    _runtime.sheet.locationId = loc.id;
    _runtime.sheet.subView = initialSubView || 'intro';
    _runtime.sheet.parkView = 'hub';
    _runtime.sheet.finishedFerrisId = null;
    _runtime.sheet.stationView = 'hub';
    _runtime.sheet.finishedJourneyId = null;
    _runtime.sheet.canStepBack = false;
    _runtime.sheet.charQuote = '';
    _runtime.sheet.charQuoteMeta = '';
    _runtime.sheet.charQuoteSource = '';
    _runtime.aiLoading = Boolean(_runtime.activeCharId);

    var st = await loadMirrorState();
    if (myOpenSeq !== _openSeq || !_runtime.sheet.open || _runtime.sheet.locationId !== loc.id) return;

    if (!st.visitedLocations[loc.id]) {
      st.visitedLocations[loc.id] = nowMs();
      await saveMirrorState({ visitedLocations: st.visitedLocations });
    }
    if (myOpenSeq !== _openSeq || !_runtime.sheet.open || _runtime.sheet.locationId !== loc.id) return;

    await renderSheet();
    await renderAtmosphereAndInviteUi();

    if (_runtime.activeCharId) {
      var res = await requestCharReaction({
        locationName: loc.name,
        actionDesc: '停在了「' + loc.name + '」门口'
      });
      _runtime.aiLoading = false;
      if (res && res.ok && !res.aborted && myOpenSeq === _openSeq && _runtime.sheet.open && _runtime.sheet.locationId === loc.id) {
        _runtime.sheet.charQuote = res.text;
        _runtime.sheet.charQuoteMeta = res.source === 'ai' ? 'AI 即时回应' : '陪伴提示';
        _runtime.sheet.charQuoteSource = res.source;
        await renderSheet();
        var quoteEl = _runtime.pageEl && _runtime.pageEl.querySelector('.wx-char-strip-quote');
        if (quoteEl) applyQuoteTextWithOptionalTypewriter(quoteEl, res.text);
      }
    }
  }

  async function closeSheetOnly() {
    clearTypewriter();
    clearCarouselAnimTimer();
    _aiSeq++; // 作废在途 AI 请求，防止关闭后回流重开
    _openSeq++;
    _runtime.aiLoading = false;
    _runtime.confirm.open = false;
    _runtime.confirm.data = null;
    _runtime.sheet.open = false;
    _runtime.sheet.canStepBack = false;
    renderConfirmModal();
    await renderSheet();
    await renderAtmosphereAndInviteUi();
    await saveMirrorState({
      mapTransform: { x: _runtime.mapTransform.x, y: _runtime.mapTransform.y, scale: _runtime.mapTransform.scale }
    });
  }

  async function switchTab(tabKey) {
    if (['map', 'bag', 'mementos', 'codex'].indexOf(tabKey) === -1) return;
    _runtime.activeTab = tabKey;
    if (_runtime.pageEl) {
      _runtime.pageEl.querySelectorAll('.wx-nav-tab').forEach(function(btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-wx-tab') === tabKey);
      });
    }
    await renderSubpageContent();
    await renderAtmosphereAndInviteUi();
  }

  // ====================================================
  // 七、手势与交互绑定（1指平移 / 2指缩放 / 弹窗阻断地图穿刺）
  // ====================================================
  function bindStageGestures(page) {
    var stage = page.querySelector('#wx-map-stage');
    if (!stage) return;

    function getDist(p1, p2) {
      var dx = p1.x - p2.x;
      var dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    stage.addEventListener('pointerdown', function(e) {
      if (_runtime.sheet.open || _runtime.confirm.open) return;
      if (e.button && e.button !== 0) return;
      _runtime.gesture.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(_runtime.gesture.pointers);
      if (ids.length === 1) {
        _runtime.gesture.dragging = true;
        _runtime.gesture.pinching = false;
        _runtime.gesture.moved = false;
        _runtime.gesture.startX = e.clientX;
        _runtime.gesture.startY = e.clientY;
        _runtime.gesture.origX = _runtime.mapTransform.x;
        _runtime.gesture.origY = _runtime.mapTransform.y;
        stage.classList.add('is-dragging');
      } else if (ids.length === 2) {
        _runtime.gesture.dragging = false;
        _runtime.gesture.pinching = true;
        _runtime.gesture.moved = true;
        var p1 = _runtime.gesture.pointers[ids[0]];
        var p2 = _runtime.gesture.pointers[ids[1]];
        _runtime.gesture.pinchStartDist = Math.max(10, getDist(p1, p2));
        _runtime.gesture.pinchStartScale = _runtime.mapTransform.scale;
        var rect = stage.getBoundingClientRect();
        _runtime.gesture.pinchMidX = ((p1.x + p2.x) / 2) - rect.left;
        _runtime.gesture.pinchMidY = ((p1.y + p2.y) / 2) - rect.top;
        _runtime.gesture.origX = _runtime.mapTransform.x;
        _runtime.gesture.origY = _runtime.mapTransform.y;
      }
    });

    stage.addEventListener('pointermove', function(e) {
      if (_runtime.sheet.open || _runtime.confirm.open) return;
      if (!_runtime.gesture.pointers[e.pointerId]) return;
      _runtime.gesture.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(_runtime.gesture.pointers);

      if (_runtime.gesture.pinching && ids.length >= 2) {
        var p1 = _runtime.gesture.pointers[ids[0]];
        var p2 = _runtime.gesture.pointers[ids[1]];
        var dist = Math.max(10, getDist(p1, p2));
        var ratio = dist / _runtime.gesture.pinchStartDist;
        var nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _runtime.gesture.pinchStartScale * ratio));
        var scaleRatio = nextScale / _runtime.gesture.pinchStartScale;
        var rawX = _runtime.gesture.pinchMidX - (_runtime.gesture.pinchMidX - _runtime.gesture.origX) * scaleRatio;
        var rawY = _runtime.gesture.pinchMidY - (_runtime.gesture.pinchMidY - _runtime.gesture.origY) * scaleRatio;
        var clamped = clampMapTransform(rawX, rawY, nextScale, _runtime.boardMetrics);
        _runtime.mapTransform.x = clamped.x;
        _runtime.mapTransform.y = clamped.y;
        _runtime.mapTransform.scale = clamped.scale;
        applyTransformDom();
      } else if (_runtime.gesture.dragging && ids.length === 1) {
        var dx = e.clientX - _runtime.gesture.startX;
        var dy = e.clientY - _runtime.gesture.startY;
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
          _runtime.gesture.moved = true;
        }
        if (_runtime.gesture.moved) {
          var clampedDrag = clampMapTransform(
            _runtime.gesture.origX + dx,
            _runtime.gesture.origY + dy,
            _runtime.mapTransform.scale,
            _runtime.boardMetrics
          );
          _runtime.mapTransform.x = clampedDrag.x;
          _runtime.mapTransform.y = clampedDrag.y;
          applyTransformDom();
        }
      }
    });

    function endPointer(e) {
      delete _runtime.gesture.pointers[e.pointerId];
      var remaining = Object.keys(_runtime.gesture.pointers).length;
      if (remaining === 0) {
        _runtime.gesture.dragging = false;
        _runtime.gesture.pinching = false;
        stage.classList.remove('is-dragging');
        if (_runtime.gesture.moved) {
          saveMirrorState({
            mapTransform: { x: _runtime.mapTransform.x, y: _runtime.mapTransform.y, scale: _runtime.mapTransform.scale }
          });
        }
      } else if (remaining === 1) {
        _runtime.gesture.pinching = false;
      }
    }

    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);

    stage.addEventListener('wheel', function(e) {
      if (_runtime.sheet.open || _runtime.confirm.open) return;
      e.preventDefault();
      var delta = e.deltaY < 0 ? 0.15 : -0.15;
      zoomAtCenter(_runtime.mapTransform.scale + delta);
    }, { passive: false });

    stage.addEventListener('click', function(e) {
      if (_runtime.sheet.open || _runtime.confirm.open) return;
      if (_runtime.gesture.moved) {
        _runtime.gesture.moved = false;
        return;
      }
      var spot = e.target && e.target.closest ? e.target.closest('.wx-hotspot') : null;
      if (!spot) return;
      var locId = spot.getAttribute('data-loc-id');
      if (locId) openLocationSheet(locId, 'intro');
    });
  }

  function zoomAtCenter(targetScale) {
    var metrics = _runtime.boardMetrics;
    var oldScale = _runtime.mapTransform.scale || 1;
    var nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(targetScale) || 1));
    if (nextScale === oldScale) return;
    var cx = metrics.stageW / 2;
    var cy = metrics.stageH / 2;
    var ratio = nextScale / oldScale;
    var rawX = cx - (cx - _runtime.mapTransform.x) * ratio;
    var rawY = cy - (cy - _runtime.mapTransform.y) * ratio;
    var clamped = clampMapTransform(rawX, rawY, nextScale, metrics);
    _runtime.mapTransform.x = clamped.x;
    _runtime.mapTransform.y = clamped.y;
    _runtime.mapTransform.scale = clamped.scale;
    applyTransformDom();
    saveMirrorState({
      mapTransform: { x: clamped.x, y: clamped.y, scale: clamped.scale }
    });
  }

  function recenterToPlaza() {
    var centered = centerTransformOnPoint(50, 44, 1.0, _runtime.boardMetrics);
    _runtime.mapTransform.x = centered.x;
    _runtime.mapTransform.y = centered.y;
    _runtime.mapTransform.scale = centered.scale;
    applyTransformDom();
    saveMirrorState({
      mapTransform: { x: centered.x, y: centered.y, scale: centered.scale }
    });
    global.toast && global.toast('已回到镜心广场');
  }

  // ====================================================
  // 八、事件代理（弹窗、确认层、Char 面板、顶部工具栏、底部导航）
  // ====================================================
  async function handleFeatureAction(locId, featId) {
    var loc = getLocationById(locId);
    if (!loc) return;
    var allFeats = (loc.features || []).concat(loc.secondaryFeatures || []);
    var feat = allFeats.find(function(f) { return f.id === featId; });
    if (!feat) return;

    if (!feat.available) {
      global.toast && global.toast(loc.name + '「' + feat.label + '」正在开发中，敬请期待');
      return;
    }

    if (feat.externalApp === 'gameHall') {
      if (typeof global.showGameHallPage === 'function') {
        global.showGameHallPage();
      } else {
        global.toast && global.toast('游戏大厅暂未加载');
      }
      return;
    }

    if (locId === 'mirror_plaza') {
      if (featId === 'plaza_wish') {
        var wRes = await claimPlazaWish();
        global.toast && global.toast(wRes.ok ? ('许愿成功，获得 +' + wRes.coins + ' 金币') : wRes.msg);
        await refreshTopbarAndCompanion();
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.subView = 'plaza';
        await renderSheet();
        return;
      }
      if (featId === 'plaza_chat') {
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.subView = 'charChat';
        await renderSheet();
        return;
      }
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'plaza';
      await renderSheet();
      return;
    }

    if (locId === 'shopping_street') {
      var catMap = {
        shop_gift: 'gift',
        shop_life: 'life',
        shop_style: 'style',
        shop_prop: 'prop',
        shop_bag: 'bag'
      };
      if (featId === 'shop_signin') {
        var sRes = await claimDailySignin();
        global.toast && global.toast(sRes.ok ? ('签到成功！获得 +' + sRes.coins + ' 金币') : sRes.msg);
        await refreshTopbarAndCompanion();
        return;
      }
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'shop';
      _runtime.sheet.shopCat = catMap[featId] || 'all';
      await renderSheet();
      return;
    }

    if (locId === 'afternoon_cafe') {
      if (featId === 'cafe_chat') {
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.subView = 'charChat';
        await renderSheet();
        return;
      }
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'cafe';
      await renderSheet();
      return;
    }

    if (locId === 'gacha_house') {
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'gacha';
      if (featId === 'gacha_adventure') _runtime.sheet.gachaTab = 'adventure';
      else if (featId === 'gacha_odds') _runtime.sheet.gachaTab = 'odds';
      else if (featId === 'gacha_history') _runtime.sheet.gachaTab = 'history';
      else _runtime.sheet.gachaTab = 'gift';
      await renderSheet();
      return;
    }

    if (locId === 'mirror_gallery') {
      if (featId === 'gal_photos') {
        await closeSheetOnly();
        switchTab('mementos');
      } else if (featId === 'gal_codex') {
        await closeSheetOnly();
        switchTab('codex');
      } else if (featId === 'gal_achievement') {
        if (global.AchievementHall && typeof global.AchievementHall.open === 'function') {
          global.AchievementHall.open();
        } else if (typeof global.showAchievementPage === 'function') {
          global.showAchievementPage();
        }
      } else if (featId === 'gal_lovediary') {
        if (typeof global.showLoveDiaryPage === 'function') {
          global.showLoveDiaryPage();
        } else {
          global.toast && global.toast('恋爱记入口暂未加载');
        }
      }
      return;
    }

    if (locId === 'four_seasons_garden') {
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'garden';
      if (featId === 'garden_collect') _runtime.sheet.gardenTab = 'collect';
      else if (featId === 'garden_craft') _runtime.sheet.gardenTab = 'craft';
      else if (featId === 'garden_basket') _runtime.sheet.gardenTab = 'basket';
      else if (featId === 'garden_mementos') _runtime.sheet.gardenTab = 'mementos';
      else _runtime.sheet.gardenTab = 'home';
      await renderSheet();
      return;
    }

    if (locId === 'lakeside_walk') {
      if (featId === 'lake_char') {
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.subView = 'charPicker';
        await renderSheet();
        return;
      }
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'lakeside';
      if (featId === 'lake_mementos') {
        _runtime.sheet.lakesideView = 'mementos';
      } else {
        _runtime.sheet.lakesideView = 'walk';
        _runtime.sheet.finishedWalkId = null;
      }
      await renderSheet();
      return;
    }

    if (locId === 'starlight_park') {
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'park';
      _runtime.sheet.finishedFerrisId = null;
      if (featId === 'park_claw') _runtime.sheet.parkView = 'claw';
      else if (featId === 'park_ferris') _runtime.sheet.parkView = 'ferris';
      else if (featId === 'park_carousel') _runtime.sheet.parkView = 'carousel';
      else _runtime.sheet.parkView = 'hub';
      await renderSheet();
      return;
    }

    if (locId === 'starwish_station') {
      if (featId === 'station_char') {
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.subView = 'charPicker';
        await renderSheet();
        return;
      }
      _runtime.sheet.canStepBack = true;
      _runtime.sheet.subView = 'station';
      _runtime.sheet.finishedJourneyId = null;
      if (featId === 'station_tickets') _runtime.sheet.stationView = 'tickets';
      else if (featId === 'station_postcards') _runtime.sheet.stationView = 'postcards';
      else _runtime.sheet.stationView = 'hub';
      await renderSheet();
    }
  }

  function bindPageDelegatedEvents(page) {
    page.addEventListener('click', async function(e) {
      var target = e.target;
      if (!target || !target.closest) return;

      // 关闭昼夜预览框
      var timePop = page.querySelector('#wx-time-popover');
      if (_runtime.timeMenuOpen && !target.closest('#wx-time-popover') && !target.closest('#wx-time-btn')) {
        _runtime.timeMenuOpen = false;
        if (timePop) timePop.classList.remove('is-open');
      }

      // 第五层确认/结果弹层交互（优先级最高，防止误触后层）
      if (_runtime.confirm.open) {
        if (target.id === 'wx-confirm-backdrop' || target.closest('[data-wx-confirm-close]')) {
          closeConfirmModal();
          return;
        }
        if (target.closest('[data-wx-confirm-exec]')) {
          await executePendingConfirm();
          return;
        }
        var conflictBtn = target.closest('[data-wx-bridge-conflict]');
        if (conflictBtn && _runtime.confirm.data && _runtime.confirm.data.mode === 'bridge_share_conflict') {
          var mode = conflictBtn.getAttribute('data-wx-bridge-conflict') || 'merge';
          var pl = _runtime.confirm.data.payload;
          var br = getBridge();
          if (br && pl) {
            var applied = await br.applyShareDraftToChat({
              ownerUid: pl.ownerUid,
              chatId: pl.chatId,
              charId: pl.charId,
              shareRecord: pl.shareRecord,
              draftText: pl.draftText,
              existingText: pl.existingText,
              mode: mode
            });
            _runtime.confirm.open = false;
            _runtime.confirm.data = null;
            close();
            if (typeof global.openWechatPrivateChatForBridge === 'function') {
              await global.openWechatPrivateChatForBridge({
                charId: pl.charId,
                chatId: pl.chatId,
                ownerUid: pl.ownerUid,
                restoreDraftText: applied && applied.draft ? applied.draft.draftText : pl.draftText
              });
            }
            global.toast && global.toast(mode === 'merge' ? '已合并到原草稿中，请确认后手动发送' : '已替换为本次分享草稿，请确认后手动发送');
          }
          return;
        }
        if (target.closest('#wx-confirm-card')) {
          return;
        }
      }

      // 0B. V3.1 返回原微信聊天入口（严格回到发起跳转的源会话与角色）
      if (target.closest('#wx-chat-return-btn')) {
        var retCtx = _runtime.fromChatCtx;
        var retNavId = _runtime.fromChatNavId;
        var brNav = getBridge();
        if (retNavId && brNav && typeof brNav.clearNavigationContext === 'function') {
          await brNav.clearNavigationContext(retNavId);
        }
        _runtime.fromChatNavId = '';
        _runtime.fromChatCtx = null;
        close();
        if (retCtx && retCtx.sourceChatId && retCtx.charId && typeof global.openWechatPrivateChatForBridge === 'function') {
          await global.openWechatPrivateChatForBridge({
            charId: retCtx.charId,
            chatId: retCtx.sourceChatId,
            ownerUid: retCtx.ownerUid,
            restoreScrollTop: retCtx.scrollTop,
            restoreDraftText: retCtx.draftText
          });
        }
        return;
      }

      // 1. 返回小手机桌面
      if (target.closest('#wx-back-home')) {
        close();
        return;
      }

      // 2. 昼夜预览按钮与切换
      if (target.closest('#wx-time-btn')) {
        _runtime.timeMenuOpen = !_runtime.timeMenuOpen;
        if (timePop) timePop.classList.toggle('is-open', _runtime.timeMenuOpen);
        return;
      }
      var timeOpt = target.closest('[data-wx-time-mode]');
      if (timeOpt) {
        var mode = timeOpt.getAttribute('data-wx-time-mode') || 'auto';
        _runtime.timePreview = mode;
        _runtime.timeMenuOpen = false;
        if (timePop) {
          timePop.classList.remove('is-open');
          timePop.querySelectorAll('[data-wx-time-mode]').forEach(function(b) {
            b.classList.toggle('is-active', b.getAttribute('data-wx-time-mode') === mode);
          });
        }
        await saveMirrorState({ timePreview: mode });
        await refreshTopbarAndCompanion();
        if (_runtime.sheet.open) await renderSheet();
        return;
      }

      // 2B. V3.0 小镇来信入口 / 恢复本地时间 / 生活设置 / 纸条便签操作
      if (target.closest('#wx-letters-btn')) {
        _runtime.sheet.open = true;
        _runtime.sheet.locationId = null;
        _runtime.sheet.subView = 'letters';
        _runtime.sheet.canStepBack = false;
        _runtime.letterReturnTo = null;
        await renderSheet();
        await renderAtmosphereAndInviteUi();
        return;
      }
      if (target.closest('[data-wx-atmo-restore]')) {
        _runtime.timePreview = 'auto';
        _runtime.timeMenuOpen = false;
        if (timePop) timePop.classList.remove('is-open');
        await saveMirrorState({ timePreview: 'auto' });
        await refreshTopbarAndCompanion();
        if (_runtime.sheet.open) await renderSheet();
        global.toast && global.toast('已恢复跟随当前本地时间');
        return;
      }
      var lifeOpenBtn = target.closest('[data-wx-open-life-settings]');
      if (lifeOpenBtn) {
        _runtime.letterReturnTo = lifeOpenBtn.getAttribute('data-wx-open-life-settings') === 'letters' ? 'letters' : null;
        _runtime.sheet.open = true;
        _runtime.sheet.locationId = null;
        _runtime.sheet.subView = 'lifeSettings';
        _runtime.sheet.canStepBack = _runtime.letterReturnTo === 'letters';
        await renderSheet();
        await renderAtmosphereAndInviteUi();
        return;
      }
      var noteActBtn = target.closest('[data-wx-invite-act]');
      if (noteActBtn) {
        var nAct = noteActBtn.getAttribute('data-wx-invite-act');
        var nInvId = noteActBtn.getAttribute('data-wx-invite-id');
        if (nAct === 'accept') {
          var accRes = await acceptInvitation(nInvId, _runtime.activeCharId);
          if (accRes.ok && accRes.invitation) {
            await openLocationSheet(accRes.invitation.locationId, 'intro');
          } else {
            global.toast && global.toast(accRes.msg || '无法接受邀约');
            await renderAtmosphereAndInviteUi();
          }
        } else if (nAct === 'defer') {
          await deferInvitation(nInvId, _runtime.activeCharId);
          _runtime.suppressedNoteForSession[nInvId] = true;
          await renderAtmosphereAndInviteUi();
          global.toast && global.toast('已收起便签，可在「小镇来信」中随时查看');
        } else if (nAct === 'dismiss') {
          await dismissInvitation(nInvId, _runtime.activeCharId);
          _runtime.suppressedNoteForSession[nInvId] = true;
          await renderAtmosphereAndInviteUi();
        }
        return;
      }
      var lettersTabBtn = target.closest('[data-wx-letters-tab]');
      if (lettersTabBtn) {
        _runtime.lettersTab = lettersTabBtn.getAttribute('data-wx-letters-tab') || 'active';
        await renderSheet();
        return;
      }
      var openLetterBtn = target.closest('[data-wx-open-letter]');
      if (openLetterBtn) {
        _runtime.selectedLetterId = openLetterBtn.getAttribute('data-wx-open-letter');
        _runtime.sheet.subView = 'letterDetail';
        _runtime.sheet.canStepBack = true;
        await renderSheet();
        return;
      }
      var letterOpBtn = target.closest('[data-wx-letter-op]');
      if (letterOpBtn) {
        var lOp = letterOpBtn.getAttribute('data-wx-letter-op');
        var lInvId = letterOpBtn.getAttribute('data-wx-invite-id');
        if (lOp === 'go') {
          var bGo = await getInvitationsForChar(_runtime.activeCharId);
          var invGo = bGo.all.find(function(x) { return x.inviteId === lInvId; });
          if (invGo && invGo.locationId) await openLocationSheet(invGo.locationId, 'intro');
        } else if (lOp === 'accept') {
          var lAccRes = await acceptInvitation(lInvId, _runtime.activeCharId);
          if (lAccRes.ok && lAccRes.invitation) {
            await openLocationSheet(lAccRes.invitation.locationId, 'intro');
          } else {
            global.toast && global.toast(lAccRes.msg || '当前邀约不可接受');
            await renderSheet();
          }
        } else if (lOp === 'defer') {
          await deferInvitation(lInvId, _runtime.activeCharId);
          await refreshTopbarAndCompanion();
          await renderSheet();
        } else if (lOp === 'dismiss') {
          await dismissInvitation(lInvId, _runtime.activeCharId);
          await refreshTopbarAndCompanion();
          await renderSheet();
        } else if (lOp === 'abandon_accepted') {
          await abandonAcceptedInvitation(lInvId, _runtime.activeCharId);
          await refreshTopbarAndCompanion();
          await renderSheet();
          global.toast && global.toast('已温和结束本次同行邀约');
        }
        return;
      }
      var lifeToggleBtn = target.closest('[data-wx-life-toggle]');
      if (lifeToggleBtn) {
        var tKey = lifeToggleBtn.getAttribute('data-wx-life-toggle');
        var curLife = await loadLifeState();
        var patch = {};
        patch[tKey] = !Boolean(curLife.settings[tKey]);
        var tSaveRes = await saveLifeSettings(patch);
        if (!tSaveRes || !tSaveRes.ok) {
          global.toast && global.toast('保存设置失败，请检查存储空间');
        }
        await refreshTopbarAndCompanion();
        await renderSheet();
        return;
      }
      var lifeFreqBtn = target.closest('[data-wx-life-freq]');
      if (lifeFreqBtn) {
        var fVal = lifeFreqBtn.getAttribute('data-wx-life-freq') === 'standard' ? 'standard' : 'low';
        var fSaveRes = await saveLifeSettings({ invitationFrequency: fVal });
        if (!fSaveRes || !fSaveRes.ok) {
          global.toast && global.toast('保存频率设置失败，请检查存储空间');
        }
        await refreshTopbarAndCompanion();
        await renderSheet();
        return;
      }
      var openSeasonalBtn = target.closest('[data-wx-open-seasonal]');
      if (openSeasonalBtn) {
        if (_runtime.sheet.open && _runtime.sheet.subView !== 'seasonal') {
          _runtime.seasonalReturnTo = _runtime.sheet.subView;
        }
        if (_runtime.activeCharId) {
          await startSeasonalEventInteraction(_runtime.activeCharId, uid('ss'));
        }
        _runtime.sheet.open = true;
        _runtime.sheet.canStepBack = Boolean(_runtime.seasonalReturnTo);
        _runtime.sheet.subView = 'seasonal';
        await renderSheet();
        await renderAtmosphereAndInviteUi();
        return;
      }
      var seasonalChoiceBtn = target.closest('[data-wx-seasonal-choice]');
      if (seasonalChoiceBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var sDraftId = seasonalChoiceBtn.getAttribute('data-wx-draft-id');
          var sOptId = seasonalChoiceBtn.getAttribute('data-wx-seasonal-choice');
          var sOptRes = await selectSeasonalEventOption(sDraftId, sOptId, uid('sopt'));
          if (!sOptRes.ok) {
            global.toast && global.toast(sOptRes.msg || '未能完成选择');
            await renderSheet();
            return;
          }
          _runtime.aiLoading = true;
          await renderSheet();
          var sOpt = sOptRes.option || {};
          var sDraft = sOptRes.draft;
          var sReact = await requestCharReaction({
            locationName: sDraft.locationName + ' · ' + sDraft.title,
            actionDesc: '在「' + sDraft.title + '」中选择了「' + (sOpt.label || sDraft.choiceLabel) + '」，' + (sOpt.outcome || sDraft.outcomeText),
            fallbackText: sOpt.fallbackReply || ''
          });
          _runtime.aiLoading = false;
          if (sReact && sReact.ok && !sReact.aborted) {
            var sAiOk = sReact.source === 'ai';
            await updateSeasonalEventReply(sDraft.draftId, sReact.charId, sAiOk ? sReact.text : '', sReact.source, !sAiOk);
            _runtime.sheet.charQuote = sReact.text;
            _runtime.sheet.charQuoteSource = sReact.source;
          }
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var retrySeasonalAiBtn = target.closest('[data-wx-seasonal-retry-ai]');
      if (retrySeasonalAiBtn) {
        var rDraftId = retrySeasonalAiBtn.getAttribute('data-wx-seasonal-retry-ai');
        var lsSr = await loadLifeState();
        var cidSr = _runtime.activeCharId ? String(_runtime.activeCharId) : '';
        var srDraft = cidSr && lsSr.activeSeasonalDrafts[cidSr];
        if (srDraft && srDraft.draftId === rDraftId) {
          _runtime.aiLoading = true;
          await renderSheet();
          var srReact = await requestCharReaction({
            locationName: srDraft.locationName + ' · ' + srDraft.title,
            actionDesc: '在「' + srDraft.title + '」中选择了「' + srDraft.choiceLabel + '」，' + srDraft.outcomeText
          });
          _runtime.aiLoading = false;
          if (srReact && srReact.ok && !srReact.aborted) {
            var srAiOk = srReact.source === 'ai';
            await updateSeasonalEventReply(srDraft.draftId, srReact.charId, srAiOk ? srReact.text : '', srReact.source, !srAiOk);
            _runtime.sheet.charQuote = srReact.text;
            _runtime.sheet.charQuoteSource = srReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var saveSeasonalMemBtn = target.closest('[data-wx-save-seasonal-mem]');
      if (saveSeasonalMemBtn) {
        var ssmRes = await saveSeasonalMemento(saveSeasonalMemBtn.getAttribute('data-wx-save-seasonal-mem'));
        global.toast && global.toast(ssmRes.ok ? (ssmRes.duplicate ? '该季节纪念卡已收藏过' : '已收藏至万象镜「季节纪念」') : (ssmRes.msg || '保存失败'));
        await renderSheet();
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        return;
      }

      // 3. 悬浮控制（Char 切换 / 定位广场 / 缩放）
      if (target.closest('#wx-float-char-btn') || target.closest('[data-wx-action="open-char-picker"]')) {
        _runtime.sheet.open = true;
        _runtime.sheet.canStepBack = Boolean(_runtime.sheet.locationId);
        _runtime.sheet.subView = 'charPicker';
        await renderSheet();
        await renderAtmosphereAndInviteUi();
        return;
      }
      if (target.closest('#wx-ctrl-recenter')) {
        recenterToPlaza();
        return;
      }
      if (target.closest('#wx-ctrl-zoom-in')) {
        zoomAtCenter(_runtime.mapTransform.scale + 0.25);
        return;
      }
      if (target.closest('#wx-ctrl-zoom-out')) {
        zoomAtCenter(_runtime.mapTransform.scale - 0.25);
        return;
      }
      if (target.closest('#wx-map-reload-btn')) {
        var img = page.querySelector('#wx-map-img');
        var fb = page.querySelector('#wx-map-fallback');
        if (fb) fb.classList.remove('is-visible');
        if (img) {
          var pInfo = getActivePeriodInfo(_runtime.timePreview);
          img.setAttribute('src', pInfo.period.src + '?r=' + Date.now());
        }
        return;
      }

      // 4. 底部 4 入口导航
      var navTab = target.closest('[data-wx-tab]');
      if (navTab) {
        if (_runtime.sheet.open) await closeSheetOnly();
        switchTab(navTab.getAttribute('data-wx-tab'));
        return;
      }

      // 5. 点击弹窗遮罩外部关闭弹窗（防穿透）
      if (target.id === 'wx-sheet-backdrop') {
        await closeSheetOnly();
        return;
      }

      // 6. 弹窗内通用动作
      var actBtn = target.closest('[data-wx-action]');
      if (actBtn) {
        var act = actBtn.getAttribute('data-wx-action');
        if (act === 'close-sheet') {
          await closeSheetOnly();
        } else if (act === 'back-letters') {
          _runtime.sheet.subView = 'letters';
          _runtime.sheet.canStepBack = false;
          _runtime.letterReturnTo = null;
          await renderSheet();
        } else if (act === 'back-seasonal-origin') {
          if (_runtime.seasonalReturnTo && _runtime.sheet.locationId) {
            _runtime.sheet.subView = _runtime.seasonalReturnTo;
            _runtime.sheet.canStepBack = _runtime.seasonalReturnTo !== 'intro';
            _runtime.seasonalReturnTo = null;
            await renderSheet();
          } else {
            _runtime.seasonalReturnTo = null;
            await closeSheetOnly();
          }
        } else if (act === 'seasonal-abandon') {
          await dismissSeasonalDraft(_runtime.activeCharId);
          if (_runtime.seasonalReturnTo && _runtime.sheet.locationId) {
            _runtime.sheet.subView = _runtime.seasonalReturnTo;
            _runtime.sheet.canStepBack = _runtime.seasonalReturnTo !== 'intro';
            _runtime.seasonalReturnTo = null;
            await renderSheet();
          } else {
            _runtime.seasonalReturnTo = null;
            await closeSheetOnly();
          }
        } else if (act === 'back-intro') {
          _runtime.sheet.subView = 'intro';
          _runtime.sheet.canStepBack = false;
          await renderSheet();
        } else if (act === 'toggle-secondary') {
          _runtime.sheet.subView = 'secondary';
          _runtime.sheet.canStepBack = true;
          await renderSheet();
        } else if (act === 'toggle-typewriter') {
          var nextTw = !_runtime.uiSettings.typewriterEnabled;
          await saveUiSettings({ typewriterEnabled: nextTw });
          await renderSheet();
        } else if (act === 'open-char-chat') {
          _runtime.sheet.canStepBack = true;
          _runtime.sheet.subView = 'charChat';
          await renderSheet();
        } else if (act === 'open-shop-bag') {
          _runtime.sheet.canStepBack = true;
          _runtime.sheet.subView = 'shop';
          _runtime.sheet.shopCat = 'bag';
          await renderSheet();
        } else if (act === 'retry-char-ai') {
          var curLoc = getLocationById(_runtime.sheet.locationId);
          if (curLoc) {
            await triggerCharReactionAndRender(curLoc, _runtime.sheet.lastAiActionDesc || ('在「' + curLoc.name + '」四处看看'), false);
          }
        } else if (act === 'char-panel-send') {
          var cLoc = getLocationById(_runtime.sheet.locationId);
          var pInput = page.querySelector('#wx-char-panel-input');
          var pTxt = pInput ? pInput.value.trim() : '';
          if (cLoc && pTxt) {
            pushCharBubbleEntry(_runtime.activeCharId, cLoc.id, 'user', pTxt, '你');
            if (pInput) pInput.value = '';
            await triggerCharReactionAndRender(cLoc, '用户对你说：「' + pTxt + '」', true);
          } else if (cLoc) {
            await triggerCharReactionAndRender(cLoc, '轻声叫了你的名字', true);
          }
        } else if (act === 'enter-location') {
          var lid = actBtn.getAttribute('data-wx-loc');
          _runtime.sheet.canStepBack = true;
          if (lid === 'mirror_plaza') _runtime.sheet.subView = 'plaza';
          else if (lid === 'shopping_street') { _runtime.sheet.subView = 'shop'; _runtime.sheet.shopCat = 'all'; }
          else if (lid === 'afternoon_cafe') _runtime.sheet.subView = 'cafe';
          else if (lid === 'gacha_house') _runtime.sheet.subView = 'gacha';
          else if (lid === 'mirror_gallery') _runtime.sheet.subView = 'gallery';
          else if (lid === 'four_seasons_garden') { _runtime.sheet.subView = 'garden'; _runtime.sheet.gardenTab = 'home'; }
          else if (lid === 'lakeside_walk') { _runtime.sheet.subView = 'lakeside'; _runtime.sheet.lakesideView = 'home'; _runtime.sheet.finishedWalkId = null; }
          else if (lid === 'starlight_park') { _runtime.sheet.subView = 'park'; _runtime.sheet.parkView = 'hub'; _runtime.sheet.finishedFerrisId = null; }
          else if (lid === 'starwish_station') { _runtime.sheet.subView = 'station'; _runtime.sheet.stationView = 'hub'; _runtime.sheet.finishedJourneyId = null; }
          await renderSheet();
        } else if (act === 'back-park-hub') {
          clearCarouselAnimTimer();
          _runtime.sheet.subView = 'park';
          _runtime.sheet.parkView = 'hub';
          _runtime.sheet.canStepBack = true;
          _runtime.sheet.finishedFerrisId = null;
          await renderSheet();
        } else if (act === 'back-station-hub') {
          _runtime.sheet.subView = 'station';
          _runtime.sheet.stationView = 'hub';
          _runtime.sheet.canStepBack = true;
          _runtime.sheet.finishedJourneyId = null;
          await renderSheet();
        } else if (act === 'station-resume-journey') {
          _runtime.sheet.subView = 'station';
          _runtime.sheet.stationView = 'journey';
          _runtime.sheet.canStepBack = true;
          _runtime.sheet.finishedJourneyId = null;
          await renderSheet();
        } else if (act === 'station-abandon-ask') {
          var charAbn = await getActiveCharacterObj();
          var jsAbn = await loadJourneysState();
          var jAbn = charAbn && jsAbn.activeJourneysByChar[String(charAbn.id)];
          if (!jAbn) return;
          openConfirmModal({
            mode: 'confirm',
            kind: 'train_abandon',
            title: '提前结束当前旅程',
            sub: esc(jAbn.destinationName) + ' · ' + esc(jAbn.charName),
            icon: 'fa-solid fa-triangle-exclamation',
            confirmLabel: '确认结束',
            pendingLabel: '退出中…',
            payload: { charId: String(charAbn.id), journeyId: jAbn.journeyId },
            detailHtml: '确定要中途提前结束这趟开往「<strong>' + esc(jAbn.destinationName) + '</strong>」的旅程吗？<br><span style="font-size:12px;color:var(--wx-sub);">提示：主动提前结束旅程不自动退还已购票的 30 金币。</span>'
          });
        } else if (act === 'station-skip-postcard') {
          _runtime.sheet.finishedJourneyId = null;
          _runtime.sheet.postcardDraftMsg = '';
          _runtime.sheet.stationView = 'hub';
          await renderSheet();
        } else if (act === 'claw-left') {
          _runtime.sheet.clawPos = Math.max(10, (_runtime.sheet.clawPos || 50) - 12);
          await renderSheet();
        } else if (act === 'claw-right') {
          _runtime.sheet.clawPos = Math.min(90, (_runtime.sheet.clawPos || 50) + 12);
          await renderSheet();
        } else if (act === 'claw-drop') {
          var ecoClaw = await getEconomySnapshot();
          openConfirmModal({
            mode: 'confirm',
            kind: 'claw_play',
            title: '抓娃娃确认',
            sub: '星光游乐场 · 抓娃娃机',
            icon: 'fa-solid fa-gift',
            confirmLabel: '确认落爪 (-20 币)',
            pendingLabel: '落爪中…',
            requestId: uid('clwreq'),
            payload: { clawPos: _runtime.sheet.clawPos },
            detailHtml: '即将花费 <strong>20 金币</strong> 落爪一次（抓中 60% · 失手 40%，无隐藏保底）。<br><span style="font-size:12px;color:var(--wx-sub);">当前金币余额：' + (ecoClaw.coins || 0) + ' 币</span>'
          });
        } else if (act === 'ferris-start') {
          var charFer = await getActiveCharacterObj();
          if (!charFer) {
            global.toast && global.toast('请先选择一位同行 Char 再乘坐星愿摩天轮');
            return;
          }
          var fsCur = await loadFerrisState();
          if (fsCur.activeRidesByChar && fsCur.activeRidesByChar[String(charFer.id)]) {
            _runtime.sheet.subView = 'park';
            _runtime.sheet.parkView = 'ferris';
            _runtime.sheet.finishedFerrisId = null;
            await renderSheet();
            return;
          }
          var ecoFer = await getEconomySnapshot();
          openConfirmModal({
            mode: 'confirm',
            kind: 'ferris_start',
            title: '乘坐星愿摩天轮',
            sub: '同行：' + esc(charFer.nick || charFer.name),
            icon: 'fa-solid fa-circle-notch',
            confirmLabel: '确认乘坐 (-30 币)',
            pendingLabel: '登舱中…',
            requestId: uid('freq'),
            payload: { charId: String(charFer.id) },
            detailHtml: '即将花费 <strong>30 金币</strong> 与 <strong>' + esc(charFer.nick || charFer.name) + '</strong> 共乘星愿摩天轮（含全部三幕高空互动）。<br><span style="font-size:12px;color:var(--wx-sub);">当前金币余额：' + (ecoFer.coins || 0) + ' 币</span>'
          });
        } else if (act === 'ferris-abandon') {
          await abandonFerrisRide(_runtime.activeCharId);
          _runtime.sheet.finishedFerrisId = null;
          _runtime.sheet.parkView = 'ferris';
          global.toast && global.toast('已结束当前摩天轮草稿');
          await renderSheet();
        } else if (act === 'ferris-skip-memento') {
          _runtime.sheet.finishedFerrisId = null;
          _runtime.sheet.parkView = 'hub';
          await renderSheet();
        } else if (act === 'carousel-start') {
          var seatPick = CAROUSEL_CONFIG.seats.find(function(s) { return s.id === _runtime.sheet.carouselSeatId; }) || CAROUSEL_CONFIG.seats[0];
          var moodPick = CAROUSEL_CONFIG.moods.find(function(m) { return m.id === _runtime.sheet.carouselMoodId; }) || CAROUSEL_CONFIG.moods[0];
          var ecoCar = await getEconomySnapshot();
          openConfirmModal({
            mode: 'confirm',
            kind: 'carousel_ride',
            title: '乘坐旋转木马',
            sub: seatPick.name + ' · ' + moodPick.name,
            icon: seatPick.icon || 'fa-solid fa-horse',
            confirmLabel: '确认乘坐 (-10 币)',
            pendingLabel: '启动中…',
            requestId: uid('creq'),
            payload: { seatId: seatPick.id, moodId: moodPick.id },
            detailHtml: '确定花费 <strong>10 金币</strong> 乘坐「<strong>' + esc(seatPick.name) + '</strong>」（' + esc(moodPick.name) + '）？<br><span style="font-size:12px;color:var(--wx-sub);">当前金币余额：' + (ecoCar.coins || 0) + ' 币</span>'
          });
        } else if (act === 'carousel-skip-anim') {
          clearCarouselAnimTimer();
          if (_runtime.sheet.lastCarouselRideId) {
            await markCarouselAnimationSkipped(_runtime.sheet.lastCarouselRideId);
          }
          await renderSheet();
        } else if (act === 'carousel-skip-memento') {
          _runtime.sheet.lastCarouselRideId = null;
          _runtime.sheet.parkView = 'hub';
          await renderSheet();
        } else if (act === 'garden-collect') {
          if (_runtime.pendingAction) return;
          _runtime.pendingAction = true;
          try {
            var colRes = await collectDailyFlower(uid('col'));
            if (colRes.ok) {
              _runtime.sheet.lastCollectedFlower = colRes.flower;
              global.toast && global.toast('采到「' + colRes.flower.name + '」（' + colRes.flower.meaning + '），今日剩余 ' + colRes.remaining + ' 次');
            } else {
              global.toast && global.toast(colRes.msg || '今日采集次数已用完');
            }
            await renderSheet();
          } finally {
            _runtime.pendingAction = false;
          }
        } else if (act === 'garden-craft-confirm') {
          var nameEl = page.querySelector('#wx-bouquet-name-input');
          if (nameEl) _runtime.sheet.craftDraft.name = nameEl.value || '';
          var draftNow = _runtime.sheet.craftDraft || { counts: {}, wrappingId: 'sakura_pink', ribbonId: 'champagne_gold', name: '' };
          var cMeta = buildBouquetMetadata(draftNow.counts, draftNow.wrappingId, draftNow.ribbonId, draftNow.name);
          if (cMeta.total !== 3 || cMeta.items.length < 1 || cMeta.items.length > 3) {
            global.toast && global.toast('请先选择 1–3 种花材，合计恰好 3 份');
            return;
          }
          openConfirmModal({
            mode: 'confirm',
            kind: 'craft_bouquet',
            title: '确认制作花束',
            sub: '四季花园 · 免费包装与丝带',
            icon: 'fa-solid fa-fan',
            confirmLabel: '确认制作',
            pendingLabel: '制作中…',
            requestId: uid('crf'),
            payload: {
              counts: Object.assign({}, draftNow.counts),
              wrappingId: cMeta.wrapping.id,
              ribbonId: cMeta.ribbon.id,
              name: draftNow.name || ''
            },
            detailHtml:
              '花束名称：<strong>' + esc(cMeta.name) + '</strong><br>' +
              '花材配方：' + esc(cMeta.items.map(function(x) { return x.name + '×' + x.count; }).join('、')) + '<br>' +
              '花语与包装：' + esc(cMeta.meanings) + ' · ' + esc(cMeta.wrapping.name) + ' / ' + esc(cMeta.ribbon.name)
          });
        } else if (act === 'lake-start') {
          if (_runtime.pendingAction) return;
          _runtime.pendingAction = true;
          try {
            var wStart = await startLakesideWalk(_runtime.activeCharId, uid('ws'));
            if (!wStart.ok) {
              global.toast && global.toast(wStart.msg || '请先选择同行 Char');
            } else {
              _runtime.sheet.finishedWalkId = null;
              _runtime.sheet.lakesideView = 'walk';
            }
            await renderSheet();
          } finally {
            _runtime.pendingAction = false;
          }
        } else if (act === 'lake-abandon') {
          await abandonLakesideWalk(_runtime.activeCharId);
          _runtime.sheet.finishedWalkId = null;
          _runtime.sheet.lakesideView = 'home';
          global.toast && global.toast('已结束当前散步草稿');
          await renderSheet();
        } else if (act === 'lake-skip-memento') {
          _runtime.sheet.finishedWalkId = null;
          _runtime.sheet.lakesideView = 'home';
          await renderSheet();
        } else if (act === 'plaza-wish') {
          if (_runtime.pendingAction) return;
          _runtime.pendingAction = true;
          try {
            var wr = await claimPlazaWish();
            global.toast && global.toast(wr.ok ? ('许愿成功，获得 +' + wr.coins + ' 金币') : wr.msg);
            await refreshTopbarAndCompanion();
            await renderSheet();
          } finally {
            _runtime.pendingAction = false;
          }
        } else if (act === 'plaza-greet') {
          var plazaLoc = getLocationById('mirror_plaza');
          if (plazaLoc) {
            await triggerCharReactionAndRender(plazaLoc, '在喷泉前向身边的你打招呼', _runtime.sheet.subView === 'charChat');
          }
        } else if (act === 'shop-signin') {
          if (_runtime.pendingAction) return;
          _runtime.pendingAction = true;
          try {
            var sr = await claimDailySignin();
            global.toast && global.toast(sr.ok ? ('签到成功！获得 +' + sr.coins + ' 金币') : sr.msg);
            await refreshTopbarAndCompanion();
            await renderSheet();
          } finally {
            _runtime.pendingAction = false;
          }
        } else if (act === 'cafe-send-chat') {
          var cafeLoc = getLocationById('afternoon_cafe');
          var inputEl = page.querySelector('#wx-cafe-chat-input');
          var txt = inputEl ? inputEl.value.trim() : '';
          if (cafeLoc) {
            if (txt) pushCharBubbleEntry(_runtime.activeCharId, 'afternoon_cafe', 'user', txt, '你');
            await appendCharInteraction(_runtime.activeCharId, {
              locationId: 'afternoon_cafe',
              type: 'cafe_chat',
              title: txt ? ('聊起「' + txt.slice(0, 18) + '」') : '在咖啡馆闲聊'
            });
            await triggerCharReactionAndRender(cafeLoc, txt ? ('用户对你说：「' + txt + '」') : '在咖啡桌前微笑着看着你', true);
          }
        } else if (act === 'cafe-save-photo') {
          var photoNoteEl = page.querySelector('#wx-cafe-chat-input') || page.querySelector('#wx-char-panel-input');
          var mem = await saveCafeMemento(photoNoteEl ? photoNoteEl.value : '');
          global.toast && global.toast('已拍下留影，存入万象镜「留影」栏');
          await renderSheet();
          if (_runtime.activeTab === 'mementos') await renderSubpageContent();
          openConfirmModal({
            mode: 'result',
            title: '留影已珍藏',
            sub: esc(mem.locationName) + ' · ' + esc(mem.periodLabel),
            icon: 'fa-solid fa-camera',
            detailHtml: '<strong>' + esc(mem.charName) + '</strong><br>' + esc(mem.note) + '<br><span style="font-size:11.5px;color:var(--wx-sub);">已独立保存于万象镜，不改动角色长期记忆。</span>'
          });
        }
        return;
      }

      // 6B. 四季花园与湖畔步道交互控件
      var gTabBtn = target.closest('[data-wx-garden-tab]');
      if (gTabBtn) {
        _runtime.sheet.subView = 'garden';
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.gardenTab = gTabBtn.getAttribute('data-wx-garden-tab') || 'home';
        await renderSheet();
        return;
      }
      var incBtn = target.closest('[data-wx-craft-inc]');
      if (incBtn) {
        var fidInc = incBtn.getAttribute('data-wx-craft-inc');
        var gsInc = await loadGardenState();
        var dInc = _runtime.sheet.craftDraft || { counts: {}, wrappingId: 'sakura_pink', ribbonId: 'champagne_gold', name: '' };
        var sumInc = Object.keys(dInc.counts || {}).reduce(function(s, k) { return s + (Number(dInc.counts[k]) || 0); }, 0);
        var typesInc = Object.keys(dInc.counts || {}).filter(function(k) { return (Number(dInc.counts[k]) || 0) > 0; }).length;
        var curInc = Number(dInc.counts[fidInc]) || 0;
        if (sumInc < 3 && curInc < (gsInc.flowers[fidInc] || 0) && (curInc > 0 || typesInc < 3)) {
          dInc.counts[fidInc] = curInc + 1;
          await renderSheet();
        }
        return;
      }
      var decBtn = target.closest('[data-wx-craft-dec]');
      if (decBtn) {
        var fidDec = decBtn.getAttribute('data-wx-craft-dec');
        var dDec = _runtime.sheet.craftDraft || { counts: {}, wrappingId: 'sakura_pink', ribbonId: 'champagne_gold', name: '' };
        var curDec = Number(dDec.counts[fidDec]) || 0;
        if (curDec > 0) {
          dDec.counts[fidDec] = curDec - 1;
          if (dDec.counts[fidDec] <= 0) delete dDec.counts[fidDec];
          await renderSheet();
        }
        return;
      }
      var wrapBtn = target.closest('[data-wx-wrap-id]');
      if (wrapBtn) {
        _runtime.sheet.craftDraft.wrappingId = wrapBtn.getAttribute('data-wx-wrap-id');
        await renderSheet();
        return;
      }
      var ribBtn = target.closest('[data-wx-ribbon-id]');
      if (ribBtn) {
        _runtime.sheet.craftDraft.ribbonId = ribBtn.getAttribute('data-wx-ribbon-id');
        await renderSheet();
        return;
      }
      var giftBqBtn = target.closest('[data-wx-gift-bouquet]');
      if (giftBqBtn) {
        var bqId = giftBqBtn.getAttribute('data-wx-gift-bouquet');
        var charBq = await getActiveCharacterObj();
        if (!charBq) {
          global.toast && global.toast('请先选择一位同行 Char 再送出花束');
          return;
        }
        var gsBq = await loadGardenState();
        var bqTarget = gsBq.bouquets.find(function(b) { return b.bouquetId === bqId; });
        if (!bqTarget || (bqTarget.status !== 'owned' && !(bqTarget.status === 'gifting' && !bqTarget.giftEventId))) {
          global.toast && global.toast('该花束不可送出或已赠予');
          return;
        }
        openConfirmModal({
          mode: 'confirm',
          kind: 'gift_bouquet',
          title: '赠花确认',
          sub: '送给同行伙伴 ' + esc(charBq.nick || charBq.name),
          icon: 'fa-solid fa-fan',
          confirmLabel: '确认送出',
          pendingLabel: '赠送中…',
          requestId: uid('gbq'),
          payload: { bouquetId: bqTarget.bouquetId, expectedCharId: String(charBq.id) },
          detailHtml: '确定将花束「<strong>' + esc(bqTarget.name) + '</strong>」（花语：' + esc(bqTarget.meanings || '') + '）送给 <strong>' + esc(charBq.nick || charBq.name) + '</strong>？'
        });
        return;
      }
      var saveFlMemBtn = target.closest('[data-wx-save-flower-mem]');
      if (saveFlMemBtn) {
        var smRes = await saveFlowerMemento(saveFlMemBtn.getAttribute('data-wx-save-flower-mem'));
        global.toast && global.toast(smRes.ok ? (smRes.duplicate ? '该花语纪念卡已收藏过' : '已保存花语纪念卡') : (smRes.msg || '保存失败'));
        await renderSheet();
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        return;
      }
      var retryGiftAiBtn = target.closest('[data-wx-retry-gift-ai]');
      if (retryGiftAiBtn) {
        var rBqId = retryGiftAiBtn.getAttribute('data-wx-retry-gift-ai');
        var gsRetry = await loadGardenState();
        var bqRetry = gsRetry.bouquets.find(function(b) { return b.bouquetId === rBqId; });
        if (bqRetry && bqRetry.status === 'gifted') {
          var ingStr = (bqRetry.ingredients || []).map(function(i) { return i.name + '×' + i.count; }).join('、');
          var rReact = await requestCharReaction({
            locationName: '四季花园',
            actionDesc: '收到了你亲手送出的花束「' + bqRetry.name + '」（花材：' + ingStr + '，花语：' + (bqRetry.meanings || '') + '）'
          });
          if (rReact && rReact.ok && !rReact.aborted) {
            var okAi = rReact.source === 'ai';
            await updateBouquetReply(bqRetry.bouquetId, rReact.charId, rReact.text, !okAi);
            _runtime.sheet.charQuote = rReact.text;
            _runtime.sheet.charQuoteMeta = okAi ? 'AI 赠花回应' : '暂未接通 AI';
            _runtime.sheet.charQuoteSource = rReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var lakeViewBtn = target.closest('[data-wx-lake-view]');
      if (lakeViewBtn) {
        _runtime.sheet.subView = 'lakeside';
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.lakesideView = lakeViewBtn.getAttribute('data-wx-lake-view') || 'home';
        await renderSheet();
        return;
      }
      var lakeChoiceBtn = target.closest('[data-wx-lake-choice]');
      if (lakeChoiceBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var wId = lakeChoiceBtn.getAttribute('data-wx-walk-id');
          var cId = lakeChoiceBtn.getAttribute('data-wx-lake-choice');
          var chRes = await chooseLakesideOption(wId, cId, uid('wopt'));
          if (!chRes.ok) {
            global.toast && global.toast(chRes.msg || '操作未完成');
            await renderSheet();
            return;
          }
          _runtime.aiLoading = true;
          await renderSheet();

          var optObj = chRes.option || {};
          var evObj = chRes.event || {};
          var wObj = chRes.walk;
          var lkReact = await requestCharReaction({
            locationName: '湖畔步道',
            actionDesc: '在「' + (evObj.title || wObj.eventTitle) + '」中，你选择了「' + (optObj.label || wObj.choiceLabel) + '」，' + (optObj.outcome || wObj.outcomeText),
            fallbackText: optObj.fallbackReply || ''
          });
          _runtime.aiLoading = false;
          if (lkReact && lkReact.ok && !lkReact.aborted) {
            var isAiOk = lkReact.source === 'ai';
            await updateWalkReply(wObj.walkId, lkReact.charId, isAiOk ? lkReact.text : '', lkReact.source, !isAiOk);
            _runtime.sheet.charQuote = lkReact.text;
            _runtime.sheet.charQuoteMeta = isAiOk ? 'AI 湖畔回应' : '自然回应（可重试 AI）';
            _runtime.sheet.charQuoteSource = lkReact.source;
            pushCharBubbleEntry(lkReact.charId, 'lakeside_walk', 'char', lkReact.text, _runtime.sheet.charQuoteMeta);
          }
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var retryWalkAiBtn = target.closest('[data-wx-retry-walk-ai]');
      if (retryWalkAiBtn) {
        var rwId = retryWalkAiBtn.getAttribute('data-wx-retry-walk-ai');
        var lsRw = await loadLakesideState();
        var rwObj = _runtime.activeCharId && lsRw.activeWalksByChar[String(_runtime.activeCharId)];
        if (rwObj && rwObj.walkId === rwId) {
          _runtime.aiLoading = true;
          await renderSheet();
          var rwReact = await requestCharReaction({
            locationName: '湖畔步道',
            actionDesc: '在「' + rwObj.eventTitle + '」中，你选择了「' + rwObj.choiceLabel + '」，' + rwObj.outcomeText
          });
          _runtime.aiLoading = false;
          if (rwReact && rwReact.ok && !rwReact.aborted) {
            var rwAiOk = rwReact.source === 'ai';
            await updateWalkReply(rwObj.walkId, rwReact.charId, rwAiOk ? rwReact.text : '', rwReact.source, !rwAiOk);
            _runtime.sheet.charQuote = rwReact.text;
            _runtime.sheet.charQuoteSource = rwReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var lakeFinishBtn = target.closest('[data-wx-lake-finish]');
      if (lakeFinishBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var finWId = lakeFinishBtn.getAttribute('data-wx-lake-finish');
          var finRes = await finishLakesideWalk(finWId, uid('wfin'));
          if (finRes.ok) {
            _runtime.sheet.finishedWalkId = finRes.completedWalk.walkId;
          } else {
            global.toast && global.toast(finRes.msg || '散步结算失败');
          }
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var saveLakeMemBtn = target.closest('[data-wx-save-lake-mem]');
      if (saveLakeMemBtn) {
        var lmRes = await saveLakesideMemento(saveLakeMemBtn.getAttribute('data-wx-save-lake-mem'));
        global.toast && global.toast(lmRes.ok ? (lmRes.duplicate ? '该次湖畔纪念已收藏过' : '已收藏至万象镜「湖畔纪念」') : (lmRes.msg || '保存失败'));
        await renderSheet();
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        return;
      }
      var memFilterBtn = target.closest('[data-wx-mem-filter]');
      if (memFilterBtn) {
        _runtime.mementoFilter = memFilterBtn.getAttribute('data-wx-mem-filter') || 'all';
        await renderSubpageContent();
        return;
      }

      // 7. 地点卡片内的功能按钮
      var featBtn = target.closest('[data-wx-feature]');
      if (featBtn) {
        await handleFeatureAction(featBtn.getAttribute('data-wx-loc'), featBtn.getAttribute('data-wx-feature'));
        return;
      }

      // 8. 选择同行 Char（立刻作废旧 Char 在途 AI 请求，绝不串话）
      var pickCharBtn = target.closest('[data-wx-pick-char]');
      if (pickCharBtn) {
        var nextCid = pickCharBtn.getAttribute('data-wx-pick-char') || null;
        _aiSeq++;
        clearCarouselAnimTimer();
        _runtime.aiLoading = false;
        _runtime.activeCharId = nextCid;
        _runtime.suppressedNoteForSession = {};
        _runtime.sheet.charQuote = '';
        _runtime.sheet.charQuoteMeta = '';
        _runtime.sheet.charQuoteSource = '';
        _runtime.sheet.finishedWalkId = null;
        _runtime.sheet.finishedFerrisId = null;
        _runtime.sheet.lastCarouselRideId = null;
        _runtime.sheet.finishedJourneyId = null;
        _runtime.sheet.postcardDraftMsg = '';
        clearTypewriter();
        await saveMirrorState({ activeCharId: nextCid });
        if (nextCid) {
          await checkAndGenerateActiveInvitation({ cycleKey: _runtime.sessionId + '_char_' + String(nextCid) });
        }
        await refreshTopbarAndCompanion();
        if (_runtime.sheet.locationId) {
          _runtime.sheet.subView = 'intro';
          _runtime.sheet.canStepBack = false;
          await renderSheet();
        } else {
          await closeSheetOnly();
        }
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        return;
      }

      // 9. 广场快捷跳转其它地点
      var jumpBtn = target.closest('[data-wx-jump-loc]');
      if (jumpBtn) {
        await openLocationSheet(jumpBtn.getAttribute('data-wx-jump-loc'), 'intro');
        return;
      }

      // 10. 商店街切分类 / 购买确认 / 赠礼确认
      var shopCatBtn = target.closest('[data-wx-shop-cat]');
      if (shopCatBtn) {
        _runtime.sheet.shopCat = shopCatBtn.getAttribute('data-wx-shop-cat');
        await renderSheet();
        return;
      }
      var buyBtn = target.closest('[data-wx-buy-good]');
      if (buyBtn) {
        var gid = buyBtn.getAttribute('data-wx-buy-good');
        var goodObj = SHOP_GOODS.find(function(g) { return g.id === gid; });
        if (!goodObj) return;
        var ecoBuy = await getEconomySnapshot();
        openConfirmModal({
          mode: 'confirm',
          kind: 'buy_good',
          title: '购买确认',
          sub: '心动商店街 · 共享经济扣费',
          icon: goodObj.icon || 'fa-solid fa-bag-shopping',
          confirmLabel: '确认购买 (' + goodObj.price + '币)',
          pendingLabel: '购买中…',
          payload: { goodId: gid },
          detailHtml: '确定花费 <strong>' + goodObj.price + ' 金币</strong> 购买「<strong>' + esc(goodObj.name) + '</strong>」？<br><span style="font-size:12px;color:var(--wx-sub);">当前金币余额：' + (ecoBuy.coins || 0) + ' 币</span>'
        });
        return;
      }
      var giftBtn = target.closest('[data-wx-gift-item]');
      if (giftBtn) {
        var giftItemId = giftBtn.getAttribute('data-wx-gift-item');
        var charGift = await getActiveCharacterObj();
        if (!charGift) {
          global.toast && global.toast('请先选择一位同行 Char 再送出礼物');
          return;
        }
        var ecoGift = await getEconomySnapshot();
        var invIt = (ecoGift.inventory || []).find(function(it) { return it.itemId === giftItemId; });
        openConfirmModal({
          mode: 'confirm',
          kind: 'gift_item',
          title: '赠礼确认',
          sub: '送给同行伙伴 ' + esc(charGift.nick || charGift.name),
          icon: 'fa-solid fa-gift',
          confirmLabel: '确认送出',
          pendingLabel: '赠送中…',
          requestId: uid('gbq'),
          payload: { itemId: giftItemId, expectedCharId: String(charGift.id) },
          detailHtml: '将背包中的「<strong>' + esc(invIt ? invIt.name : giftItemId) + '</strong>」赠予 <strong>' + esc(charGift.nick || charGift.name) + '</strong>？'
        });
        return;
      }

      // 11. 咖啡馆点单确认
      var cafeBtn = target.closest('[data-wx-cafe-order]');
      if (cafeBtn) {
        var parts = String(cafeBtn.getAttribute('data-wx-cafe-order')).split(':');
        var mType = parts[0];
        var mId = parts[1];
        var menuItem = (CAFE_MENU[mType] || []).find(function(m) { return m.id === mId; });
        if (!menuItem) return;
        var ecoCafe = await getEconomySnapshot();
        openConfirmModal({
          mode: 'confirm',
          kind: 'cafe_order',
          title: '点单确认',
          sub: '午后咖啡馆',
          icon: mType === 'dessert' ? 'fa-solid fa-cake-candles' : 'fa-solid fa-mug-hot',
          confirmLabel: '确认点单 (' + menuItem.price + '币)',
          pendingLabel: '点单中…',
          payload: { menuType: mType, itemId: mId },
          detailHtml: '确认花费 <strong>' + menuItem.price + ' 金币</strong> 点一份「<strong>' + esc(menuItem.name) + '</strong>」？<br><span style="font-size:12px;color:var(--wx-sub);">当前金币余额：' + (ecoCafe.coins || 0) + ' 币</span>'
        });
        return;
      }

      // 12. 扭蛋屋切 tab / 抽取确认（绑定固定 requestId 防重）
      var gachaTabBtn = target.closest('[data-wx-gacha-tab]');
      if (gachaTabBtn) {
        _runtime.sheet.gachaTab = gachaTabBtn.getAttribute('data-wx-gacha-tab');
        await renderSheet();
        return;
      }
      var drawBtn = target.closest('[data-wx-gacha-draw]');
      if (drawBtn) {
        var mid = drawBtn.getAttribute('data-wx-gacha-draw');
        var machine = GACHA_MACHINES[mid];
        if (!machine) return;
        var ecoGacha = await getEconomySnapshot();
        var gsInfo = await loadGachaState();
        var pityCur = mid === 'gift' ? gsInfo.giftPity : gsInfo.adventurePity;
        openConfirmModal({
          mode: 'confirm',
          kind: 'gacha_draw',
          title: '扭蛋扣费确认',
          sub: machine.name,
          icon: 'fa-solid fa-egg',
          confirmLabel: '确认抽取 (-' + machine.cost + '币)',
          pendingLabel: '抽取中…',
          requestId: uid('greq'),
          payload: { machineId: mid },
          detailHtml: '即将消耗 <strong>' + machine.cost + ' 金币</strong> 抽取「<strong>' + esc(machine.name) + '</strong>」。<br><span style="font-size:12px;color:var(--wx-sub);">当前金币：' + (ecoGacha.coins || 0) + ' 币 · 保底进度：' + pityCur + ' / ' + machine.pityLimit + '</span>'
        });
        return;
      }

      // 13. 留影馆快捷切换 / 外部复用入口 / 删留影
      var swTab = target.closest('[data-wx-switch-tab]');
      if (swTab) {
        await closeSheetOnly();
        switchTab(swTab.getAttribute('data-wx-switch-tab'));
        return;
      }
      var extBtn = target.closest('[data-wx-external]');
      if (extBtn) {
        var ext = extBtn.getAttribute('data-wx-external');
        if (ext === 'achievement') {
          if (global.AchievementHall && typeof global.AchievementHall.open === 'function') global.AchievementHall.open();
          else if (typeof global.showAchievementPage === 'function') global.showAchievementPage();
        } else if (ext === 'loveDiary') {
          if (typeof global.showLoveDiaryPage === 'function') global.showLoveDiaryPage();
        }
        return;
      }
      var delMemBtn = target.closest('[data-wx-del-mem]');
      if (delMemBtn) {
        await deleteMemento(delMemBtn.getAttribute('data-wx-del-mem'));
        global.toast && global.toast('已删除该条留影（不影响角色记忆）');
        await renderSubpageContent();
        return;
      }

      // 14. 星光游乐场子玩法与分栏控件
      var parkViewBtn = target.closest('[data-wx-park-view]');
      if (parkViewBtn) {
        clearCarouselAnimTimer();
        _runtime.sheet.subView = 'park';
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.parkView = parkViewBtn.getAttribute('data-wx-park-view') || 'hub';
        await renderSheet();
        return;
      }
      var giftPlushBtn = target.closest('[data-wx-gift-plush]');
      if (giftPlushBtn) {
        var plId = giftPlushBtn.getAttribute('data-wx-gift-plush');
        var charPl = await getActiveCharacterObj();
        if (!charPl) {
          global.toast && global.toast('请先选择一位同行 Char 再送出玩偶');
          return;
        }
        var csPl = await loadClawState();
        var plTarget = csPl.plushies.find(function(p) { return p.plushInstanceId === plId; });
        if (!plTarget || (plTarget.status !== 'owned' && !(plTarget.status === 'gifting' && !plTarget.giftEventId))) {
          global.toast && global.toast('该玩偶已送出或不可赠送');
          return;
        }
        openConfirmModal({
          mode: 'confirm',
          kind: 'gift_plush',
          title: '赠送玩偶确认',
          sub: '送给同行伙伴 ' + esc(charPl.nick || charPl.name),
          icon: plTarget.icon || 'fa-solid fa-gift',
          confirmLabel: '确认送出',
          pendingLabel: '赠送中…',
          requestId: uid('gpl'),
          payload: { plushInstanceId: plTarget.plushInstanceId, expectedCharId: String(charPl.id) },
          detailHtml: '确定将【' + esc(plTarget.rarityLabel) + '】玩偶「<strong>' + esc(plTarget.name) + '</strong>」送给 <strong>' + esc(charPl.nick || charPl.name) + '</strong>？'
        });
        return;
      }
      var retryPlushAiBtn = target.closest('[data-wx-retry-plush-ai]');
      if (retryPlushAiBtn) {
        var rPlId = retryPlushAiBtn.getAttribute('data-wx-retry-plush-ai');
        var csRp = await loadClawState();
        var plRetry = csRp.plushies.find(function(p) { return p.plushInstanceId === rPlId; });
        if (plRetry && plRetry.status === 'gifted') {
          var rpReact = await requestCharReaction({
            locationName: '星光游乐场',
            actionDesc: '收到了你在游乐场抓到的玩偶「' + plRetry.name + '」（' + plRetry.rarityLabel + '）'
          });
          if (rpReact && rpReact.ok && !rpReact.aborted) {
            var rpIsAi = rpReact.source === 'ai';
            await updatePlushReply(plRetry.plushInstanceId, rpReact.charId, rpReact.text, !rpIsAi);
            _runtime.sheet.charQuote = rpReact.text;
            _runtime.sheet.charQuoteMeta = rpIsAi ? 'AI 赠玩偶回应' : '暂未接通 AI';
            _runtime.sheet.charQuoteSource = rpReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var saveParkMemBtn = target.closest('[data-wx-save-park-mem]');
      if (saveParkMemBtn) {
        var spParts = String(saveParkMemBtn.getAttribute('data-wx-save-park-mem')).split(':');
        var spRes = await saveAmusementMemento({ kind: spParts[0], sourceId: spParts[1] });
        global.toast && global.toast(spRes.ok ? (spRes.duplicate ? '该条游乐场纪念已收藏过' : '已收藏至万象镜「游乐场纪念」') : (spRes.msg || '保存失败'));
        await renderSheet();
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        return;
      }
      var ferrisChoiceBtn = target.closest('[data-wx-ferris-choice]');
      if (ferrisChoiceBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var frId = ferrisChoiceBtn.getAttribute('data-wx-ride-id');
          var frAct = Number(ferrisChoiceBtn.getAttribute('data-wx-act'));
          var frChId = ferrisChoiceBtn.getAttribute('data-wx-ferris-choice');
          var fOptRes = await chooseFerrisActOption(frId, frAct, frChId, uid('fopt'));
          if (!fOptRes.ok) {
            global.toast && global.toast(fOptRes.msg || '操作未完成');
            await renderSheet();
            return;
          }
          _runtime.aiLoading = true;
          await renderSheet();
          var fOpt = fOptRes.option || {};
          var fActDef = fOptRes.actDef || {};
          var fRide = fOptRes.ride;
          var fReact = await requestCharReaction({
            locationName: '星愿摩天轮 · ' + (fActDef.shortTitle || ('第' + frAct + '幕')),
            actionDesc: '在摩天轮第' + frAct + '幕选择了「' + (fOpt.label || '') + '」，' + (fOpt.outcome || '')
          });
          _runtime.aiLoading = false;
          if (fReact && fReact.ok && !fReact.aborted) {
            var fAiOk = fReact.source === 'ai';
            await updateFerrisActReply(fRide.rideId, frAct, fReact.charId, fAiOk ? fReact.text : '', fReact.source, !fAiOk);
            _runtime.sheet.charQuote = fReact.text;
            _runtime.sheet.charQuoteMeta = fAiOk ? 'AI 摩天轮回应' : '自然回应（可重试 AI）';
            _runtime.sheet.charQuoteSource = fReact.source;
            pushCharBubbleEntry(fReact.charId, 'starlight_park', 'char', fReact.text, _runtime.sheet.charQuoteMeta);
          }
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var retryFerrisAiBtn = target.closest('[data-wx-retry-ferris-ai]');
      if (retryFerrisAiBtn) {
        var rfId = retryFerrisAiBtn.getAttribute('data-wx-retry-ferris-ai');
        var rfAct = Number(retryFerrisAiBtn.getAttribute('data-wx-act'));
        var fsRf = await loadFerrisState();
        var rfObj = _runtime.activeCharId && fsRf.activeRidesByChar[String(_runtime.activeCharId)];
        if (rfObj && rfObj.rideId === rfId && rfObj.choices && rfObj.choices['act' + rfAct]) {
          var chRf = rfObj.choices['act' + rfAct];
          _runtime.aiLoading = true;
          await renderSheet();
          var rfReact = await requestCharReaction({
            locationName: '星愿摩天轮 · ' + (chRf.actTitle || ('第' + rfAct + '幕')),
            actionDesc: '在摩天轮第' + rfAct + '幕选择了「' + chRf.label + '」，' + chRf.outcome
          });
          _runtime.aiLoading = false;
          if (rfReact && rfReact.ok && !rfReact.aborted) {
            var rfAiOk = rfReact.source === 'ai';
            await updateFerrisActReply(rfObj.rideId, rfAct, rfReact.charId, rfAiOk ? rfReact.text : '', rfReact.source, !rfAiOk);
            _runtime.sheet.charQuote = rfReact.text;
            _runtime.sheet.charQuoteSource = rfReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var ferrisNextBtn = target.closest('[data-wx-ferris-next]');
      if (ferrisNextBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var advRes = await advanceFerrisAct(ferrisNextBtn.getAttribute('data-wx-ferris-next'));
          if (!advRes.ok) global.toast && global.toast(advRes.msg || '无法进入下一幕');
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var ferrisFinBtn = target.closest('[data-wx-ferris-finish]');
      if (ferrisFinBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var finFRes = await finishFerrisRide(ferrisFinBtn.getAttribute('data-wx-ferris-finish'), uid('ffin'));
          if (finFRes.ok) _runtime.sheet.finishedFerrisId = finFRes.completedRide.rideId;
          else global.toast && global.toast(finFRes.msg || '结算失败');
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var carSeatBtn = target.closest('[data-wx-carousel-seat]');
      if (carSeatBtn) {
        _runtime.sheet.carouselSeatId = carSeatBtn.getAttribute('data-wx-carousel-seat') || 'moon_white_horse';
        await renderSheet();
        return;
      }
      var carMoodBtn = target.closest('[data-wx-carousel-mood]');
      if (carMoodBtn) {
        _runtime.sheet.carouselMoodId = carMoodBtn.getAttribute('data-wx-carousel-mood') || 'gentle_romantic';
        await renderSheet();
        return;
      }
      var retryCarAiBtn = target.closest('[data-wx-retry-carousel-ai]');
      if (retryCarAiBtn) {
        var rCarId = retryCarAiBtn.getAttribute('data-wx-retry-carousel-ai');
        var csRc = await loadCarouselState();
        var rcObj = csRc.rides.find(function(r) { return r.carouselRideId === rCarId; });
        if (rcObj) {
          _runtime.aiLoading = true;
          await renderSheet();
          var rcReact = await requestCharReaction({
            locationName: '星光游乐场 · 旋转木马',
            actionDesc: '一起乘上了「' + rcObj.seatName + '」（氛围提示：' + rcObj.moodName + '，仅作场景氛围描述，请严格保持角色原本性格与说话方式）'
          });
          _runtime.aiLoading = false;
          if (rcReact && rcReact.ok && !rcReact.aborted) {
            var rcIsAi = rcReact.source === 'ai';
            await updateCarouselReply(rcObj.carouselRideId, rcReact.charId, rcReact.text, rcReact.source, !rcIsAi);
            _runtime.sheet.charQuote = rcReact.text;
            _runtime.sheet.charQuoteSource = rcReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var amuseSubBtn = target.closest('[data-wx-amuse-sub]');
      if (amuseSubBtn) {
        _runtime.amusementSubFilter = amuseSubBtn.getAttribute('data-wx-amuse-sub') || 'all';
        await renderSubpageContent();
        return;
      }

      // 15. 星愿列车站：切子视图 / 购票出发 / 三阶段互动 / 重试 AI / 抵达与明信片 / 二级筛选
      var stViewBtn = target.closest('[data-wx-station-view]');
      if (stViewBtn) {
        _runtime.sheet.subView = 'station';
        _runtime.sheet.canStepBack = true;
        _runtime.sheet.stationView = stViewBtn.getAttribute('data-wx-station-view') || 'hub';
        await renderSheet();
        return;
      }
      var stBuyBtn = target.closest('[data-wx-station-buy]');
      if (stBuyBtn) {
        var destIdPick = stBuyBtn.getAttribute('data-wx-station-buy');
        var destPick = getTrainDestinationById(destIdPick);
        if (!destPick) return;
        var charSt = await getActiveCharacterObj();
        if (!charSt) {
          global.toast && global.toast('请先选择一位同行 Char 再购买星愿车票');
          return;
        }
        var jsCur = await loadJourneysState();
        if (jsCur.activeJourneysByChar && jsCur.activeJourneysByChar[String(charSt.id)]) {
          _runtime.sheet.subView = 'station';
          _runtime.sheet.stationView = 'journey';
          _runtime.sheet.finishedJourneyId = null;
          global.toast && global.toast('当前 Char 还有未完成的列车旅程，已为你接续');
          await renderSheet();
          return;
        }
        var ecoSt = await getEconomySnapshot();
        openConfirmModal({
          mode: 'confirm',
          kind: 'train_buy',
          title: '购买星愿车票',
          sub: esc(destPick.name) + ' · 同行：' + esc(charSt.nick || charSt.name),
          icon: destPick.icon || 'fa-solid fa-train',
          confirmLabel: '购票启程 (-30 币)',
          pendingLabel: '出票中…',
          requestId: uid('trreq'),
          payload: { destinationId: destPick.id, charId: String(charSt.id) },
          detailHtml: '即将花费 <strong>30 金币</strong> 购买前往「<strong>' + esc(destPick.name) + '</strong>」的车票并与 <strong>' + esc(charSt.nick || charSt.name) + '</strong> 登车出发（含三阶段旅程体验）。<br><span style="font-size:12px;color:var(--wx-sub);">当前金币余额：' + (ecoSt.coins || 0) + ' 币</span>'
        });
        return;
      }
      var stChoiceBtn = target.closest('[data-wx-train-choice]');
      if (stChoiceBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var tJrnId = stChoiceBtn.getAttribute('data-wx-journey-id');
          var tStg = Number(stChoiceBtn.getAttribute('data-wx-stage'));
          var tChId = stChoiceBtn.getAttribute('data-wx-train-choice');
          var tOptRes = await chooseTrainStageOption(tJrnId, tStg, tChId, uid('topt'));
          if (!tOptRes.ok) {
            global.toast && global.toast(tOptRes.msg || '操作未完成');
            await renderSheet();
            return;
          }
          _runtime.aiLoading = true;
          await renderSheet();
          var tOpt = tOptRes.option || {};
          var tStgDef = tOptRes.stageDef || {};
          var tDest = tOptRes.destination || {};
          var tJrn = tOptRes.journey;
          var tReact = await requestCharReaction({
            locationName: '星愿列车 · ' + (tDest.name || '') + '（' + (tStgDef.shortTitle || ('第' + tStg + '阶段')) + '）',
            actionDesc: '在前往「' + (tDest.name || '') + '」的第' + tStg + '阶段选择了「' + (tOpt.label || '') + '」，' + (tOpt.outcome || ''),
            fallbackText: tOpt.fallbackReply || ''
          });
          _runtime.aiLoading = false;
          if (tReact && tReact.ok && !tReact.aborted) {
            var tAiOk = tReact.source === 'ai';
            await updateTrainStageReply(tJrn.journeyId, tStg, tReact.charId, tAiOk ? tReact.text : '', tReact.source, !tAiOk);
            _runtime.sheet.charQuote = tReact.text;
            _runtime.sheet.charQuoteMeta = tAiOk ? 'AI 旅途回应' : '自然回应（可重试 AI）';
            _runtime.sheet.charQuoteSource = tReact.source;
            pushCharBubbleEntry(tReact.charId, 'starwish_station', 'char', tReact.text, _runtime.sheet.charQuoteMeta);
          }
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var retryTrainAiBtn = target.closest('[data-wx-retry-train-ai]');
      if (retryTrainAiBtn) {
        var rJrnId = retryTrainAiBtn.getAttribute('data-wx-retry-train-ai');
        var rStg = Number(retryTrainAiBtn.getAttribute('data-wx-stage'));
        var jsRt = await loadJourneysState();
        var rtJrn = _runtime.activeCharId && jsRt.activeJourneysByChar[String(_runtime.activeCharId)];
        if (rtJrn && rtJrn.journeyId === rJrnId && rtJrn.choices && rtJrn.choices['stage' + rStg]) {
          var chRt = rtJrn.choices['stage' + rStg];
          var rtDest = getTrainDestinationById(rtJrn.destinationId);
          _runtime.aiLoading = true;
          await renderSheet();
          var rtReact = await requestCharReaction({
            locationName: '星愿列车 · ' + (rtDest ? rtDest.name : rtJrn.destinationName),
            actionDesc: '在前往「' + rtJrn.destinationName + '」的第' + rStg + '阶段选择了「' + chRt.label + '」，' + chRt.outcome
          });
          _runtime.aiLoading = false;
          if (rtReact && rtReact.ok && !rtReact.aborted) {
            var rtAiOk = rtReact.source === 'ai';
            await updateTrainStageReply(rtJrn.journeyId, rStg, rtReact.charId, rtAiOk ? rtReact.text : '', rtReact.source, !rtAiOk);
            _runtime.sheet.charQuote = rtReact.text;
            _runtime.sheet.charQuoteSource = rtReact.source;
            await renderSheet();
          }
        }
        return;
      }
      var trainNextBtn = target.closest('[data-wx-train-next]');
      if (trainNextBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var tAdvRes = await advanceTrainStage(trainNextBtn.getAttribute('data-wx-train-next'));
          if (!tAdvRes.ok) global.toast && global.toast(tAdvRes.msg || '无法进入下一阶段');
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var trainFinBtn = target.closest('[data-wx-train-finish]');
      if (trainFinBtn) {
        if (_runtime.pendingAction) return;
        _runtime.pendingAction = true;
        try {
          var tFinRes = await completeTrainJourney(trainFinBtn.getAttribute('data-wx-train-finish'), uid('tfin'));
          if (tFinRes.ok) {
            _runtime.sheet.finishedJourneyId = tFinRes.completedJourney.journeyId;
            _runtime.sheet.postcardDraftMsg = '';
          } else {
            global.toast && global.toast(tFinRes.msg || '结算失败');
          }
          await renderSheet();
        } finally {
          _runtime.pendingAction = false;
        }
        return;
      }
      var pcPresetBtn = target.closest('[data-wx-postcard-preset]');
      if (pcPresetBtn) {
        var idxPc = Number(pcPresetBtn.getAttribute('data-wx-postcard-preset'));
        if (TRAIN_CONFIG.presetMessages[idxPc]) {
          _runtime.sheet.postcardDraftMsg = TRAIN_CONFIG.presetMessages[idxPc];
          var pcInput = page.querySelector('#wx-postcard-msg-input');
          if (pcInput) pcInput.value = _runtime.sheet.postcardDraftMsg;
          var pcPrev = page.querySelector('#wx-postcard-preview-msg');
          if (pcPrev) pcPrev.textContent = '“' + _runtime.sheet.postcardDraftMsg + '”';
        }
        return;
      }
      var savePcBtn = target.closest('[data-wx-save-train-postcard]');
      if (savePcBtn) {
        var pcInputEl = page.querySelector('#wx-postcard-msg-input');
        var rawPcMsg = pcInputEl ? pcInputEl.value : _runtime.sheet.postcardDraftMsg;
        var spcRes = await saveTrainPostcardMemento({
          journeyId: savePcBtn.getAttribute('data-wx-save-train-postcard'),
          customMessage: rawPcMsg,
          presetMessage: TRAIN_CONFIG.presetMessages[0]
        });
        global.toast && global.toast(spcRes.ok ? (spcRes.duplicate ? '该趟旅程明信片已收藏过' : '已收藏旅行明信片至万象镜「留影」页') : (spcRes.msg || '保存失败'));
        await renderSheet();
        if (_runtime.activeTab === 'mementos') await renderSubpageContent();
        return;
      }
      var trDestFilterBtn = target.closest('[data-wx-train-dest]');
      if (trDestFilterBtn) {
        _runtime.trainDestFilter = trDestFilterBtn.getAttribute('data-wx-train-dest') || 'all';
        await renderSubpageContent();
        return;
      }

      // 16. V3.1 分享给 Char / 记住这一天（严格绑定原经历 charId，仅经用户编辑与确认后才生效）
      var brShareBtn = target.closest('[data-wx-bridge-share]');
      if (brShareBtn) {
        var bExpId = brShareBtn.getAttribute('data-wx-bridge-share');
        var bExpCharId = brShareBtn.getAttribute('data-wx-bridge-char') || _runtime.activeCharId;
        var brApi = getBridge();
        if (!brApi || !bExpId || !bExpCharId) {
          global.toast && global.toast('分享桥接模块未就绪');
          return;
        }
        var targetExp = await brApi.getExperienceById(bExpId, bExpCharId);
        if (!targetExp || !targetExp.canShare) {
          global.toast && global.toast('未找到可分享的经历记录');
          return;
        }
        var mismatchNote = (_runtime.activeCharId && String(_runtime.activeCharId) !== String(targetExp.charId))
          ? '<div class="wx-bridge-warn-box">提示：当前小镇同行角色已切换，本次分享将严格发往原经历角色「<strong>' + esc(targetExp.charName) + '</strong>」的私聊。</div>'
          : '';
        openConfirmModal({
          mode: 'confirm',
          kind: 'bridge_share_preview',
          title: '分享给 ' + (targetExp.charName || 'Char'),
          sub: targetExp.locationName + ' · 仅填充草稿，不会自动发送',
          icon: 'fa-regular fa-paper-plane',
          confirmLabel: '前往聊天确认',
          pendingLabel: '准备草稿中…',
          payload: { experience: targetExp, draftText: targetExp.shareText },
          detailHtml:
            mismatchNote +
            '<div style="font-size:12px;color:var(--wx-sub);margin-bottom:6px;">可先修改下面这段话，点击前往后会带入微信输入框（不自动发送）：</div>' +
            '<textarea id="wx-bridge-share-input" class="wx-input wx-bridge-textarea" rows="3" maxlength="240">' + esc(targetExp.shareText) + '</textarea>'
        });
        return;
      }

      var brRemBtn = target.closest('[data-wx-bridge-remember]');
      if (brRemBtn) {
        var rExpId = brRemBtn.getAttribute('data-wx-bridge-remember');
        var rExpCharId = brRemBtn.getAttribute('data-wx-bridge-char') || _runtime.activeCharId;
        var brApiMem = getBridge();
        if (!brApiMem || !rExpId || !rExpCharId) {
          global.toast && global.toast('记忆桥接模块未就绪');
          return;
        }
        var remExp = await brApiMem.getExperienceById(rExpId, rExpCharId);
        if (!remExp || !remExp.canRemember) {
          global.toast && global.toast('该条记录暂不支持保存为长期记忆');
          return;
        }
        var alreadyMem = await brApiMem.checkMemorySavedStatus({ experience: remExp });
        if (alreadyMem && alreadyMem.saved) {
          global.toast && global.toast('这条回忆已经保存在长期记忆中了');
          if (_runtime.sheet.open) await renderSheet();
          if (_runtime.activeTab === 'mementos') await renderSubpageContent();
          return;
        }
        var cand = brApiMem.buildMemoryCandidate(remExp);
        if (!cand) {
          global.toast && global.toast('无法生成长期记忆预览');
          return;
        }
        openConfirmModal({
          mode: 'confirm',
          kind: 'bridge_memory_preview',
          title: '记住这一天',
          sub: '精选录入「' + (remExp.charName || 'Char') + '」长期记忆（需手动确认）',
          icon: 'fa-regular fa-bookmark',
          confirmLabel: '确认记住',
          pendingLabel: '保存记忆中…',
          payload: { experience: remExp, title: cand.title, content: cand.content },
          detailHtml:
            '<div style="font-size:12px;color:var(--wx-sub);margin-bottom:6px;">将保存到微信长期记忆（来源：万象镜），可在记忆长廊随时修改或删除：</div>' +
            '<label class="wx-bridge-field-lbl">记忆标题（最多30字）</label>' +
            '<input id="wx-bridge-mem-title" type="text" class="wx-input" maxlength="30" value="' + esc(cand.title) + '">' +
            '<label class="wx-bridge-field-lbl" style="margin-top:8px;">记忆内容（最多150字）</label>' +
            '<textarea id="wx-bridge-mem-content" class="wx-input wx-bridge-textarea" rows="3" maxlength="150">' + esc(cand.content) + '</textarea>'
        });
        return;
      }
    });

    page.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'wx-bouquet-name-input') {
        _runtime.sheet.craftDraft.name = e.target.value || '';
        var prevNameEl = page.querySelector('#wx-bouquet-preview-name');
        if (prevNameEl) {
          var meta = buildBouquetMetadata(
            _runtime.sheet.craftDraft.counts,
            _runtime.sheet.craftDraft.wrappingId,
            _runtime.sheet.craftDraft.ribbonId,
            _runtime.sheet.craftDraft.name
          );
          if (meta.total > 0) prevNameEl.textContent = meta.name;
        }
      } else if (e.target && e.target.id === 'wx-postcard-msg-input') {
        _runtime.sheet.postcardDraftMsg = sanitizeTextField(e.target.value || '', 48);
        var pcPrevEl = page.querySelector('#wx-postcard-preview-msg');
        if (pcPrevEl) {
          pcPrevEl.textContent = '“' + (_runtime.sheet.postcardDraftMsg || TRAIN_CONFIG.presetMessages[0]) + '”';
        }
      }
    });

    page.addEventListener('focusin', function(e) {
      if (e.target && (e.target.id === 'wx-postcard-msg-input' || e.target.id === 'wx-bouquet-name-input' || e.target.id === 'wx-char-panel-input' || e.target.id === 'wx-cafe-chat-input')) {
        setTimeout(function() {
          try { e.target && typeof e.target.scrollIntoView === 'function' && e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
        }, 180);
      }
    });
  }

  // ====================================================
  // 九、Android 返回键 / 浏览器历史与页面生命周期
  // ====================================================
  function stepBackFromTopLayer() {
    if (_runtime.confirm.open) {
      closeConfirmModal();
      return 'handled_confirm';
    }
    if (_runtime.sheet.open) {
      if (_runtime.sheet.subView === 'letterDetail') {
        _runtime.sheet.subView = 'letters';
        _runtime.sheet.canStepBack = false;
        renderSheet();
        return 'handled_stepback';
      }
      if (_runtime.sheet.subView === 'lifeSettings') {
        if (_runtime.letterReturnTo === 'letters') {
          _runtime.sheet.subView = 'letters';
          _runtime.sheet.canStepBack = false;
          _runtime.letterReturnTo = null;
          renderSheet();
          return 'handled_stepback';
        }
        closeSheetOnly();
        return 'handled_sheet';
      }
      if (_runtime.sheet.subView === 'seasonal') {
        if (_runtime.seasonalReturnTo && _runtime.sheet.locationId) {
          _runtime.sheet.subView = _runtime.seasonalReturnTo;
          _runtime.sheet.canStepBack = _runtime.seasonalReturnTo !== 'intro';
          _runtime.seasonalReturnTo = null;
          renderSheet();
          return 'handled_stepback';
        }
        _runtime.seasonalReturnTo = null;
        closeSheetOnly();
        return 'handled_sheet';
      }
      if (_runtime.sheet.subView === 'letters') {
        closeSheetOnly();
        return 'handled_sheet';
      }
      if (_runtime.sheet.subView === 'park' && _runtime.sheet.parkView !== 'hub') {
        clearCarouselAnimTimer();
        _runtime.sheet.parkView = 'hub';
        _runtime.sheet.finishedFerrisId = null;
        renderSheet();
        return 'handled_stepback';
      }
      if (_runtime.sheet.subView === 'station' && _runtime.sheet.stationView !== 'hub') {
        _runtime.sheet.stationView = 'hub';
        _runtime.sheet.finishedJourneyId = null;
        renderSheet();
        return 'handled_stepback';
      }
      if (_runtime.sheet.canStepBack) {
        clearCarouselAnimTimer();
        _runtime.sheet.subView = 'intro';
        _runtime.sheet.canStepBack = false;
        _runtime.sheet.finishedWalkId = null;
        _runtime.sheet.finishedFerrisId = null;
        _runtime.sheet.finishedJourneyId = null;
        renderSheet();
        return 'handled_stepback';
      }
      closeSheetOnly();
      return 'handled_sheet';
    }
    return 'exit_page';
  }

  function bindNavigationGuards() {
    unbindNavigationGuards();

    _runtime.keyHandler = function(e) {
      if (e.key === 'Escape' && _runtime.pageEl) {
        var res = stepBackFromTopLayer();
        if (res === 'exit_page') close();
      }
    };
    global.addEventListener('keydown', _runtime.keyHandler);

    _runtime.resizeHandler = function() {
      recalcStageMetrics(true);
    };
    global.addEventListener('resize', _runtime.resizeHandler, { passive: true });
    global.addEventListener('orientationchange', _runtime.resizeHandler, { passive: true });
    if (global.visualViewport && typeof global.visualViewport.addEventListener === 'function') {
      global.visualViewport.addEventListener('resize', _runtime.resizeHandler, { passive: true });
    }

    // 低频 60 秒 & 页面重现时温和刷新氛围条（绝不打断输入、确认框、弹窗或支付）
    var setIntFn = typeof global.setInterval === 'function' ? global.setInterval : setInterval;
    _atmosphereTimer = setIntFn(function() {
      if (_runtime.pageEl && isInviteUiIdle()) {
        refreshTopbarAndCompanion();
      }
    }, 60000);
    if (_atmosphereTimer && typeof _atmosphereTimer.unref === 'function') {
      _atmosphereTimer.unref();
    }
    if (global.document && typeof global.document.addEventListener === 'function') {
      _visibilityHandler = function() {
        if (_runtime.pageEl && global.document.visibilityState === 'visible' && isInviteUiIdle()) {
          refreshTopbarAndCompanion();
        }
      };
      global.document.addEventListener('visibilitychange', _visibilityHandler);
    }

    try {
      var stage = _runtime.pageEl && _runtime.pageEl.querySelector('#wx-map-stage');
      if (stage && typeof global.ResizeObserver === 'function') {
        _runtime.resizeObserver = new global.ResizeObserver(function() {
          recalcStageMetrics(true);
        });
        _runtime.resizeObserver.observe(stage);
      }
    } catch (_) {}

    try {
      if (global.history && typeof global.history.pushState === 'function') {
        global.history.pushState({ wanxiangMirror: true }, '');
        _runtime.pushedHistory = true;
        _runtime.popHandler = function() {
          if (!_runtime.pageEl) return;
          var res = stepBackFromTopLayer();
          if (res !== 'exit_page') {
            try { global.history.pushState({ wanxiangMirror: true }, ''); } catch (_) {}
          } else {
            _runtime.pushedHistory = false;
            close(true);
          }
        };
        global.addEventListener('popstate', _runtime.popHandler);
      }
    } catch (_) {}
  }

  function unbindNavigationGuards() {
    if (_atmosphereTimer) {
      clearInterval(_atmosphereTimer);
      _atmosphereTimer = null;
    }
    if (_visibilityHandler && global.document && typeof global.document.removeEventListener === 'function') {
      global.document.removeEventListener('visibilitychange', _visibilityHandler);
      _visibilityHandler = null;
    }
    if (_runtime.keyHandler) {
      global.removeEventListener('keydown', _runtime.keyHandler);
      _runtime.keyHandler = null;
    }
    if (_runtime.resizeHandler) {
      global.removeEventListener('resize', _runtime.resizeHandler);
      global.removeEventListener('orientationchange', _runtime.resizeHandler);
      if (global.visualViewport && typeof global.visualViewport.removeEventListener === 'function') {
        global.visualViewport.removeEventListener('resize', _runtime.resizeHandler);
      }
      _runtime.resizeHandler = null;
    }
    if (_runtime.resizeObserver) {
      try { _runtime.resizeObserver.disconnect(); } catch (_) {}
      _runtime.resizeObserver = null;
    }
    if (_runtime.popHandler) {
      global.removeEventListener('popstate', _runtime.popHandler);
      _runtime.popHandler = null;
    }
  }

  async function open(opts) {
    opts = opts || {};
    var existing = global.document && global.document.getElementById(PAGE_ID);
    if (existing) existing.remove();

    var savedState = await loadMirrorState();
    _runtime.uiSettings = await loadUiSettings();
    var lifeStateOpen = await loadLifeState();
    _runtime.lifeSettings = Object.assign({}, lifeStateOpen.settings);
    _runtime.timePreview = savedState.timePreview || 'auto';
    _runtime.fromChatNavId = opts.fromChatNavId ? String(opts.fromChatNavId) : '';
    var navBridge = getBridge();
    _runtime.fromChatCtx = (_runtime.fromChatNavId && navBridge && typeof navBridge.getNavigationContext === 'function')
      ? await navBridge.getNavigationContext(_runtime.fromChatNavId)
      : null;
    if (opts.charId) {
      _runtime.activeCharId = String(opts.charId);
      await saveMirrorState({ activeCharId: _runtime.activeCharId });
    } else if (_runtime.fromChatCtx && _runtime.fromChatCtx.charId) {
      _runtime.activeCharId = String(_runtime.fromChatCtx.charId);
      await saveMirrorState({ activeCharId: _runtime.activeCharId });
    } else {
      _runtime.activeCharId = savedState.activeCharId || null;
    }
    _runtime.activeTab = opts.tab || 'map';
    _runtime.mementoFilter = opts.mementoFilter || 'all';
    _runtime.amusementSubFilter = opts.amusementSubFilter || 'all';
    _runtime.trainDestFilter = opts.trainDestFilter || 'all';
    _runtime.lettersTab = 'active';
    _runtime.selectedLetterId = null;
    _runtime.letterReturnTo = null;
    _runtime.seasonalReturnTo = null;
    _runtime.visibleNoteInviteId = null;
    _runtime.suppressedNoteForSession = {};
    _runtime.sessionId = 'sess_' + nowMs().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    _runtime.sheet.open = false;
    _runtime.sheet.locationId = null;
    _runtime.sheet.subView = 'intro';
    _runtime.sheet.canStepBack = false;
    _runtime.sheet.gardenTab = 'home';
    _runtime.sheet.craftDraft = { counts: {}, wrappingId: 'sakura_pink', ribbonId: 'champagne_gold', name: '' };
    _runtime.sheet.lastCollectedFlower = null;
    _runtime.sheet.lastGiftedBouquetId = null;
    _runtime.sheet.lakesideView = 'home';
    _runtime.sheet.finishedWalkId = null;
    _runtime.sheet.parkView = 'hub';
    _runtime.sheet.clawPos = 50;
    _runtime.sheet.clawDropping = false;
    _runtime.sheet.lastClawResult = null;
    _runtime.sheet.lastGiftedPlushId = null;
    _runtime.sheet.finishedFerrisId = null;
    _runtime.sheet.carouselSeatId = 'moon_white_horse';
    _runtime.sheet.carouselMoodId = 'gentle_romantic';
    _runtime.sheet.carouselPlaying = false;
    _runtime.sheet.lastCarouselRideId = null;
    _runtime.sheet.stationView = 'hub';
    _runtime.sheet.selectedDestId = 'sakura_valley';
    _runtime.sheet.finishedJourneyId = null;
    _runtime.sheet.postcardDraftMsg = '';
    _runtime.confirm.open = false;
    _runtime.confirm.data = null;
    _runtime.pendingAction = false;
    _runtime.aiLoading = false;
    _runtime.timeMenuOpen = false;

    var periodInfo = getActivePeriodInfo(_runtime.timePreview);
    var eco = await getEconomySnapshot();

    var page = global.document.createElement('div');
    page.id = PAGE_ID;
    page.className = 'full-page';

    page.innerHTML =
      '<div class="wx-shell">' +
        '<header class="wx-topbar">' +
          '<div class="wx-topbar-left">' +
            '<button type="button" class="wx-icon-btn" id="wx-back-home" aria-label="返回桌面">' +
              '<i class="fa fa-angle-left"></i><span>桌面</span>' +
            '</button>' +
            '<div class="wx-title-group">' +
              '<div class="wx-title">万象镜</div>' +
              '<div class="wx-subtitle" id="wx-topbar-sub">' + esc((periodInfo.isPreview ? '预览 · ' : '') + periodInfo.period.label + ' · 镜中小镇') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="wx-topbar-right">' +
            '<div class="wx-coin-readout wx-num" title="共享金币余额"><i class="fa-solid fa-coins"></i><span id="wx-coin-val">' + (eco.coins || 0) + '</span></div>' +
            '<button type="button" class="wx-letters-btn" id="wx-letters-btn" aria-label="小镇来信">' +
              '<i class="fa-regular fa-envelope"></i><span>来信</span><span class="wx-letters-count wx-num" id="wx-letters-count"></span>' +
            '</button>' +
            '<button type="button" class="wx-time-btn" id="wx-time-btn" aria-label="昼夜预览">' +
              '<i class="fa-regular fa-sun"></i><span id="wx-time-btn-label">' + esc(periodInfo.period.label) + '</span>' +
            '</button>' +
          '</div>' +
        '</header>' +

        '<div class="wx-chat-return-bar is-hidden" id="wx-chat-return-bar"></div>' +
        '<div class="wx-atmosphere-bar" id="wx-atmosphere-bar"></div>' +

        '<div class="wx-time-popover" id="wx-time-popover" role="dialog" aria-label="昼夜预览">' +
          '<div class="wx-time-popover-head"><span>昼夜画卷预览</span><span style="font-size:11px;color:var(--wx-sub);">仅视觉效果</span></div>' +
          '<div class="wx-time-popover-note">默认随设备本地时间自动切换；手动预览不改变真实游戏时间。</div>' +
          '<div class="wx-time-options">' +
            '<button type="button" class="wx-time-opt is-wide ' + (_runtime.timePreview === 'auto' ? 'is-active' : '') + '" data-wx-time-mode="auto"><span>跟随本地时间</span><small>自动匹配清晨/白昼/黄昏/夜晚</small></button>' +
            '<button type="button" class="wx-time-opt ' + (_runtime.timePreview === 'morning' ? 'is-active' : '') + '" data-wx-time-mode="morning"><span>清晨</span><small>05:00–10:59</small></button>' +
            '<button type="button" class="wx-time-opt ' + (_runtime.timePreview === 'day' ? 'is-active' : '') + '" data-wx-time-mode="day"><span>白昼</span><small>11:00–16:59</small></button>' +
            '<button type="button" class="wx-time-opt ' + (_runtime.timePreview === 'dusk' ? 'is-active' : '') + '" data-wx-time-mode="dusk"><span>黄昏</span><small>17:00–19:59</small></button>' +
            '<button type="button" class="wx-time-opt ' + (_runtime.timePreview === 'night' ? 'is-active' : '') + '" data-wx-time-mode="night"><span>夜晚</span><small>20:00–04:59</small></button>' +
          '</div>' +
        '</div>' +

        '<main class="wx-main">' +
          '<div class="wx-map-stage" id="wx-map-stage">' +
            '<div class="wx-map-transform" id="wx-map-transform">' +
              '<div class="wx-map-board">' +
                '<img id="wx-map-img" class="wx-map-img" src="' + esc(periodInfo.period.src) + '" alt="万象镜镜中小镇地图" decoding="async" draggable="false">' +
                '<div class="wx-map-fallback" id="wx-map-fallback">' +
                  '<i class="fa-solid fa-map" style="font-size:28px;"></i>' +
                  '<div style="font-weight:700;">小镇地图暂时未能加载</div>' +
                  '<div style="font-size:12px;opacity:0.75;">依然可以直接点击下方地点标签进行探索</div>' +
                  '<button type="button" class="wx-map-fallback-btn" id="wx-map-reload-btn">重新加载画卷</button>' +
                '</div>' +
                renderHotspotsHtml() +
              '</div>' +
            '</div>' +

            '<div class="wx-float-left">' +
              '<div class="wx-invite-note is-hidden" id="wx-invite-note" role="status" aria-live="polite"></div>' +
              '<button type="button" class="wx-companion-btn" id="wx-float-char-btn" aria-label="切换同行 Char">' +
                '<div class="wx-companion-avatar" id="wx-float-avatar"><i class="fa-solid fa-user"></i></div>' +
                '<div class="wx-companion-meta">' +
                  '<span class="wx-companion-name" id="wx-float-char-name">独自探索</span>' +
                  '<span class="wx-companion-hint" id="wx-float-char-hint">点击选择同行 Char</span>' +
                '</div>' +
              '</button>' +
            '</div>' +

            '<div class="wx-float-right">' +
              '<button type="button" class="wx-float-ctrl" id="wx-ctrl-recenter" title="回到镜心广场" aria-label="回到镜心广场"><i class="fa-solid fa-crosshairs"></i></button>' +
              '<button type="button" class="wx-float-ctrl" id="wx-ctrl-zoom-in" title="放大地图" aria-label="放大地图"><i class="fa-solid fa-plus"></i></button>' +
              '<button type="button" class="wx-float-ctrl" id="wx-ctrl-zoom-out" title="缩小地图" aria-label="缩小地图"><i class="fa-solid fa-minus"></i></button>' +
            '</div>' +
          '</div>' +

          '<section class="wx-subpage" id="wx-subpage" aria-label="万象镜功能分页"></section>' +

          '<div class="wx-sheet-backdrop" id="wx-sheet-backdrop">' +
            '<div class="wx-sheet" id="wx-sheet" role="dialog" aria-modal="true" aria-label="万象镜地点卡片"></div>' +
          '</div>' +

          '<div class="wx-confirm-backdrop" id="wx-confirm-backdrop">' +
            '<div class="wx-confirm-card" id="wx-confirm-card" role="alertdialog" aria-modal="true" aria-label="操作确认与结果"></div>' +
          '</div>' +
        '</main>' +

        '<nav class="wx-bottom-nav" aria-label="万象镜主导航">' +
          '<button type="button" class="wx-nav-tab is-active" data-wx-tab="map"><i class="fa-solid fa-map-location-dot"></i><span>地图</span></button>' +
          '<button type="button" class="wx-nav-tab" data-wx-tab="bag"><i class="fa-solid fa-box-open"></i><span>背包</span></button>' +
          '<button type="button" class="wx-nav-tab" data-wx-tab="mementos"><i class="fa-solid fa-images"></i><span>留影</span></button>' +
          '<button type="button" class="wx-nav-tab" data-wx-tab="codex"><i class="fa-solid fa-book"></i><span>图鉴</span></button>' +
        '</nav>' +
      '</div>';

    _runtime.pageEl = page;

    if (typeof global.openPage === 'function') {
      global.openPage(page);
    } else {
      var rootApp = global.document.getElementById('app') || global.document.body;
      rootApp.appendChild(page);
    }

    var mapImg = page.querySelector('#wx-map-img');
    var fallbackEl = page.querySelector('#wx-map-fallback');
    if (mapImg) {
      mapImg.addEventListener('error', function() {
        if (fallbackEl) fallbackEl.classList.add('is-visible');
      });
      mapImg.addEventListener('load', function() {
        if (fallbackEl) fallbackEl.classList.remove('is-visible');
      });
    }

    if (savedState.mapTransform && typeof savedState.mapTransform.scale === 'number') {
      _runtime.mapTransform = {
        x: Number(savedState.mapTransform.x) || 0,
        y: Number(savedState.mapTransform.y) || 0,
        scale: Number(savedState.mapTransform.scale) || 1,
        initialized: true
      };
      recalcStageMetrics(true);
    } else {
      _runtime.mapTransform.initialized = false;
      recalcStageMetrics(false);
    }

    bindStageGestures(page);
    bindPageDelegatedEvents(page);
    bindNavigationGuards();

    await checkAndGenerateActiveInvitation({ cycleKey: _runtime.sessionId });
    await refreshTopbarAndCompanion();
    await renderChatReturnBar();
    if (opts.openLocationId) {
      await openLocationSheet(opts.openLocationId, opts.subView || 'intro');
    } else if (opts.openLetters) {
      _runtime.sheet.open = true;
      _runtime.sheet.locationId = null;
      _runtime.sheet.subView = 'letters';
      _runtime.sheet.canStepBack = false;
      await renderSheet();
      await renderAtmosphereAndInviteUi();
    }
    if (_runtime.activeTab !== 'map') {
      await switchTab(_runtime.activeTab);
    }

    setTimeout(function() {
      if (_runtime.pageEl === page) recalcStageMetrics(true);
    }, 360);

    return page;
  }

  function close(fromPopstate) {
    clearTypewriter();
    clearCarouselAnimTimer();
    _aiSeq++;
    _openSeq++;
    _runtime.aiLoading = false;
    _runtime.pendingAction = false;
    if (_runtime.pageEl) {
      saveMirrorState({
        mapTransform: { x: _runtime.mapTransform.x, y: _runtime.mapTransform.y, scale: _runtime.mapTransform.scale },
        timePreview: _runtime.timePreview,
        activeCharId: _runtime.activeCharId
      });
    }
    unbindNavigationGuards();
    var p = _runtime.pageEl;
    _runtime.pageEl = null;
    _runtime.sheet.open = false;
    _runtime.sheet.canStepBack = false;
    _runtime.confirm.open = false;
    _runtime.confirm.data = null;
    if (!fromPopstate && _runtime.pushedHistory && global.history && typeof global.history.back === 'function') {
      _runtime.pushedHistory = false;
      try { global.history.back(); } catch (_) {}
    }
    if (p) {
      if (typeof global.closePage === 'function') {
        global.closePage(PAGE_ID);
      } else {
        p.remove();
      }
    }
  }

  var WanxiangMirror = {
    PAGE_ID: PAGE_ID,
    STORAGE_KEYS: STORAGE_KEYS,
    TIME_PERIODS: TIME_PERIODS,
    TIME_SLOTS_V30: TIME_SLOTS_V30,
    WELCOME_GREETINGS: WELCOME_GREETINGS,
    INVITATION_COOLDOWNS: INVITATION_COOLDOWNS,
    INVITATION_TEMPLATES: INVITATION_TEMPLATES,
    SEASONAL_EVENTS_V30: SEASONAL_EVENTS_V30,
    LOCATIONS: LOCATIONS,
    SHOP_GOODS: SHOP_GOODS,
    CAFE_MENU: CAFE_MENU,
    GACHA_MACHINES: GACHA_MACHINES,
    FLOWERS: FLOWERS,
    SEASON_THEMES: SEASON_THEMES,
    BOUQUET_WRAPPINGS: BOUQUET_WRAPPINGS,
    BOUQUET_RIBBONS: BOUQUET_RIBBONS,
    LAKESIDE_EVENTS: LAKESIDE_EVENTS,
    DAILY_COLLECTION_LIMIT: DAILY_COLLECTION_LIMIT,
    CLAW_CONFIG: CLAW_CONFIG,
    FERRIS_CONFIG: FERRIS_CONFIG,
    CAROUSEL_CONFIG: CAROUSEL_CONFIG,
    TRAIN_CONFIG: TRAIN_CONFIG,
    TRAIN_DESTINATIONS: TRAIN_DESTINATIONS,
    setClock: function(fn) { _clockFn = typeof fn === 'function' ? fn : null; },
    nowMs: nowMs,
    nowDate: nowDate,
    getRealTimeSlotKey: getRealTimeSlotKey,
    getRealTimePeriodKey: getRealTimePeriodKey,
    getActivePeriodInfo: getActivePeriodInfo,
    getSeasonalYear: getSeasonalYear,
    getLocalSeasonInfo: getLocalSeasonInfo,
    pickTimeSlotGreeting: pickTimeSlotGreeting,
    getTownAtmosphereSnapshot: getTownAtmosphereSnapshot,
    getLocationById: getLocationById,
    computeBoardMetrics: computeBoardMetrics,
    clampMapTransform: clampMapTransform,
    centerTransformOnPoint: centerTransformOnPoint,
    loadMirrorState: loadMirrorState,
    saveMirrorState: saveMirrorState,
    loadUiSettings: loadUiSettings,
    saveUiSettings: saveUiSettings,
    defaultLifeSettings: defaultLifeSettings,
    loadLifeState: loadLifeState,
    saveLifeState: saveLifeState,
    saveLifeSettings: saveLifeSettings,
    loadInvitationsState: loadInvitationsState,
    saveInvitationsState: saveInvitationsState,
    applySilentInvitationExpiry: applySilentInvitationExpiry,
    isInviteUiIdle: isInviteUiIdle,
    checkAndGenerateActiveInvitation: checkAndGenerateActiveInvitation,
    polishInvitationWithAI: polishInvitationWithAI,
    acceptInvitation: acceptInvitation,
    deferInvitation: deferInvitation,
    dismissInvitation: dismissInvitation,
    abandonAcceptedInvitation: abandonAcceptedInvitation,
    completeAcceptedInvitationForChar: completeAcceptedInvitationForChar,
    getInvitationsForChar: getInvitationsForChar,
    getSeasonalEventForSeason: getSeasonalEventForSeason,
    getCurrentSeasonalEvent: getCurrentSeasonalEvent,
    startSeasonalEventInteraction: startSeasonalEventInteraction,
    selectSeasonalEventOption: selectSeasonalEventOption,
    updateSeasonalEventReply: updateSeasonalEventReply,
    dismissSeasonalDraft: dismissSeasonalDraft,
    saveSeasonalMemento: saveSeasonalMemento,
    loadGachaState: loadGachaState,
    loadCharLogs: loadCharLogs,
    loadMementos: loadMementos,
    loadGardenState: loadGardenState,
    getGardenDailyCollectionStatus: getGardenDailyCollectionStatus,
    collectDailyFlower: collectDailyFlower,
    buildBouquetMetadata: buildBouquetMetadata,
    craftBouquet: craftBouquet,
    giftBouquetToActiveChar: giftBouquetToActiveChar,
    saveFlowerMemento: saveFlowerMemento,
    loadLakesideState: loadLakesideState,
    startLakesideWalk: startLakesideWalk,
    chooseLakesideOption: chooseLakesideOption,
    finishLakesideWalk: finishLakesideWalk,
    abandonLakesideWalk: abandonLakesideWalk,
    saveLakesideMemento: saveLakesideMemento,
    loadParkState: loadParkState,
    loadClawState: loadClawState,
    loadFerrisState: loadFerrisState,
    loadCarouselState: loadCarouselState,
    rollClawOutcome: rollClawOutcome,
    playClawAttempt: playClawAttempt,
    giftPlushToActiveChar: giftPlushToActiveChar,
    updatePlushReply: updatePlushReply,
    startFerrisRide: startFerrisRide,
    chooseFerrisActOption: chooseFerrisActOption,
    updateFerrisActReply: updateFerrisActReply,
    advanceFerrisAct: advanceFerrisAct,
    finishFerrisRide: finishFerrisRide,
    abandonFerrisRide: abandonFerrisRide,
    commitCarouselRide: commitCarouselRide,
    markCarouselAnimationSkipped: markCarouselAnimationSkipped,
    updateCarouselReply: updateCarouselReply,
    saveAmusementMemento: saveAmusementMemento,
    loadStationState: loadStationState,
    loadJourneysState: loadJourneysState,
    getTrainDestinationById: getTrainDestinationById,
    purchaseTrainTicketAndStartJourney: purchaseTrainTicketAndStartJourney,
    chooseTrainStageOption: chooseTrainStageOption,
    updateTrainStageReply: updateTrainStageReply,
    advanceTrainStage: advanceTrainStage,
    completeTrainJourney: completeTrainJourney,
    abandonTrainJourney: abandonTrainJourney,
    saveTrainPostcardMemento: saveTrainPostcardMemento,
    loadCompanionState: loadCompanionState,
    recordCompanionEvent: recordCompanionEvent,
    getCompanionContextForChar: getCompanionContextForChar,
    purchaseShopGood: purchaseShopGood,
    claimDailySignin: claimDailySignin,
    claimPlazaWish: claimPlazaWish,
    giftItemToActiveChar: giftItemToActiveChar,
    orderAtCafe: orderAtCafe,
    saveCafeMemento: saveCafeMemento,
    deleteMemento: deleteMemento,
    drawGacha: drawGacha,
    requestCharReaction: requestCharReaction,
    getCharHistoryFor: getCharHistoryFor,
    open: open,
    close: close,
    openLocationSheet: openLocationSheet,
    closeSheetOnly: closeSheetOnly,
    openConfirmModal: openConfirmModal,
    closeConfirmModal: closeConfirmModal,
    switchTab: switchTab,
    recenterToPlaza: recenterToPlaza,
    zoomAtCenter: zoomAtCenter,
    getRuntimeSnapshot: function() {
      return {
        activeTab: _runtime.activeTab,
        mementoFilter: _runtime.mementoFilter,
        amusementSubFilter: _runtime.amusementSubFilter,
        trainDestFilter: _runtime.trainDestFilter,
        timePreview: _runtime.timePreview,
        realTimeSlot: getRealTimeSlotKey(nowDate()),
        activeCharId: _runtime.activeCharId,
        lifeSettings: Object.assign({}, _runtime.lifeSettings),
        lettersTab: _runtime.lettersTab,
        selectedLetterId: _runtime.selectedLetterId,
        visibleNoteInviteId: _runtime.visibleNoteInviteId,
        mapTransform: Object.assign({}, _runtime.mapTransform),
        sheetOpen: _runtime.sheet.open,
        modalOpen: _runtime.sheet.open,
        sheetLocationId: _runtime.sheet.locationId,
        sheetSubView: _runtime.sheet.subView,
        gardenTab: _runtime.sheet.gardenTab,
        lakesideView: _runtime.sheet.lakesideView,
        finishedWalkId: _runtime.sheet.finishedWalkId,
        parkView: _runtime.sheet.parkView,
        clawPos: _runtime.sheet.clawPos,
        finishedFerrisId: _runtime.sheet.finishedFerrisId,
        carouselSeatId: _runtime.sheet.carouselSeatId,
        carouselMoodId: _runtime.sheet.carouselMoodId,
        carouselPlaying: _runtime.sheet.carouselPlaying,
        lastCarouselRideId: _runtime.sheet.lastCarouselRideId,
        stationView: _runtime.sheet.stationView,
        selectedDestId: _runtime.sheet.selectedDestId,
        finishedJourneyId: _runtime.sheet.finishedJourneyId,
        canStepBack: _runtime.sheet.canStepBack,
        confirmOpen: _runtime.confirm.open,
        pendingAction: _runtime.pendingAction,
        aiLoading: _runtime.aiLoading,
        typewriterEnabled: _runtime.uiSettings.typewriterEnabled
      };
    }
  };

  global.WanxiangMirror = WanxiangMirror;
  global.showWanxiangMirrorPage = function(opts) { return WanxiangMirror.open(opts); };
  global.showWanxiangMirrorApp = global.showWanxiangMirrorPage;
  global.showHeartbeatMallPage = function(opts) { return WanxiangMirror.open(opts); };
  global.showHeartbeatMallApp = global.showHeartbeatMallPage;

})(typeof window !== 'undefined' ? window : this);
