import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';
import type { Character, ChatSession, ChatMessage, Moment } from '../../types';

export const WeChatApp: React.FC = () => {
  const { closePage, characters, currentUser, setCurrentUser, toast, pickImage, settings } = useApp();
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'moments' | 'me'>('chats');
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [newMomentText, setNewMomentText] = useState('');
  const [newMomentImage, setNewMomentImage] = useState('');
  const [showNewMomentModal, setShowNewMomentModal] = useState(false);
  const [showRedPacketModal, setShowRedPacketModal] = useState(false);
  const [redPacketAmount, setRedPacketAmount] = useState('5.20');
  const [redPacketNote, setRedPacketNote] = useState('恭喜发财，大吉大利');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat sessions
  const loadChats = async () => {
    const list = await db.chats.toArray();
    setChats(list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  };

  // Load moments
  const loadMoments = async () => {
    const list = await db.moments.toArray();
    setMoments(list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  };

  useEffect(() => {
    loadChats();
    loadMoments();
  }, []);

  // When activeChat changes, load messages
  useEffect(() => {
    if (!activeChat?.id) {
      setMessages([]);
      return;
    }
    const loadMsgs = async () => {
      const msgs = await db.messages.where('chatId').equals(activeChat.id!).sortBy('createdAt');
      setMessages(msgs);
      // Mark as read
      if (activeChat.unread) {
        await db.chats.update(activeChat.id!, { unread: 0 });
        setChats((prev) =>
          prev.map((c) => (c.id === activeChat.id ? { ...c, unread: 0 } : c))
        );
      }
    };
    loadMsgs();
  }, [activeChat]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeChar = activeChat ? characters.find((c) => c.id === activeChat.charId) : null;

  // Send message
  const handleSendMessage = async (customContent?: string, type: ChatMessage['type'] = 'text', meta?: any) => {
    const text = customContent || inputText.trim();
    if (!text && type === 'text') return;
    if (!activeChat?.id) return;

    const newMsg: ChatMessage = {
      chatId: activeChat.id,
      sender: 'user',
      content: text,
      createdAt: Date.now(),
      type,
      meta,
    };

    const msgId = await db.messages.add(newMsg);
    newMsg.id = msgId as number;
    setMessages((prev) => [...prev, newMsg]);
    if (!customContent) setInputText('');

    await db.chats.update(activeChat.id, {
      lastMessage: type === 'redpacket' ? '[微信红包]' : type === 'image' ? '[图片]' : text,
      updatedAt: Date.now(),
    });
    loadChats();
  };

  // AI Reply Trigger
  const handleAiReply = async () => {
    if (!activeChat?.id || !activeChar || isGenerating) return;
    setIsGenerating(true);

    try {
      let replyText = '';

      // Check if user has configured API
      if (settings.apiKey && settings.apiBaseUrl) {
        try {
          const prompt = activeChar.prompt || `你是${activeChar.name}，一个温暖真诚的角色。`;
          const history = messages.slice(-10).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content,
          }));

          const response = await fetch(`${settings.apiBaseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${settings.apiKey}`,
            },
            body: JSON.stringify({
              model: settings.apiModel || 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: prompt },
                ...history,
              ],
              temperature: settings.temperature || 0.8,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            replyText = data.choices?.[0]?.message?.content || '';
          }
        } catch (apiErr) {
          console.warn('API call failed, fallback to local persona generator', apiErr);
        }
      }

      // If no reply generated yet, use smart local persona generator
      if (!replyText) {
        await new Promise((r) => setTimeout(r, 800));
        const lastUserMsg = messages.filter((m) => m.sender === 'user').pop()?.content || '';

        if (activeChar.name === '弯弯') {
          const replies = [
            `我也一直在想你呢！看到你的消息超级开心~ (〃'▽'〃)`,
            `今天过得怎么样？累不累呀，要不要我给你揉揉肩？`,
            `只要是和你聊天，时间总是过得特别快✨`,
            `嗯嗯！无论发生什么事，弯弯都会一直在你身边的哦。`,
            `给你比心！记得要多喝水，按时吃饭，不能偷偷饿肚子哦。`,
          ];
          replyText = replies[Math.floor(Math.random() * replies.length)];
          if (lastUserMsg.includes('想你')) {
            replyText = '听到你说想我，心跳都漏了一拍……我也超级超级想你！随时随地都在想！❤️';
          } else if (lastUserMsg.includes('累') || lastUserMsg.includes('难过')) {
            replyText = '抱抱你~ 辛苦啦！今天所有不开心的事情都交给我吃掉吧，今晚做个甜甜的梦。';
          }
        } else if (activeChar.name === '小狗神') {
          const replies = [
            `哼，你这家伙……突然这么说，以为我会感动吗？`,
            `才没有特意在等你的消息呢！我只是刚好看到而已。`,
            `知道了知道了，今天就破例多陪你聊一会儿好了。`,
            `笨蛋，对自己好一点，别总是让我操心。`,
          ];
          replyText = replies[Math.floor(Math.random() * replies.length)];
        } else {
          replyText = `${activeChar.greeting || '收到你的消息了！'} ${activeChar.name}会一直守护在你身边。`;
        }
      }

      // Insert AI message
      const charMsg: ChatMessage = {
        chatId: activeChat.id,
        sender: 'char',
        content: replyText,
        createdAt: Date.now(),
        type: 'text',
      };
      const cId = await db.messages.add(charMsg);
      charMsg.id = cId as number;
      setMessages((prev) => [...prev, charMsg]);

      await db.chats.update(activeChat.id, {
        lastMessage: replyText,
        updatedAt: Date.now(),
      });
      loadChats();
    } catch (e) {
      toast('回复生成失败，请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  };

  // Start chat with character
  const handleStartChatWithChar = async (char: Character) => {
    if (!char.id) return;
    let existing = chats.find((c) => c.charId === char.id);
    if (!existing) {
      const newChatId = await db.chats.add({
        charId: char.id,
        ownerUid: currentUser?.id,
        lastMessage: char.greeting || '已建立对话',
        updatedAt: Date.now(),
        unread: 0,
      });
      existing = {
        id: newChatId as number,
        charId: char.id,
        ownerUid: currentUser?.id,
        lastMessage: char.greeting || '已建立对话',
        updatedAt: Date.now(),
        unread: 0,
      };
      // Send greeting
      if (char.greeting) {
        await db.messages.add({
          chatId: newChatId as number,
          sender: 'char',
          content: char.greeting,
          createdAt: Date.now(),
          type: 'text',
        });
      }
      loadChats();
    }
    setActiveChat(existing);
  };

  // Send red packet
  const handleConfirmRedPacket = () => {
    if (!redPacketAmount) return;
    handleSendMessage(redPacketNote || '恭喜发财，大吉大利', 'redpacket', {
      amount: redPacketAmount,
      note: redPacketNote,
      isOpened: false,
    });
    setShowRedPacketModal(false);
  };

  // Post moment
  const handlePostMoment = async () => {
    if (!newMomentText.trim() && !newMomentImage) return;
    const newMoment: Moment = {
      charId: currentUser?.id || 0,
      authorName: currentUser?.name || '我',
      avatar: currentUser?.avatar || 'img/ava-00.jpg',
      content: newMomentText.trim(),
      images: newMomentImage ? [newMomentImage] : [],
      likes: [],
      comments: [],
      createdAt: Date.now(),
    };
    await db.moments.add(newMoment);
    setNewMomentText('');
    setNewMomentImage('');
    setShowNewMomentModal(false);
    loadMoments();
    toast('已发布朋友圈');
  };

  // Like moment
  const handleLikeMoment = async (m: Moment) => {
    if (!m.id) return;
    const myName = currentUser?.name || '我';
    const hasLiked = m.likes?.includes(myName);
    const nextLikes = hasLiked
      ? m.likes?.filter((n) => n !== myName) || []
      : [...(m.likes || []), myName];

    await db.moments.update(m.id, { likes: nextLikes });
    setMoments((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, likes: nextLikes } : item))
    );
  };

  // Active Chat Room View
  if (activeChat && activeChar) {
    return (
      <div className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#ededed' }}>
        {/* Header */}
        <div
          className="page-header"
          style={{
            background: '#ededed',
            borderBottom: '1px solid #dcdcdc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
          }}
        >
          <button className="header-back" onClick={() => setActiveChat(null)}>
            <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#111' }}>{activeChar.name}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>在线 · 随时陪伴</div>
          </div>
          <button className="btn-icon" onClick={() => setShowSettingsDrawer((p) => !p)}>
            <i className="fa fa-ellipsis-h" />
          </button>
        </div>

        {/* Messages list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
          <div style={{ textAlign: 'center', margin: '8px 0 16px' }}>
            <span
              style={{
                fontSize: '11px',
                color: '#999',
                background: 'rgba(0,0,0,0.05)',
                padding: '3px 8px',
                borderRadius: '4px',
              }}
            >
              与 {activeChar.name} 的对话加密保护中
            </span>
          </div>

          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const avatar = isUser
              ? currentUser?.avatar || 'img/ava-00.jpg'
              : activeChar.avatar || 'img/wanwan.png';

            return (
              <div
                key={msg.id || Math.random()}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  marginBottom: '14px',
                  gap: '8px',
                }}
              >
                <img
                  src={avatar}
                  alt="avatar"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />

                {/* Message Bubble */}
                <div style={{ maxWidth: '70%' }}>
                  {msg.type === 'image' ? (
                    <img
                      src={msg.meta?.url || msg.content}
                      alt="chat-pic"
                      style={{
                        maxWidth: '200px',
                        maxHeight: '200px',
                        borderRadius: '8px',
                        display: 'block',
                      }}
                    />
                  ) : msg.type === 'redpacket' ? (
                    <div
                      style={{
                        background: '#fa9d3b',
                        color: '#fff',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                      }}
                      onClick={() => toast(`红包已领取：￥${msg.meta?.amount || '5.20'}`)}
                    >
                      <i className="fa fa-envelope-open-text" style={{ fontSize: '28px', color: '#ffea79' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{msg.meta?.note || msg.content}</div>
                        <div style={{ fontSize: '11px', opacity: 0.9 }}>￥{msg.meta?.amount || '5.20'}</div>
                      </div>
                    </div>
                  ) : msg.type === 'voice' ? (
                    <div
                      style={{
                        background: isUser ? '#95ec69' : '#ffffff',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                      }}
                      onClick={() => toast('播放语音 (已保活)')}
                    >
                      <i className="fa fa-wifi" style={{ transform: 'rotate(90deg)', fontSize: '12px' }} />
                      <span style={{ fontSize: '13px' }}>{msg.meta?.duration || 3}" 语音</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        background: isUser ? '#95ec69' : '#ffffff',
                        color: '#111',
                        padding: '10px 13px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        wordBreak: 'break-word',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isGenerating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}>
              <img
                src={activeChar.avatar || 'img/wanwan.png'}
                alt=""
                style={{ width: '36px', height: '36px', borderRadius: '6px' }}
              />
              <div
                style={{
                  background: '#fff',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#718096',
                }}
              >
                <i className="fa fa-spinner fa-spin" style={{ marginRight: '6px' }} />
                {activeChar.name} 正在输入...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div
          style={{
            background: '#f7f7f7',
            borderTop: '1px solid #dcdcdc',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            className="btn-icon"
            title="发送图片"
            onClick={() => pickImage((url) => handleSendMessage(url, 'image', { url }))}
          >
            <i className="fa fa-image" style={{ color: '#666' }} />
          </button>

          <button
            className="btn-icon"
            title="发红包"
            onClick={() => setShowRedPacketModal(true)}
          >
            <i className="fa fa-coins" style={{ color: '#e53e3e' }} />
          </button>

          <input
            type="text"
            className="input-field"
            placeholder="发消息..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            style={{
              flex: 1,
              background: '#fff',
              borderRadius: '6px',
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              fontSize: '14px',
            }}
          />

          <button
            className="btn-pill"
            onClick={handleAiReply}
            disabled={isGenerating}
            title="请求AI角色回复"
            style={{
              background: '#4a90e2',
              color: '#fff',
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <i className="fa fa-wand-magic-sparkles" />
            <span>AI</span>
          </button>

          <button
            className="btn-pill"
            onClick={() => handleSendMessage()}
            style={{
              background: '#07c160',
              color: '#fff',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '6px',
            }}
          >
            发送
          </button>
        </div>

        {/* Red Packet Modal */}
        {showRedPacketModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setShowRedPacketModal(false)}
          >
            <div
              style={{
                background: '#ea5f5f',
                color: '#fff',
                width: '280px',
                borderRadius: '16px',
                padding: '24px 20px',
                textAlign: 'center',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>发红包给 {activeChar.name}</div>
              <input
                type="number"
                value={redPacketAmount}
                onChange={(e) => setRedPacketAmount(e.target.value)}
                placeholder="金额 (元)"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  marginBottom: '10px',
                  fontSize: '16px',
                  textAlign: 'center',
                }}
              />
              <input
                type="text"
                value={redPacketNote}
                onChange={(e) => setRedPacketNote(e.target.value)}
                placeholder="恭喜发财，大吉大利"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  marginBottom: '18px',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowRedPacketModal(false)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmRedPacket}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    background: '#f8d75b',
                    color: '#c23934',
                    fontWeight: 600,
                    border: 'none',
                  }}
                >
                  塞钱发红包
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Character Drawer */}
        {showSettingsDrawer && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '80%',
              maxWidth: '320px',
              background: '#fff',
              zIndex: 999,
              boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
              padding: '20px',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontWeight: 600, fontSize: '16px' }}>聊天详情</span>
              <button className="btn-icon" onClick={() => setShowSettingsDrawer(false)}>
                <i className="fa fa-times" />
              </button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <img
                src={activeChar.avatar || 'img/wanwan.png'}
                alt=""
                style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <div style={{ fontWeight: 600, marginTop: '8px' }}>{activeChar.name}</div>
              <div style={{ fontSize: '12px', color: '#718096' }}>{activeChar.bio || '专属虚拟伴侣'}</div>
            </div>
            <div style={{ fontSize: '13px', color: '#4a5568', lineHeight: '1.6', background: '#f7fafc', padding: '12px', borderRadius: '8px' }}>
              <strong>设定提词：</strong>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>{activeChar.prompt || '默认伴侣提示词'}</div>
            </div>
            <button
              className="btn-pill"
              onClick={async () => {
                await db.messages.where('chatId').equals(activeChat.id!).delete();
                setMessages([]);
                toast('聊天记录已清空');
                setShowSettingsDrawer(false);
              }}
              style={{
                width: '100%',
                marginTop: '24px',
                background: '#fed7d7',
                color: '#c53030',
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
              }}
            >
              清空聊天记录
            </button>
          </div>
        )}
      </div>
    );
  }

  // WeChat Main Navigation (Chats / Contacts / Moments / Me)
  return (
    <div id="wechat-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f7f7' }}>
      {/* Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#ededed',
          borderBottom: '1px solid #dcdcdc',
        }}
      >
        <button className="header-back" onClick={() => closePage('wechat')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>
          {activeTab === 'chats' ? '微信' : activeTab === 'contacts' ? '通讯录' : activeTab === 'moments' ? '发现 · 朋友圈' : '我'}
        </span>
        {activeTab === 'moments' ? (
          <button className="btn-icon" onClick={() => setShowNewMomentModal(true)}>
            <i className="fa fa-camera" />
          </button>
        ) : (
          <div style={{ width: '24px' }} />
        )}
      </div>

      {/* Content based on tab */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Tab 1: Chats List */}
        {activeTab === 'chats' && (
          <div>
            {chats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a0aec0' }}>
                <i className="fa fa-comments" style={{ fontSize: '40px', marginBottom: '12px' }} />
                <div>暂无会话，请前往通讯录发起聊天</div>
              </div>
            ) : (
              chats.map((c) => {
                const char = characters.find((ch) => ch.id === c.charId);
                if (!char) return null;
                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveChat(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: '#fff',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ position: 'relative', marginRight: '12px' }}>
                      <img
                        src={char.avatar || 'img/wanwan.png'}
                        alt={char.name}
                        style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }}
                      />
                      {!!c.unread && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            background: '#e53e3e',
                            color: '#fff',
                            fontSize: '10px',
                            padding: '1px 5px',
                            borderRadius: '10px',
                          }}
                        >
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c' }}>{char.name}</span>
                        <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#718096',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.lastMessage || '已连接'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Contacts */}
        {activeTab === 'contacts' && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ padding: '0 16px 8px', fontSize: '12px', color: '#718096', fontWeight: 600 }}>
              角色列表 ({characters.length})
            </div>
            {characters.map((char) => (
              <div
                key={char.id}
                onClick={() => handleStartChatWithChar(char)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 16px',
                  background: '#fff',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={char.avatar || 'img/wanwan.png'}
                  alt={char.name}
                  style={{ width: '42px', height: '42px', borderRadius: '8px', marginRight: '12px', objectFit: 'cover' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#2d3748' }}>{char.name}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: char.type === 'char' ? '#e2e8f0' : '#feebc8',
                        color: char.type === 'char' ? '#4a5568' : '#c05621',
                      }}
                    >
                      {char.type.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '2px' }}>{char.bio || '暂无介绍'}</div>
                </div>
                <button
                  style={{
                    background: '#07c160',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  发消息
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Moments (朋友圈) */}
        {activeTab === 'moments' && (
          <div>
            {/* Cover header */}
            <div
              style={{
                height: '180px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                position: 'relative',
                marginBottom: '40px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: '-25px',
                  right: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                  {currentUser?.name || '我'}
                </span>
                <img
                  src={currentUser?.avatar || 'img/ava-00.jpg'}
                  alt=""
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '10px',
                    border: '2px solid #fff',
                    objectFit: 'cover',
                  }}
                />
              </div>
            </div>

            {/* Moments Feed */}
            <div style={{ padding: '0 16px' }}>
              {moments.map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid #edf2f7', paddingBottom: '16px' }}>
                  <img
                    src={m.avatar || 'img/wanwan.png'}
                    alt=""
                    style={{ width: '42px', height: '42px', borderRadius: '6px', objectFit: 'cover' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#576b95' }}>{m.authorName}</div>
                    <div style={{ fontSize: '14px', color: '#2d3748', margin: '6px 0', lineHeight: '1.5' }}>{m.content}</div>
                    {m.images && m.images.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' }}>
                        {m.images.map((imgUrl, i) => (
                          <img
                            key={i}
                            src={imgUrl}
                            alt=""
                            style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '4px' }}
                          />
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => handleLikeMoment(m)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: m.likes?.includes(currentUser?.name || '我') ? '#e53e3e' : '#718096',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                        }}
                      >
                        <i className={`fa${m.likes?.includes(currentUser?.name || '我') ? 's' : 'r'} fa-heart`} />
                        <span>{m.likes?.length || 0}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Me Profile */}
        {activeTab === 'me' && (
          <div style={{ padding: '20px 16px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <img
                src={currentUser?.avatar || 'img/ava-00.jpg'}
                alt=""
                style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '16px', color: '#1a202c' }}>{currentUser?.name || '我'}</div>
                <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>微信号：wanwan_owner</div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
              <div
                onClick={() => pickImage((url) => {
                  if (currentUser?.id) {
                    db.characters.update(currentUser.id, { avatar: url });
                    setCurrentUser({ ...currentUser, avatar: url });
                    toast('头像已更新');
                  }
                })}
                style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <span>更换头像</span>
                <i className="fa fa-angle-right" style={{ color: '#a0aec0' }} />
              </div>
              <div
                onClick={() => {
                  const name = prompt('请输入新昵称：', currentUser?.name || '');
                  if (name && currentUser?.id) {
                    db.characters.update(currentUser.id, { name });
                    setCurrentUser({ ...currentUser, name });
                    toast('昵称已更新');
                  }
                }}
                style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <span>修改昵称</span>
                <i className="fa fa-angle-right" style={{ color: '#a0aec0' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Moment Modal */}
      {showNewMomentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowNewMomentModal(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '90%',
              maxWidth: '360px',
              borderRadius: '14px',
              padding: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '14px' }}>发布新朋友圈</div>
            <textarea
              value={newMomentText}
              onChange={(e) => setNewMomentText(e.target.value)}
              placeholder="这一刻的想法..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '14px',
                marginBottom: '12px',
              }}
            />
            {newMomentImage && (
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
                <img src={newMomentImage} alt="" style={{ width: '80px', height: '80px', borderRadius: '6px', objectFit: 'cover' }} />
                <button
                  onClick={() => setNewMomentImage('')}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: '#e53e3e',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn-icon"
                onClick={() => pickImage((url) => setNewMomentImage(url))}
                title="添加图片"
              >
                <i className="fa fa-image" style={{ fontSize: '18px', color: '#4a90e2' }} />
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn-pill"
                  onClick={() => setShowNewMomentModal(false)}
                  style={{ background: '#edf2f7', color: '#4a5568' }}
                >
                  取消
                </button>
                <button
                  className="btn-pill"
                  onClick={handlePostMoment}
                  style={{ background: '#07c160', color: '#fff' }}
                >
                  发表
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WeChat Bottom Tab Bar */}
      <div
        style={{
          height: '56px',
          background: '#f7f7f7',
          borderTop: '1px solid #dcdcdc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
        }}
      >
        <button
          onClick={() => setActiveTab('chats')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'chats' ? '#07c160' : '#718096',
            cursor: 'pointer',
          }}
        >
          <i className="fa fa-comment" style={{ fontSize: '18px' }} />
          <span style={{ fontSize: '11px', marginTop: '2px' }}>微信</span>
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'contacts' ? '#07c160' : '#718096',
            cursor: 'pointer',
          }}
        >
          <i className="fa fa-address-book" style={{ fontSize: '18px' }} />
          <span style={{ fontSize: '11px', marginTop: '2px' }}>通讯录</span>
        </button>
        <button
          onClick={() => setActiveTab('moments')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'moments' ? '#07c160' : '#718096',
            cursor: 'pointer',
          }}
        >
          <i className="fa fa-compass" style={{ fontSize: '18px' }} />
          <span style={{ fontSize: '11px', marginTop: '2px' }}>朋友圈</span>
        </button>
        <button
          onClick={() => setActiveTab('me')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'me' ? '#07c160' : '#718096',
            cursor: 'pointer',
          }}
        >
          <i className="fa fa-user" style={{ fontSize: '18px' }} />
          <span style={{ fontSize: '11px', marginTop: '2px' }}>我</span>
        </button>
      </div>
    </div>
  );
};
