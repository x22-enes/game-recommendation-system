import { Bell, CheckCheck, Heart, MessageCircle, Percent, Tag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

type Notification = {
    id: string;
    type: 'price_drop' | 'comment_reply' | 'comment_like' | string;
    title: string;
    body: string;
    link?: string | null;
    read: boolean;
    createdAt: string;
};

function timeAgo(value: string) {
    const then = new Date(value).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return 'Just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    return `${Math.floor(diff / day)}d ago`;
}

function NotificationIcon({ type }: { type: string }) {
    if (type === 'price_drop') return <Percent className="h-4 w-4" aria-hidden />;
    if (type === 'comment_reply') return <MessageCircle className="h-4 w-4" aria-hidden />;
    if (type === 'comment_like') return <Heart className="h-4 w-4" aria-hidden />;
    return <Tag className="h-4 w-4" aria-hidden />;
}

function notificationTypeClass(type: string) {
    if (type === 'price_drop' || type === 'comment_reply' || type === 'comment_like') {
        return `notification-type-${type}`;
    }

    return '';
}

export default function NotificationBell() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const fetchUnreadCount = async () => {
        const res = await api.get('/notifications/unread-count');
        setUnreadCount(Number(res.data?.count || 0));
    };

    const fetchNotifications = async () => {
        const res = await api.get('/notifications');
        setNotifications(Array.isArray(res.data) ? res.data : []);
    };

    useEffect(() => {
        fetchUnreadCount().catch(() => {});
        const interval = window.setInterval(() => {
            fetchUnreadCount().catch(() => {});
        }, 30000);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!open) return;
        fetchNotifications().catch(() => {});
    }, [open]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, []);

    const markAllRead = async () => {
        await api.patch('/notifications/read-all');
        setNotifications(current => current.map(item => ({ ...item, read: true })));
        setUnreadCount(0);
    };

    const openNotification = async (notification: Notification) => {
        if (!notification.read) {
            await api.patch(`/notifications/${notification.id}/read`).catch(() => {});
            setNotifications(current => current.map(item => (
                item.id === notification.id ? { ...item, read: true } : item
            )));
            setUnreadCount(current => Math.max(0, current - 1));
        }

        setOpen(false);
        if (notification.link) navigate(notification.link);
    };

    return (
        <div ref={rootRef} className="notification-root">
            <button
                type="button"
                className="notification-trigger"
                onClick={() => setOpen(current => !current)}
                aria-label="Open notifications"
                aria-expanded={open}
            >
                <Bell className="h-4 w-4" aria-hidden />
                {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
            </button>

            {open && (
                <div className="notification-panel">
                    <div className="notification-panel-header">
                        <div>
                            <p className="eyebrow">Updates</p>
                            <h2 className="text-base font-black text-white">Notifications</h2>
                        </div>
                        <button
                            type="button"
                            className="notification-read-all"
                            onClick={markAllRead}
                            disabled={unreadCount === 0}
                        >
                            <CheckCheck className="h-4 w-4" aria-hidden />
                            Mark all read
                        </button>
                    </div>

                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="notification-empty">
                                <Bell className="mx-auto mb-3 h-6 w-6 text-slate-600" aria-hidden />
                                <p>No notifications yet.</p>
                            </div>
                        ) : notifications.map(notification => (
                            <button
                                type="button"
                                key={notification.id}
                                className={`notification-item ${notification.read ? '' : 'notification-item-unread'}`}
                                onClick={() => openNotification(notification)}
                            >
                                <span className={`notification-type ${notificationTypeClass(notification.type)}`}>
                                    <NotificationIcon type={notification.type} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="notification-title">{notification.title}</span>
                                    <span className="notification-body">{notification.body}</span>
                                    <span className="notification-time">{timeAgo(notification.createdAt)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
