import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';
import type { CallRecord } from '../../types';

export const PhoneApp: React.FC = () => {
  const { closePage, characters, toast } = useApp();
  const [tab, setTab] = useState<'calls' | 'dialer'>('calls');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [dialNumber, setDialNumber] = useState('');
  const [callingChar, setCallingChar] = useState<CallRecord | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const loadCalls = async () => {
    const list = await db.callRecords.toArray();
    setCalls(list.sort((a, b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadCalls();
  }, []);

  // Timer when in call
  useEffect(() => {
    if (!callingChar) return;
    const timer = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callingChar]);

  const handleStartCall = (record: Partial<CallRecord>) => {
    setCallDuration(0);
    setCallingChar({
      charId: record.charId || 1,
      charName: record.charName || '弯弯',
      avatar: record.avatar || 'img/wanwan.png',
      type: 'outgoing',
      duration: 0,
      createdAt: Date.now(),
    });
  };

  const handleHangUp = async () => {
    if (callingChar) {
      await db.callRecords.add({
        ...callingChar,
        duration: callDuration,
        createdAt: Date.now(),
      });
      loadCalls();
    }
    setCallingChar(null);
    setCallDuration(0);
    toast('通话已结束');
  };

  // Fullscreen In-call Screen
  if (callingChar) {
    const m = Math.floor(callDuration / 60);
    const s = callDuration % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    return (
      <div style={{ position: 'fixed', inset: 0, background: '#1c1c1e', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '60px 24px 80px', zIndex: 9999 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '26px', fontWeight: 600, marginBottom: '6px' }}>{callingChar.charName}</div>
          <div style={{ fontSize: '14px', color: '#8e8e93' }}>正在通话中 · {timeStr}</div>
        </div>

        <div style={{ position: 'relative' }}>
          <img
            src={callingChar.avatar || 'img/wanwan.png'}
            alt=""
            style={{ width: '130px', height: '130px', borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '32px' }}>
          <button
            onClick={() => toast('静音已切换')}
            style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#2c2c2e', color: '#fff', border: 'none', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa fa-microphone-slash" />
          </button>

          <button
            onClick={handleHangUp}
            style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#ff3b30', color: '#fff', border: 'none', fontSize: '24px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(255, 59, 48, 0.4)' }}
          >
            <i className="fa fa-phone-slash" />
          </button>

          <button
            onClick={() => toast('免提已开启')}
            style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#2c2c2e', color: '#fff', border: 'none', fontSize: '20px', cursor: 'pointer' }}
          >
            <i className="fa fa-volume-high" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="phone-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f2f2f7' }}>
        <button className="header-back" onClick={() => closePage('phone')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setTab('calls')}
            style={{
              background: 'none',
              border: 'none',
              fontWeight: 600,
              fontSize: '15px',
              color: tab === 'calls' ? '#007aff' : '#8e8e93',
              cursor: 'pointer',
            }}
          >
            通话记录
          </button>
          <button
            onClick={() => setTab('dialer')}
            style={{
              background: 'none',
              border: 'none',
              fontWeight: 600,
              fontSize: '15px',
              color: tab === 'dialer' ? '#007aff' : '#8e8e93',
              cursor: 'pointer',
            }}
          >
            拨号键盘
          </button>
        </div>
        <div style={{ width: '24px' }} />
      </div>

      {tab === 'calls' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {calls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#8e8e93' }}>
              <i className="fa fa-phone" style={{ fontSize: '40px', marginBottom: '12px' }} />
              <div>暂无通话记录</div>
            </div>
          ) : (
            calls.map((c) => (
              <div
                key={c.id}
                onClick={() => handleStartCall(c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: '1px solid #f2f2f7',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={c.avatar || 'img/wanwan.png'}
                  alt=""
                  style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', marginRight: '14px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: c.type === 'missed' ? '#ff3b30' : '#1c1c1e' }}>
                    {c.charName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8e8e93', marginTop: '2px' }}>
                    {c.type === 'incoming' ? '来电' : c.type === 'outgoing' ? '呼出' : '未接来电'} · {c.duration} 秒
                  </div>
                </div>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#34c759',
                    fontSize: '18px',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa fa-phone" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Dialer Tab */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ height: '50px', fontSize: '32px', fontWeight: 600, letterSpacing: '2px', color: '#1c1c1e', marginBottom: '20px' }}>
            {dialNumber || ' '}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 24px', marginBottom: '24px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((n) => (
              <button
                key={n}
                onClick={() => setDialNumber((prev) => prev + n)}
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: '#e5e5ea',
                  color: '#1c1c1e',
                  fontSize: '24px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
            <div style={{ width: '40px' }} />
            <button
              onClick={() => {
                const char = characters.find((c) => c.type === 'char') || characters[0];
                handleStartCall({ charId: char?.id, charName: char?.name, avatar: char?.avatar });
              }}
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: '#34c759',
                color: '#fff',
                fontSize: '26px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(52, 199, 89, 0.4)',
              }}
            >
              <i className="fa fa-phone" />
            </button>
            <button
              onClick={() => setDialNumber((prev) => prev.slice(0, -1))}
              style={{ background: 'none', border: 'none', color: '#8e8e93', fontSize: '20px', cursor: 'pointer', width: '40px' }}
            >
              <i className="fa fa-delete-left" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
