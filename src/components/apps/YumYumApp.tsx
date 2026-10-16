import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface Dish {
  id: string;
  name: string;
  price: number;
  image: string;
  desc: string;
}

export const YumYumApp: React.FC = () => {
  const { closePage, toast } = useApp();
  const [cart, setCart] = useState<{ [id: string]: number }>({});

  const dishes: Dish[] = [
    {
      id: 'd1',
      name: '日式厚蛋烧便当',
      price: 32.0,
      image: 'img/blank_img1.jpg',
      desc: '松软香甜的玉子烧，搭配新鲜西兰花与秋田小町米。',
    },
    {
      id: 'd2',
      name: '草莓芝士雪顶松饼',
      price: 28.5,
      image: 'img/blank_img2.jpg',
      desc: '弯弯最喜欢的甜点！酥脆松软，奶香浓郁。',
    },
    {
      id: 'd3',
      name: '地狱豚骨拉面',
      price: 36.0,
      image: 'img/blank_img3.jpg',
      desc: '小狗神专属辣度！浓醇骨汤搭配厚切叉烧与溏心蛋。',
    },
    {
      id: 'd4',
      name: '鲜榨白桃乌龙茶',
      price: 18.0,
      image: 'img/blank_img4.jpg',
      desc: '清甜白桃融入冷萃乌龙茶底，解腻爽口。',
    },
  ];

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    toast('已加入餐车');
  };

  const totalAmount = Object.entries(cart).reduce((sum, [id, count]) => {
    const dish = dishes.find((d) => d.id === id);
    return sum + (dish ? dish.price * count : 0);
  }, 0);

  const totalCount = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <div id="yumyum-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#f8f9fa' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#ed8936', color: '#fff' }}>
        <button className="header-back" onClick={() => closePage('yumyum')} style={{ color: '#fff' }}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '16px' }}>YumYum · 美食外卖</span>
        <div style={{ width: '24px' }} />
      </div>

      {/* Menu List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        <div style={{ fontWeight: 600, fontSize: '15px', color: '#2d3748', marginBottom: '12px' }}>
          今日热卖推荐
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {dishes.map((dish) => (
            <div
              key={dish.id}
              style={{
                background: '#fff',
                borderRadius: '14px',
                padding: '12px',
                display: 'flex',
                gap: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              <img src={dish.image} alt={dish.name} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a202c' }}>{dish.name}</div>
                  <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px', lineHeight: '1.4' }}>{dish.desc}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ color: '#e53e3e', fontWeight: 700, fontSize: '15px' }}>￥{dish.price.toFixed(1)}</span>
                  <button
                    onClick={() => addToCart(dish.id)}
                    style={{
                      background: '#ed8936',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fa fa-plus" style={{ fontSize: '11px' }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Cart Bar */}
      <div
        style={{
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>已选 {totalCount} 件美食</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#e53e3e' }}>￥{totalAmount.toFixed(2)}</div>
        </div>
        <button
          onClick={() => {
            if (totalCount === 0) return toast('餐车还是空的呢');
            toast('外卖订单已送出！骑手小哥正火速配送给角色~');
            setCart({});
          }}
          disabled={totalCount === 0}
          style={{
            background: totalCount > 0 ? '#ed8936' : '#cbd5e0',
            color: '#fff',
            border: 'none',
            borderRadius: '20px',
            padding: '10px 24px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: totalCount > 0 ? 'pointer' : 'default',
          }}
        >
          立即结算
        </button>
      </div>
    </div>
  );
};
