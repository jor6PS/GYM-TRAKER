
import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Check, XCircle, Users, Loader2, Palette, CheckCircle2, Clock } from 'lucide-react';
import { searchUsers, sendFriendRequest, getFriendships, respondToRequest } from '../services/supabase';
import { Friend, User } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface SocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  activeFriends: string[]; 
  onToggleFriend: (friendId: string, friendName: string, color: string) => void;
}

const FRIEND_COLORS = ['#38bdf8', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf'];

export const SocialModal: React.FC<SocialModalProps> = ({ isOpen, onClose, currentUser, activeFriends, onToggleFriend }) => {
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string, name: string, avatar_url?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen) {
        fetchFriends();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const fetchFriends = async () => {
    setIsLoading(true);
    const data = await getFriendships();
    setFriends(data);
    setIsLoading(false);
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
            
            {activeTab === 'friends' && (
                <div className="space-y-3">
                    {acceptedFriends.length === 0 ? (
                        <div className="text-center py-10 text-subtext text-xs italic">
                            <p>Tu lista está vacía. Busca a tus amigos por nombre.</p>
                        </div>
                    ) : (
                        acceptedFriends.map((friend, idx) => {
                            const isActive = activeFriends.includes(friend.id);
                            const color = FRIEND_COLORS[idx % FRIEND_COLORS.length];

                            return (
                                <div key={friend.id} className="flex items-center justify-between p-3 bg-surfaceHighlight/50 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10 shadow-inner">
                                            {friend.avatar_url ? <img src={friend.avatar_url} className="w-full h-full object-cover" /> : <span className="font-black text-zinc-500 uppercase">{friend.name.charAt(0)}</span>}
                                        </div>
                                        <div>
                                            <div className="font-bold text-text text-sm italic">{friend.name}</div>
                                            <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-tighter">Gym Bro</div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => onToggleFriend(friend.id, friend.name, color)}
                                        className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                                            isActive 
                                            ? 'bg-black text-white border-white/20' 
                                            : 'bg-transparent text-zinc-500 border-white/5 hover:bg-white/5'
                                        }`}
                                        style={isActive ? { borderColor: color, color: color } : {}}
                                    >
                                        {isActive ? (
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}></div> Activo
                                            </div>
                                        ) : 'Ver'}
                                    </button>
                                </div>
                            );
                        })
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
