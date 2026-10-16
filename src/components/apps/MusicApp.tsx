import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const MusicApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [progress, setProgress] = useState(25);

  const playlist = [
    {
      title: 'Always Online',
      artist: '林俊杰 / 弯弯伴奏版',
      cover: 'img/wanwan.png',
      lyrics: [
        '变色黄昏 一个人在回想',
        '晴天微风 阳光照亮远方',
        '和你one to one 愛開始擴散',
        '我们连接在世界的某一个角落',
        '准备好了 无论多远都有我在',
      ],
    },
    {
      title: '想见你 想见你 想见你',
      artist: '八三夭 / 弯弯机特别版',
      cover: 'img/ava-01.jpg',
      lyrics: [
        '想见你 只想见你 未来过去 我只想见你',
        '穿越了 千个万个 时间线里 人海里相依',
        '不放弃 只要能再一次与你相遇',
      ],
    },
    {
      title: '小狗神的摇篮曲',
      artist: '小狗神',
      cover: 'img/ava-02.jpg',
      lyrics: [
        '（哼，才不是唱给你听的呢）',
        '闭上眼睛 晚安',
        '做个好梦 别怕孤单',
      ],
    },
  ];

  const track = playlist[currentTrackIndex];

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div id="music-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #2b2b2b 0%, #121212 100%)', color: '#fff' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'transparent' }}>
        <button className="header-back" onClick={() => closePage('music')} style={{ color: '#fff' }}>
          <i className="fa fa-angle-left" style={{ fontSize: '22px' }} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>{track.title}</div>
          <div style={{ fontSize: '12px', color: '#a0aec0' }}>{track.artist}</div>
        </div>
        <button className="btn-icon" onClick={() => toast('已添加到我的喜欢')} style={{ color: '#fff' }}>
          <i className="fa fa-heart" />
        </button>
      </div>

      {/* Main Turntable Vinyl View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {/* Turntable Disc */}
        <div
          style={{
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #333 0%, #111 70%, #000 100%)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isPlaying ? 'spin 12s linear infinite' : 'none',
            border: '6px solid #222',
            marginBottom: '32px',
          }}
        >
          <img
            src={track.cover}
            alt=""
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '4px solid #111',
            }}
          />
        </div>

        {/* Lyrics Snippet */}
        <div style={{ textAlign: 'center', minHeight: '80px', padding: '0 20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: '#e2e8f0', marginBottom: '8px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {track.lyrics[Math.floor((progress / 100) * track.lyrics.length)] || track.lyrics[0]}
          </div>
          <div style={{ fontSize: '12px', color: '#718096' }}>网易云音乐 · 正在播放</div>
        </div>
      </div>

      {/* Controls Bar */}
      <div style={{ padding: '20px 24px 36px', background: 'rgba(0,0,0,0.2)' }}>
        {/* Scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>1:20</span>
          <div
            style={{
              flex: 1,
              height: '4px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '2px',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const p = ((e.clientX - rect.left) / rect.width) * 100;
              setProgress(p);
            }}
          >
            <div style={{ width: `${progress}%`, height: '100%', background: '#e53e3e', transition: 'width 0.2s' }} />
          </div>
          <span style={{ fontSize: '11px', color: '#a0aec0' }}>4:30</span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          <button
            onClick={() => setCurrentTrackIndex((p) => (p > 0 ? p - 1 : playlist.length - 1))}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa fa-backward-step" />
          </button>

          <button
            onClick={() => setIsPlaying((p) => !p)}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#e53e3e',
              color: '#fff',
              border: 'none',
              fontSize: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(229, 62, 62, 0.4)',
            }}
          >
            <i className={`fa fa-${isPlaying ? 'pause' : 'play'}`} style={{ marginLeft: isPlaying ? 0 : '3px' }} />
          </button>

          <button
            onClick={() => setCurrentTrackIndex((p) => (p < playlist.length - 1 ? p + 1 : 0))}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa fa-forward-step" />
          </button>
        </div>
      </div>
    </div>
  );
};
