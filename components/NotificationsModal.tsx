import React from 'react';
import { X, Bell, Trash2, CheckCheck, Calendar } from 'lucide-react';
import { Notification } from '../hooks/useNotifications';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { useScrollLock } from '../hooks/useScrollLock';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClear: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClear
}) => {
  useScrollLock(isOpen);

  if (!isOpen) return null;

  // Ordenar notificaciones: no leídas primero, luego por fecha (más recientes primero)
  const sortedNotifications = [...notifications].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const formatNotificationTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) return 'Ahora';
      if (diffMins < 60) return `Hace ${diffMins} min`;
      if (diffHours < 24) return `Hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
      return format(date, 'dd/MM/yyyy HH:mm', { locale: es });
    } catch {
      return dateString;
    }
  };

  const getWorkoutDateMessage = (workoutDateString: string) => {
    try {
      const workoutDate = parseISO(workoutDateString);
      if (isYesterday(workoutDate)) {
        return 'Ha registrado ejercicios ayer';
      } else {
        return `Ha registrado ejercicios`;
      }
    } catch {
      return 'Ha registrado ejercicios';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Notificaciones</h2>
              {unreadCount > 0 && (
                <p className="text-xs text-zinc-400">
                  {unreadCount} {unreadCount === 1 ? 'no leída' : 'no leídas'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllAsRead}
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                    title="Marcar todas como leídas"
                  >
                    <CheckCheck className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={onClear}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-red-400"
                  title="Limpiar todas"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 font-medium mb-1">No hay notificaciones</p>
              <p className="text-xs text-zinc-600">Las notificaciones aparecerán aquí cuando tus amigos entrenen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (!notification.read) {
                      onMarkAsRead(notification.id);
                    }
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    notification.read
                      ? 'bg-zinc-800/50 border-white/5'
                      : 'bg-primary/10 border-primary/30 shadow-lg shadow-primary/10'
                  } hover:bg-white/5`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar del amigo */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: notification.friendColor,
                        color: '#000'
                      }}
                    >
                      {notification.friendName.charAt(0).toUpperCase()}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="font-bold text-sm"
                          style={{ color: notification.friendColor }}
                        >
                          {notification.friendName}
                        </span>
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>
                        )}
                      </div>
                      <p className="text-zinc-300 text-sm mb-2">
                        {getWorkoutDateMessage(notification.workoutDate)}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatNotificationTime(notification.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

