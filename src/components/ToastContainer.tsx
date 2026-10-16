import React from 'react';
import { useApp } from '../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts } = useApp();

  return (
    <div id="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast show">
          {t.message}
        </div>
      ))}
    </div>
  );
};
