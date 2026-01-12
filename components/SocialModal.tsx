
import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Check, XCircle, Users, Loader2, Palette, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { searchUsers, sendFriendRequest, getFriendships, respondToRequest, removeFriendship } from '../services/supabase';
import { Friend, User } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useScrollLock } from '../hooks/useScrollLock';

interface SocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  activeFriends: string[]; 
  onToggleFriend: (friendId: string, friendName: string, color: string) => void;
  onToggleAllFriends: (allFriends: { id: string; name: string }[]) => Promise<void>;
}

// Ampliada paleta de colores para evitar repeticiones con muchos amigos
// Colores diseñados para ser distintivos y visibles en el calendario
const FRIEND_COLORS = [
  '#38bdf8',  // Sky blue
  '#f472b6',  // Pink
  '#a78bfa',  // Purple
  '#fb923c',  // Orange
  '#2dd4bf',  // Teal
  '#fbbf24',  // Amber
  '#34d399',  // Emerald
  '#60a5fa',  // Blue
  '#f87171',  // Red
  '#c084fc',  // Violet
  '#22d3ee',  // Cyan
  '#f97316',  // Orange (darker)
  '#14b8a6',  // Teal (darker)
  '#8b5cf6',  // Purple (darker)
  '#ec4899',  // Pink (darker)
  '#06b6d4',  // Cyan (darker)
  '#3b82f6',  // Blue (brighter)
  '#ef4444',  // Red (brighter)
  '#10b981',  // Green
  '#6366f1',  // Indigo
  '#84cc16',  // Lime
  '#eab308',  // Yellow
  '#06b6d4',  // Sky
  '#a855f7'   // Purple (lighter)
];

