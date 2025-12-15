
import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Check, XCircle, Users, Loader2, Share2, Palette } from 'lucide-react';
import { searchUsers, sendFriendRequest, getFriendships, respondToRequest } from '../services/supabase';
import { Friend, User } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface SocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  activeFriends: string[]; // IDs of friends selected for calendar
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

  // Scroll Lock Effect
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
        setRequestStatus(`Request sent!`);
        setTimeout(() => setRequestStatus(null), 3000);
        // Optimistic update? No, safer to wait for fetch
    } catch (e: any) {
        setRequestStatus(e.message);
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
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
           <h2 className="text-lg font-bold text-text flex items-center gap-2">
             <Users className="w-5 h-5 text-primary" /> Friends Arena
           </h2>
           <button onClick={onClose} className="p-1 hover:text-white text-subtext transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-black/20">
            <button 
                onClick={() => setActiveTab('friends')} 
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'friends' ? 'text-primary border-b-2 border-primary' : 'text-subtext hover:text-text'}`}
            >
                My Crew ({acceptedFriends.length})
            </button>
            <button 
                onClick={() => setActiveTab('requests')} 
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'requests' ? 'text-primary border-b-2 border-primary' : 'text-subtext hover:text-text'}`}
            >
                Requests {pendingRequests.length > 0 && <span className="bg-red-500 text-white px-1.5 rounded-full ml-1">{pendingRequests.length}</span>}
            </button>
            <button 
                onClick={() => setActiveTab('search')} 
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${activeTab === 'search' ? 'text-primary border-b-2 border-primary' : 'text-subtext hover:text-text'}`}
            >
                Find
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-background">
            
            {/* TAB: FRIENDS */}
            {activeTab === 'friends' && (
                <div className="space-y-3">
                    {acceptedFriends.length === 0 ? (
                        <div className="text-center py-10 text-subtext text-sm">
                            <p>No friends yet. Go to "Find" to invite gym bros.</p>
                        </div>
                    ) : (
                        acceptedFriends.map((friend, idx) => {
                            const isActive = activeFriends.includes(friend.id);
                            // Simple color assignment based on index
                            const color = FRIEND_COLORS[idx % FRIEND_COLORS.length];

                            return (
                                <div key={friend.id} className="flex items-center justify-between p-3 bg-surfaceHighlight rounded-xl border border-border">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10">
                                            {friend.avatar_url ? <img src={friend.avatar_url} className="w-full h-full object-cover" /> : friend.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-text text-sm">{friend.name}</div>
                                            <div className="text-[10px] text-green-500 font-mono">Gym Bro</div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => onToggleFriend(friend.id, friend.name, color)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                            isActive 
                                            ? 'bg-black text-white border-white/20' 
                                            : 'bg-transparent text-subtext border-border hover:bg-white/5'
                                        }`}
                                        style={isActive ? { borderColor: color, color: color } : {}}
                                    >
                                        {isActive ? (
                                            <div className="flex items-center gap-1">
                                                <Palette className="w-3 h-3" /> Active
                                            </div>
                                        ) : 'Show'}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* TAB: REQUESTS */}
            {activeTab === 'requests' && (
                <div className="space-y-3">
                    {pendingRequests.length === 0 ? (
                         <div className="text-center py-10 text-subtext text-sm">
                           <p>No pending requests.</p>
                        </div>
                    ) : (
                        pendingRequests.map(req => (
                            <div key={req.friendship_id} className="p-4 bg-surfaceHighlight rounded-xl border border-border">
                                <div className="font-bold text-text mb-2">{req.name} wants to connect.</div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleResponse(req.friendship_id, 'accepted')}
                                        className="flex-1 bg-primary text-black font-bold py-2 rounded text-xs hover:bg-primaryHover"
                                    >
                                        Accept
                                    </button>
                                    <button 
                                        onClick={() => handleResponse(req.friendship_id, 'rejected')}
                                        className="flex-1 bg-zinc-800 text-white font-bold py-2 rounded text-xs hover:bg-zinc-700"
                                    >
                                        Ignore
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* TAB: SEARCH */}
            {activeTab === 'search' && (
                <div className="space-y-4">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Username or Email..."
                                className="w-full bg-surfaceHighlight border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-text focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <button type="submit" disabled={isLoading} className="bg-primary text-black font-bold px-4 rounded-xl">
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Find'}
                        </button>
                    </form>

                    {requestStatus && (
                        <div className="text-xs text-center text-primary font-mono bg-primary/10 p-2 rounded">
                            {requestStatus}
                        </div>
                    )}

                    <div className="space-y-2">
                        {searchResults.map(user => (
                            <div key={user.id} className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                                <div className="text-sm font-bold text-white">{user.name}</div>
                                <button 
                                    onClick={() => handleSendRequest(user.id)}
                                    className="p-2 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-full transition-colors"
                                >
                                    <UserPlus className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
