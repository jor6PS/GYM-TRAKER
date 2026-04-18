import { Exercise, WorkoutData } from '../types';

export interface WorkoutSessionDraft {
  exercises: Exercise[];
  timestamp: number;
}

export interface PendingWorkoutSave {
  id: string;
  userId: string;
  date: string;
  data: WorkoutData;
  userWeight: number;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError?: string;
}

const SESSION_DRAFT_KEY = 'workout_session_draft_v2';
const PENDING_WORKOUTS_KEY = 'pending_workout_saves_v1';

const isBrowser = typeof window !== 'undefined';

const readJson = <T,>(key: string, fallback: T): T => {
  if (!isBrowser) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (!isBrowser) return;
  localStorage.setItem(key, JSON.stringify(value));
};

export const loadWorkoutSessionDraft = (): string | null => {
  if (!isBrowser) return null;
  return localStorage.getItem(SESSION_DRAFT_KEY) || sessionStorage.getItem('workout_session_backup');
};

export const saveWorkoutSessionDraft = (exercises: Exercise[]) => {
  if (!exercises.length) return;
  const draft: WorkoutSessionDraft = { exercises, timestamp: Date.now() };
  const serialized = JSON.stringify(draft);
  if (!isBrowser) return;
  localStorage.setItem(SESSION_DRAFT_KEY, serialized);
  sessionStorage.setItem('workout_session_backup', serialized);
};

export const clearWorkoutSessionDraft = () => {
  if (!isBrowser) return;
  localStorage.removeItem(SESSION_DRAFT_KEY);
  sessionStorage.removeItem('workout_session_backup');
};

export const getPendingWorkoutSaves = (userId?: string): PendingWorkoutSave[] => {
  const queue = readJson<PendingWorkoutSave[]>(PENDING_WORKOUTS_KEY, []);
  return userId ? queue.filter(item => item.userId === userId) : queue;
};

export const upsertPendingWorkoutSave = (entry: PendingWorkoutSave) => {
  const queue = getPendingWorkoutSaves();
  const next = [...queue.filter(item => item.id !== entry.id), entry].sort((a, b) => (
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  ));
  writeJson(PENDING_WORKOUTS_KEY, next);
};

export const removePendingWorkoutSave = (entryId: string) => {
  const queue = getPendingWorkoutSaves();
  writeJson(PENDING_WORKOUTS_KEY, queue.filter(item => item.id !== entryId));
};

export const countPendingWorkoutSaves = (userId?: string) => getPendingWorkoutSaves(userId).length;

export const createPendingWorkoutSave = (
  userId: string,
  date: string,
  data: WorkoutData,
  userWeight: number
): PendingWorkoutSave => {
  const now = new Date().toISOString();
  return {
    id: `${userId}:${date}`,
    userId,
    date,
    data,
    userWeight,
    createdAt: now,
    updatedAt: now,
    retryCount: 0
  };
};
