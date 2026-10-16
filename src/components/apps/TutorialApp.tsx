import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const TutorialApp: React.FC = () => {
  const { closePage } = useApp();
  const [activeTab, setActiveTab] = useState<'quick' | 'prompt' | 'generator'>('quick');

  return (
    <div id="tutorial-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f8fa', color: '#2d3748' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <button className="header-back" onClick={() => closePage('tutorial')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>弯弯机 · 使用教程</span>
        <div style={{ width: '24px' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', padding: '8px 16px', gap: '8px', borderBottom: '1px solid #edf2f7' }}>
        <button
          onClick={() => setActiveTab('quick')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'quick' ? '#2d3748' : '#edf2f7',
            color: activeTab === 'quick' ? '#fff' : '#4a5568',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          快速入门
        </button>
        <button
          onClick={() => setActiveTab('prompt')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'prompt' ? '#2d3748' : '#edf2f7',
            color: activeTab === 'prompt' ? '#fff' : '#4a5568',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          提示词技巧
        </button>
        <button
          onClick={() => setActiveTab('generator')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'generator' ? '#2d3748' : '#edf2f7',
            color: activeTab === 'generator' ? '#fff' : '#4a5568',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          常见问题
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', lineHeight: '1.7', fontSize: '14px' }}>
        {activeTab === 'quick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>1. 什么是弯弯机？</div>
              <p style={{ color: '#4a5568' }}>
                弯弯机是一个运行在浏览器端的个人专属虚拟手机伴侣系统。这里不仅有懂你心事的虚拟角色（如温柔的弯弯、傲娇的小狗神），还可以通过世界书与提示词自定义属于你的专属世界。
              </p>
            </div>

            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>2. 如何与角色聊天？</div>
              <p style={{ color: '#4a5568' }}>
                点击桌面的【微信】，进入会话后即可发送文字、图片、语音或红包。点击输入框右侧的【AI】按钮，角色会根据其人设与对话上下文自动给出智能回复。
              </p>
            </div>

            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>3. 数据保存在哪里？</div>
              <p style={{ color: '#4a5568' }}>
                所有角色档案、聊天记录、日记、账本等数据均保存在当前浏览器的本地数据库（IndexedDB）中。强烈建议在【设置】&gt;【数据与备份】中定期导出备份文件。
              </p>
            </div>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>角色人设 Prompt 编写方法</div>
              <p style={{ color: '#4a5568' }}>
                在【角色档案】中编辑角色时，Prompt是决定角色性格的关键：
              </p>
              <ul style={{ paddingLeft: '20px', marginTop: '8px', color: '#4a5568' }}>
                <li><strong>称呼与身份：</strong>明确角色叫什么名字，与你是什么关系（如青梅竹马、伴侣、神仙守护者）。</li>
                <li><strong>语言风格：</strong>指定角色的说话口吻（如喜欢用颜文字、说话柔声细语，或带着傲娇口癖）。</li>
                <li><strong>禁忌与习惯：</strong>例如讨厌被冷落，喜欢吃甜食等。</li>
              </ul>
            </div>

            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>世界书联动</div>
              <p style={{ color: '#4a5568' }}>
                当对话内容中出现世界书词条的【触发关键词】时，该词条的内容会被自动唤醒，让角色拥有对特定设定或往事的共同认知。
              </p>
            </div>
          </div>
        )}

        {activeTab === 'generator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>Q: 为什么不需要登录账号？</div>
              <p style={{ color: '#4a5568' }}>
                为了最大程度保护你的隐私，弯弯机不需要注册或登录任何中心化账号，数据完全由你本地掌握。
              </p>
            </div>

            <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#1a202c', marginBottom: '6px' }}>Q: 更换设备后数据怎么迁移？</div>
              <p style={{ color: '#4a5568' }}>
                在旧设备上打开【设置】&gt;【数据与备份】&gt;【导出完整备份 (JSON)】。在新设备上打开弯弯机，选择该备份文件恢复即可无缝迁移。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
