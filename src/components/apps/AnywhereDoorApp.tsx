import React from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';

interface Scenario {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  prompt: string;
}

export const AnywhereDoorApp: React.FC = () => {
  const { closePage, openPage, toast } = useApp();

  const scenarios: Scenario[] = [
    {
      id: 's1',
      title: '黄昏海边漫步',
      desc: '橘红色的夕阳沉入海平线，细软的白沙与翻涌的白浪，海风吹起发丝。',
      icon: 'fa-umbrella-beach',
      color: 'linear-gradient(135deg, #f6ad55 0%, #ed8936 100%)',
      prompt: '（传送场景：黄昏海边）我们现在来到了海边，金黄色的夕阳洒在沙滩上，海浪一阵阵涌上来，海风很温柔。',
    },
    {
      id: 's2',
      title: '雨夜街角便利店',
      desc: '门铃叮咚作响，雨水模糊了落地窗，关东煮冒着热腾腾的白色蒸汽。',
      icon: 'fa-cloud-rain',
      color: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
      prompt: '（传送场景：雨夜便利店）外面的雨越下越大，我们坐在便利店靠窗的高脚凳上，手里捧着热气腾腾的关东煮。',
    },
    {
      id: 's3',
      title: '深夜星空天台',
      desc: '城市的车水马龙在脚下流淌成光河，抬头是无边无际的璀璨银河与晚风。',
      icon: 'fa-star',
      color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      prompt: '（传送场景：星空天台）天台的风很清凉，整座城市的灯火在下方闪烁，夜空里繁星点点，只有我们两个人并肩坐着。',
    },
    {
      id: 's4',
      title: '冬日雪山温泉木屋',
      desc: '窗外大雪纷飞，壁炉里的松木哔剥燃烧，温泉水汽氤氲，温暖而静谧。',
      icon: 'fa-snowflake',
      color: 'linear-gradient(135deg, #a0aec0 0%, #718096 100%)',
      prompt: '（传送场景：雪山木屋）木屋的壁炉暖洋洋地烧着，窗外下着漫天大雪，整个世界格外安静，我们围坐在地毯上取暖。',
    },
  ];

  const handleTeleport = async (s: Scenario) => {
    // Add scenario prompt to latest chat session
    const chats = await db.chats.toArray();
    if (chats.length > 0) {
      const targetChat = chats[0];
      await db.messages.add({
        chatId: targetChat.id!,
        sender: 'user',
        content: s.prompt,
        createdAt: Date.now(),
        type: 'text',
      });
      await db.chats.update(targetChat.id!, {
        lastMessage: s.prompt,
        updatedAt: Date.now(),
      });
      toast(`任意门启动！已传送至【${s.title}】`);
      openPage('wechat');
    } else {
      toast('任意门启动！请先在微信中建立对话');
    }
  };

  return (
    <div id="anywhere-door-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f8fa' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#667eea', color: '#fff' }}>
        <button className="header-back" onClick={() => closePage('anyDoor')} style={{ color: '#fff' }}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>任意门 · 场景传送</span>
        <div style={{ width: '24px' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ fontSize: '13px', color: '#718096', marginBottom: '14px', lineHeight: '1.5' }}>
          选择一个奇妙的约会与相处场景，任意门将瞬间把你们带入专属空间，并自动生成情景对话。
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {scenarios.map((s) => (
            <div
              key={s.id}
              onClick={() => handleTeleport(s)}
              style={{
                background: s.color,
                color: '#fff',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 6px 16px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: 'transform 0.15s ease',
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                <i className={`fa ${s.icon}`} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '4px' }}>{s.title}</div>
                <div style={{ fontSize: '12px', opacity: 0.9, lineHeight: '1.4' }}>{s.desc}</div>
              </div>
              <i className="fa fa-chevron-right" style={{ opacity: 0.7 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
