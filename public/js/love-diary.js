// love-diary.js — 恋爱记（情侣空间）完整模块
// 包含角色开通邀请流程、相册、情书、日记、悄悄话、心愿、我们的歌单与情侣动态

(function() {
  var COUPLE_SPACE_CONFIG_KEY = 'coupleSpaceSettings'
  var _activeTab = 'album' // album | letters | diaries | whispers | wishes | playlist | moments
  var _currentCoupleData = null
  var _previewAudio = null
  var _playingSongId = null

  // ===== 默认情侣空间初始数据生成器 =====
  function createInitialCoupleData(charId, charName) {
    var todayStr = new Date().toISOString().slice(0, 10)
    return {
      charId: charId,
      status: 'accepted',
      acceptedAt: Date.now(),
      anniversaryDate: todayStr,
      quote: '愿每一秒心动，都有回音 ✨',
      bannerBg: '',
      album: [
        {
          id: 'p1',
          title: '第一次相遇的阳光',
          url: 'img/blank_img1.jpg',
          date: todayStr,
          desc: '那一天的阳光刚刚好，你对我笑了。'
        },
        {
          id: 'p2',
          title: '草莓下午茶时光',
          url: 'img/blank_img2.jpg',
          date: todayStr,
          desc: '甜甜的草莓和甜甜的你~'
        }
      ],
      letters: [
        {
          id: 'l1',
          title: '写给最特别的你',
          sender: 'char',
          date: todayStr,
          content: '见字如面。不知道从什么时候开始，习惯了有你陪伴的每一天。世界很大，但只要听到你的声音，整个世界都变得格外温柔。愿往后所有漫长岁月，我们都能紧紧相依。'
        }
      ],
      diaries: [
        {
          id: 'd1',
          title: '开通情侣空间的第一天',
          author: 'char',
          mood: '心动 💖',
          weather: '晴 ☀️',
          date: todayStr,
          content: '今天我们正式开通了属于彼此的秘密基地！看着相册里慢慢填满我们的回忆，心里像装了一整罐蜂蜜。'
        }
      ],
      whispers: [
        {
          id: 'w1',
          text: '今天也超级超级喜欢你哦！',
          author: 'char',
          color: '#ffe5ec',
          date: '刚刚'
        },
        {
          id: 'w2',
          text: '晚上早点睡，今晚也要在梦里见呀~',
          author: 'char',
          color: '#e0f4ff',
          date: '今天'
        },
        {
          id: 'w3',
          text: '天冷了记得多穿一件外套，不许着凉！',
          author: 'char',
          color: '#fff3cd',
          date: '今天'
        }
      ],
      wishes: [
        { id: 'wi1', text: '一起去海边看橘红色的日落', done: true },
        { id: 'wi2', text: '一起去游乐园坐夜晚的旋转木马', done: false },
        { id: 'wi3', text: '为你做一顿丰盛的烛光晚餐', done: false },
        { id: 'wi4', text: '在下雪天一起堆一个大雪人', done: false },
        { id: 'wi5', text: '拍一整套可爱的拍立得情侣照片', done: true },
        { id: 'wi6', text: '一起看一场午夜露天电影', done: false }
      ],
      playlist: [
        {
          id: 's1',
          title: 'Always Online',
          artist: '林俊杰',
          note: '我们专属的第一首心动主题曲',
          cover: 'img/wanwan.png'
        },
        {
          id: 's2',
          title: '想见你想见你想见你',
          artist: '八三夭',
          note: '未来过去，我只想见你',
          cover: 'img/ava-01.jpg'
        },
        {
          id: 's3',
          title: '遇到',
          artist: '方雅贤',
          note: '我们绕了这么一圈才遇到',
          cover: 'img/blank_img1.jpg'
        }
      ],
      moments: [
        {
          id: 'm1',
          author: 'char',
          date: '刚刚',
          content: '今天和世界上最可爱的人正式开启情侣空间啦！打卡留念 🌸✨',
          images: ['img/blank_img1.jpg'],
          likes: 2
        }
      ]
    }
  }

  // ===== 读写情侣空间配置 =====
  async function loadAllCoupleSpaces() {
    try {
      var row = await db.config.get(COUPLE_SPACE_CONFIG_KEY)
      return row && row.value ? row.value : { activeCharId: null, spaces: {} }
    } catch (_) {
      return { activeCharId: null, spaces: {} }
    }
  }

  async function saveAllCoupleSpaces(data) {
    try {
      await db.config.put({ key: COUPLE_SPACE_CONFIG_KEY, value: data })
    } catch (e) {
      console.warn('保存情侣空间失败:', e)
    }
  }

  function getDaysBetween(dateStr) {
    if (!dateStr) return 1
    var start = new Date(dateStr).getTime()
    var now = Date.now()
    var diff = Math.floor((now - start) / (1000 * 60 * 60 * 24))
    return Math.max(1, diff + 1)
  }

  // ===== 页面入口 =====
  window.showLoveDiaryPage = async function() {
    var config = await loadAllCoupleSpaces()
    var page = document.createElement('div')
    page.id = 'love-diary-page'
    page.className = 'full-page is-opening'

    if (config.activeCharId && config.spaces[config.activeCharId] && config.spaces[config.activeCharId].status === 'accepted') {
      _currentCoupleData = config.spaces[config.activeCharId]
      renderMainLoveDiary(page, config)
    } else {
      renderPartnerSelect(page, config)
    }

    window.openPage(page)
  }

  // ===== 渲染角色选择与开通界面 =====
  async function renderPartnerSelect(page, config) {
    var chars = await db.characters.toArray()
    var partners = chars.filter(function(c) { return c && c.type !== 'user' })

    page.innerHTML =
      '<div class="page-header" style="background:#fff;border-bottom:1px solid #ffeef1;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;">' +
        '<button class="header-back" onclick="window.closePage(\'love-diary-page\')">' +
          '<i class="fa fa-angle-left" style="font-size:22px;color:#5a3e47;"></i>' +
        '</button>' +
        '<span style="font-weight:700;font-size:16px;color:#4a2d36;">恋爱记 · 选择接入角色</span>' +
        '<div style="width:24px;"></div>' +
      '</div>' +
      '<div class="ld-select-partner-page">' +
        '<div class="ld-partner-header">' +
          '<div style="width:64px;height:64px;border-radius:50%;background:#ffe3e8;color:#ff477e;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px;box-shadow:0 4px 14px rgba(255,71,126,0.2);">' +
            '<i class="fa fa-heart-pulse"></i>' +
          '</div>' +
          '<div class="ld-partner-title">开启专属情侣空间</div>' +
          '<div class="ld-partner-desc">在恋爱记中选择一个角色接入。<br>需要先在聊天里向TA发起【开通情侣空间】邀请，TA同意接受后即可正式接入。</div>' +
        '</div>' +
        '<div id="ld-partners-list">' +
          (partners.length === 0 ? '<div style="text-align:center;color:#a08c93;padding:40px 0;">暂无可接入角色，请先在角色档案中创建</div>' : '') +
        '</div>' +
      '</div>'

    var listEl = page.querySelector('#ld-partners-list')
    if (!listEl) return

    partners.forEach(function(char) {
      var space = config.spaces[char.id]
      var isAccepted = space && space.status === 'accepted'

      var item = document.createElement('div')
      item.className = 'ld-char-item'
      item.innerHTML =
        '<div class="ld-char-left">' +
          '<img class="ld-char-ava" src="' + (char.avatar || 'img/wanwan.png') + '" alt="">' +
          '<div>' +
            '<div class="ld-char-name">' + (char.name || '未命名角色') + '</div>' +
            '<div class="ld-char-bio">' + (char.bio || char.prompt || '暂无介绍') + '</div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          (isAccepted
            ? '<button class="ld-status-tag" id="btn-enter-' + char.id + '"><i class="fa fa-heart" style="margin-right:4px;"></i>已开通 · 进入</button>'
            : '<button class="ld-invite-btn" id="btn-invite-' + char.id + '"><i class="fa fa-envelope-open-heart" style="margin-right:4px;"></i>开通邀请</button>'
          ) +
        '</div>'

      listEl.appendChild(item)

      if (isAccepted) {
        item.querySelector('#btn-enter-' + char.id).addEventListener('click', function() {
          config.activeCharId = char.id
          saveAllCoupleSpaces(config)
          _currentCoupleData = space
          renderMainLoveDiary(page, config)
        })
      } else {
        item.querySelector('#btn-invite-' + char.id).addEventListener('click', function() {
          handleSendCoupleInvitation(char, page, config)
        })
      }
    })
  }

  // ===== 发起开通邀请流程 =====
  async function handleSendCoupleInvitation(char, page, config) {
    var userConfirmed = confirm('是否立即向【' + char.name + '】在聊天中发送【开通情侣空间】邀请？')
    if (!userConfirmed) return

    window.toast && window.toast('正在向 ' + char.name + ' 发送开通邀请...')

    // 1. 查找或建立对话
    var chats = await db.chats.toArray()
    var targetChat = chats.find(function(c) { return c.charId === char.id })
    var chatId = targetChat ? targetChat.id : null

    if (!chatId) {
      chatId = await db.chats.add({
        charId: char.id,
        ownerUid: 1,
        lastMessage: '【情侣空间邀请】',
        updatedAt: Date.now(),
        unread: 0
      })
    }

    // 2. 发送用户邀请消息
    var inviteMsg = '💌【情侣空间邀请】我向你发起了开通专属情侣空间的邀请，你愿意和我一起记录属于我们的心动日常吗？'
    await db.messages.add({
      chatId: chatId,
      sender: 'user',
      content: inviteMsg,
      createdAt: Date.now(),
      type: 'text'
    })

    // 3. 角色根据人设自动同意接受
    var acceptReply = ''
    if (char.name.indexOf('弯弯') >= 0) {
      acceptReply = '呜哇！我愿意！我等这一刻好久好久啦~(〃\'▽\'〃)💕 从今天起，我们就有专属的情侣空间了！相册、日记、心愿单……我们一起把它填得满满的！❤️'
    } else if (char.name.indexOf('狗神') >= 0) {
      acceptReply = '哼……你这家伙，突然搞得这么正式干嘛？既然你这么诚恳地邀请了，本神仙就勉为其难答应吧。可别让我失望哦，我们的恋爱记，我可是会每天监督检查的！💖'
    } else {
      acceptReply = '收到你的邀请啦！很荣幸能与你开启专属情侣空间，以后的每一个纪念日，我们都要一起度过哦~ ✨'
    }

    await db.messages.add({
      chatId: chatId,
      sender: 'char',
      content: acceptReply,
      createdAt: Date.now() + 500,
      type: 'text'
    })

    await db.chats.update(chatId, {
      lastMessage: acceptReply,
      updatedAt: Date.now() + 500
    })

    // 4. 初始化情侣空间数据并设置为已接受
    var newSpaceData = createInitialCoupleData(char.id, char.name)
    config.spaces[char.id] = newSpaceData
    config.activeCharId = char.id
    await saveAllCoupleSpaces(config)
    _currentCoupleData = newSpaceData

    window.toast && window.toast('【' + char.name + '】已接受邀请，情侣空间开通成功！')

    // 5. 立即进入主界面
    setTimeout(function() {
      renderMainLoveDiary(page, config)
    }, 400)
  }

  // ===== 渲染情侣空间主界面 =====
  async function renderMainLoveDiary(page, config) {
    var chars = await db.characters.toArray()
    var partner = chars.find(function(c) { return c.id === _currentCoupleData.charId }) || { name: '心动伴侣', avatar: 'img/wanwan.png' }
    var userChar = chars.find(function(c) { return c.type === 'user' }) || { name: '我', avatar: 'img/ava-00.jpg' }
    var days = getDaysBetween(_currentCoupleData.anniversaryDate)

    page.innerHTML =
      '<div class="ld-banner" style="' + (_currentCoupleData.bannerBg ? 'background-image:url(' + _currentCoupleData.bannerBg + ');' : '') + '">' +
        '<div class="ld-banner-nav">' +
          '<button class="ld-nav-btn" id="ld-back-btn"><i class="fa fa-angle-left"></i></button>' +
          '<div style="font-weight:700;font-size:15px;color:#5a3e47;">恋爱记 · 情侣空间</div>' +
          '<button class="ld-nav-btn" id="ld-switch-partner-btn" title="切换角色"><i class="fa fa-users"></i></button>' +
        '</div>' +
        '<div class="ld-banner-body">' +
          '<div class="ld-avatar-wrap">' +
            '<img class="ld-avatar-img" src="' + (userChar.avatar || 'img/ava-00.jpg') + '" alt="">' +
            '<div class="ld-avatar-name">' + userChar.name + '</div>' +
          '</div>' +
          '<div class="ld-heart-center">' +
            '<i class="fa-solid fa-heart ld-heart-icon"></i>' +
            '<div class="ld-days-badge">相恋 ' + days + ' 天</div>' +
          '</div>' +
          '<div class="ld-avatar-wrap">' +
            '<img class="ld-avatar-img" src="' + (partner.avatar || 'img/wanwan.png') + '" alt="">' +
            '<div class="ld-avatar-name">' + partner.name + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ld-banner-foot">' +
          '<span id="ld-anniversary-text" style="cursor:pointer;" title="点击修改纪念日"><i class="fa fa-calendar-heart" style="margin-right:4px;"></i>纪念日：' + (_currentCoupleData.anniversaryDate || '今天') + '</span>' +
          '<span id="ld-quote-text" style="cursor:pointer;" title="点击修改情侣签名">' + (_currentCoupleData.quote || '愿每一秒心动，都有回音') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="ld-tabs-bar">' +
        '<div class="ld-tab-item' + (_activeTab === 'album' ? ' active' : '') + '" data-tab="album"><i class="fa fa-camera"></i>相册</div>' +
        '<div class="ld-tab-item' + (_activeTab === 'letters' ? ' active' : '') + '" data-tab="letters"><i class="fa fa-envelope"></i>情书</div>' +
        '<div class="ld-tab-item' + (_activeTab === 'diaries' ? ' active' : '') + '" data-tab="diaries"><i class="fa fa-book-heart"></i>日记</div>' +
        '<div class="ld-tab-item' + (_activeTab === 'whispers' ? ' active' : '') + '" data-tab="whispers"><i class="fa fa-comment-heart"></i>悄悄话</div>' +
        '<div class="ld-tab-item' + (_activeTab === 'wishes' ? ' active' : '') + '" data-tab="wishes"><i class="fa fa-sparkles"></i>心愿</div>' +
        '<div class="ld-tab-item' + (_activeTab === 'playlist' ? ' active' : '') + '" data-tab="playlist"><i class="fa fa-music"></i>歌单</div>' +
        '<div class="ld-tab-item' + (_activeTab === 'moments' ? ' active' : '') + '" data-tab="moments"><i class="fa fa-camera-retro"></i>动态</div>' +
      '</div>' +
      '<div class="ld-content" id="ld-content-area"></div>' +
      '<button class="ld-fab" id="ld-fab-btn"><i class="fa fa-plus"></i></button>'

    // 绑定基础事件
    page.querySelector('#ld-back-btn').addEventListener('click', function() {
      window.closePage('love-diary-page')
    })
    page.querySelector('#ld-switch-partner-btn').addEventListener('click', function() {
      renderPartnerSelect(page, config)
    })
    page.querySelector('#ld-anniversary-text').addEventListener('click', function() {
      var nextDate = prompt('修改恋爱纪念日（格式：YYYY-MM-DD）：', _currentCoupleData.anniversaryDate || '')
      if (nextDate && /^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
        _currentCoupleData.anniversaryDate = nextDate
        config.spaces[_currentCoupleData.charId] = _currentCoupleData
        saveAllCoupleSpaces(config)
        renderMainLoveDiary(page, config)
        window.toast && window.toast('纪念日已更新')
      }
    })
    page.querySelector('#ld-quote-text').addEventListener('click', function() {
      var nextQuote = prompt('修改今日情侣签名：', _currentCoupleData.quote || '')
      if (nextQuote) {
        _currentCoupleData.quote = nextQuote
        config.spaces[_currentCoupleData.charId] = _currentCoupleData
        saveAllCoupleSpaces(config)
        page.querySelector('#ld-quote-text').textContent = nextQuote
        window.toast && window.toast('签名已更新')
      }
    })

    // 绑定 Tab 切换
    var tabItems = page.querySelectorAll('.ld-tab-item')
    tabItems.forEach(function(item) {
      item.addEventListener('click', function() {
        tabItems.forEach(function(t) { t.classList.remove('active') })
        item.classList.add('active')
        _activeTab = item.dataset.tab
        renderTabContent(page, config, partner, userChar)
      })
    })

    // 绑定新建按钮
    page.querySelector('#ld-fab-btn').addEventListener('click', function() {
      handleFabAction(page, config, partner, userChar)
    })

    renderTabContent(page, config, partner, userChar)
  }

  // ===== 渲染各个 Tab 详细内容 =====
  function renderTabContent(page, config, partner, userChar) {
    var container = page.querySelector('#ld-content-area')
    if (!container) return

    switch (_activeTab) {
      case 'album':
        renderAlbumTab(container, config)
        break
      case 'letters':
        renderLettersTab(container, config, partner)
        break
      case 'diaries':
        renderDiariesTab(container, config, partner)
        break
      case 'whispers':
        renderWhispersTab(container, config, partner)
        break
      case 'wishes':
        renderWishesTab(container, config)
        break
      case 'playlist':
        renderPlaylistTab(container, config)
        break
      case 'moments':
        renderMomentsTab(container, config, partner, userChar)
        break
    }
  }

  // 1. 相册
  function renderAlbumTab(container, config) {
    var album = _currentCoupleData.album || []
    if (album.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#a08c93;padding:40px 0;"><i class="fa fa-images" style="font-size:36px;margin-bottom:10px;"></i><br>相册还没有照片，点击右下角 + 上传属于你们的第一张合照吧！</div>'
      return
    }
    var html = '<div class="ld-album-grid">'
    album.forEach(function(p) {
      html +=
        '<div class="ld-photo-card">' +
          '<img class="ld-photo-img" src="' + p.url + '" alt="" onclick="window.previewCouplePhoto && window.previewCouplePhoto(\'' + p.url + '\')">' +
          '<div class="ld-photo-info">' +
            '<div class="ld-photo-title">' + (p.title || '甜蜜瞬间') + '</div>' +
            '<div class="ld-photo-date">' + p.date + '</div>' +
          '</div>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // 2. 情书
  function renderLettersTab(container, config, partner) {
    var letters = _currentCoupleData.letters || []
    if (letters.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#a08c93;padding:40px 0;"><i class="fa fa-envelope-open-text" style="font-size:36px;margin-bottom:10px;"></i><br>还没有收到情书，点击右下角 + 给TA写一封心动情书吧</div>'
      return
    }
    var html = '<div>'
    letters.forEach(function(l) {
      html +=
        '<div class="ld-letter-card" onclick="window.readCoupleLetterModal && window.readCoupleLetterModal(\'' + l.id + '\')">' +
          '<div class="ld-letter-seal"><i class="fa fa-heart"></i></div>' +
          '<div class="ld-letter-title">' + l.title + '</div>' +
          '<div class="ld-letter-preview">' + l.content + '</div>' +
          '<div class="ld-letter-meta">' +
            '<span>来自于：' + (l.sender === 'user' ? '我' : partner.name) + '</span>' +
            '<span>' + l.date + '</span>' +
          '</div>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // 3. 日记
  function renderDiariesTab(container, config, partner) {
    var diaries = _currentCoupleData.diaries || []
    if (diaries.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#a08c93;padding:40px 0;"><i class="fa fa-book-heart" style="font-size:36px;margin-bottom:10px;"></i><br>还没有恋爱日记，点击右下角 + 记下今天的心情</div>'
      return
    }
    var html = '<div style="display:flex;flex-direction:column;gap:12px;">'
    diaries.forEach(function(d) {
      html +=
        '<div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-weight:700;font-size:15px;color:#4a2d36;">' + d.title + '</span>' +
            '<span style="font-size:11px;background:#ffeef1;color:#ff477e;padding:2px 8px;border-radius:10px;">' + (d.mood || '开心') + ' · ' + (d.weather || '晴') + '</span>' +
          '</div>' +
          '<div style="font-size:13.5px;line-height:1.65;color:#443338;margin-bottom:8px;">' + d.content + '</div>' +
          '<div style="font-size:11px;color:#a08c93;display:flex;justify-content:space-between;">' +
            '<span>记录者：' + (d.author === 'user' ? '我' : partner.name) + '</span>' +
            '<span>' + d.date + '</span>' +
          '</div>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // 4. 悄悄话
  function renderWhispersTab(container, config, partner) {
    var whispers = _currentCoupleData.whispers || []
    var html = '<div class="ld-whispers-grid">'
    whispers.forEach(function(w) {
      html +=
        '<div class="ld-whisper-card" style="background:' + (w.color || '#fff0f3') + ';">' +
          '<div style="color:#4a2d36;font-weight:500;">' + w.text + '</div>' +
          '<div style="font-size:10.5px;color:#8c6d75;display:flex;justify-content:space-between;margin-top:8px;">' +
            '<span>' + (w.author === 'user' ? '我的留言' : partner.name + '的小纸条') + '</span>' +
            '<span>' + w.date + '</span>' +
          '</div>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // 5. 心愿清单
  function renderWishesTab(container, config) {
    var wishes = _currentCoupleData.wishes || []
    var completedCount = wishes.filter(function(w) { return w.done }).length
    var html =
      '<div style="background:#fff;border-radius:14px;padding:14px 16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,0.03);display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-weight:700;font-size:15px;color:#4a2d36;">恋爱 100 件心愿清单</div>' +
          '<div style="font-size:12px;color:#a08c93;margin-top:2px;">已共同实现 ' + completedCount + ' / ' + wishes.length + ' 件小事</div>' +
        '</div>' +
        '<div style="font-size:24px;color:#ff477e;"><i class="fa fa-sparkles"></i></div>' +
      '</div>' +
      '<div>'

    wishes.forEach(function(wish, index) {
      html +=
        '<div class="ld-wish-item' + (wish.done ? ' done' : '') + '" onclick="window.toggleCoupleWish && window.toggleCoupleWish(' + index + ')">' +
          '<div class="ld-wish-check"><i class="fa fa-check" style="font-size:11px;"></i></div>' +
          '<div class="ld-wish-text">' + (index + 1) + '. ' + wish.text + '</div>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // 6. 我们的歌单
  function renderPlaylistTab(container, config) {
    var playlist = _currentCoupleData.playlist || []
    var html = '<div>'
    playlist.forEach(function(song) {
      var isPlaying = _playingSongId === song.id
      html +=
        '<div class="ld-song-item">' +
          '<div class="ld-song-left">' +
            '<img class="ld-song-cover" src="' + (song.cover || 'img/wanwan.png') + '" alt="">' +
            '<div>' +
              '<div class="ld-song-title">' + song.title + '</div>' +
              '<div class="ld-song-artist">' + song.artist + ' · ' + song.note + '</div>' +
            '</div>' +
          '</div>' +
          '<button class="ld-song-play-btn" onclick="window.toggleCoupleSongPlay && window.toggleCoupleSongPlay(\'' + song.id + '\')">' +
            '<i class="fa fa-' + (isPlaying ? 'pause' : 'play') + '"></i>' +
          '</button>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // 7. 动态
  function renderMomentsTab(container, config, partner, userChar) {
    var moments = _currentCoupleData.moments || []
    if (moments.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#a08c93;padding:40px 0;"><i class="fa fa-camera-retro" style="font-size:36px;margin-bottom:10px;"></i><br>还没有发布情侣动态，点击右下角 + 记录当下的小甜蜜</div>'
      return
    }
    var html = '<div>'
    moments.forEach(function(m, idx) {
      var isUser = m.author === 'user'
      var ava = isUser ? (userChar.avatar || 'img/ava-00.jpg') : (partner.avatar || 'img/wanwan.png')
      var name = isUser ? userChar.name : partner.name

      html +=
        '<div class="ld-moment-card">' +
          '<div class="ld-moment-head">' +
            '<img class="ld-moment-ava" src="' + ava + '" alt="">' +
            '<div>' +
              '<div class="ld-moment-author">' + name + '</div>' +
              '<div class="ld-moment-date">' + m.date + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ld-moment-body">' + m.content + '</div>' +
          (m.images && m.images.length > 0 ? '<div class="ld-moment-images">' + m.images.map(function(img) { return '<img class="ld-moment-img" src="' + img + '" alt="">' }).join('') + '</div>' : '') +
          '<div class="ld-moment-foot" onclick="window.likeCoupleMoment && window.likeCoupleMoment(' + idx + ')">' +
            '<i class="fa fa-heart"></i><span>' + (m.likes || 0) + '</span>' +
          '</div>' +
        '</div>'
    })
    html += '</div>'
    container.innerHTML = html
  }

  // ===== 悬浮按钮响应各 Tab 新增 =====
  function handleFabAction(page, config, partner, userChar) {
    var todayStr = new Date().toISOString().slice(0, 10)

    if (_activeTab === 'album') {
      if (window.showImagePicker) {
        window.showImagePicker(function(url) {
          var title = prompt('给这张合照起个好听的名字吧：', '心动合照') || '甜蜜瞬间'
          _currentCoupleData.album.unshift({
            id: 'p_' + Date.now(),
            title: title,
            url: url,
            date: todayStr,
            desc: ''
          })
          config.spaces[_currentCoupleData.charId] = _currentCoupleData
          saveAllCoupleSpaces(config)
          renderAlbumTab(page.querySelector('#ld-content-area'), config)
          window.toast && window.toast('照片已添加至情侣相册')
        })
      }
    } else if (_activeTab === 'letters') {
      var title = prompt('情书标题：', '致最爱的你')
      if (!title) return
      var content = prompt('写下你想对TA说的话：')
      if (!content) return
      _currentCoupleData.letters.unshift({
        id: 'l_' + Date.now(),
        title: title,
        sender: 'user',
        date: todayStr,
        content: content
      })
      config.spaces[_currentCoupleData.charId] = _currentCoupleData
      saveAllCoupleSpaces(config)
      renderLettersTab(page.querySelector('#ld-content-area'), config, partner)
      window.toast && window.toast('情书已放入信箱 💌')
    } else if (_activeTab === 'diaries') {
      var dTitle = prompt('日记标题：', '今天也是想你的一天')
      if (!dTitle) return
      var dContent = prompt('记录今天的恋爱点滴：')
      if (!dContent) return
      _currentCoupleData.diaries.unshift({
        id: 'd_' + Date.now(),
        title: dTitle,
        author: 'user',
        mood: '甜度爆表 💕',
        weather: '晴 ☀️',
        date: todayStr,
        content: dContent
      })
      config.spaces[_currentCoupleData.charId] = _currentCoupleData
      saveAllCoupleSpaces(config)
      renderDiariesTab(page.querySelector('#ld-content-area'), config, partner)
      window.toast && window.toast('日记已保存')
    } else if (_activeTab === 'whispers') {
      var text = prompt('在小纸条上留下一句悄悄话：')
      if (!text) return
      var colors = ['#ffe5ec', '#e0f4ff', '#fff3cd', '#e8f5e9', '#f3e5f5']
      var randomColor = colors[Math.floor(Math.random() * colors.length)]
      _currentCoupleData.whispers.unshift({
        id: 'w_' + Date.now(),
        text: text,
        author: 'user',
        color: randomColor,
        date: '刚刚'
      })
      config.spaces[_currentCoupleData.charId] = _currentCoupleData
      saveAllCoupleSpaces(config)
      renderWhispersTab(page.querySelector('#ld-content-area'), config, partner)
      window.toast && window.toast('悄悄话已贴在墙上 💬')
    } else if (_activeTab === 'wishes') {
      var wishText = prompt('新增共同心愿小事：')
      if (!wishText) return
      _currentCoupleData.wishes.push({
        id: 'wi_' + Date.now(),
        text: wishText,
        done: false
      })
      config.spaces[_currentCoupleData.charId] = _currentCoupleData
      saveAllCoupleSpaces(config)
      renderWishesTab(page.querySelector('#ld-content-area'), config)
      window.toast && window.toast('心愿已添加')
    } else if (_activeTab === 'playlist') {
      var songTitle = prompt('歌曲名称：')
      if (!songTitle) return
      var artist = prompt('演唱者：') || partner.name
      var note = prompt('歌曲心动小备注：') || '属于我们的旋律'
      _currentCoupleData.playlist.push({
        id: 's_' + Date.now(),
        title: songTitle,
        artist: artist,
        note: note,
        cover: partner.avatar || 'img/wanwan.png'
      })
      config.spaces[_currentCoupleData.charId] = _currentCoupleData
      saveAllCoupleSpaces(config)
      renderPlaylistTab(page.querySelector('#ld-content-area'), config)
      window.toast && window.toast('已加入我们的歌单 🎵')
    } else if (_activeTab === 'moments') {
      var mContent = prompt('发布一条甜蜜的情侣动态：')
      if (!mContent) return
      _currentCoupleData.moments.unshift({
        id: 'm_' + Date.now(),
        author: 'user',
        date: '刚刚',
        content: mContent,
        images: [],
        likes: 1
      })
      config.spaces[_currentCoupleData.charId] = _currentCoupleData
      saveAllCoupleSpaces(config)
      renderMomentsTab(page.querySelector('#ld-content-area'), config, partner, userChar)
      window.toast && window.toast('情侣动态已发布')
    }
  }

  // ===== 全局交互挂载 =====
  window.toggleCoupleWish = async function(index) {
    if (!_currentCoupleData || !_currentCoupleData.wishes[index]) return
    var item = _currentCoupleData.wishes[index]
    item.done = !item.done
    var config = await loadAllCoupleSpaces()
    config.spaces[_currentCoupleData.charId] = _currentCoupleData
    await saveAllCoupleSpaces(config)
    var page = document.getElementById('love-diary-page')
    if (page) renderWishesTab(page.querySelector('#ld-content-area'), config)
    window.toast && window.toast(item.done ? '太棒啦！又共同完成了一件心愿 🎉' : '心愿状态已重置')
  }

  window.toggleCoupleSongPlay = function(songId) {
    if (_playingSongId === songId) {
      _playingSongId = null
      window.toast && window.toast('音乐已暂停')
    } else {
      _playingSongId = songId
      window.toast && window.toast('正在播放专属情侣歌曲 🎵')
    }
    var page = document.getElementById('love-diary-page')
    if (page) renderPlaylistTab(page.querySelector('#ld-content-area'))
  }

  window.likeCoupleMoment = async function(index) {
    if (!_currentCoupleData || !_currentCoupleData.moments[index]) return
    _currentCoupleData.moments[index].likes = (_currentCoupleData.moments[index].likes || 0) + 1
    var config = await loadAllCoupleSpaces()
    config.spaces[_currentCoupleData.charId] = _currentCoupleData
    await saveAllCoupleSpaces(config)
    var page = document.getElementById('love-diary-page')
    if (page) {
      var foot = page.querySelectorAll('.ld-moment-foot')[index]
      if (foot) foot.innerHTML = '<i class="fa fa-heart"></i><span>' + _currentCoupleData.moments[index].likes + '</span>'
    }
    window.toast && window.toast('心动 +1 ❤️')
  }

  window.readCoupleLetterModal = function(letterId) {
    if (!_currentCoupleData) return
    var letter = _currentCoupleData.letters.find(function(l) { return l.id === letterId })
    if (!letter) return

    var modal = document.createElement('div')
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;'
    modal.innerHTML =
      '<div style="background:#fffdf9;border:1px solid #f6e8d8;border-radius:18px;max-width:380px;width:100%;padding:24px 20px;box-shadow:0 12px 36px rgba(0,0,0,0.25);position:relative;max-height:85vh;overflow-y:auto;">' +
        '<div style="text-align:center;font-size:18px;font-weight:700;color:#5c3b28;margin-bottom:12px;">' + letter.title + '</div>' +
        '<div style="font-size:11px;color:#a08c93;text-align:center;margin-bottom:16px;">日期：' + letter.date + '</div>' +
        '<div style="font-size:14px;line-height:1.8;color:#5a4336;white-space:pre-wrap;text-indent:2em;margin-bottom:24px;">' + letter.content + '</div>' +
        '<button id="ld-letter-close" style="width:100%;padding:10px;border-radius:20px;background:#ff5e7e;color:#fff;border:none;font-weight:600;font-size:14px;cursor:pointer;">收好信件</button>' +
      '</div>'
    document.body.appendChild(modal)
    modal.querySelector('#ld-letter-close').addEventListener('click', function() {
      modal.remove()
    })
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.remove()
    })
  }

  window.previewCouplePhoto = function(url) {
    var modal = document.createElement('div')
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
    modal.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:90vh;border-radius:8px;object-fit:contain;">'
    modal.addEventListener('click', function() { modal.remove() })
    document.body.appendChild(modal)
  }
})()
