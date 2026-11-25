import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'info', ms = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((p) => [...p, { id, message, kind }]);
    setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), ms);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info, alert: AlertTriangle };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => {
          const I = Icon[t.kind] || Info;
          return (
            <div key={t.id} className={`toast ${t.kind}`}>
              <I size={16} /> <span>{t.message}</span>
              <button className="icon-btn" onClick={() => setItems((p) => p.filter((i) => i.id !== t.id))}><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
