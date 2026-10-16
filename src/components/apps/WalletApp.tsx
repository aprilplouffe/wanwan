import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db';
import type { Transaction } from '../../types';

export const WalletApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('餐饮');
  const [note, setNote] = useState('');

  const loadTransactions = async () => {
    const list = await db.finance.toArray();
    setTransactions(list.sort((a, b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleAdd = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      toast('请输入有效金额');
      return;
    }
    await db.finance.add({
      type,
      amount: val,
      category,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    });
    setAmount('');
    setNote('');
    setShowAddModal(false);
    toast('记账成功');
    loadTransactions();
  };

  const categories = [
    { name: '餐饮', icon: 'fa-utensils' },
    { name: '购物', icon: 'fa-bag-shopping' },
    { name: '娱乐', icon: 'fa-gamepad' },
    { name: '交通', icon: 'fa-car' },
    { name: '日用', icon: 'fa-house' },
    { name: '收入', icon: 'fa-sack-dollar' },
  ];

  return (
    <div id="wallet-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f7f8fa' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <button className="header-back" onClick={() => closePage('wallet')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>钱迹 · 账本</span>
        <button className="btn-icon" onClick={() => setShowAddModal(true)}>
          <i className="fa fa-plus" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Balance Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
            color: '#fff',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0aec0', marginBottom: '6px' }}>结余资产 (元)</div>
          <div style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            ￥{(totalIncome - totalExpense).toFixed(2)}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#a0aec0' }}>总支出</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#fc8181', marginTop: '2px' }}>
                -￥{totalExpense.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#a0aec0' }}>总收入</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#68d391', marginTop: '2px' }}>
                +￥{totalIncome.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#4a5568', marginBottom: '12px' }}>
          交易明细 ({transactions.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {transactions.map((t) => (
            <div
              key={t.id}
              style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: t.type === 'expense' ? '#fed7d7' : '#c6f6d5',
                    color: t.type === 'expense' ? '#c53030' : '#22543d',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '15px',
                  }}
                >
                  <i className={`fa ${categories.find((c) => c.name === t.category)?.icon || 'fa-receipt'}`} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#2d3748' }}>{t.category}</div>
                  <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>
                    {t.note || new Date(t.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  color: t.type === 'expense' ? '#e53e3e' : '#38a169',
                }}
              >
                {t.type === 'expense' ? '-' : '+'}￥{t.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddModal && (
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
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: '#fff',
              width: '90%',
              maxWidth: '340px',
              borderRadius: '16px',
              padding: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '16px' }}>记一笔</div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                onClick={() => setType('expense')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  background: type === 'expense' ? '#e53e3e' : '#edf2f7',
                  color: type === 'expense' ? '#fff' : '#4a5568',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                支出
              </button>
              <button
                onClick={() => setType('income')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  background: type === 'income' ? '#38a169' : '#edf2f7',
                  color: type === 'income' ? '#fff' : '#4a5568',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                收入
              </button>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>金额 (元)</label>
              <input
                type="number"
                step="0.01"
                className="input-field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                style={{ width: '100%', padding: '10px', fontSize: '18px', fontWeight: 600, borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>分类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '4px' }}
              >
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#718096' }}>备注 (可选)</label>
              <input
                type="text"
                className="input-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：买咖啡、生活费"
                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-pill"
                onClick={() => setShowAddModal(false)}
                style={{ flex: 1, padding: '10px', background: '#edf2f7', color: '#4a5568', borderRadius: '8px', border: 'none' }}
              >
                取消
              </button>
              <button
                className="btn-pill"
                onClick={handleAdd}
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
