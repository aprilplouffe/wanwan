import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export const DisclaimerModal: React.FC = () => {
  const { disclaimerVisible, confirmDisclaimer } = useApp();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!disclaimerVisible) return;
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [disclaimerVisible, countdown]);

  if (!disclaimerVisible) return null;

  return (
    <div className="disclaimer-overlay show" id="disclaimer-overlay">
      <div className="disclaimer-modal" role="dialog" aria-modal="true">
        <div className="disclaimer-header">
          <h2 id="disclaimer-title">免责声明</h2>
          <p>请完整阅读以下内容后确认</p>
        </div>
        <div className="disclaimer-body">
          <section className="disclaimer-section">
            <h3>1. 内容生成方式</h3>
            <p>弯弯机内所有对话、动态、图片描述等内容均由第三方 AI 大语言模型生成，不对生成内容承担任何法律责任。</p>
          </section>
          <section className="disclaimer-section">
            <h3>2. 虚构性声明</h3>
            <p>弯弯机中的角色、情节均为虚构内容，不代表开发者立场，请自行判断内容的适用性。</p>
          </section>
          <section className="disclaimer-section">
            <h3>3. 数据存储</h3>
            <p>业务数据默认保存在当前浏览器本地存储中，请定期通过设置导出数据备份。</p>
          </section>
          <section className="disclaimer-section">
            <h3>4. 年龄与责任限制</h3>
            <p>本应用仅限成年人使用，旨在提供陪伴与愉悦体验。继续使用即视为接受以上条款。</p>
          </section>
          <p className="disclaimer-closing">继续使用本应用即视为您已阅读、理解并同意本免责声明的全部内容。</p>
          <p className="disclaimer-credit">弯弯机 · 个人专属虚拟伴侣手机系统</p>
        </div>
        <div className="disclaimer-footer">
          <button
            className="disclaimer-confirm"
            disabled={countdown > 0}
            onClick={confirmDisclaimer}
            type="button"
          >
            <span>{countdown > 0 ? `请等待 ${countdown}s` : '同意并进入'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
