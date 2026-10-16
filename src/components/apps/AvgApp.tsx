import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface StoryScene {
  id: string;
  speaker: string;
  text: string;
  characterImg: string;
  bgImg: string;
  choices: { text: string; nextSceneId: string }[];
}

export const AvgApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [selectedGame, setSelectedGame] = useState<'campus' | 'shadow' | null>(null);
  const [currentSceneId, setCurrentSceneId] = useState<string>('scene_1');
  const [history, setHistory] = useState<string[]>([]);

  // Story definition for Campus and Shadow
  const campusScenes: Record<string, StoryScene> = {
    scene_1: {
      id: 'scene_1',
      speaker: '弯弯',
      text: '（微风吹过樱花树，弯弯手里捧着笔记本，小步跑到了你面前）前辈，终于找到你了！今天放学后……你有空吗？',
      characterImg: 'img/avg/character-campus.png',
      bgImg: 'img/avg/background-campus.png',
      choices: [
        { text: '当然有空，我们一起去图书馆吧', nextSceneId: 'scene_library' },
        { text: '抱歉，今天社团活动要加训', nextSceneId: 'scene_club' },
      ],
    },
    scene_library: {
      id: 'scene_library',
      speaker: '弯弯',
      text: '（弯弯眼睛亮晶晶的，露出开心的笑容）太好了！那我们在老位置见，我把复习笔记都准备好啦~',
      characterImg: 'img/avg/character-campus.png',
      bgImg: 'img/avg/background-campus.png',
      choices: [
        { text: '（轻轻揉揉弯弯的头发）真乖', nextSceneId: 'scene_end_sweet' },
        { text: '今天也要认真加油哦', nextSceneId: 'scene_end_sweet' },
      ],
    },
    scene_club: {
      id: 'scene_club',
      speaker: '弯弯',
      text: '（弯弯有些失落地垂下眼眸，但随即又抬起头对你微笑）没关系的！加训也要注意身体哦，我在旁边给你买冰乌龙茶等你！',
      characterImg: 'img/avg/character-campus.png',
      bgImg: 'img/avg/background-campus.png',
      choices: [
        { text: '那就辛苦我们的小天使啦', nextSceneId: 'scene_end_sweet' },
      ],
    },
    scene_end_sweet: {
      id: 'scene_end_sweet',
      speaker: '旁白',
      text: '【校园皆是修罗场 · 序章完】微风拂过脸颊，属于你们的校园物语，在这个午后悄然展开……',
      characterImg: 'img/avg/character-campus.png',
      bgImg: 'img/avg/background-campus.png',
      choices: [
        { text: '重新开始序章', nextSceneId: 'scene_1' },
      ],
    },
  };

  const shadowScenes: Record<string, StoryScene> = {
    scene_1: {
      id: 'scene_1',
      speaker: '小狗神 (特工代号：Shadow)',
      text: '（雨夜的街角，霓虹灯倒映在潮湿的沥青路面。黑风衣男子压低帽檐）别回头。你被人盯上了。',
      characterImg: 'img/avg/character-shadow.png',
      bgImg: 'img/avg/background-shadow.png',
      choices: [
        { text: '你是谁？为什么要帮我？', nextSceneId: 'scene_inquire' },
        { text: '握紧伞柄，警惕地后退半步', nextSceneId: 'scene_alert' },
      ],
    },
    scene_inquire: {
      id: 'scene_inquire',
      speaker: '小狗神 (特工代号：Shadow)',
      text: '（他冷笑一声，从口袋里拿出一枚古朴的铜币）因为你的命，在我的委托清单上。跟我走，除非你想被那些人带走。',
      characterImg: 'img/avg/character-shadow.png',
      bgImg: 'img/avg/background-shadow.png',
      choices: [
        { text: '跟上他的脚步进入雨巷', nextSceneId: 'scene_end_shadow' },
      ],
    },
    scene_alert: {
      id: 'scene_alert',
      speaker: '小狗神 (特工代号：Shadow)',
      text: '（他敏锐地抬手挡在你身前，子弹擦过远处的铁皮招牌发出清脆声响）动作还挺敏捷……不过现在不是发呆的时候，抓紧我！',
      characterImg: 'img/avg/character-shadow.png',
      bgImg: 'img/avg/background-shadow.png',
      choices: [
        { text: '握住他的手跃入暗影', nextSceneId: 'scene_end_shadow' },
      ],
    },
    scene_end_shadow: {
      id: 'scene_end_shadow',
      speaker: '旁白',
      text: '【谍影留声 · 第一幕完】雨夜的枪声划破寂静，宿命的轮盘在此刻转动……',
      characterImg: 'img/avg/character-shadow.png',
      bgImg: 'img/avg/background-shadow.png',
      choices: [
        { text: '重新开始序章', nextSceneId: 'scene_1' },
      ],
    },
  };

  const scenes = selectedGame === 'campus' ? campusScenes : shadowScenes;
  const currentScene = scenes[currentSceneId] || scenes['scene_1'];

  const handleChoose = (nextSceneId: string, choiceText: string) => {
    setHistory((prev) => [...prev, `${currentScene.speaker}: ${currentScene.text}`, `> 你选择了: ${choiceText}`]);
    setCurrentSceneId(nextSceneId);
  };

  // If no game selected yet, show Game Lobby
  if (!selectedGame) {
    return (
      <div id="avg-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#1a1a1a', color: '#fff' }}>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #333' }}>
          <button className="header-back" onClick={() => closePage('avg')} style={{ color: '#fff' }}>
            <i className="fa fa-angle-left" style={{ fontSize: '22px' }} />
          </button>
          <span style={{ fontWeight: 600, fontSize: '16px' }}>橙光 · 互动小说</span>
          <div style={{ width: '24px' }} />
        </div>

        <div style={{ flex: 1, padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ fontSize: '13px', color: '#a0aec0', marginBottom: '16px' }}>精选互动视觉小说</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Campus Game Card */}
            <div
              onClick={() => {
                setSelectedGame('campus');
                setCurrentSceneId('scene_1');
              }}
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#2d3748',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                cursor: 'pointer',
              }}
            >
              <img
                src="img/avg/cover-campus.png"
                alt="校园皆是修罗场"
                style={{ width: '100%', height: '160px', objectFit: 'cover' }}
              />
              <div style={{ padding: '14px' }}>
                <div style={{ fontWeight: 600, fontSize: '16px' }}>校园皆是修罗场</div>
                <div style={{ fontSize: '12px', color: '#cbd5e0', marginTop: '4px' }}>
                  青春校园恋爱冒险。温柔乖巧的后辈弯弯，与你开启的青涩日常。
                </div>
                <button
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    background: '#ed64a6',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  开始阅读
                </button>
              </div>
            </div>

            {/* Shadow Game Card */}
            <div
              onClick={() => {
                setSelectedGame('shadow');
                setCurrentSceneId('scene_1');
              }}
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                background: '#2d3748',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                cursor: 'pointer',
              }}
            >
              <img
                src="img/avg/cover-shadow.png"
                alt="谍影留声"
                style={{ width: '100%', height: '160px', objectFit: 'cover' }}
              />
              <div style={{ padding: '14px' }}>
                <div style={{ fontWeight: 600, fontSize: '16px' }}>谍影留声</div>
                <div style={{ fontSize: '12px', color: '#cbd5e0', marginTop: '4px' }}>
                  赛博朋克风悬疑特工题材。代号Shadow的神秘守护者，危机四伏的雨夜追踪。
                </div>
                <button
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    background: '#4a5568',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  开始阅读
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active Story Player View
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
      }}
    >
      {/* Background Image */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${currentScene.bgImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'brightness(0.85)',
        }}
      />

      {/* Top action bar */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setSelectedGame(null)}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer' }}
        >
          <i className="fa fa-angle-left" /> 返回目录
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => toast('已保存到第1存档位')}
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #fff', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', cursor: 'pointer' }}
          >
            保存
          </button>
          <button
            onClick={() => {
              setCurrentSceneId('scene_1');
              toast('已读取存档');
            }}
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #fff', color: '#fff', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', cursor: 'pointer' }}
          >
            读档
          </button>
        </div>
      </div>

      {/* Character Sprite */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          zIndex: 5,
          overflow: 'hidden',
        }}
      >
        {currentScene.characterImg && (
          <img
            src={currentScene.characterImg}
            alt=""
            style={{
              maxHeight: '75%',
              maxWidth: '90%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
              transition: 'all 0.3s ease',
            }}
          />
        )}
      </div>

      {/* Dialogue Box & Branching Choices */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          padding: '16px 16px 24px',
          background: 'linear-gradient(0deg, rgba(10,10,12,0.95) 0%, rgba(10,10,12,0.85) 80%, transparent 100%)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {currentScene.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => handleChoose(choice.nextSceneId, choice.text)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            >
              ▶ {choice.text}
            </button>
          ))}
        </div>

        {/* Text Display */}
        <div
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '14px',
          }}
        >
          <div style={{ fontWeight: 600, color: '#f6ad55', fontSize: '15px', marginBottom: '6px' }}>
            {currentScene.speaker}
          </div>
          <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#edf2f7' }}>
            {currentScene.text}
          </div>
        </div>
      </div>
    </div>
  );
};
