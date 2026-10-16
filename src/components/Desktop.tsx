import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { PageId } from '../types';

export const Desktop: React.FC = () => {
  const { openPage, wallpaper, settings, toast } = useApp();
  const [currentPage, setCurrentPage] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${h}:${m}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const page1Icons: { id: PageId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'wechat',
      label: '微信',
      icon: <i className="fa-brands fa-weixin" style={{ color: '#07c160' }} />,
    },
    {
      id: 'character',
      label: '角色档案',
      icon: <i className="fa-solid fa-folder-closed" style={{ color: '#4a90e2' }} />,
    },
    {
      id: 'lorebook',
      label: '世界书',
      icon: <i className="fa-solid fa-earth-americas" style={{ color: '#38a169' }} />,
    },
    {
      id: 'phone',
      label: '查看记录',
      icon: <i className="fa-brands fa-chrome" style={{ color: '#ea4335' }} />,
    },
    {
      id: 'music',
      label: '网易云音乐',
      icon: <i className="fa-solid fa-music" style={{ color: '#e53e3e' }} />,
    },
    {
      id: 'icity',
      label: 'iCity',
      icon: <i className="fa-solid fa-feather-pointed" style={{ color: '#805ad5' }} />,
    },
    {
      id: 'x',
      label: 'X',
      icon: <i className="fa-brands fa-x-twitter" style={{ color: '#1a202c' }} />,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      icon: <i className="fa-brands fa-instagram" style={{ color: '#d53f8c' }} />,
    },
    {
      id: 'miss-you',
      label: '想见你',
      icon: <i className="fa-solid fa-fire-flame-curved" style={{ color: '#e53e3e' }} />,
    },
    {
      id: 'memory',
      label: '记忆',
      icon: <i className="fa-brands fa-deezer" style={{ color: '#319795' }} />,
    },
    {
      id: 'wallet',
      label: '钱迹',
      icon: <i className="fa-brands fa-apple-pay" style={{ color: '#dd6b20' }} />,
    },
    {
      id: 'taobao',
      label: '淘宝',
      icon: <i className="fa-solid fa-bag-shopping" style={{ color: '#ff5000' }} />,
    },
    {
      id: 'bookstore',
      label: 'Readen',
      icon: <i className="fa-solid fa-book-open" style={{ color: '#4a5568' }} />,
    },
    {
      id: 'yumyum',
      label: 'YumYum',
      icon: <i className="fa-solid fa-drumstick-bite" style={{ color: '#ed8936' }} />,
    },
    {
      id: 'anyDoor',
      label: '任意门',
      icon: <i className="fa-solid fa-cubes" style={{ color: '#667eea' }} />,
    },
    {
      id: 'gameHall',
      label: '游戏大厅',
      icon: <i className="fa-solid fa-dice" style={{ color: '#9f7aea' }} />,
    },
  ];

  const page2Icons: { id: PageId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'tutorial',
      label: '教程',
      icon: (
        <img
          src="img/wanwan.png"
          alt="教程"
          style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}
        />
      ),
    },
    {
      id: 'avg',
      label: '橙光',
      icon: <i className="fa-solid fa-gamepad" style={{ color: '#ed64a6' }} />,
    },
    {
      id: 'terminal',
      label: '终端',
      icon: <i className="fa-solid fa-terminal" style={{ color: '#2d3748' }} />,
    },
  ];

  const dockIcons: { id: PageId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'settings',
      label: '设置',
      icon: <i className="fa-solid fa-gear" style={{ color: '#718096' }} />,
    },
    {
      id: 'iscreens',
      label: 'iScreens',
      icon: <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#805ad5' }} />,
    },
    {
      id: 'wechat',
      label: '信息',
      icon: <i className="fa-solid fa-comment-dots" style={{ color: '#48bb78' }} />,
    },
  ];

  const handleIconClick = (id: PageId) => {
    if (isEditing) return;
    if (id === 'iscreens') {
      setIsEditing((prev) => !prev);
      toast('点击完成可保存桌面布局');
      return;
    }
    openPage(id);
  };

  const bgStyle: React.CSSProperties = wallpaper
    ? { backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(180deg, #f8f9fa 0%, #edf2f7 100%)' };

  return (
    <div id="home-page" className={isEditing ? 'desktop-editing' : ''} style={bgStyle}>
      {/* Edit bar */}
      {isEditing && (
        <div className="desktop-edit-bar" style={{ display: 'flex' }}>
          <span>桌面编辑模式</span>
          <button onClick={() => setIsEditing(false)}>完成</button>
        </div>
      )}

      {/* iOS Status Bar */}
      <div
        className="status-bar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 24px 2px',
          fontSize: '13px',
          fontWeight: 600,
          color: settings.desktopLabelColor || '#333',
        }}
      >
        <span>{currentTime || '12:00'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="fa fa-wifi" style={{ fontSize: '11px' }} />
          <i className="fa fa-battery-full" style={{ fontSize: '13px' }} />
        </div>
      </div>

      {/* Desktop Viewport */}
      <div className="desktop-viewport" style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 80px' }}>
        {/* Top Widget */}
        <div
          className="top-widget"
          style={{
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            padding: '12px 16px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
            cursor: 'pointer',
          }}
          onClick={() => openPage('wechat')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="img/ava-00.jpg"
              alt="Avatar"
              style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a202c' }}>@WanWan.zzz</div>
              <div style={{ fontSize: '12px', color: '#718096' }}>某年某月某个星期几 · 随身伴侣</div>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>刚刚</span>
        </div>

        {/* Widgets Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          {/* Music Widget */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(16px)',
              borderRadius: '20px',
              padding: '14px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '130px',
              cursor: 'pointer',
            }}
            onClick={() => openPage('music')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src="img/wanwan.png"
                alt="Music Cover"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  animation: musicPlaying ? 'spin 6s linear infinite' : 'none',
                }}
              />
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  Always Online
                </div>
                <div style={{ fontSize: '11px', color: '#718096' }}>WanWan FM</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#4a5568', fontStyle: 'italic', margin: '6px 0' }}>
              "和你one to one愛開始擴散"
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#a0aec0' }}>1:28 / 5:20</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMusicPlaying((prev) => !prev);
                  toast(musicPlaying ? '音乐已暂停' : '正在播放音乐');
                }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#1a202c',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <i className={`fa fa-${musicPlaying ? 'pause' : 'play'}`} style={{ fontSize: '10px' }} />
              </button>
            </div>
          </div>

          {/* Today's Mood / Couple Widget */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(16px)',
              borderRadius: '20px',
              padding: '14px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '130px',
              cursor: 'pointer',
            }}
            onClick={() => openPage('miss-you')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#e53e3e' }}>
                <i className="fa fa-heart" style={{ marginRight: '4px' }} />
                想见你
              </span>
              <span style={{ fontSize: '11px', color: '#a0aec0' }}>520 天</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <img
                src="img/wanwan.png"
                alt="W1"
                style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #fff' }}
              />
              <span style={{ fontSize: '16px' }}>❤️</span>
              <img
                src="img/ava-01.jpg"
                alt="W2"
                style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #fff' }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#718096', textAlign: 'center' }}>
              你在左边，我靠近右
            </div>
          </div>
        </div>

        {/* Icons Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px 10px',
            marginBottom: '20px',
          }}
        >
          {(currentPage === 0 ? page1Icons : page2Icons).map((iconItem) => (
            <div
              key={iconItem.id}
              onClick={() => handleIconClick(iconItem.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.88)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease',
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
                onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {iconItem.icon}
              </div>
              <span
                style={{
                  marginTop: '6px',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  color: settings.desktopLabelColor || '#3a3a3a',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 3px rgba(255,255,255,0.8)',
                }}
              >
                {iconItem.label}
              </span>
            </div>
          ))}
        </div>

        {/* Page Dots Indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '10px 0' }}>
          {[0, 1].map((p) => (
            <div
              key={p}
              onClick={() => setCurrentPage(p)}
              style={{
                width: p === currentPage ? '18px' : '6px',
                height: '6px',
                borderRadius: '3px',
                background: p === currentPage ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.18)',
                transition: 'all 0.25s ease',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      {/* Dock Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          right: '16px',
          height: '76px',
          background: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: '26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
        }}
      >
        {dockIcons.map((dock) => (
          <div
            key={dock.id}
            onClick={() => handleIconClick(dock.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '15px',
                background: 'rgba(255, 255, 255, 0.92)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s ease',
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {dock.icon}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
