import React, { useState, useEffect } from 'react';
import { Search, Eye, Shield, Loader2, RefreshCw } from 'lucide-react';
import { User } from '../types';
import { supabase, getExerciseCatalog } from '../services/supabase';
import { recalculateUserRecords } from '../services/recordsService';
import { useExercises } from '../contexts/ExerciseContext';

interface AdminPanelProps {
  currentUser: User;
  onViewAsUser: (user: User) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onViewAsUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [recalculationProgress, setRecalculationProgress] = useState({ current: 0, total: 0 });
  const { catalog } = useExercises();

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadUsers();
    }
  }, [currentUser?.id]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const { data: allUsers, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading users:', error);
        setIsLoading(false);
        return;
      }

      setUsers(allUsers || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRecalculateAllRecords = async () => {
    if (!confirm('¿Estás seguro de que quieres recalcular todos los records de todos los usuarios? Esto puede tardar varios minutos.')) {
      return;
    }

    setIsRecalculating(true);
    setRecalculationProgress({ current: 0, total: 0 });

    try {
      // Obtener catálogo de ejercicios
      const exerciseCatalog = catalog && catalog.length > 0 ? catalog : await getExerciseCatalog();
      
      if (!exerciseCatalog || exerciseCatalog.length === 0) {
        alert('Error: No se pudo obtener el catálogo de ejercicios');
        setIsRecalculating(false);
        return;
      }

      console.log(`📚 Catálogo: ${exerciseCatalog.length} ejercicios`);

      // Obtener todos los usuarios
      const { data: allUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .order('name', { ascending: true });

      if (usersError || !allUsers) {
        alert(`Error obteniendo usuarios: ${usersError?.message}`);
        setIsRecalculating(false);
        return;
      }

      console.log(`📊 Usuarios: ${allUsers.length}`);

      // Obtener todos los workouts
      const { data: allWorkouts, error: workoutsError } = await supabase
        .from('workouts')
        .select('*')
        .order('created_at', { ascending: true });

      if (workoutsError) {
        alert(`Error obteniendo workouts: ${workoutsError.message}`);
        setIsRecalculating(false);
        return;
      }

      console.log(`💪 Workouts: ${allWorkouts?.length || 0}`);

      setRecalculationProgress({ current: 0, total: allUsers.length });

      let processed = 0;
      let errors = 0;
      let totalWorkoutsProcessed = 0;

      // Procesar cada usuario
      for (const user of allUsers) {
        try {
          const userWorkouts = (allWorkouts || []).filter(w => w.user_id === user.id);
          
          if (userWorkouts.length > 0) {
            console.log(`Procesando ${user.name} (${userWorkouts.length} workouts)...`);
            await recalculateUserRecords(user.id, userWorkouts, exerciseCatalog);
            totalWorkoutsProcessed += userWorkouts.length;
          }
          
          processed++;
          setRecalculationProgress({ current: processed, total: allUsers.length });
          
          // Pequeña pausa para no sobrecargar
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          errors++;
          console.error(`Error procesando ${user.name}:`, error);
        }
      }

      alert(`✅ Recalculación completada!\n\nUsuarios procesados: ${processed}/${allUsers.length}\nWorkouts procesados: ${totalWorkoutsProcessed}\nErrores: ${errors}`);
      
    } catch (error: any) {
      console.error('Error fatal:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsRecalculating(false);
      setRecalculationProgress({ current: 0, total: 0 });
    }
  };

  const handleCleanEmptyUUIDs = async () => {
    if (!confirm('¿Estás seguro de que quieres limpiar los campos UUID vacíos en todos los records? Esto convertirá strings vacíos a null.')) {
      return;
    }

    setIsCleaning(true);

    try {
      console.log('🧹 Iniciando limpieza de UUIDs vacíos...');

      // Obtener todos los records
      const { data: allRecords, error: fetchError } = await supabase
        .from('user_records')
        .select('*');

      if (fetchError) {
        alert(`Error obteniendo records: ${fetchError.message}`);
        setIsCleaning(false);
        return;
      }

      if (!allRecords || allRecords.length === 0) {
        alert('No hay records para limpiar.');
        setIsCleaning(false);
        return;
      }

      console.log(`📋 Encontrados ${allRecords.length} records para revisar`);

      let cleaned = 0;
      let errors = 0;

      // Función helper para sanitizar UUID
      const sanitizeUUID = (value: string | undefined | null): string | undefined | null => {
        if (!value || value.trim() === '') return null;
        return value;
      };

      // Procesar cada record
      for (const record of allRecords) {
        try {
          // Verificar si tiene campos UUID vacíos que necesiten limpieza
          const needsCleaning = 
            (record.max_weight_workout_id === '' || record.max_weight_workout_id === '""') ||
            (record.max_1rm_workout_id === '' || record.max_1rm_workout_id === '""') ||
            (record.max_reps_workout_id === '' || record.max_reps_workout_id === '""') ||
            (record.best_single_set_workout_id === '' || record.best_single_set_workout_id === '""') ||
            (record.best_near_max_workout_id === '' || record.best_near_max_workout_id === '""');

          if (needsCleaning) {
            const updateData: any = {};
            
            // Solo actualizar los campos que necesitan limpieza
            if (record.max_weight_workout_id === '' || record.max_weight_workout_id === '""') {
              updateData.max_weight_workout_id = null;
            }
            if (record.max_1rm_workout_id === '' || record.max_1rm_workout_id === '""') {
              updateData.max_1rm_workout_id = null;
            }
            if (record.max_reps_workout_id === '' || record.max_reps_workout_id === '""') {
              updateData.max_reps_workout_id = null;
            }
            if (record.best_single_set_workout_id === '' || record.best_single_set_workout_id === '""') {
              updateData.best_single_set_workout_id = null;
            }
            if (record.best_near_max_workout_id === '' || record.best_near_max_workout_id === '""') {
              updateData.best_near_max_workout_id = null;
            }

            const { error: updateError } = await supabase
              .from('user_records')
              .update(updateData)
              .eq('id', record.id);

            if (updateError) {
              console.error(`❌ Error limpiando record ${record.id}:`, updateError);
              errors++;
            } else {
              cleaned++;
              console.log(`✅ Record ${record.id} limpiado (${record.exercise_name})`);
            }
          }
        } catch (error) {
          errors++;
          console.error(`Error procesando record ${record.id}:`, error);
        }
      }

      alert(`✅ Limpieza completada!\n\nRecords limpiados: ${cleaned}\nErrores: ${errors}\nTotal revisados: ${allRecords.length}`);
      console.log(`✅ Limpieza completada: ${cleaned} records limpiados, ${errors} errores`);

    } catch (error: any) {
      console.error('Error fatal en limpieza:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  if (currentUser?.role !== 'admin') return null;

  return (
    <div className="bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-primary/20 via-black to-black p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Panel de Administración</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Selecciona un usuario para usar la aplicación como él</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Botones de Administración */}
        <div className="mb-4 space-y-2">
          <button
            onClick={handleCleanEmptyUUIDs}
            disabled={isCleaning || isRecalculating}
            className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-zinc-800 disabled:opacity-50 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-yellow-600/20 disabled:cursor-not-allowed"
          >
            {isCleaning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Limpiando UUIDs vacíos...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Limpiar UUIDs Vacíos
              </>
            )}
          </button>

          <button
            onClick={handleRecalculateAllRecords}
            disabled={isRecalculating || isCleaning}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:opacity-50 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-600/20 disabled:cursor-not-allowed"
          >
            {isRecalculating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {recalculationProgress.total > 0 
                  ? `Recalculando... ${recalculationProgress.current}/${recalculationProgress.total}`
                  : 'Recalculando...'}
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Recalcular Todos los Records
              </>
            )}
          </button>
          {isRecalculating && recalculationProgress.total > 0 && (
            <div className="mt-2 w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${(recalculationProgress.current / recalculationProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Búsqueda */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar usuarios..."
            className="w-full bg-zinc-900 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-primary/50 outline-none"
          />
        </div>

        {/* Lista de Usuarios */}
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="bg-zinc-900 border border-white/10 rounded-xl p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-surfaceHighlight border border-white/10 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        user.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white truncate">{user.name}</h3>
                        {user.role === 'admin' && (
                          <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-black uppercase rounded">Admin</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">{user.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      console.log('Click en Usar Como para:', user.name, user.id);
                      onViewAsUser(user);
                    }}
                    className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-colors shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                    Usar Como
                  </button>
                </div>
              </div>
            ))}

            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                <p className="text-sm">No se encontraron usuarios</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
