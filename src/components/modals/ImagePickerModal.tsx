import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';

export const ImagePickerModal: React.FC = () => {
  const { imagePickerOpen, closeImagePicker, onImageSelected, toast } = useApp();
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!imagePickerOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) onImageSelected(result);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlConfirm = () => {
    if (!urlValue.trim()) {
      toast('请输入图片URL');
      return;
    }
    onImageSelected(urlValue.trim());
  };

  return (
    <>
      <div className="img-picker-overlay show" onClick={closeImagePicker} />
      <div className="img-picker-modal show">
        <div className="img-picker-title">选择图片</div>
        <div className="img-picker-options">
          <button
            className="img-picker-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="fa fa-folder-open"></i>
            <span>本地文件</span>
          </button>
          <button
            className="img-picker-btn"
            onClick={() => setShowUrlInput(true)}
          >
            <i className="fa fa-link"></i>
            <span>输入URL</span>
          </button>
        </div>

        {showUrlInput && (
          <div className="img-picker-url-area" style={{ display: 'flex', marginTop: 12 }}>
            <input
              className="input-field"
              placeholder="粘贴图片URL..."
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              autoFocus
            />
            <button className="btn-pill img-picker-confirm" onClick={handleUrlConfirm}>
              确认
            </button>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button className="img-picker-cancel" onClick={closeImagePicker}>
          取消
        </button>
      </div>
    </>
  );
};
