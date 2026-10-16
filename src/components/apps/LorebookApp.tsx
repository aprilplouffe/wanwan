import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';
import type { LorebookEntry } from '../../types';

export const LorebookApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState<LorebookEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [key, setKey] = useState('');
  const [triggersText, setTriggersText] = useState('');
  const [content, setContent] = useState('');
  const [enabled, setEnabled] = useState(true);

  const loadEntries = async () => {
    const list = await db.lorebook.toArray();
    setEntries(list);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm) return true;
    return (
      e.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.triggers.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase())) ||
      e.content.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleOpenCreate = () => {
    setEditingEntry(null);
    setKey('');
    setTriggersText('');
    setContent('');
    setEnabled(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: LorebookEntry) => {
    setEditingEntry(entry);
    setKey(entry.key);
    setTriggersText(entry.triggers.join(', '));
    setContent(entry.content);
    setEnabled(entry.enabled);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!key.trim()) {
      toast('请输入词条名称');
      return;
    }

    const triggers = triggersText
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingEntry?.id) {
      await db.lorebook.update(editingEntry.id, {
        key: key.trim(),
        triggers,
        content: content.trim(),
        enabled,
      });
      toast('世界书词条已更新');
    } else {
      await db.lorebook.add({
        key: key.trim(),
        triggers,
        content: content.trim(),
        enabled,
      });
      toast('世界书词条已创建');
    }
    await loadEntries();
    setIsModalOpen(false);
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (confirm('确认删除此词条？')) {
      await db.lorebook.delete(id);
      await loadEntries();
      toast('词条已删除');
      setIsModalOpen(false);
    }
  };

  const handleToggle = async (e: React.MouseEvent, entry: LorebookEntry) => {
    e.stopPropagation();
    if (!entry.id) return;
    const nextState = !entry.enabled;
    await db.lorebook.update(entry.id, { enabled: nextState });
    setEntries((prev) =>
      prev.map((item) => (item.id === entry.id ? { ...item, enabled: nextState } : item))
    );
  };

  return (
    <div id="lorebook-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f8fa' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <button className="header-back" onClick={() => closePage('lorebook')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>世界书</span>
        <button className="btn-icon" onClick={handleOpenCreate} title="新建词条">
          <i className="fa fa-plus" />
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <div style={{ position: 'relative' }}>
          <i className="fa fa-search" style={{ position: 'absolute', left: '12px', top: '10px', color: '#a0aec0' }} />
          <input
            type="text"
            className="input-field"
            placeholder="搜索词条名称、触发词或内容..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Entries List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {filteredEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0aec0' }}>
            <i className="fa fa-book" style={{ fontSize: '40px', marginBottom: '12px' }} />
            <div>暂无词条，点击右上角 + 创建世界设定</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredEntries.map((item) => (
              <div
                key={item.id}
                onClick={() => handleOpenEdit(item)}
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  padding: '14px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  cursor: 'pointer',
                  borderLeft: item.enabled ? '4px solid #38a169' : '4px solid #cbd5e0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c' }}>{item.key}</span>
                  <button
                    onClick={(e) => handleToggle(e, item)}
                    style={{
                      border: 'none',
                      background: item.enabled ? '#c6f6d5' : '#edf2f7',
                      color: item.enabled ? '#22543d' : '#718096',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {item.enabled ? '生效中' : '已停用'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {item.triggers.map((t, idx) => (
                    <span key={idx} style={{ background: '#edf2f7', color: '#4a5568', fontSize: '11px', padding: '1px 6px', borderRadius: '4px' }}>
                      #{t}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: '13px', color: '#718096', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      {isModalOpen && (
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '90%',
              maxWidth: '380px',
              borderRadius: '16px',
              padding: '20px',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingEntry ? '编辑世界书词条' : '新建世界书词条'}</span>
              {editingEntry && (
                <button
                  onClick={() => handleDelete(editingEntry.id)}
                  style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                >
                  删除
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>词条标题</label>
                <input
                  type="text"
                  className="input-field"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="例如：世界观、特殊设定"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>触发关键词 (用逗号或空格分隔)</label>
                <input
                  type="text"
                  className="input-field"
                  value={triggersText}
                  onChange={(e) => setTriggersText(e.target.value)}
                  placeholder="例如：魔法, 学院, 契约"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>设定内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="详细设定内容，当对话中触发关键词时将注入到提示词中..."
                  rows={5}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="enabled-check"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <label htmlFor="enabled-check" style={{ fontSize: '13px', color: '#2d3748' }}>启用此词条</label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                className="btn-pill"
                onClick={() => setIsModalOpen(false)}
                style={{ flex: 1, padding: '10px', background: '#edf2f7', color: '#4a5568', borderRadius: '8px', border: 'none' }}
              >
                取消
              </button>
              <button
                className="btn-pill"
                onClick={handleSave}
                style={{ flex: 1, padding: '10px', background: '#38a169', color: '#fff', borderRadius: '8px', border: 'none' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
