import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface Tweet {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  content: string;
  time: string;
  likes: number;
  retweets: number;
  isLiked?: boolean;
}

export const XApp: React.FC = () => {
  const { closePage, currentUser, toast } = useApp();
  const [tweets, setTweets] = useState<Tweet[]>([
    {
      id: '1',
      author: '弯弯',
      handle: '@wanwan_official',
      avatar: 'img/wanwan.png',
      content: '今日天气晴朗，气温适宜，很适合去公园散步呢！你们今天过得开心吗？✨',
      time: '2小时前',
      likes: 128,
      retweets: 42,
    },
    {
      id: '2',
      author: '小狗神',
      handle: '@dog_god_99',
      avatar: 'img/ava-01.jpg',
      content: '巡视凡间时发现某些人类总是熬夜。再不早点睡，今晚的噩梦就全部没收。',
      time: '5小时前',
      likes: 356,
      retweets: 99,
    },
  ]);

  const [newTweet, setNewTweet] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const handlePost = () => {
    if (!newTweet.trim()) return;
    const tweet: Tweet = {
      id: String(Date.now()),
      author: currentUser?.name || '我',
      handle: '@my_handle',
      avatar: currentUser?.avatar || 'img/ava-00.jpg',
      content: newTweet.trim(),
      time: '刚刚',
      likes: 0,
      retweets: 0,
    };
    setTweets([tweet, ...tweets]);
    setNewTweet('');
    setIsPosting(false);
    toast('发布成功');
  };

  const handleLike = (id: string) => {
    setTweets((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              isLiked: !t.isLiked,
              likes: t.isLiked ? t.likes - 1 : t.likes + 1,
            }
          : t
      )
    );
  };

  return (
    <div id="x-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#000', color: '#fff' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2f3336' }}>
        <button className="header-back" onClick={() => closePage('x')} style={{ color: '#fff' }}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <i className="fa-brands fa-x-twitter" style={{ fontSize: '20px' }} />
        <button className="btn-icon" onClick={() => setIsPosting(true)} style={{ color: '#1d9bf0' }}>
          <i className="fa fa-feather-pointed" />
        </button>
      </div>

      {/* Feed List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tweets.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #2f3336',
              display: 'flex',
              gap: '12px',
            }}
          >
            <img src={t.avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>{t.author}</span>
                <span style={{ color: '#71767b', fontSize: '13px' }}>{t.handle} · {t.time}</span>
              </div>
              <div style={{ margin: '6px 0 10px', fontSize: '14px', lineHeight: '1.5' }}>{t.content}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '300px', color: '#71767b', fontSize: '13px' }}>
                <span style={{ cursor: 'pointer' }}><i className="fa-regular fa-comment" /> 8</span>
                <span style={{ cursor: 'pointer' }}><i className="fa fa-retweet" /> {t.retweets}</span>
                <span
                  onClick={() => handleLike(t.id)}
                  style={{ cursor: 'pointer', color: t.isLiked ? '#f91880' : 'inherit' }}
                >
                  <i className={`fa${t.isLiked ? 's' : 'r'} fa-heart`} /> {t.likes}
                </span>
                <span style={{ cursor: 'pointer' }}><i className="fa-regular fa-share-from-square" /></span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Post Modal */}
      {isPosting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button onClick={() => setIsPosting(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px' }}>
              取消
            </button>
            <button
              onClick={handlePost}
              style={{
                background: '#1d9bf0',
                color: '#fff',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '20px',
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              发帖
            </button>
          </div>
          <textarea
            value={newTweet}
            onChange={(e) => setNewTweet(e.target.value)}
            placeholder="有什么新鲜事？"
            rows={5}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '18px',
              outline: 'none',
              resize: 'none',
            }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
};
