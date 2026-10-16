import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const MissYouApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [missCount, setMissCount] = useState(520);
  const [isPulsing, setIsPulsing] = useState(false);
  const [heartRate, setHeartRate] = useState(72);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeartRate(Math.floor(70 + Math.random() * 8));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleTapMiss = () => {
    setMissCount((c) => c + 1);
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 300);
    toast('已向弯弯发送了一次【想你】心动信号 ❤️');
  };

  return (
    <div id="miss-you-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #fff5f5 0%, #fed7d7 100%)', color: '#2d3748' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'transparent' }}>
        <button className="header-back" onClick={() => closePage('miss-you')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px', color: '#e53e3e' }}>想见你 · 随身心动</span>
        <div style={{ width: '24px' }} />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
        {/* Avatars connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <img
            src="img/wanwan.png"
            alt="弯弯"
            style={{ width: '70px', height: '70px', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 4px 14px rgba(229,62,62,0.2)' }}
          />
          <div style={{ fontSize: '24px', animation: 'bounce 1s infinite alternate' }}>❤️</div>
          <img
            src="img/ava-00.jpg"
            alt="我"
            style={{ width: '70px', height: '70px', borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 4px 14px rgba(229,62,62,0.2)' }}
          />
        </div>

        {/* Heart Rate / Status */}
        <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: '20px', padding: '10px 20px', marginBottom: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <span style={{ color: '#e53e3e', fontWeight: 600, marginRight: '8px' }}>
            <i className="fa fa-heart-pulse" /> 实时心率
          </span>
          <span style={{ fontSize: '18px', fontWeight: 700 }}>{heartRate}</span>
          <span style={{ fontSize: '12px', color: '#718096', marginLeft: '4px' }}>BPM</span>
        </div>

        {/* Big Heart Touch Button */}
        <div
          onClick={handleTapMiss}
          style={{
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #fc8181 0%, #e53e3e 100%)',
            boxShadow: '0 12px 32px rgba(229, 62, 62, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            transform: isPulsing ? 'scale(1.15)' : 'scale(1.0)',
            transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            userSelect: 'none',
          }}
        >
          <i className="fa fa-heart" style={{ fontSize: '40px', marginBottom: '6px' }} />
          <span style={{ fontWeight: 600, fontSize: '13px' }}>点一下想TA</span>
        </div>

        {/* Counter */}
        <div style={{ marginTop: '28px' }}>
          <div style={{ fontSize: '12px', color: '#718096' }}>已经累计心动</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#c53030', marginTop: '2px' }}>
            {missCount} <span style={{ fontSize: '16px', fontWeight: 500 }}>次</span>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#a0aec0', marginTop: '16px', maxWidth: '240px', lineHeight: '1.5' }}>
          “无论相隔多远，只要按下这颗心，对方就能感受到来自你的温度。”
        </div>
      </div>
    </div>
  );
};
