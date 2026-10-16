import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';

export const SettingsApp: React.FC = () => {
  const { closePage, currentUser, settings, updateSettings, wallpaper, setWallpaper, toast, pickImage } = useApp();
  const [activeSection, setActiveSection] = useState<'main' | 'api' | 'appearance' | 'data' | 'about'>('main');

  // Form states for API settings
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [apiModel, setApiModel] = useState(settings.apiModel);
  const [temperature, setTemperature] = useState(settings.temperature);

  const handleSaveApi = async () => {
    await updateSettings({
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      apiModel: apiModel.trim(),
      temperature: Number(temperature),
    });
    toast('API 设置已保存');
    setActiveSection('main');
  };

  const handleExportData = async () => {
    try {
      const config = await db.config.toArray();
      const characters = await db.characters.toArray();
      const chats = await db.chats.toArray();
      const messages = await db.messages.toArray();
      const moments = await db.moments.toArray();
      const lorebook = await db.lorebook.toArray();
      const finance = await db.finance.toArray();

      const backup = {
        version: 'wanwan-react-v1',
        timestamp: Date.now(),
        data: {
          config,
          characters,
          chats,
          messages,
          moments,
          lorebook,
          finance,
        },
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
      const a = document.createElement('a');
      a.href = dataStr;
      a.download = `wanwan_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast('备份文件已导出');
    } catch (err) {
      toast('导出备份失败');
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const payload = JSON.parse(ev.target?.result as string);
        if (payload?.data) {
          const { characters, chats, messages, moments, lorebook, finance } = payload.data;
          if (Array.isArray(characters)) await db.characters.bulkPut(characters);
          if (Array.isArray(chats)) await db.chats.bulkPut(chats);
          if (Array.isArray(messages)) await db.messages.bulkPut(messages);
          if (Array.isArray(moments)) await db.moments.bulkPut(moments);
          if (Array.isArray(lorebook)) await db.lorebook.bulkPut(lorebook);
          if (Array.isArray(finance)) await db.finance.bulkPut(finance);
          toast('数据恢复成功，请刷新');
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (err) {
        toast('备份文件解析失败');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = async () => {
    if (confirm('警告：此操作将清空所有聊天记录、角色和设置，无法恢复！是否确定？')) {
      await db.delete();
      toast('数据已清空，正在重载...');
      setTimeout(() => window.location.reload(), 1200);
    }
  };

  return (
    <div id="settings-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f2f2f7' }}>
      {/* Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f2f2f7',
          borderBottom: '1px solid #e5e5ea',
        }}
      >
        <button
          className="header-back"
          onClick={() => {
            if (activeSection !== 'main') setActiveSection('main');
            else closePage('settings');
          }}
        >
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>
          {activeSection === 'main'
            ? '设置'
            : activeSection === 'api'
            ? 'API 配置'
            : activeSection === 'appearance'
            ? '个性化与外观'
            : activeSection === 'data'
            ? '数据与备份'
            : '关于本机'}
        </span>
        <div style={{ width: '24px' }} />
      </div>

      {/* Main Settings List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {activeSection === 'main' && (
          <div>
            {/* Account Card */}
            <div
              style={{
                background: '#fff',
                borderRadius: '14px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <img
                src={currentUser?.avatar || 'img/ava-00.jpg'}
                alt=""
                style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '16px', color: '#1c1c1e' }}>{currentUser?.name || '弯弯'}</div>
                <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '2px' }}>Apple Account, iCloud, and more</div>
              </div>
              <i className="fa fa-angle-right" style={{ color: '#c7c7cc' }} />
            </div>

            {/* General Section */}
            <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
              <div
                onClick={() => setActiveSection('api')}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderBottom: '1px solid #e5e5ea',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#5856d6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <i className="fa fa-key" style={{ fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, fontSize: '15px', color: '#1c1c1e' }}>API 配置</div>
                <span style={{ fontSize: '13px', color: '#8e8e93' }}>{settings.apiKey ? '已配置' : '未配置'}</span>
                <i className="fa fa-angle-right" style={{ color: '#c7c7cc' }} />
              </div>

              <div
                onClick={() => setActiveSection('appearance')}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderBottom: '1px solid #e5e5ea',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ff9500', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <i className="fa fa-paint-brush" style={{ fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, fontSize: '15px', color: '#1c1c1e' }}>壁纸与外观</div>
                <i className="fa fa-angle-right" style={{ color: '#c7c7cc' }} />
              </div>

              <div
                onClick={() => setActiveSection('data')}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#34c759', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <i className="fa fa-database" style={{ fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, fontSize: '15px', color: '#1c1c1e' }}>数据与备份</div>
                <i className="fa fa-angle-right" style={{ color: '#c7c7cc' }} />
              </div>
            </div>

            {/* System Info Section */}
            <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden' }}>
              <div
                onClick={() => setActiveSection('about')}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#8e8e93', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <i className="fa fa-info-circle" style={{ fontSize: '14px' }} />
                </div>
                <div style={{ flex: 1, fontSize: '15px', color: '#1c1c1e' }}>关于本机</div>
                <span style={{ fontSize: '13px', color: '#8e8e93' }}>弯弯机 v1.0.0</span>
                <i className="fa fa-angle-right" style={{ color: '#c7c7cc' }} />
              </div>
            </div>
          </div>
        )}

        {/* Sub-section: API Config */}
        {activeSection === 'api' && (
          <div style={{ background: '#fff', borderRadius: '14px', padding: '16px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#718096', fontWeight: 500 }}>API Base URL (端点)</label>
              <input
                type="text"
                className="input-field"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="例如：https://api.openai.com"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#718096', fontWeight: 500 }}>API Key (密钥)</label>
              <input
                type="password"
                className="input-field"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#718096', fontWeight: 500 }}>Model (模型名称)</label>
              <input
                type="text"
                className="input-field"
                value={apiModel}
                onChange={(e) => setApiModel(e.target.value)}
                placeholder="例如：gpt-4o-mini 或 gemini-1.5-flash"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '6px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', color: '#718096', fontWeight: 500 }}>Temperature (创造度): {temperature}</label>
              <input
                type="range"
                min="0.1"
                max="1.5"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: '6px' }}
              />
            </div>

            <button
              className="btn-pill"
              onClick={handleSaveApi}
              style={{ width: '100%', padding: '12px', background: '#5856d6', color: '#fff', borderRadius: '10px', fontWeight: 600, border: 'none' }}
            >
              保存配置
            </button>
          </div>
        )}

        {/* Sub-section: Appearance */}
        {activeSection === 'appearance' && (
          <div style={{ background: '#fff', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>桌面壁纸设置</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                className="btn-pill"
                onClick={() => pickImage((url) => setWallpaper(url))}
                style={{ flex: 1, padding: '10px', background: '#2d3748', color: '#fff', borderRadius: '8px', border: 'none' }}
              >
                选择自定义壁纸
              </button>
              {wallpaper && (
                <button
                  className="btn-pill"
                  onClick={() => setWallpaper('')}
                  style={{ padding: '10px 14px', background: '#edf2f7', color: '#e53e3e', borderRadius: '8px', border: 'none' }}
                >
                  恢复默认
                </button>
              )}
            </div>

            <div style={{ fontWeight: 600, marginBottom: '12px' }}>图标文字颜色</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['#3a3a3a', '#ffffff', '#1a202c', '#d53f8c', '#3182ce'].map((color) => (
                <div
                  key={color}
                  onClick={() => updateSettings({ desktopLabelColor: color })}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: color,
                    border: settings.desktopLabelColor === color ? '3px solid #007aff' : '1px solid #cbd5e0',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sub-section: Data & Backup */}
        {activeSection === 'data' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#fff', borderRadius: '14px', padding: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>备份与导出</div>
              <div style={{ fontSize: '12px', color: '#8e8e93', marginBottom: '14px' }}>
                将所有角色、聊天、世界书和账单导出为 JSON 备份文件。
              </div>
              <button
                className="btn-pill"
                onClick={handleExportData}
                style={{ width: '100%', padding: '10px', background: '#34c759', color: '#fff', borderRadius: '8px', border: 'none', fontWeight: 600 }}
              >
                导出完整备份 (JSON)
              </button>
            </div>

            <div style={{ background: '#fff', borderRadius: '14px', padding: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>导入与恢复</div>
              <div style={{ fontSize: '12px', color: '#8e8e93', marginBottom: '14px' }}>
                从之前导出的备份文件中恢复所有数据。
              </div>
              <label
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '10px',
                  background: '#007aff',
                  color: '#fff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                选择备份文件恢复
                <input type="file" accept=".json" onChange={handleImportData} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ background: '#fff', borderRadius: '14px', padding: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#ff3b30', marginBottom: '6px' }}>危险区域</div>
              <div style={{ fontSize: '12px', color: '#8e8e93', marginBottom: '14px' }}>
                清空当前设备上的所有存储数据并重置为初始状态。
              </div>
              <button
                className="btn-pill"
                onClick={handleClearAllData}
                style={{ width: '100%', padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', border: 'none', fontWeight: 600 }}
              >
                清空所有本地数据
              </button>
            </div>
          </div>
        )}

        {/* Sub-section: About */}
        {activeSection === 'about' && (
          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px 20px', textAlign: 'center' }}>
            <img src="img/wanwan.png" alt="弯弯" style={{ width: '72px', height: '72px', borderRadius: '18px', marginBottom: '12px' }} />
            <div style={{ fontWeight: 600, fontSize: '18px' }}>弯弯机</div>
            <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '2px' }}>版本 1.0.0 (React Rewrite)</div>

            <div style={{ margin: '24px 0', textAlign: 'left', fontSize: '13px', color: '#4a5568', lineHeight: '1.6', background: '#f7fafc', padding: '14px', borderRadius: '10px' }}>
              <p>弯弯机是一个纯浏览器端运行的虚拟手机伴侣系统。</p>
              <p style={{ marginTop: '6px' }}>数据保存在本地浏览器中，支持角色扮演、世界书、互动小说与桌面小组件。</p>
              <p style={{ marginTop: '6px', color: '#718096' }}>特别鸣谢：月酱 ｜ 小厌厌</p>
            </div>

            <div style={{ fontSize: '11px', color: '#a0aec0' }}>
              Copyright © 2026 WanWan Studio. All rights reserved.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
