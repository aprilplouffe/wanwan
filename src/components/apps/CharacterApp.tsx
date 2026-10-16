import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';
import type { Character, RoleType } from '../../types';

export const CharacterApp: React.FC = () => {
  const { closePage, characters, refreshCharacters, toast, pickImage } = useApp();
  const [filter, setFilter] = useState<'all' | RoleType>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states for creating/editing character
  const [name, setName] = useState('');
  const [type, setType] = useState<RoleType>('char');
  const [avatar, setAvatar] = useState('img/wanwan.png');
  const [bio, setBio] = useState('');
  const [group, setGroup] = useState('默认');
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState('');

  const groups = Array.from(new Set(characters.map((c) => c.group).filter(Boolean))) as string[];

  const filteredCharacters = characters.filter((c) => {
    if (filter !== 'all' && c.type !== filter) return false;
    if (selectedGroup && c.group !== selectedGroup) return false;
    return true;
  });

  const handleOpenCreate = () => {
    setEditingChar(null);
    setName('');
    setType('char');
    setAvatar('img/wanwan.png');
    setBio('');
    setGroup('默认');
    setPrompt('');
    setGreeting('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Character) => {
    setEditingChar(c);
    setName(c.name);
    setType(c.type);
    setAvatar(c.avatar || 'img/wanwan.png');
    setBio(c.bio || '');
    setGroup(c.group || '默认');
    setPrompt(c.prompt || '');
    setGreeting(c.greeting || '');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast('请输入角色名称');
      return;
    }

    if (editingChar?.id) {
      await db.characters.update(editingChar.id, {
        name: name.trim(),
        type,
        avatar,
        bio,
        group,
        prompt,
        greeting,
      });
      toast('角色已更新');
    } else {
      await db.characters.add({
        name: name.trim(),
        type,
        avatar,
        bio,
        group,
        prompt,
        greeting,
      });
      toast('角色已创建');
    }
    await refreshCharacters();
    setIsModalOpen(false);
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (confirm('确认删除此角色？')) {
      await db.characters.delete(id);
      await refreshCharacters();
      toast('角色已删除');
      setIsModalOpen(false);
    }
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(characters, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `wanwan_characters_${Date.now()}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const list = JSON.parse(ev.target?.result as string);
        if (Array.isArray(list)) {
          for (const item of list) {
            delete item.id;
            await db.characters.add(item);
          }
          await refreshCharacters();
          toast(`成功导入 ${list.length} 个角色`);
        }
      } catch (err) {
        toast('导入文件解析失败');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div id="character-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f8fa' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <button className="header-back" onClick={() => closePage('character')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>角色档案</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-icon" onClick={handleExport} title="导出角色">
            <i className="fa fa-download" />
          </button>
          <label className="btn-icon" style={{ cursor: 'pointer' }} title="导入角色">
            <i className="fa fa-upload" />
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button className="btn-icon" onClick={handleOpenCreate} title="新建角色">
            <i className="fa fa-plus" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="char-filter-tabs" style={{ display: 'flex', background: '#fff', padding: '8px 16px', gap: '8px', borderBottom: '1px solid #edf2f7' }}>
        {(['all', 'char', 'npc', 'user'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`filter-tab ${filter === t ? 'active' : ''}`}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: 'none',
              background: filter === t ? '#2d3748' : '#edf2f7',
              color: filter === t ? '#fff' : '#4a5568',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t === 'all' ? '全部' : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Group Chips */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', padding: '8px 16px', overflowX: 'auto', background: '#fff' }}>
          <button
            onClick={() => setSelectedGroup('')}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              border: 'none',
              fontSize: '11px',
              background: selectedGroup === '' ? '#cbd5e0' : '#f7fafc',
              cursor: 'pointer',
            }}
          >
            全部分组
          </button>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '11px',
                background: selectedGroup === g ? '#cbd5e0' : '#f7fafc',
                cursor: 'pointer',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Character List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {filteredCharacters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#a0aec0' }}>
            <i className="fa fa-folder-open" style={{ fontSize: '40px', marginBottom: '12px' }} />
            <div>暂无角色，点击右上角 + 新建</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
            {filteredCharacters.map((c) => (
              <div
                key={c.id}
                onClick={() => handleOpenEdit(c)}
                style={{
                  background: '#fff',
                  borderRadius: '14px',
                  padding: '14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={c.avatar || 'img/wanwan.png'}
                  alt={c.name}
                  style={{ width: '52px', height: '52px', borderRadius: '12px', objectFit: 'cover' }}
                />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c' }}>{c.name}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: c.type === 'char' ? '#e2e8f0' : '#feebc8',
                        color: c.type === 'char' ? '#4a5568' : '#c05621',
                        fontWeight: 600,
                      }}
                    >
                      {c.type.toUpperCase()}
                    </span>
                    {c.group && (
                      <span style={{ fontSize: '11px', color: '#718096', background: '#edf2f7', padding: '1px 6px', borderRadius: '4px' }}>
                        {c.group}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#718096', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.bio || c.prompt || '暂无设定描述'}
                  </div>
                </div>
                <i className="fa fa-angle-right" style={{ color: '#cbd5e0' }} />
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
              <span>{editingChar ? '编辑角色' : '新建角色'}</span>
              {editingChar && (
                <button
                  onClick={() => handleDelete(editingChar.id)}
                  style={{ background: 'none', border: 'none', color: '#e53e3e', fontSize: '13px', cursor: 'pointer' }}
                >
                  删除
                </button>
              )}
            </div>

            {/* Avatar picker */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <img
                src={avatar}
                alt=""
                style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover', cursor: 'pointer', border: '2px dashed #cbd5e0' }}
                onClick={() => pickImage((url) => setAvatar(url))}
              />
              <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>点击修改头像</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>角色名称</label>
                <input
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：弯弯"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>角色类型</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as RoleType)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                >
                  <option value="char">CHAR (主角)</option>
                  <option value="npc">NPC (配角)</option>
                  <option value="user">USER (用户)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>分组标签</label>
                <input
                  type="text"
                  className="input-field"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="例如：默认、朋友、工作"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>简短介绍</label>
                <input
                  type="text"
                  className="input-field"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="一句话介绍"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>初始问候语</label>
                <input
                  type="text"
                  className="input-field"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  placeholder="进入对话时的第一句话"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#718096' }}>Prompt 提示词 / 性格设定</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="详细设定该角色的语气、性格、喜好..."
                  rows={4}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px', fontSize: '13px' }}
                />
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
                style={{ flex: 1, padding: '10px', background: '#2d3748', color: '#fff', borderRadius: '8px', border: 'none' }}
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
