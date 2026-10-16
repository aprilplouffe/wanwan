import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const GameHallApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [selectedGame, setSelectedGame] = useState<'hall' | 'werewolf' | 'dice' | 'coin'>('hall');

  // Werewolf Game State
  const [werewolfStep, setWerewolfStep] = useState<'setup' | 'night' | 'day' | 'end'>('setup');
  const [myRole, setMyRole] = useState<'预言家' | '女巫' | '猎人' | '村民' | '狼人'>('预言家');
  const [gameLog, setGameLog] = useState<string[]>([]);
  const [players, setPlayers] = useState([
    { id: 1, name: '1号 (我)', role: '预言家', alive: true },
    { id: 2, name: '2号 弯弯', role: '女巫', alive: true },
    { id: 3, name: '3号 小狗神', role: '狼人', alive: true },
    { id: 4, name: '4号 兔兔', role: '村民', alive: true },
    { id: 5, name: '5号 猫猫', role: '猎人', alive: true },
    { id: 6, name: '6号 熊熊', role: '村民', alive: true },
  ]);

  // Dice & Coin state
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [coinResult, setCoinResult] = useState<'正面' | '反面' | null>(null);

  const startWerewolf = () => {
    setWerewolfStep('night');
    setGameLog(['天黑请闭眼……', '狼人正在夜间行动……']);
  };

  const handleSeerCheck = (targetId: number) => {
    const target = players.find((p) => p.id === targetId);
    if (!target) return;
    const isWolf = target.role === '狼人';
    const log = `【查验结果】${target.name} 的真实身份是：${isWolf ? '【狼人】！' : '【好人】。'}`;
    setGameLog((prev) => [...prev, log, '天亮了，昨晚是平安夜！进入白天发言与投票阶段。']);
    setWerewolfStep('day');
  };

  const handleVote = (targetId: number) => {
    const target = players.find((p) => p.id === targetId);
    if (!target) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, alive: false } : p))
    );
    const win = target.role === '狼人';
    setGameLog((prev) => [
      ...prev,
      `投票结果：${target.name} 被投票出局！其真实身份是：${target.role}。`,
      win ? '🎉 狼人已被消灭，好人阵营获胜！' : '狼人仍在潜伏，夜幕再次降临……',
    ]);
    if (win) {
      setWerewolfStep('end');
    } else {
      setTimeout(() => setWerewolfStep('night'), 2000);
    }
  };

  const rollDice = () => {
    if (isRolling) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setDiceResult(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 10) {
        clearInterval(interval);
        setIsRolling(false);
      }
    }, 80);
  };

  const flipCoin = () => {
    const res = Math.random() > 0.5 ? '正面' : '反面';
    setCoinResult(res);
    toast(`抛硬币结果：${res}`);
  };

  return (
    <div id="game-hall-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#171923', color: '#fff' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2d3748', background: '#1a202c' }}>
        <button
          className="header-back"
          onClick={() => {
            if (selectedGame !== 'hall') setSelectedGame('hall');
            else closePage('gameHall');
          }}
          style={{ color: '#fff' }}
        >
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>
          {selectedGame === 'hall'
            ? '游戏大厅'
            : selectedGame === 'werewolf'
            ? '狼人杀小游戏'
            : selectedGame === 'dice'
            ? '幸运骰子'
            : '抛硬币'}
        </span>
        <div style={{ width: '24px' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {selectedGame === 'hall' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Werewolf Card */}
            <div
              onClick={() => {
                setSelectedGame('werewolf');
                setWerewolfStep('setup');
              }}
              style={{
                background: 'linear-gradient(135deg, #44337a 0%, #2b6cb0 100%)',
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <i className="fa fa-moon" style={{ fontSize: '24px', color: '#f6e05e' }} />
                <span style={{ fontWeight: 700, fontSize: '18px' }}>狼人杀 (单机对局)</span>
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: '1.5' }}>
                沉浸式6人经典局。扮演神职与伙伴们斗智斗勇，夜间技能发动与白天投票决战！
              </div>
            </div>

            {/* Dice Card */}
            <div
              onClick={() => setSelectedGame('dice')}
              style={{
                background: 'linear-gradient(135deg, #c53030 0%, #dd6b20 100%)',
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <i className="fa fa-dice" style={{ fontSize: '24px', color: '#fff' }} />
                <span style={{ fontWeight: 700, fontSize: '18px' }}>幸运骰子</span>
              </div>
              <div style={{ fontSize: '12px', color: '#fed7d7' }}>聚会随身解压摇骰子，随机点数一键生成。</div>
            </div>

            {/* Coin Card */}
            <div
              onClick={() => setSelectedGame('coin')}
              style={{
                background: 'linear-gradient(135deg, #d69e2e 0%, #b7791f 100%)',
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <i className="fa fa-coins" style={{ fontSize: '24px', color: '#fff' }} />
                <span style={{ fontWeight: 700, fontSize: '18px' }}>抛硬币决断器</span>
              </div>
              <div style={{ fontSize: '12px', color: '#fefcbf' }}>选择困难症救星，掷出命运的正反面。</div>
            </div>
          </div>
        )}

        {/* Werewolf Minigame */}
        {selectedGame === 'werewolf' && (
          <div>
            {werewolfStep === 'setup' && (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <i className="fa fa-mask" style={{ fontSize: '50px', color: '#9f7aea', marginBottom: '16px' }} />
                <div style={{ fontSize: '18px', fontWeight: 600 }}>你的角色身份：【预言家】</div>
                <div style={{ fontSize: '13px', color: '#a0aec0', margin: '12px 0 24px' }}>
                  技能：每晚可查验一名玩家的真实阵营（好人 / 狼人）。
                </div>
                <button
                  className="btn-pill"
                  onClick={startWerewolf}
                  style={{
                    padding: '12px 32px',
                    background: '#9f7aea',
                    color: '#fff',
                    borderRadius: '24px',
                    fontWeight: 600,
                    fontSize: '15px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  进入黑夜
                </button>
              </div>
            )}

            {werewolfStep === 'night' && (
              <div>
                <div style={{ background: '#2d3748', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#fbd38d' }}>
                  🌙 预言家请睁眼，请选择今晚要查验的玩家：
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {players.filter((p) => p.id !== 1 && p.alive).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSeerCheck(p.id)}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: '#4a5568',
                        color: '#fff',
                        border: 'none',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      查验 {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {werewolfStep === 'day' && (
              <div>
                <div style={{ background: '#2d3748', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#90cdf4' }}>
                  ☀️ 白天讨论结束，请投出你认为的狼人：
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {players.filter((p) => p.id !== 1 && p.alive).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleVote(p.id)}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: '#e53e3e',
                        color: '#fff',
                        border: 'none',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      投票处决 {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {werewolfStep === 'end' && (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>🏆</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#68d391' }}>游戏结束 · 好人阵营胜利！</div>
                <button
                  className="btn-pill"
                  onClick={() => setWerewolfStep('setup')}
                  style={{ marginTop: '20px', padding: '10px 24px', background: '#4a5568', color: '#fff', border: 'none', borderRadius: '16px' }}
                >
                  再来一局
                </button>
              </div>
            )}

            {/* Live game logs */}
            {gameLog.length > 0 && (
              <div style={{ marginTop: '24px', background: '#2d3748', padding: '14px', borderRadius: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#a0aec0', marginBottom: '8px' }}>对局战报</div>
                {gameLog.map((log, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#edf2f7', lineHeight: '1.6', marginBottom: '4px' }}>
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dice Game */}
        {selectedGame === 'dice' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '20px',
                background: '#fff',
                color: '#e53e3e',
                fontSize: '48px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 30px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {diceResult || '?'}
            </div>
            <button
              className="btn-pill"
              onClick={rollDice}
              disabled={isRolling}
              style={{ padding: '12px 36px', background: '#e53e3e', color: '#fff', borderRadius: '24px', fontWeight: 600, fontSize: '16px', border: 'none', cursor: 'pointer' }}
            >
              {isRolling ? '摇动中...' : '摇骰子'}
            </button>
          </div>
        )}

        {/* Coin Game */}
        {selectedGame === 'coin' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, #f6e05e 0%, #d69e2e 100%)',
                color: '#744210',
                fontSize: '24px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 30px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                border: '4px solid #ecc94b',
              }}
            >
              {coinResult || '币'}
            </div>
            <button
              className="btn-pill"
              onClick={flipCoin}
              style={{ padding: '12px 36px', background: '#d69e2e', color: '#fff', borderRadius: '24px', fontWeight: 600, fontSize: '16px', border: 'none', cursor: 'pointer' }}
            >
              抛硬币
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