export const SocialModal: React.FC<SocialModalProps> = ({ isOpen, onClose, currentUser, activeFriends, onToggleFriend, onToggleAllFriends }) => {
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string, name: string, avatar_url?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const { t } = useLanguage();
  
  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
        fetchFriends();
    }
  }, [isOpen]);

  const fetchFriends = async () => {
    setIsLoading(true);
    const data = await getFriendships();
    console.log('[fetchFriends] Amigos obtenidos:', data.length, data.map(f => ({ id: f.id, name: f.name, status: f.status })));
    setFriends(data);
    setIsLoading(false);
    return data;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    const results = await searchUsers(searchTerm);
    setSearchResults(results);
    setIsLoading(false);
  };

  const handleSendRequest = async (toId: string) => {
    try {
        await sendFriendRequest(toId);
        setRequestStatus(`Solicitud enviada`);
        await fetchFriends(); // Recargar lista local
        setTimeout(() => setRequestStatus(null), 3000);
    } catch (e: any) {
        setRequestStatus(e.message);
        setTimeout(() => setRequestStatus(null), 4000);
    }
  };

  const handleResponse = async (id: string, response: 'accepted' | 'rejected') => {
      await respondToRequest(id, response);
      fetchFriends();
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
      if (!confirm(`¿Estás seguro de que quieres eliminar a ${friendName} de tu Crew? Esta acción desvinculará completamente la amistad.`)) {
          return;
      }
      
      try {
          setIsLoading(true);
          console.log('[handleRemoveFriend] Intentando eliminar amistad con:', friendId);
          
          // Si el amigo estaba activo, desactivarlo ANTES de eliminar (mientras todavía tenemos la referencia)
          const wasActive = activeFriends.includes(friendId);
          const friend = acceptedFriends.find(f => f.id === friendId);
          let friendColor = '';
          
          if (wasActive && friend) {
              friendColor = FRIEND_COLORS[acceptedFriends.indexOf(friend) % FRIEND_COLORS.length];
              console.log('[handleRemoveFriend] Desactivando amigo antes de eliminar...');
              onToggleFriend(friendId, friendName, friendColor);
          }
          
          // Eliminar la amistad
          try {
              await removeFriendship(friendId);
              console.log('[handleRemoveFriend] Amistad eliminada exitosamente');
          } catch (removeError: any) {
              console.error('[handleRemoveFriend] Error durante eliminación:', removeError);
              // Si el error menciona RLS, dar un mensaje más claro
              if (removeError.message && removeError.message.includes('RLS')) {
                  setRequestStatus(`Error: Problema de permisos. Verifica las políticas RLS en Supabase.`);
                  setTimeout(() => setRequestStatus(null), 6000);
                  return;
              }
              throw removeError;
          }
          
          // Esperar un momento antes de recargar para asegurar que la BD se actualice
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Recargar lista de amigos
          const updatedFriends = await fetchFriends();
          console.log('[handleRemoveFriend] Lista actualizada. Amigos restantes:', updatedFriends.length);
          
          // Asegurar que el amigo eliminado no esté en la lista
          const friendStillInList = updatedFriends.find(f => f.id === friendId);
          if (friendStillInList) {
              console.error('[handleRemoveFriend] ❌ CRÍTICO: El amigo todavía está en la lista después de eliminar!', friendStillInList);
              // Forzar eliminación del estado local como medida de emergencia
              setFriends(prevFriends => {
                  const filtered = prevFriends.filter(f => f.id !== friendId);
                  console.log('[handleRemoveFriend] Estado local actualizado. Amigos antes:', prevFriends.length, 'después:', filtered.length);
                  return filtered;
              });
              setRequestStatus(`⚠️ Advertencia: ${friendName} eliminado localmente, pero puede aparecer al recargar. Verifica permisos RLS en Supabase.`);
              setTimeout(() => setRequestStatus(null), 6000);
          } else {
              setRequestStatus(`${friendName} eliminado de tu Crew`);
              setTimeout(() => setRequestStatus(null), 3000);
          }
          
          // Forzar re-render del componente
          setRefreshKey(prev => prev + 1);
          
          setRequestStatus(`${friendName} eliminado de tu Crew`);
          setTimeout(() => setRequestStatus(null), 3000);
      } catch (e: any) {
          console.error('[handleRemoveFriend] Error al eliminar amigo:', e);
          const errorMessage = e.message || 'Error desconocido al eliminar el amigo';
          setRequestStatus(`Error: ${errorMessage}`);
          setTimeout(() => setRequestStatus(null), 5000);
      } finally {
          setIsLoading(false);
      }
  };

  if (!isOpen) return null;

  const acceptedFriends = friends.filter(f => f.status === 'accepted');
  const pendingRequests = friends.filter(f => f.status === 'pending' && !f.is_sender);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col h-[70vh] animate-in zoom-in-95 duration-200">
        
        <div className="p-4 border-b border-border flex items-center justify-between">
           <h2 className="text-lg font-bold text-text flex items-center gap-2">
             <Users className="w-5 h-5 text-primary" /> Mi Crew
           </h2>
           <button onClick={onClose} className="p-1 hover:text-white text-subtext transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-border bg-black/20">
            <button 
                onClick={() => setActiveTab('friends')} 
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'friends' ? 'text-primary border-b-2 border-primary' : 'text-subtext hover:text-text'}`}
            >
                Amigos ({acceptedFriends.length})
            </button>
            <button 
                onClick={() => setActiveTab('requests')} 
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'requests' ? 'text-primary border-b-2 border-primary' : 'text-subtext hover:text-text'}`}
            >
                Peticiones {pendingRequests.length > 0 && <span className="bg-red-500 text-white px-1.5 rounded-full ml-1 font-mono text-[9px]">{pendingRequests.length}</span>}
            </button>
            <button 
                onClick={() => setActiveTab('search')} 
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === 'search' ? 'text-primary border-b-2 border-primary' : 'text-subtext hover:text-text'}`}
            >
                Buscar
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-background">
            {requestStatus && activeTab === 'friends' && (
                <div className="mb-3 text-[10px] text-center text-primary font-mono bg-primary/10 p-2 rounded-lg border border-primary/20 animate-in slide-in-from-top-1">
                    {requestStatus.toUpperCase()}
                </div>
            )}
            
            {activeTab === 'friends' && (
                <div key={refreshKey} className="space-y-3">
                    {acceptedFriends.length === 0 ? (
                        <div className="text-center py-10 text-subtext text-xs italic">
                            <p>Tu lista está vacía. Busca a tus amigos por nombre.</p>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => onToggleAllFriends(acceptedFriends.map(f => ({ id: f.id, name: f.name })))}
                                disabled={isLoading}
                                className={`w-full py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                    acceptedFriends.every(f => activeFriends.includes(f.id))
                                        ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                                        : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                                } disabled:opacity-50`}
                            >
                                {acceptedFriends.every(f => activeFriends.includes(f.id))
                                    ? 'Deseleccionar Todos'
                                    : 'Seleccionar Todos'}
                            </button>
                            {acceptedFriends.map((friend, idx) => {
                            const isActive = activeFriends.includes(friend.id);
                            const color = FRIEND_COLORS[idx % FRIEND_COLORS.length];

                            return (
                                <div key={friend.id} className="flex items-center justify-between p-3 bg-surfaceHighlight/50 rounded-xl border border-white/5 group">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10 shadow-inner shrink-0">
                                            {friend.avatar_url ? <img src={friend.avatar_url} className="w-full h-full object-cover" /> : <span className="font-black text-zinc-500 uppercase">{friend.name.charAt(0)}</span>}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-text text-sm italic truncate">{friend.name}</div>
                                            <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-tighter">Gym Bro</div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button 
                                            onClick={() => onToggleFriend(friend.id, friend.name, color)}
                                            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                                                isActive 
                                                ? 'bg-black text-white border-white/20' 
                                                : 'bg-transparent text-zinc-500 border-white/5 hover:bg-white/5'
                                            }`}
                                            style={isActive ? { borderColor: color, color: color } : {}}
                                            disabled={isLoading}
                                        >
                                            {isActive ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}></div> Activo
                                                </div>
                                            ) : 'Ver'}
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveFriend(friend.id, friend.name);
                                            }}
                                            className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all border border-red-500/10 hover:border-red-500/30 opacity-70 group-hover:opacity-100 disabled:opacity-50"
                                            title="Eliminar amigo"
                                            disabled={isLoading}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        </>
                    )}
                </div>
            )}

            {activeTab === 'requests' && (
                <div className="space-y-3">
                    {pendingRequests.length === 0 ? (
                         <div className="text-center py-10 text-subtext text-xs italic">
                           <p>No tienes peticiones de amistad pendientes.</p>
                        </div>
                    ) : (
                        pendingRequests.map(req => (
                            <div key={req.friendship_id} className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
                                <div className="font-bold text-white mb-3 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-black">{req.name.charAt(0)}</div>
                                    <span className="text-sm italic">{req.name}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleResponse(req.friendship_id, 'accepted')}
                                        className="flex-1 bg-primary text-black font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest hover:scale-[1.02] transition-transform"
                                    >
                                        Aceptar
                                    </button>
                                    <button 
                                        onClick={() => handleResponse(req.friendship_id, 'rejected')}
                                        className="flex-1 bg-zinc-800 text-zinc-400 font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest hover:bg-zinc-700"
                                    >
                                        Ignorar
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {activeTab === 'search' && (
                <div className="space-y-4">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Nombre o email..."
                                className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <button type="submit" disabled={isLoading} className="bg-primary text-black font-black px-6 rounded-xl text-xs uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Ir'}
                        </button>
                    </form>

                    {requestStatus && (
                        <div className="text-[10px] text-center text-primary font-mono bg-primary/10 p-2 rounded-lg border border-primary/20 animate-in slide-in-from-top-1">
                            {requestStatus.toUpperCase()}
                        </div>
                    )}

                    <div className="space-y-2">
                        {searchResults.map(user => {
                            const existing = friends.find(f => f.id === user.id);
                            const isAccepted = existing?.status === 'accepted';
                            const isPending = existing?.status === 'pending';
                            const isSentByMe = existing?.is_sender;

                            return (
                                <div key={user.id} className="flex items-center justify-between p-3 bg-zinc-900/30 rounded-xl border border-white/5 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[10px] font-black text-zinc-500 uppercase">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div className="text-sm font-bold text-zinc-300 italic">{user.name}</div>
                                    </div>
                                    
                                    {isAccepted ? (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-500 rounded-full border border-green-500/20 text-[9px] font-black uppercase">
                                            <CheckCircle2 className="w-3 h-3" /> Amigos
                                        </div>
                                    ) : isPending ? (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20 text-[9px] font-black uppercase">
                                            <Clock className="w-3 h-3" /> {isSentByMe ? 'Enviada' : 'Pendiente'}
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleSendRequest(user.id)}
                                            className="p-2 bg-white/5 hover:bg-primary text-zinc-500 hover:text-black rounded-lg transition-all"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
