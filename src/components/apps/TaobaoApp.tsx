import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  sales: string;
  tag: string;
}

export const TaobaoApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [cartCount, setCartCount] = useState(0);

  const products: Product[] = [
    {
      id: '1',
      name: '小狗神专属软萌毛绒挂件',
      price: 39.9,
      image: 'img/wanwan.png',
      sales: '月销 1000+',
      tag: '买给TA的礼物',
    },
    {
      id: '2',
      name: '复古拍立得相机 (含限定相纸)',
      price: 299.0,
      image: 'img/blank_img1.jpg',
      sales: '月销 500+',
      tag: '记录回忆',
    },
    {
      id: '3',
      name: '暖冬热可可礼盒与保温杯',
      price: 68.0,
      image: 'img/blank_img2.jpg',
      sales: '月销 800+',
      tag: '治愈系',
    },
    {
      id: '4',
      name: '梦幻银河星空投影夜灯',
      price: 88.0,
      image: 'img/blank_img3.jpg',
      sales: '月销 2000+',
      tag: '卧室氛围',
    },
  ];

  const handleBuy = (p: Product) => {
    setCartCount((c) => c + 1);
    toast(`已购买【${p.name}】，礼物已寄往角色背包！`);
  };

  return (
    <div id="taobao-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f4f4f4' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#ff5000', color: '#fff' }}>
        <button className="header-back" onClick={() => closePage('taobao')} style={{ color: '#fff' }}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>淘宝 · 礼物小店</span>
        <div style={{ position: 'relative' }}>
          <i className="fa fa-cart-shopping" style={{ fontSize: '18px' }} />
          {cartCount > 0 && (
            <span style={{ position: 'absolute', top: '-6px', right: '-8px', background: '#fff', color: '#ff5000', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {cartCount}
            </span>
          )}
        </div>
      </div>

      {/* Product Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                background: '#fff',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <img src={p.image} alt={p.name} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
              <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#ff5000', background: '#fff1eb', padding: '1px 4px', borderRadius: '3px' }}>
                    {p.tag}
                  </span>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', marginTop: '4px', lineHeight: '1.4' }}>
                    {p.name}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <div>
                    <span style={{ color: '#ff5000', fontSize: '11px', fontWeight: 600 }}>￥</span>
                    <span style={{ color: '#ff5000', fontSize: '16px', fontWeight: 700 }}>{p.price.toFixed(1)}</span>
                  </div>
                  <button
                    onClick={() => handleBuy(p)}
                    style={{
                      background: 'linear-gradient(90deg, #ff9000, #ff5000)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    购买
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
