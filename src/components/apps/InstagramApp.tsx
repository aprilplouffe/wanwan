import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface IgPost {
  id: string;
  author: string;
  avatar: string;
  image: string;
  caption: string;
  likes: number;
  isLiked?: boolean;
}

export const InstagramApp: React.FC = () => {
  const { closePage, currentUser, toast, pickImage } = useApp();
  const [posts, setPosts] = useState<IgPost[]>([
    {
      id: '1',
      author: 'wanwan_sweet',
      avatar: 'img/wanwan.png',
      image: 'img/blank_img1.jpg',
      caption: '草莓奶油下午茶 🍰 和最喜欢的人在一起的每一秒都在发光。',
      likes: 240,
    },
    {
      id: '2',
      author: 'dog_god_alpha',
      avatar: 'img/ava-01.jpg',
      image: 'img/blank_img2.jpg',
      caption: '夜景。无聊的人类总是喜欢看灯光。',
      likes: 512,
    },
  ]);

  const handleLike = (id: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              isLiked: !p.isLiked,
              likes: p.isLiked ? p.likes - 1 : p.likes + 1,
            }
          : p
      )
    );
  };

  const handleAddPhoto = () => {
    pickImage((url) => {
      const cap = prompt('写下这幅照片的瞬间心情：') || '记录美好的一天 ✨';
      const newPost: IgPost = {
        id: String(Date.now()),
        author: currentUser?.name || 'me',
        avatar: currentUser?.avatar || 'img/ava-00.jpg',
        image: url,
        caption: cap,
        likes: 1,
        isLiked: true,
      };
      setPosts([newPost, ...posts]);
      toast('已发布到 Instagram');
    });
  };

  return (
    <div id="ig-page" className="full-page" style={{ display: 'flex', flexDirection: 'column', background: '#fff', color: '#262626' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #efefef' }}>
        <button className="header-back" onClick={() => closePage('instagram')}>
          <i className="fa fa-angle-left" style={{ fontSize: '20px' }} />
        </button>
        <span style={{ fontFamily: 'cursive', fontSize: '22px', fontWeight: 600 }}>Instagram</span>
        <button className="btn-icon" onClick={handleAddPhoto}>
          <i className="fa-regular fa-square-plus" style={{ fontSize: '20px' }} />
        </button>
      </div>

      {/* Stories Bar */}
      <div style={{ display: 'flex', gap: '14px', padding: '10px 16px', borderBottom: '1px solid #efefef', overflowX: 'auto' }}>
        {['弯弯', '小狗神', '我', '兔兔'].map((name, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ padding: '2px', borderRadius: '50%', background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' }}>
              <img
                src={i === 0 ? 'img/wanwan.png' : i === 1 ? 'img/ava-01.jpg' : 'img/ava-00.jpg'}
                alt=""
                style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #fff', objectFit: 'cover' }}
              />
            </div>
            <span style={{ fontSize: '11px', marginTop: '4px', color: '#262626' }}>{name}</span>
          </div>
        ))}
      </div>

      {/* Posts Stream */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {posts.map((post) => (
          <div key={post.id} style={{ marginBottom: '20px' }}>
            {/* Post Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px' }}>
              <img src={post.avatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{post.author}</span>
            </div>

            {/* Post Image */}
            <div onDoubleClick={() => handleLike(post.id)} style={{ cursor: 'pointer' }}>
              <img src={post.image} alt="" style={{ width: '100%', maxHeight: '380px', objectFit: 'cover', display: 'block' }} />
            </div>

            {/* Post Action Buttons */}
            <div style={{ padding: '10px 16px' }}>
              <div style={{ display: 'flex', gap: '16px', fontSize: '20px', marginBottom: '8px' }}>
                <span onClick={() => handleLike(post.id)} style={{ cursor: 'pointer', color: post.isLiked ? '#ed4956' : 'inherit' }}>
                  <i className={`fa${post.isLiked ? 's' : 'r'} fa-heart`} />
                </span>
                <span onClick={() => toast('评论功能开启')} style={{ cursor: 'pointer' }}>
                  <i className="fa-regular fa-comment" />
                </span>
                <span onClick={() => toast('分享图片')} style={{ cursor: 'pointer' }}>
                  <i className="fa-regular fa-paper-plane" />
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{post.likes} 次赞</div>
              <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                <strong style={{ marginRight: '6px' }}>{post.author}</strong>
                {post.caption}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
