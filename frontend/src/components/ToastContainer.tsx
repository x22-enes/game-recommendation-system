import { X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function ToastContainer() {
  const { toasts, closeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast-card toast-card-${toast.type} ${toast.closing ? 'toast-card-closing' : ''}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          <div className="min-w-0">
            <p className="toast-label">{toast.type === 'success' ? 'Success' : 'Error'}</p>
            <p className="toast-message">{toast.message}</p>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => closeToast(toast.id)}
            aria-label="Close notification"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
