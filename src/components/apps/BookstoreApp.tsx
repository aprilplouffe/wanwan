import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  content: string[];
}

export const BookstoreApp: React.FC = () => {
  const { closePage } = useApp();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [fontSize, setFontSize] = useState(15);
  const [theme, setTheme] = useState<'light' | 'sepia' | 'dark'>('sepia');

  const books: Book[] = [
    {
      id: '1',
      title: '在时间尽头呼唤你的名字',
      author: '月酱',
      cover: 'img/blank_img1.jpg',
      content: [
        '第一章 · 银杏落下的午后',
        '风掠过长椅的时候，弯弯把头靠在我的肩上。',
        '世界的声音在这一刻仿佛都退远了。只有秋叶落地的沙沙声，和彼此平稳的呼吸。',
        '“如果有一天时间重置了，你还会记得我吗？”她小声问。',
        '我握紧了她的手。阳光把我们的影子拉得很长很长。',
        '“无论重来多少次，只要听到你的声音，我就会第一时间找到你。”',
      ],
    },
    {
      id: '2',
      title: '小狗神的人间观察日记',
      author: '小狗神',
      cover: 'img/blank_img2.jpg',
      content: [
        '【观察第103天】',
        '那家伙今天又工作到了深夜。明明告诉过她不要喝那么多浓咖啡。',
        '本神仙只好施展了一点小小的瞌睡魔法。看着她趴在桌上睡着的样子……算了，本座勉为其难帮她把毛毯盖上吧。',
        '才不是心疼她呢，只是感冒了会传染给我而已！',
      ],
    },
  ];

  if (selectedBook) {
    const bg = theme === 'dark' ? '#1a1a1a' : theme === 'sepia' ? '#fbf0d9' : '#ffffff';
    const color = theme === 'dark' ? '#d1d5db' : theme === 'sepia' ? '#5f4b32' : '#1f2937';

    return (
      <div style={{ position: 'fixed', inset: 0, background: bg, color, display: 'flex', flexDirection: 'column', zIndex: 9999 }}>
        {/* Reader Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#e5d8b8'}` }}>
          <button onClick={() => setSelectedBook(null)} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '18px', cursor: 'pointer' }}>
            <i className="fa fa-angle-left" /> 返回书架
          </button>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{selectedBook.title}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setFontSize((s) => Math.max(12, s - 1))} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '12px' }}>A-</button>
            <button onClick={() => setFontSize((s) => Math.min(22, s + 1))} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '14px' }}>A+</button>
            <button onClick={() => setTheme((t) => (t === 'sepia' ? 'dark' : t === 'dark' ? 'light' : 'sepia'))} style={{ background: 'none', border: 'none', color: 'inherit' }}>
              <i className="fa fa-circle-half-stroke" />
            </button>
          </div>
        </div>

        {/* Reader Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', lineHeight: '2.0', fontSize: `${fontSize}px` }}>
          {selectedBook.content.map((p, i) => (
            <p key={i} style={{ marginBottom: '16px', textIndent: '2em' }}>{p}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div id="bookstore-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f8f9fa' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <button className="header-back" onClick={() => closePage('bookstore')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>Readen · 书店</span>
        <div style={{ width: '24px' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: '#2d3748', marginBottom: '12px' }}>我的书架</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {books.map((b) => (
            <div
              key={b.id}
              onClick={() => setSelectedBook(b)}
              style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                cursor: 'pointer',
              }}
            >
              <img src={b.cover} alt={b.title} style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#2d3748', lineHeight: '1.4' }}>{b.title}</div>
              <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>{b.author}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
