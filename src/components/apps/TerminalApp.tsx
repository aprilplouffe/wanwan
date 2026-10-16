import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';

export const TerminalApp: React.FC = () => {
  const { closePage, characters } = useApp();
  const [logs, setLogs] = useState<string[]>([
    'WanWan System Terminal [Version 1.0.0-react]',
    'Type "help" for a list of available commands.',
    'System ready. Local database connected.',
  ]);
  const [command, setCommand] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleRunCommand = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    const nextLogs = [...logs, `$ ${cmd}`];

    const [action, ...args] = cmd.split(' ');

    switch (action.toLowerCase()) {
      case 'help':
        nextLogs.push(
          'Available commands:',
          '  help      - Show this manual',
          '  status    - Show system & database diagnostic',
          '  chars     - List all cached characters',
          '  chats     - List active chat sessions',
          '  date      - Print current system date & time',
          '  clear     - Clear terminal buffer',
          '  sysinfo   - Display system environment info'
        );
        break;

      case 'status': {
        const charCount = await db.characters.count();
        const chatCount = await db.chats.count();
        const msgCount = await db.messages.count();
        nextLogs.push(
          '[STATUS: OK]',
          `Characters: ${charCount}`,
          `Chat Sessions: ${chatCount}`,
          `Total Messages: ${msgCount}`,
          'Storage: IndexedDB (WanWanDB v15) active'
        );
        break;
      }

      case 'chars':
        nextLogs.push(`Found ${characters.length} characters:`);
        characters.forEach((c) => {
          nextLogs.push(`  [#${c.id || 0}] ${c.name} (${c.type}) - Group: ${c.group || 'default'}`);
        });
        break;

      case 'chats': {
        const sessions = await db.chats.toArray();
        nextLogs.push(`Found ${sessions.length} chats:`);
        sessions.forEach((s) => {
          nextLogs.push(`  Chat #${s.id}: CharID ${s.charId} - Last: "${s.lastMessage || ''}"`);
        });
        break;
      }

      case 'date':
        nextLogs.push(`Current Time: ${new Date().toString()}`);
        break;

      case 'sysinfo':
        nextLogs.push(
          'OS: WanWan Virtual Runtime',
          'Engine: React 19 + TypeScript + Vite 6',
          'Platform: Web (standalone container)',
          `UserAgent: ${navigator.userAgent}`
        );
        break;

      case 'clear':
        setLogs([]);
        setCommand('');
        return;

      default:
        nextLogs.push(`Command not recognized: "${action}". Type "help" for assistance.`);
        break;
    }

    setLogs(nextLogs);
    setCommand('');
  };

  return (
    <div id="terminal-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#0c1017', color: '#38ef7d', fontFamily: 'monospace' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d' }}>
        <button className="header-back" onClick={() => closePage('terminal')} style={{ color: '#38ef7d' }}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '14px', letterSpacing: '1px' }}>TERMINAL // WANWAN</span>
        <div style={{ width: '24px' }} />
      </div>

      {/* Terminal Output */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', lineHeight: '1.6', fontSize: '13px' }}>
        {logs.map((log, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {log}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Command Input Bar */}
      <div style={{ padding: '10px 16px', background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#58a6ff', fontWeight: 700 }}>$</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRunCommand();
          }}
          placeholder="输入指令 (如 help, status)..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: '#38ef7d',
            fontFamily: 'monospace',
            fontSize: '14px',
            outline: 'none',
          }}
          autoFocus
        />
        <button
          onClick={handleRunCommand}
          style={{
            background: '#238636',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          执行
        </button>
      </div>
    </div>
  );
};
