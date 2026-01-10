import { getUserRecords, getUserTotalVolume, UserRecord } from './recordsService';
import { ExerciseDef } from '../contexts/ExerciseContext';
import { getCanonicalId, getLocalizedName } from '../utils';
import { Workout } from '../types';

interface UserStats {
    userId: string;
    name: string;
    totalVolume: number;
    workoutCount: number;
    maxLifts: Record<string, {
        weight: number;
        reps: number;
        isBodyweight: boolean;
        unit: string;
    }>;
}

interface CommonExerciseComparison {
    exerciseId: string;
    exerciseName: string;
    entries: Array<{
        userName: string;
        weight: number;
        reps: number;
        unit: string;
        oneRM: number;
    }>;
    winner: string;
}

interface ArenaData {
    winner: string;
    rankings: Array<{
        name: string;
        rawVolume: number;
        score: number;
        rank: number;
    }>;
    headToHeadData: CommonExerciseComparison[];
    matrixData: Array<Record<string, string>>;
    markdownReport: string;
    rawStats: UserStats[];
}

/**
 * Genera los datos de la Arena sin usar IA
 * Extrae directamente desde los records de la base de datos:
 * - Podium (ganador por volumen total)
 * - Comparación de ejercicios comunes (head-to-head)
 * - Matriz de mejor serie por ejercicio
 */
