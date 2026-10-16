import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';
import type { MemoryItem } from '../../types';

export const MemoryApp: React.FC = () => {
  const { closePage, characters, toast } = useApp();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<number>(0);
  const [tags, setTags] = useState('约定, 温暖');

  const loadMemories = async () => {
    const list = await db.memories.toArray();
    setMemories(list.sort((a, b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadMemories();
    if (characters.length > 0) {
      setSelectedCharId(characters[0].id || 0);
    }
  }, [characters]);

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) {
      toast('请填写记忆标题和内容');
      return;
    }
    const tagList = tags.split(/[,，\s]+/).filter(Boolean);
    await db.memories.add({
      charId: selectedCharId,
      title: title.trim(),
      content: content.trim(),
      tags: tagList,
      createdAt: Date.now(),
    });
    setTitle('');
    setContent('');
    setShowAddModal(false);
    toast('珍贵记忆已封装入库');
    loadMemories();
  };

  return (
    <div id="memory-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f8fa' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <button className="header-back" onClick={() => closePage('memory')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>记忆 · 时光碎片</span>
        <button className="btn-icon" onClick={() => setShowAddModal(true)}>
          <i className="fa fa-plus" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {memories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0aec0' }}>
            <i className="fa-brands fa-deezer" style={{ fontSize: '42px', marginBottom: '12px' }} />
            <div>暂无记忆碎片，点击右上角 + 记录专属回忆</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {memories.map((m) => {
              const char = characters.find((c) => c.id === m.charId);
              return (
                <div
                  key={m.id}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img
                        src={char?.avatar || 'img/wanwan.png'}
                        alt=""
                        style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#2d3748' }}>{m.title}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#a0aec0' }}>
                      {new Date(m.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: '#4a5568', lineHeight: '1.6', margin: '6px 0 10px' }}>
                    {m.content}
                  </div>

                  {m.tags && m.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {m.tags.map((t, idx) => (
                        <span key={idx} style={{ fontSize: '10px', color: '#319795', background: '#e6fffa', padding: '2px 6px', borderRadius: '4px' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Memory Modal */}
      {showAddModal && (
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
          onClick={() => setShowAddModal(false)}
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
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '14px' }}>收录一段记忆</div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>关联角色</label>
              <select
                value={selectedCharId}
                onChange={(e) => setSelectedCharId(Number(e.target.value))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>记忆标题</label>
              <input
                type="text"
                className="input-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：初遇弯弯的那天"
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>具体内容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="记录那一刻的心情与对话细节..."
                rows={4}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>标签 (用逗号分隔)</label>
              <input
                type="text"
                className="input-field"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-pill"
                onClick={() => setShowAddModal(false)}
                style={{ flex: 1, padding: '10px', background: '#edf2f7', color: '#4a5568', borderRadius: '8px', border: 'none' }}
              >
                取消
              </button>
              <button
                className="btn-pill"
                onClick={handleAdd}
                style={{ flex: 1, padding: '10px', background: '#319795', color: '#fff', borderRadius: '8px', border: 'none' }}
              >
                保存记忆
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
