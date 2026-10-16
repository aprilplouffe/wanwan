import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface DiaryEntry {
  id: string;
  date: string;
  weather: string;
  mood: string;
  content: string;
}

export const ICityApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [entries, setEntries] = useState<DiaryEntry[]>([
    {
      id: '1',
      date: '2026年10月15日 · 星期四',
      weather: '晴朗 ☀️',
      mood: '平静 ☕',
      content: '今天在窗边看了一下午的书。外面的银杏树叶已经开始变黄，给弯弯倒了一碗温水。生活慢慢地走，这样就很好。',
    },
    {
      id: '2',
      date: '2026年10月14日 · 星期三',
      weather: '小雨 🌧️',
      mood: '温暖 🌸',
      content: '雨滴敲打在玻璃上，屋子里弥漫着热红茶的香气。和小狗神聊了很久，虽然他嘴上不饶人，但还是默默把伞递了过来。',
    },
  ]);

  const [isWriting, setIsWriting] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('开心 🌟');

  const handleSave = () => {
    if (!content.trim()) return;
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 晴朗`;
    const newEntry: DiaryEntry = {
      id: String(Date.now()),
      date: dateStr,
      weather: '微风 🍃',
      mood,
      content: content.trim(),
    };
    setEntries([newEntry, ...entries]);
    setContent('');
    setIsWriting(false);
    toast('日记已收录于 iCity');
  };

  return (
    <div id="icity-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#fafaf9', color: '#44403c' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e7e5e4', background: '#fff' }}>
        <button className="header-back" onClick={() => closePage('icity')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px', letterSpacing: '1px' }}>iCity · 我的日记</span>
        <button className="btn-icon" onClick={() => setIsWriting(true)}>
          <i className="fa fa-pen-nib" style={{ color: '#78716c' }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {entries.map((item) => (
          <div
            key={item.id}
            style={{
              background: '#fff',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              border: '1px solid #f5f5f4',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', color: '#a8a29e', fontWeight: 500 }}>{item.date}</span>
              <span style={{ fontSize: '11px', background: '#f5f5f4', padding: '2px 8px', borderRadius: '10px', color: '#78716c' }}>
                {item.mood}
              </span>
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#292524' }}>
              {item.content}
            </div>
          </div>
        ))}
      </div>

      {/* Write Modal */}
      {isWriting && (
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
          onClick={() => setIsWriting(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '90%',
              maxWidth: '360px',
              borderRadius: '16px',
              padding: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '14px' }}>记录今天的心情</div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="在这里记下今天发生的事情与心绪..."
              rows={5}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: '14px', marginBottom: '14px', outline: 'none' }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e7e5e4', fontSize: '12px' }}
              >
                <option value="开心 🌟">开心 🌟</option>
                <option value="平静 ☕">平静 ☕</option>
                <option value="想念 💭">想念 💭</option>
                <option value="充实 📚">充实 📚</option>
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-pill"
                  onClick={() => setIsWriting(false)}
                  style={{ background: '#f5f5f4', color: '#78716c' }}
                >
                  取消
                </button>
                <button
                  className="btn-pill"
                  onClick={handleSave}
                  style={{ background: '#44403c', color: '#fff' }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