export const generateArenaDataWithoutAI = async (
    usersData: { name: string; workouts: Workout[]; userId?: string }[],
    catalog: ExerciseDef[]
): Promise<ArenaData> => {
    // --- FASE 1: OBTENER DATOS DESDE RECORDS ---
    const stats: UserStats[] = await Promise.all(usersData.map(async (user) => {
        const s: UserStats = {
            userId: user.userId || user.name,
            name: user.name,
            totalVolume: 0,
            workoutCount: new Set(user.workouts.map(w => w.date.split('T')[0])).size,
            maxLifts: {}
        };

        // Intentar obtener records almacenados si tenemos userId
        let storedRecords: UserRecord[] = [];
        let storedTotalVolume = 0;
        let recordsFetchError = false;
        
        if (user.userId) {
            try {
                storedRecords = await getUserRecords(user.userId);
                storedTotalVolume = await getUserTotalVolume(user.userId);
                console.log(`[Arena] ✅ Records obtenidos para ${user.name} (${user.userId}): ${storedRecords.length} records, volumen: ${storedTotalVolume}kg`);
            } catch (error: any) {
                recordsFetchError = true;
                const errorMsg = error?.message || String(error);
                console.warn(`[Arena] ⚠️ Error loading records for ${user.name} (${user.userId}):`, errorMsg);
                
                // Si es un error de permisos RLS, dar un mensaje más específico
                if (errorMsg.includes('RLS') || errorMsg.includes('permission') || errorMsg.includes('policy')) {
                    console.error(`[Arena] ❌ PROBLEMA DE PERMISOS RLS: No se pueden leer los records de ${user.name}.`);
                    console.error(`   Solución: Ejecuta el script SQL 'supabase_arena_rls_policies.sql' en Supabase SQL Editor`);
                }
                
                storedRecords = [];
                storedTotalVolume = 0;
            }
        }

        // Usar records almacenados para obtener mejores series
        if (storedRecords.length > 0) {
            for (const record of storedRecords) {
                const canonicalId = getCanonicalId(record.exercise_id, catalog);
                const exerciseName = getLocalizedName(canonicalId, catalog);
                
                // Usar best_single_set si está disponible, sino usar max_weight
                const weight = record.best_single_set_weight_kg ?? record.max_weight_kg ?? 0;
                const reps = record.best_single_set_reps ?? 
                    (record.is_bodyweight ? record.max_reps : record.max_weight_reps) ?? 0;
                
                if (weight > 0 || reps > 0) {
                    s.maxLifts[exerciseName] = {
                        weight: weight,
                        reps: reps,
                        isBodyweight: record.is_bodyweight || false,
                        unit: record.unit || 'kg'
                    };
                }
            }
        }

        // Usar volumen de records si está disponible
        if (user.userId && storedTotalVolume > 0) {
            s.totalVolume = storedTotalVolume;
        }

        return s;
    }));

    // --- FASE 2: CALCULAR RANKINGS (PODIUM) ---
    const maxVol = Math.max(...stats.map(s => s.totalVolume));
    const rankings = stats
        .map(s => ({
            name: s.name,
            rawVolume: s.totalVolume,
            score: maxVol > 0 ? (s.totalVolume / maxVol) * 100 : 0
        }))
        .sort((a, b) => b.score - a.score)
        .map((u, index) => ({ ...u, rank: index + 1 }));

    const winner = rankings[0]?.name || 'DRAW';

    // --- FASE 3: HEAD-TO-HEAD (EJERCICIOS COMUNES) ---
    const allExercisesMap = new Map<string, string>();
    stats.forEach(s => {
        Object.keys(s.maxLifts).forEach(exKey => {
            allExercisesMap.set(exKey, exKey);
        });
    });
    const allExercisesList = Array.from(allExercisesMap.keys()).sort();

    const headToHead: CommonExerciseComparison[] = [];
    const totalUsers = stats.length;

    allExercisesList.forEach(exName => {
        const participants = stats.filter(s => s.maxLifts[exName] !== undefined);
        
        // Solo incluir si TODOS los participantes tienen este ejercicio
        if (participants.length === totalUsers) {
            const entries = stats.map(p => {
                const lift = p.maxLifts[exName];
                const weightInKg = lift.unit === 'lbs' ? lift.weight * 0.453 : lift.weight;
                const powerScore = lift.isBodyweight ? lift.reps : weightInKg * (1 + lift.reps / 30);
                
                return {
                    userName: p.name,
                    weight: lift.weight,
                    reps: lift.reps,
                    unit: lift.unit,
                    oneRM: powerScore
                };
            }).sort((a, b) => b.oneRM - a.oneRM);

            let winnerName = entries[0].userName;
            if (entries.length > 1) {
                const diff = Math.abs(entries[0].oneRM - entries[1].oneRM);
                if (diff < 0.1) winnerName = 'EMPATE';
            }

            headToHead.push({
                exerciseId: exName,
                exerciseName: exName,
                entries: entries,
                winner: winnerName
            });
        }
    });

    // --- FASE 4: MATRIZ DE MEJOR SERIE ---
    const allUserNames = stats.map(s => s.name);
    const matrixData = allExercisesList.map(exName => {
        const row: Record<string, string> = { exercise: exName };
        stats.forEach(user => {
            const lift = user.maxLifts[exName];
            if (lift) {
                if (lift.isBodyweight) {
                    row[user.name] = lift.reps > 0 ? `${lift.reps} reps` : "---";
                } else {
                    row[user.name] = (lift.weight > 0 || lift.reps > 0) 
                        ? `${lift.weight}${lift.unit} x ${lift.reps}` 
                        : "---";
                }
            } else {
                row[user.name] = "---";
            }
        });
        return row;
    });

    // --- FASE 5: GENERAR MARKDOWN DIRECTAMENTE ---
    let markdownReport = "";

    // SECCIÓN 1: DUELOS (Head-to-Head)
    markdownReport += "**SECCIÓN 1: DUELOS (Head-to-Head)**\n\n";
    if (headToHead.length === 0) {
        markdownReport += "No se encontraron ejercicios realizados por TODOS los participantes para un duelo directo.\n\n";
    } else {
        headToHead.forEach(h => {
            markdownReport += `### ${h.exerciseName}\n`;
            
            if (h.winner === 'EMPATE') {
                markdownReport += `⚖️ **EMPATE**: ${h.entries[0].weight}${h.entries[0].unit} x ${h.entries[0].reps}\n`;
                h.entries.slice(1).forEach(e => {
                    markdownReport += `⚔️ vs **${e.userName}**: ${e.weight}${e.unit} x ${e.reps}\n`;
                });
            } else {
                const winnerEntry = h.entries.find(e => e.userName === h.winner) || h.entries[0];
                markdownReport += `🏆 **${h.winner}**: ${winnerEntry.weight}${winnerEntry.unit} x ${winnerEntry.reps}\n`;
                h.entries.filter(e => e.userName !== h.winner).forEach(e => {
                    markdownReport += `⚔️ vs **${e.userName}**: ${e.weight}${e.unit} x ${e.reps}\n`;
                });
            }
            markdownReport += "\n";
        });
    }

    // SECCIÓN 2: MATRIZ DE RENDIMIENTO
    markdownReport += "**SECCIÓN 2: MATRIZ DE RENDIMIENTO COMPLETA (The Matrix)**\n\n";
    if (matrixData.length === 0) {
        markdownReport += "No hay ejercicios para mostrar en la matriz.\n\n";
    } else {
        // Encabezado de la tabla
        markdownReport += `| Ejercicio | ${allUserNames.join(' | ')} |\n`;
        markdownReport += `|-----------|${allUserNames.map(() => '----------').join('|')}|\n`;
        
        // Filas de datos
        matrixData.forEach(row => {
            const values = allUserNames.map(name => row[name] || "---");
            markdownReport += `| ${row.exercise} | ${values.join(' | ')} |\n`;
        });
        markdownReport += "\n";
    }


    return {
        winner,
        rankings,
        headToHeadData: headToHead,
        matrixData,
        markdownReport,
        rawStats: stats
    };
};

