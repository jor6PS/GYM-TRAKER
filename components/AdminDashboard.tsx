import React from 'react';
import { User, Workout } from '../types';
import { 
  Users, 
  Activity, 
  Database, 
  Search, 
  MoreHorizontal, 
  ShieldAlert, 
  Eye,
  LogOut,
  TrendingUp
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, isSameDay } from 'date-fns';

interface AdminDashboardProps {
  currentUser: User;
  allUsers: User[];
  allWorkouts: Workout[];
  onImpersonate: (userId: string) => void;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  currentUser, 
  allUsers, 
  allWorkouts,
  onImpersonate,
  onLogout
}) => {

  // --- Analytics Calculation ---
  const totalWorkouts = allWorkouts.length;
  // Parse date string (yyyy-MM-dd) to local date object
  const parseDate = (dateStr: string) => new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');

  const activeUsersToday = allUsers.filter(u => 
    allWorkouts.some(w => w.user_id === u.id && isSameDay(parseDate(w.date), new Date()))
  ).length;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    
    return {
      name: format(d, 'MM/dd'),
      workouts: allWorkouts.filter(w => isSameDay(parseDate(w.date), d)).length
    };
  });

  return (
    <div className="min-h-screen bg-background pb-12">
      
      {/* Admin Header */}
      <header className="bg-zinc-900/50 border-b border-white/5 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
               <ShieldAlert className="w-5 h-5 text-red-500" />
             </div>
             <div>
               <h1 className="text-lg font-bold text-white font-mono uppercase tracking-wide">Admin_Console</h1>
               <p className="text-[10px] text-zinc-500 font-mono">Welcome back, {currentUser.name}</p>
             </div>
           </div>
           
           <button 
             onClick={onLogout}
             className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-zinc-400 hover:text-white transition-all"
           >
             <LogOut className="w-4 h-4" /> Sign Out
           </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {/* Card 1 */}
           <div className="bg-surface border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                 <div>
                   <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">Total Users</p>
                   <h3 className="text-3xl font-bold text-white">{allUsers.length}</h3>
                 </div>
                 <div className="p-3 bg-blue-500/10 rounded-xl">
                   <Users className="w-6 h-6 text-blue-500" />
                 </div>
              </div>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full w-[70%]"></div>
              </div>
           </div>

           {/* Card 2 */}
           <div className="bg-surface border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                 <div>
                   <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">Global Logs</p>
                   <h3 className="text-3xl font-bold text-white">{totalWorkouts}</h3>
                 </div>
                 <div className="p-3 bg-primary/10 rounded-xl">
                   <Database className="w-6 h-6 text-primary" />
                 </div>
              </div>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <div className="bg-primary h-full w-[45%]"></div>
              </div>
           </div>

           {/* Card 3 */}
           <div className="bg-surface border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-4">
                 <div>
                   <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">Active Today</p>
                   <h3 className="text-3xl font-bold text-white">{activeUsersToday}</h3>
                 </div>
                 <div className="p-3 bg-green-500/10 rounded-xl">
                   <Activity className="w-6 h-6 text-green-500" />
                 </div>
              </div>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full w-[20%]"></div>
              </div>
           </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="lg:col-span-2 bg-surface border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-white font-mono uppercase tracking-wide flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Activity Volume (7 Days)
                </h3>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last7Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#71717a" 
                      fontSize={12} 
                      fontFamily="monospace"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={12} 
                      fontFamily="monospace"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      cursor={{ fill: '#ffffff10' }}
                      contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                    />
                    <Bar dataKey="workouts" radius={[4, 4, 0, 0]}>
                      {last7Days.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 6 ? '#FACC15' : '#3f3f46'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </div>
           
           <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-4 relative">
                <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin duration-[3s]"></div>
                <span className="text-xl font-bold text-white">98%</span>
              </div>
              <h4 className="text-sm font-bold text-white mb-1">System Health</h4>
              <p className="text-xs text-zinc-500">All services operational</p>
           </div>
        </div>

        {/* User Management */}
        <div className="bg-surface border border-white/10 rounded-2xl overflow-hidden">
           <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20">
              <h3 className="font-bold text-white font-mono uppercase tracking-wide">User Database</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  placeholder="Search users..." 
                  className="bg-black border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                />
              </div>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full">
               <thead>
                 <tr className="bg-zinc-900/50 text-left">
                   <th className="px-6 py-4 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">User</th>
                   <th className="px-6 py-4 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">Role</th>
                   <th className="px-6 py-4 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">Joined</th>
                   <th className="px-6 py-4 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {allUsers.map((user) => (
                   <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                     <td className="px-6 py-4">
                       <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-400">
                           {user.name.charAt(0)}
                         </div>
                         <div>
                           <div className="text-sm font-bold text-white">{user.name}</div>
                           <div className="text-xs text-zinc-500">{user.email}</div>
                         </div>
                       </div>
                     </td>
                     <td className="px-6 py-4">
                       <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                         user.role === 'admin' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                       }`}>
                         {user.role}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-xs text-zinc-500 font-mono">
                       {format(new Date(user.created_at), 'yyyy-MM-dd')}
                     </td>
                     <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => onImpersonate(user.id)}
                         className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-xs text-white transition-colors border border-white/5 group-hover:border-primary/30"
                         title="Manage User Data"
                       >
                         <Eye className="w-3 h-3" /> Manage
                       </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>

      </main>
    </div>
  );
};